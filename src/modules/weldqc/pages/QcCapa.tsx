import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlarmClock, ArrowLeft, BellRing, CheckCircle2, ClipboardCheck, PenLine, Plus, Radar, Save, ShieldAlert, Users, Wrench, X } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useRemembered } from '../../../lib/navMemory'
import * as repo from '../repo'
import { fa, faDate } from '../lib/useQc'
import { ESCALATE_FA, STEPS, loopKpis, type Severity } from '../lib/capa'
import { triggerPayload, useCapa } from '../lib/useCapa'
import { RULE_FA, SEV_COLOR, SEV_FA, STATUS_COLOR, STATUS_FA } from '../lib/capaSheet'
import { CapaCase } from './CapaCase'

type Filter = 'live' | 'late' | 'mine' | 'closed' | 'all'
const FILTER_FA: Record<Filter, string> = { live: 'در جریان', late: 'عقب‌افتاده', mine: 'منتظر من', closed: 'بسته', all: 'همه' }

/**
 * بهبود کیفیت — the register of corrective and preventive action cases. Serious and recurring problems open a case by
 * themselves; from there the team cannot move on without a root-cause meeting, signed minutes, corrective and preventive
 * actions with owners and dates, and a check that the actions worked.
 */
export function QcCapa({ onOpenWeld }: { onOpenWeld: (id: string) => void }) {
  const st = useWqStore()
  const { cases, pending, today } = useCapa()
  const epc = useEpcStore()
  const [open, setOpen] = useRemembered<string | null>('capa', null, (v) => v === null || typeof v === 'string')
  const [filter, setFilter] = useState<Filter>('live')
  const [draft, setDraft] = useState<{ title: string; problem: string; severity: Severity; ncrId: string } | null>(null)
  const can = st.caps.edit || st.caps.submit || st.caps.approve || st.caps.configure
  useEffect(() => { if (!epc.loaded) void epc.fetchAll() }, [epc.loaded, epc])
  // a headline of the ticker (or a tile) asked for one case
  useEffect(() => { const h = (e: Event) => { const id = (e as CustomEvent<{ capa?: string }>).detail?.capa; if (id) setOpen(id) }; window.addEventListener('qc:capa', h); return () => window.removeEventListener('qc:capa', h) }, [setOpen])

  const k = useMemo(() => loopKpis(st.capa, today), [st.capa, today])
  const cur = open ? cases.find((x) => x.c.id === open) : undefined
  if (cur) return <CapaCase item={cur} onBack={() => setOpen(null)} onOpenWeld={onOpenWeld} />

  const live = cases.filter((x) => x.c.status !== 'closed' && x.c.status !== 'void')
  const shown = cases.filter((x) => filter === 'all' ? true : filter === 'closed' ? x.c.status === 'closed' || x.c.status === 'void' : filter === 'late' ? x.late.late : filter === 'mine' ? x.mySign || x.myActions > 0 : x.c.status !== 'closed' && x.c.status !== 'void')
  const count: Record<Filter, number> = { live: live.length, late: cases.filter((x) => x.late.late).length, mine: cases.filter((x) => x.mySign || x.myActions > 0).length, closed: cases.length - live.length, all: cases.length }
  const kpis = [
    { icon: ShieldAlert, c: '#ef4444', v: fa(k.open), l: 'پروندهٔ باز', s: `${fa(live.filter((x) => x.c.mandatory).length)} الزامی` },
    { icon: AlarmClock, c: '#f97316', v: fa(k.overdueMeeting), l: 'جلسهٔ ریشه‌یابی عقب‌افتاده', s: 'مهلت برگزاری گذشته است' },
    { icon: PenLine, c: '#0ea5e9', v: fa(cases.filter((x) => x.c.status === 'rca' && x.attendees.some((a) => a.round === x.c.round && a.present && !a.signedAt)).length), l: 'منتظر امضای صورتجلسه', s: 'توافق هنوز کامل نیست' },
    { icon: Wrench, c: '#a855f7', v: fa(st.capaActions.filter((a) => a.status === 'open' && a.dueDate < today && live.some((x) => x.c.id === a.caseId)).length), l: 'اقدام مهلت‌گذشته', s: `${fa(st.capaActions.filter((a) => a.status === 'open').length)} اقدام باز` },
    { icon: CheckCircle2, c: '#22c55e', v: k.effectivePct == null ? '—' : `${fa(k.effectivePct, 0)}٪`, l: 'اثربخشی در اولین دور', s: `${fa(k.closed)} پروندهٔ بسته${k.medianDays != null ? ` · میانه ${fa(k.medianDays, 0)} روز` : ''}` },
  ]
  const openTrigger = (t: (typeof pending)[number]) => void st.run('پرونده باز شد', async () => { setOpen(await repo.capaOpen(st.projectId!, triggerPayload(t))) })
  const saveDraft = async () => {
    if (!draft) return
    let id = ''
    const ok = await st.run('پرونده باز شد', async () => { id = await repo.capaOpen(st.projectId!, { title: draft.title, problem: draft.problem, severity: draft.severity, source: draft.ncrId ? 'ncr' : 'manual', rule: draft.ncrId ? 'ncr' : 'manual', ncr_id: draft.ncrId || null, fingerprint: draft.ncrId ? `ncr:${draft.ncrId}` : null }) })
    if (ok) { setDraft(null); setOpen(id) }
  }
  const ncrs = epc.ncrs.filter((n) => n.projectId === st.projectId && n.status !== 'void' && n.status !== 'closed')

  return (
    <div className="cp">
      <header className="qc-home-head">
        <span className="qc-home-ico cp-ico" aria-hidden><Radar size={20} /></span>
        <div><b>اقدام اصلاحی و پیشگیرانه (CAPA)</b><small>اشکال‌های مهم و تکرارشونده به‌صورت خودکار پرونده می‌شوند. هر پرونده تا برگزاری جلسهٔ ریشه‌یابی، امضای صورتجلسه توسط همهٔ حاضران، تعیین اقدام اصلاحی و پیشگیرانه و تأیید اثربخشی آن‌ها باز می‌ماند و مهلت‌گذشته‌ها به ردهٔ بالاتر گزارش می‌شوند.</small></div>
        {can && !draft && <button type="button" className="ps-btn is-primary wq-head-link" onClick={() => setDraft({ title: '', problem: '', severity: 'major', ncrId: '' })}><Plus size={14} aria-hidden /> پروندهٔ جدید</button>}
      </header>
      <div className="wq-kpis">{kpis.map(({ icon: I, c, v, l, s }, i) => (
        <div key={l} className="wq-kpi wq-rise" style={{ '--c': c, '--i': i } as CSSProperties}><span className="wq-kpi-ico"><I size={17} aria-hidden /></span><b>{v}</b><span>{l}</span><small>{s}</small></div>
      ))}</div>

      {draft && (
        <form className="wq-card wq-form" onSubmit={(e) => { e.preventDefault(); void saveDraft() }}>
          <b className="is-wide">پروندهٔ جدید اقدام اصلاحی / پیشگیرانه</b>
          <label className="is-wide"><span>عنوان مسئله *</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="مثلاً: تخلخل مکرر در پاس ریشهٔ جبههٔ ۲" /></label>
          <label className="is-wide"><span>شرح مسئله و شواهد</span><textarea rows={3} value={draft.problem} onChange={(e) => setDraft({ ...draft, problem: e.target.value })} /></label>
          <label><span>شدت</span><select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}>{(Object.keys(SEV_FA) as Severity[]).map((s) => <option key={s} value={s}>{SEV_FA[s]}</option>)}</select></label>
          <label><span>NCR مرتبط (اختیاری)</span><select value={draft.ncrId} onChange={(e) => setDraft({ ...draft, ncrId: e.target.value })}><option value="">—</option>{ncrs.map((n) => <option key={n.id} value={n.id}>{n.code} · {n.description.slice(0, 40)}</option>)}</select></label>
          <p className="is-wide ps-meta">مهلت برگزاری جلسه از روی شدت تعیین می‌شود: بحرانی ۲ روز، عمده ۵ روز، جزئی ۱۰ روز.</p>
          <div className="is-wide wq-form-actions"><button type="submit" className="ps-btn is-primary" disabled={draft.title.trim().length < 3}><Save size={14} aria-hidden /> باز کردن پرونده</button><button type="button" className="ps-btn is-ghost" onClick={() => setDraft(null)}><X size={14} aria-hidden /> انصراف</button></div>
        </form>
      )}

      {pending.length > 0 && (
        <section className="wq-card cp-pending">
          <header className="wq-card-head"><BellRing size={16} aria-hidden /><h3>الگوهای تشخیص‌داده‌شده که هنوز پرونده ندارند</h3></header>
          <ul className="cp-trig">{pending.map((t) => (
            <li key={t.fingerprint} className={t.mandatory ? 'is-must' : ''} style={{ '--c': SEV_COLOR[t.severity] } as CSSProperties}>
              <div><b>{t.title}</b><p>{t.problem}</p><small>{RULE_FA[t.rule]} · {t.evidence}</small></div>
              <span className="wq-state" style={{ '--c': t.mandatory ? '#ef4444' : '#64748b' } as CSSProperties}>{t.mandatory ? 'جلسه الزامی است' : 'پیشنهاد بررسی'}</span>
              {can && <button type="button" className="ps-btn" onClick={() => openTrigger(t)}><Plus size={14} aria-hidden /> باز کردن پرونده</button>}
            </li>
          ))}</ul>
          {!st.capaCfg.auto && <p className="ps-hint is-warn">بازشدن خودکار پرونده‌های الزامی در تنظیمات خاموش است.</p>}
        </section>
      )}

      <section className="wq-card">
        <header className="wq-card-head"><ClipboardCheck size={16} aria-hidden /><h3>پرونده‌ها</h3>
          <div className="wq-chips wq-head-link" role="tablist" aria-label="فیلتر پرونده‌ها">{(Object.keys(FILTER_FA) as Filter[]).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>{FILTER_FA[f]} <i>{fa(count[f])}</i></button>)}</div>
        </header>
        {shown.length ? <ul className="cp-list">{shown.map(({ c, late, attendees, actions, mySign, myActions }, i) => {
          const step = STEPS.findIndex((s) => s.key === c.status), people = attendees.filter((a) => a.round === c.round && a.present)
          return (
            <li key={c.id} className="wq-rise" style={{ '--i': Math.min(i, 8), '--c': STATUS_COLOR[c.status] } as CSSProperties}>
              <button type="button" onClick={() => setOpen(c.id)} className={late.late ? 'is-late' : ''}>
                <span className="cp-code"><b className="ps-code" dir="ltr">{c.code}</b>{c.mandatory && <em>الزامی</em>}</span>
                <span className="cp-main"><b>{c.title}</b><small>{RULE_FA[c.rule] ?? c.rule} · {c.ownerName || 'بدون مسئول'} · باز شده {faDate(c.openedAt)}{c.round > 1 ? ` · دور ${fa(c.round)}` : ''}</small></span>
                <span className="wq-state" style={{ '--c': SEV_COLOR[c.severity] } as CSSProperties}>{SEV_FA[c.severity]}</span>
                {c.status === 'void' ? <span className="wq-state" style={{ '--c': STATUS_COLOR.void } as CSSProperties}>{STATUS_FA.void}</span> : (
                  <span className="cp-steps" aria-label={`مرحله: ${STATUS_FA[c.status]}`}>{STEPS.map((s, n) => <i key={s.key} className={n < step ? 'is-done' : n === step ? 'is-now' : ''} />)}<small>{STATUS_FA[c.status]}</small></span>
                )}
                <span className="cp-meta">
                  {late.late ? <em className="is-bad"><AlarmClock size={12} aria-hidden /> {fa(late.days)} روز تأخیر در {late.what} — ارجاع به {ESCALATE_FA[late.level]}</em>
                    : c.status === 'open' || c.status === 'rca' ? <em>مهلت جلسه: {faDate(c.meetingDue)}</em> : c.status === 'verifying' && c.verifyDue ? <em>سنجش اثربخشی از {faDate(c.verifyDue)}</em> : null}
                  {c.status === 'rca' && people.length > 0 && <small><Users size={11} aria-hidden /> {fa(people.filter((a) => a.signedAt).length)} از {fa(people.length)} امضا</small>}
                  {c.status === 'agreed' && <small><Wrench size={11} aria-hidden /> {fa(actions.filter((a) => a.status === 'done').length)} از {fa(actions.length)} اقدام</small>}
                  {(mySign || myActions > 0) && <small className="is-me">{mySign ? 'امضای شما لازم است' : `${fa(myActions)} اقدام به نام شما`}</small>}
                </span>
                <ArrowLeft size={15} aria-hidden className="cp-go" />
              </button>
            </li>
          )
        })}</ul> : <div className="ps-hero-empty cp-empty"><ClipboardCheck size={28} aria-hidden /><b>{cases.length ? 'پرونده‌ای با این فیلتر نیست' : 'هنوز پرونده‌ای باز نشده است'}</b><p>{cases.length ? 'فیلتر دیگری را انتخاب کنید.' : 'با عبور شاخص‌ها از حد مجاز (نرخ تعمیر، عیب تکرارشونده، ترک، برش، NCR با شدت زیاد، مردودی آزمون) پرونده به‌صورت خودکار باز می‌شود؛ پروندهٔ دستی هم از دکمهٔ «پروندهٔ جدید» ثبت می‌شود.'}</p></div>}
      </section>
    </div>
  )
}
