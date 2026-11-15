import { useEffect, useState } from 'react'
import { CheckCircle2, History, Lock, RotateCcw, Save, Send, Undo2, UserCheck, XCircle } from 'lucide-react'
import { EXECUTION, METHODS, PRICING, PROCUREMENT } from '../lib/bank'
import type { Result, Weights } from '../lib/engine'
import type { Caps, Decision, DecisionKind, Study, Version } from '../repo'
import { DECISION_FA, STATUS_FA, fa, nameOf } from '../lib/useLive'

const FLOW = ['draft', 'analysed', 'in_review', 'approved'] as const
const when = (s: string) => { try { return new Date(s).toLocaleString('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return s } }

export function DsDecision({ study, live, current, versions, decisions, caps, busy, dirty, locked, onSaveVersion, onDecide }: {
  study: Study; live: Result | null; current: Version | null; versions: Version[]; decisions: Decision[]; caps: Caps; busy: boolean; dirty: boolean; locked: boolean
  onSaveVersion: (r: Result, w: Weights, note: string) => void; onDecide: (d: DecisionKind, method: string | null, pricing: string[], procurement: string[], execution: string[], rationale: string) => void
}) {
  const r = current?.result ?? null
  const rec = r?.recommendation ?? null
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<string>(rec?.method ?? '')
  const [pricing, setPricing] = useState<string[]>(rec?.pricing ?? [])
  const [proc, setProc] = useState<string[]>(rec?.procurement ?? [])
  const [exec, setExec] = useState<string[]>(rec?.execution ?? [])
  const [why, setWhy] = useState('')
  useEffect(() => { setMethod(rec?.method ?? ''); setPricing(rec?.pricing ?? []); setProc(rec?.procurement ?? []); setExec(rec?.execution ?? []) }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const override = !!rec && method !== '' && method !== rec.method
  const needWhy = override || !current?.decisive
  const toggle = (xs: string[], set: (v: string[]) => void, k: string) => set(xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k])
  const canAuthor = caps.admin || caps.edit || caps.create
  const canApprove = caps.admin || caps.approve
  const stepIdx = study.status === 'rejected' ? 3 : FLOW.indexOf(study.status as typeof FLOW[number])
  const options = [...METHODS.map((m) => ({ k: m.key, fa: m.fa })), ...(r?.options.find((o) => o.key === 'hybrid' && o.status !== 'excluded') ? [{ k: 'hybrid', fa: nameOf(r, 'hybrid') }] : [])]
  const lastSubmit = [...decisions].reverse().find((d) => d.decision === 'submitted')

  return (
    <div className="ds-stack">
      <ol className="ds-flow" aria-label="مراحل تصمیم">
        {FLOW.map((s, i) => <li key={s} className={i < stepIdx ? 'is-done' : i === stepIdx ? (study.status === 'rejected' ? 'is-rej' : 'is-on') : ''}><span>{fa(i + 1)}</span>{i === 3 && study.status === 'rejected' ? STATUS_FA.rejected : STATUS_FA[s]}</li>)}
      </ol>

      <div className="ds-grid2">
        <section className="ds-card" aria-labelledby="ds-v-h">
          <header><h3 id="ds-v-h"><Save size={15} aria-hidden />ثبت نسخهٔ تحلیل</h3><p>ورودی‌ها، وزن‌ها و نتیجهٔ کامل موتور با نسخهٔ موتور ({live?.engineVersion}) به‌صورت غیرقابل‌تغییر ثبت می‌شود. هر تغییر بعدی نسخهٔ تازه می‌سازد.</p></header>
          {locked ? <p className="ds-lock"><Lock size={13} aria-hidden />مطالعه در جریان تصمیم یا تصویب‌شده است.</p> : (
            <>
              <label className="ds-field"><span>یادداشت نسخه (اختیاری)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: پس از تکمیل اطلاعات بازار" /></label>
              <button type="button" className="ds-btn" disabled={!live || busy || !canAuthor} onClick={() => { if (live) { onSaveVersion(live, live.weights, note); setNote('') } }}><Save size={15} aria-hidden />اجرای تحلیل و ثبت نسخهٔ {fa((study.currentVersion ?? 0) + 1)}</button>
              {dirty && <p className="ds-muted">تغییرات ذخیره‌نشده در پیش‌نویس دارید؛ ثبت نسخه آن‌ها را هم ذخیره می‌کند.</p>}
              {study.status === 'analysed' && current && (
                <div className="ds-submit">
                  <p>نسخهٔ {fa(current.version)}: <b>{nameOf(current.result, current.recommended)}</b> · اطمینان {fa(current.confidence)}{current.decisive ? '' : ' · پیشنهاد قطعی نیست'}</p>
                  <button type="button" className="ds-btn is-alt" disabled={busy || !(caps.admin || caps.submit) || dirty} onClick={() => onDecide('submitted', null, [], [], [], '')}><Send size={15} aria-hidden />ارسال برای تصمیم مدیریت</button>
                  {dirty && <small className="ds-muted">پیش از ارسال، تغییرات را در نسخهٔ تازه ثبت کنید.</small>}
                </div>
              )}
            </>
          )}
        </section>

        <section className="ds-card" aria-labelledby="ds-d-h">
          <header><h3 id="ds-d-h"><UserCheck size={15} aria-hidden />تصمیم مدیریت</h3><p>پیشنهاد موتور الزام‌آور نیست. تصویب‌کننده می‌تواند روش دیگری را تصویب کند یا پیشنهاد را رد کند؛ در این حالت نوشتن دلیل الزامی است و در سابقه ثبت می‌شود. تهیه‌کنندهٔ تحلیل نمی‌تواند خودش آن را تصویب کند.</p></header>
          {study.status === 'in_review' && current ? (
            canApprove ? (
              <div className="ds-decide">
                <p>پیشنهاد موتور: <b>{rec?.methodFa ?? '—'}</b> ({current.decisive ? 'قطعی' : 'غیرقطعی'}) · ارسال: {lastSubmit?.decidedName ?? '—'}</p>
                <label className="ds-field"><span>روش تحویل مصوب</span>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>{options.map((o) => <option key={o.k} value={o.k}>{o.fa}{o.k === rec?.method ? ' (پیشنهاد موتور)' : ''}</option>)}</select>
                </label>
                {override && <p className="ds-warn-l">روش انتخابی با پیشنهاد موتور متفاوت است؛ به‌عنوان «تصویب با تصمیم متفاوت» ثبت می‌شود.</p>}
                {[['قیمت‌گذاری', PRICING, pricing, setPricing], ['تأمین', PROCUREMENT, proc, setProc], ['اجرا', EXECUTION, exec, setExec]].map(([t, xs, cur, set]) => (
                  <fieldset key={t as string} className="ds-checks"><legend>{t as string}</legend>
                    {(xs as { key: string; fa: string }[]).map((x) => <label key={x.key}><input type="checkbox" checked={(cur as string[]).includes(x.key)} onChange={() => toggle(cur as string[], set as (v: string[]) => void, x.key)} />{x.fa}</label>)}
                  </fieldset>
                ))}
                <label className="ds-field"><span>دلیل و ملاحظات مدیریت {needWhy ? '(الزامی، دست‌کم ۲۰ نویسه)' : '(اختیاری برای تصویب)'}</span><textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
                <div className="ds-actions">
                  <button type="button" className="ds-btn is-good" disabled={busy || !method || (needWhy && why.trim().length < 20)} onClick={() => onDecide(override ? 'approve_override' : 'approve', method, pricing, proc, exec, why)}><CheckCircle2 size={15} aria-hidden />تصویب</button>
                  <button type="button" className="ds-btn is-ghost" disabled={busy || why.trim().length < 20} onClick={() => onDecide('return', null, [], [], [], why)}><Undo2 size={15} aria-hidden />برگشت برای اصلاح</button>
                  <button type="button" className="ds-btn is-bad" disabled={busy || why.trim().length < 20} onClick={() => onDecide('reject', null, [], [], [], why)}><XCircle size={15} aria-hidden />رد</button>
                </div>
              </div>
            ) : <p className="ds-muted">در انتظار تصمیم تصویب‌کننده. سطح دسترسی «تصویب‌کنندهٔ راهبرد اجرا» در مدیریت کاربران تعیین می‌شود.</p>
          ) : (study.status === 'approved' || study.status === 'rejected') ? (
            <div className="ds-decide">
              {(() => { const d = [...decisions].reverse().find((x) => ['approve', 'approve_override', 'reject'].includes(x.decision)); return d ? <p><b>{DECISION_FA[d.decision]}</b>{d.method && <> — {nameOf(r, d.method)}</>} · {d.decidedName} · {when(d.decidedAt)}{d.rationale && <><br />{d.rationale}</>}</p> : null })()}
              {canApprove && <>
                <label className="ds-field"><span>دلیل بازگشایی (الزامی، دست‌کم ۲۰ نویسه)</span><textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
                <button type="button" className="ds-btn is-ghost" disabled={busy || why.trim().length < 20} onClick={() => onDecide('reopen', null, [], [], [], why)}><RotateCcw size={15} aria-hidden />بازگشایی برای بازبینی</button>
              </>}
            </div>
          ) : <p className="ds-muted">ابتدا تحلیل را ثبت و برای تصمیم ارسال کنید.</p>}
        </section>
      </div>

      <section className="ds-card" aria-labelledby="ds-h-h">
        <header><h3 id="ds-h-h"><History size={15} aria-hidden />سابقهٔ نسخه‌ها و تصمیم‌ها</h3></header>
        <div className="ds-scroll"><table className="ds-tbl">
          <thead><tr><th scope="col">رویداد</th><th scope="col">جزئیات</th><th scope="col">کاربر</th><th scope="col">زمان</th></tr></thead>
          <tbody>
            {[...versions.map((v) => ({ t: v.createdAt, row: <tr key={v.id}><th scope="row">نسخهٔ {fa(v.version)}</th><td>{nameOf(v.result, v.recommended)} · اطمینان {fa(v.confidence)}{v.decisive ? '' : ' (غیرقطعی)'}{v.note && ` · ${v.note}`}{v.narrative ? ' · خلاصهٔ هوشمند' : ''}</td><td>{v.createdName}</td><td>{when(v.createdAt)}</td></tr> })),
              ...decisions.map((d) => ({ t: d.decidedAt, row: <tr key={d.id} className={`is-${d.decision}`}><th scope="row">{DECISION_FA[d.decision]}</th><td>{d.method ? nameOf(versions.find((v) => v.id === d.versionId)?.result ?? null, d.method) : ''}{d.overridesEngine ? ' · متفاوت از پیشنهاد موتور' : ''}{d.rationale && ` · ${d.rationale}`}</td><td>{d.decidedName}</td><td>{when(d.decidedAt)}</td></tr> }))]
              .sort((a, b) => b.t.localeCompare(a.t)).map((x) => x.row)}
          </tbody>
        </table></div>
      </section>
    </div>
  )
}
