import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, Trash2, Upload } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { supabase } from '../../../lib/supabaseClient'
import { useEpcModel, type EpcModel } from '../../execution/lib/useEpcModel'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { engProgress, DEFAULT_ENG_RULES, type Impact } from '../../execution/lib/engine/engineering'
import { parseDate } from '../../execution/lib/engine/scheduleImport'
import { readXlsx } from '../../material/lib/control/xlsx'
import { addDays, daysBetween, jalaliText } from '../../execution/lib/periods'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { Empty, fa, pct } from '../../execution/components/common'
import { EpcGate } from '../../execution/components/epc/EpcBanner'
import { ProgressCurve } from '../../execution/components/ProgressCurve'
import { ENG_STATUS_LABEL_FA, type EngDocRow, type EngStatus } from '../../execution/epcTypes'

const READY_FA = { ready: 'آماده', ready_with_restrictions: 'آماده با محدودیت', not_ready: 'غیرآماده' } as const
const READY_TONE = { ready: 'good', ready_with_restrictions: 'warn', not_ready: 'bad' } as const
const d = (x: string | null) => (x ? jalaliText(x) : '—')

/** Engineering progress & execution readiness. Scope: register, dates, weights, links to activities, readiness and schedule impact — no files, revisions or correspondence. */
export function EngPage(p: { projectId: string; sub: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useEpcModel(projectId)
  const can = useExecutionStore((s) => s.can(projectId, 'edit_activities'))
  if (sub === 'register') return <Register m={m} projectId={projectId} can={can} />
  if (sub === 'links') return <Links m={m} projectId={projectId} can={can} />
  if (sub === 'impact') return <ImpactView m={m} projectId={projectId} />
  return <Dash m={m} />
}

function Dash({ m }: { m: EpcModel }) {
  const { eng } = m
  if (!m.engDocs.length) return <Empty><b style={{ display: 'block', marginBottom: 6 }}>فهرست مدارک مهندسی خالی است</b>در «فهرست مدارک» مدارک موردنیاز را با وزن و تاریخ‌های برنامه‌ای ثبت کنید (یا از اکسل وارد کنید).</Empty>
  const pr = eng.progress
  const from = m.engDocs.flatMap((x) => [x.plannedPrepared, x.actualPrepared]).filter((x): x is string => !!x).sort()[0] ?? m.today
  const to = [...m.engDocs.flatMap((x) => [x.plannedApproved, x.actualApproved]).filter((x): x is string => !!x), m.today].sort().slice(-1)[0]
  const span = Math.max(14, daysBetween(from, to)), step = Math.max(7, Math.ceil(span / 24 / 7) * 7)
  const curve = []
  for (let t = from; t <= to; t = addDays(t, step)) { const s = engProgress(m.engDocs, t); curve.push({ date: t, planned: s.plannedScore, actual: t <= m.today ? s.actualScore : 0, registered: t <= m.today ? s.actualPrepared : 0 }) }
  const rows = (b: typeof eng.byDiscipline) => b.map((x) => ({ key: x.key, ...x.p }))
  type R = ReturnType<typeof rows>[number]
  const cols: Col<R>[] = [
    { key: 'k', label: 'گروه', render: (r) => <span className="strong">{r.key}</span> }, { key: 'n', label: 'مدرک', num: true, render: (r) => fa(r.docs) },
    { key: 'pp', label: 'تهیه — برنامه', num: true, render: (r) => pct(r.plannedPrepared, 0) }, { key: 'ap', label: 'تهیه — واقعی', num: true, render: (r) => pct(r.actualPrepared, 0) },
    { key: 'pa', label: 'تأیید — برنامه', num: true, render: (r) => pct(r.plannedApproved, 0) }, { key: 'aa', label: 'تأیید — واقعی', num: true, render: (r) => pct(r.actualApproved, 0) },
    { key: 'rd', label: 'آمادهٔ اجرا', num: true, render: (r) => pct(r.ready, 0) },
    { key: 'sc', label: 'امتیاز وزنی (واقعی ÷ برنامه)', num: true, render: (r) => <><b>{pct(r.actualScore, 0)}</b><span className="sub">برنامه {pct(r.plannedScore, 0)}</span></>, sort: (r) => r.actualScore },
  ]
  const late = m.engDocs.filter((x) => x.status !== 'approved' && x.status !== 'superseded').map((x) => ({ doc: x, fc: m.docFc.get(x.id)! })).filter((x) => x.fc.overdue || (x.fc.expectedApproval && x.doc.plannedApproved && x.fc.expectedApproval > x.doc.plannedApproved)).sort((a, b) => b.fc.overdueDays - a.fc.overdueDays).slice(0, 12)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="امتیاز پیشرفت وزنی مهندسی" value={pct(pr.actualScore, 1)} tone={pr.actualScore + 0.03 >= pr.plannedScore ? 'good' : 'warn'} sub={`برنامه ${pct(pr.plannedScore, 1)}`} />
        <KpiCard i={1} label="پیشرفت تهیه" value={pct(pr.actualPrepared, 1)} sub={`برنامه ${pct(pr.plannedPrepared, 1)}`} />
        <KpiCard i={2} label="پیشرفت تأیید" value={pct(pr.actualApproved, 1)} sub={`برنامه ${pct(pr.plannedApproved, 1)}`} />
        <KpiCard i={3} label="آمادهٔ اجرا" value={pct(pr.ready, 1)} sub="تأییدشده کامل + سهم تأیید با محدودیت" />
      </div>
      <div className="fn-kpis">
        <KpiCard i={0} label="پیش‌بینی تکمیل همهٔ مدارک" value={eng.completion.date ? jalaliText(eng.completion.date) : '—'} sub={eng.completion.reason} />
        <KpiCard i={1} label="مدارک بحرانی باز" value={fa(eng.criticalOpen.length)} tone={eng.criticalOpen.some((c) => c.fc.overdue) ? 'bad' : 'neutral'} sub={`${fa(eng.criticalOpen.filter((c) => c.fc.overdue).length)} عقب‌افتاده`} />
        <KpiCard i={2} label="فعالیت غیرآمادهٔ اجرا" value={fa(eng.notReady.length)} tone={eng.notReady.length ? 'bad' : 'good'} />
        <KpiCard i={3} label="بیشترین اثر بر تکمیل پروژه" value={eng.slipMax == null ? 'نامشخص' : `${eng.slipMax} روز`} tone={eng.slipMax ? 'bad' : 'neutral'} sub="پس از کسر شناوری یا فعالیت جایگزین" />
      </div>
      <Section title="روند پیشرفت مهندسی" hint="برنامه بر پایهٔ تاریخ‌های برنامه‌ای تهیه/تأیید هر مدرک؛ واقعی بر پایهٔ تاریخ‌ها/وضعیت ثبت‌شده؛ خط آبی: پیشرفت تهیه"><ProgressCurve data={curve} h={220} /></Section>
      <Section title="به‌تفکیک رشته" flush><DataTable cols={cols} rows={rows(eng.byDiscipline)} rowKey={(r) => r.key} /></Section>
      {eng.byContract.length > 1 && <Section title="به‌تفکیک پیمان" flush><DataTable cols={cols} rows={rows(eng.byContract)} rowKey={(r) => r.key} /></Section>}
      <Section title="مدارک عقب‌افتاده یا در معرض تأخیر" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>مدرک</th><th>رشته</th><th>وضعیت</th><th>تأیید برنامه‌ای</th><th>تأیید پیش‌بینی</th><th className="num">عقب‌افتادگی</th><th>مبنای پیش‌بینی</th></tr></thead>
          <tbody>{late.length ? late.map(({ doc, fc }) => <tr key={doc.id}><td><b>{doc.code}</b>{doc.critical && <Chip tone="bad">بحرانی</Chip>}<span className="sub">{doc.title}</span></td><td>{doc.discipline}</td><td>{ENG_STATUS_LABEL_FA[doc.status]}</td><td>{d(doc.plannedApproved)}</td><td>{fc.expectedApproval ? d(fc.expectedApproval) : 'نامشخص'}</td><td className="num">{fc.overdue ? `${fa(fc.overdueDays)} روز` : '—'}</td><td className="sub">{fc.reason}</td></tr>) : <tr><td colSpan={7} className="sub">مدرک عقب‌افتاده‌ای نیست.</td></tr>}</tbody></table></div>
      </Section>
      <div className="im-card" style={{ padding: 12, fontSize: 12.5, lineHeight: 1.9 }}>
        <b>روش محاسبه (قابل کنترل):</b> هر مدرک با وزن خودش در پیشرفت شرکت می‌کند (وزن صفر یا منسوخ حذف می‌شود). «تهیه» از وضعیت تهیه‌شده به بعد و «تأیید» از وضعیت تأییدشده یا تأیید با محدودیت شمرده می‌شود. «آمادهٔ اجرا» فقط تأیید کامل را ۱۰۰٪ و تأیید با محدودیت را {pct(DEFAULT_ENG_RULES.restrictedCredit, 0)} حساب می‌کند. امتیاز وزنی = {pct(DEFAULT_ENG_RULES.prepWeight, 0)} تهیه + {pct(DEFAULT_ENG_RULES.approveWeight, 0)} تأیید. پیش‌بینی تأخیر هر مدرک از میانگین انحراف مدارک تکمیل‌شدهٔ همان رشته (حداقل {DEFAULT_ENG_RULES.minSample} مدرک) و پیش‌بینی تکمیل کل از نرخ تأیید {DEFAULT_ENG_RULES.windowDays} روز اخیر (حداقل دو تأیید) به‌دست می‌آید؛ در غیر این صورت «نامشخص» نمایش داده می‌شود.
      </div>
    </div>
  )
}

const EMPTY = { docNo: '', title: '', discipline: '', contract: '', preparer: '', approver: '', rev: '', weight: 1, plannedPrepared: '', plannedApproved: '', critical: false }
function Register({ m, projectId, can }: { m: EpcModel; projectId: string; can: boolean }) {
  const epc = useEpcStore()
  const docs = epc.engDocs.filter((x) => x.projectId === projectId)
  const [f, setF] = useState(EMPTY)
  const [flt, setFlt] = useState({ disc: '', st: '' })
  const ref = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const discs = [...new Set(docs.map((x) => x.discipline).filter(Boolean))]
  const shown = docs.filter((x) => (!flt.disc || x.discipline === flt.disc) && (!flt.st || x.status === flt.st))
  const upd = (x: EngDocRow, p: Partial<EngDocRow>) => void epc.saveEngDoc({ ...x, ...p })
  const importFile = async (file: File) => {
    const rows = await readXlsx(file), pick = (r: Record<string, unknown>, ...k: string[]) => { for (const key of Object.keys(r)) if (k.includes(key.trim().toLowerCase())) return r[key]; return '' }
    let ok = 0
    for (const r of rows) {
      const no = String(pick(r, 'شناسه', 'شماره مدرک', 'doc_no', 'document no', 'کد')).trim(); if (!no) continue
      const okSave = await epc.saveEngDoc({ projectId, docNo: no, rev: String(pick(r, 'rev', 'ویرایش')), title: String(pick(r, 'عنوان', 'title')), discipline: String(pick(r, 'رشته', 'discipline')), contract: String(pick(r, 'پیمان', 'contract')), preparer: String(pick(r, 'مسئول تهیه', 'preparer')), approver: String(pick(r, 'مسئول تأیید', 'approver')), weight: Number(pick(r, 'وزن', 'weight')) || 1, plannedPrepared: parseDate(pick(r, 'تاریخ برنامه تهیه', 'planned prepared') as never), plannedApproved: parseDate(pick(r, 'تاریخ برنامه تأیید', 'planned approved') as never), critical: ['1', 'بله', 'true', 'yes', 'بحرانی'].includes(String(pick(r, 'بحرانی', 'critical')).trim().toLowerCase()) })
      if (okSave) ok++; else break
    }
    setMsg(`${fa(ok)} مدرک وارد شد.`)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>این فهرست فقط شناسه، وزن، تاریخ‌ها و وضعیت مدارک را پایش می‌کند؛ فایل نقشه‌ها، نسخه‌های فنی و مکاتبات در سامانهٔ مدیریت مدارک پروژه می‌مانند. تاریخ‌های واقعی با رسیدن به وضعیت «تهیه‌شده» و «تأییدشده» خودکار پر می‌شوند و قابل اصلاح‌اند.</p>
      {can && <div className="im-card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">شناسه *<input value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} dir="ltr" style={{ width: 120 }} /></label>
        <label className="ex-lab">Rev<input value={f.rev} onChange={(e) => setF({ ...f, rev: e.target.value })} dir="ltr" style={{ width: 50 }} /></label>
        <label className="ex-lab">عنوان<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" style={{ width: 200 }} /></label>
        <label className="ex-lab">رشته<input list="eng-disc" value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} dir="auto" style={{ width: 110 }} /></label><datalist id="eng-disc">{discs.map((x) => <option key={x} value={x} />)}</datalist>
        <label className="ex-lab">پیمان<input value={f.contract} onChange={(e) => setF({ ...f, contract: e.target.value })} dir="auto" style={{ width: 100 }} /></label>
        <label className="ex-lab">مسئول تهیه<input value={f.preparer} onChange={(e) => setF({ ...f, preparer: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
        <label className="ex-lab">مسئول تأیید<input value={f.approver} onChange={(e) => setF({ ...f, approver: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
        <label className="ex-lab">وزن<input type="number" min={0} step="0.5" value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) || 0 })} style={{ width: 70 }} /></label>
        <label className="ex-lab">تهیه (برنامه)<JalaliDateInput value={f.plannedPrepared} onChange={(x) => setF({ ...f, plannedPrepared: x })} /></label>
        <label className="ex-lab">تأیید (برنامه)<JalaliDateInput value={f.plannedApproved} onChange={(x) => setF({ ...f, plannedApproved: x })} /></label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={f.critical} onChange={(e) => setF({ ...f, critical: e.target.checked })} /> بحرانی</label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.docNo.trim()} onClick={() => void epc.saveEngDoc({ projectId, ...f, plannedPrepared: f.plannedPrepared || null, plannedApproved: f.plannedApproved || null }).then((ok) => ok && setF(EMPTY))}><Plus size={13} /> مدرک</button>
        <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void importFile(x); e.target.value = '' }} /><button className="im-btn im-btn-sm" onClick={() => ref.current?.click()}><Upload size={13} /> ورود از اکسل</button>
      </div>}
      {msg && <div className="im-card" style={{ padding: 10 }}>{msg}</div>}
      <div className="mt-filters"><select value={flt.disc} onChange={(e) => setFlt({ ...flt, disc: e.target.value })} aria-label="رشته"><option value="">همهٔ رشته‌ها</option>{discs.map((x) => <option key={x}>{x}</option>)}</select><select value={flt.st} onChange={(e) => setFlt({ ...flt, st: e.target.value })} aria-label="وضعیت"><option value="">همهٔ وضعیت‌ها</option>{Object.entries(ENG_STATUS_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="im-helper" style={{ margin: 0 }}>{fa(shown.length)} مدرک</span></div>
      <div className="im-card" style={{ padding: 0 }}><div className="fn-tbl-wrap" style={{ maxHeight: 520 }}><table className="ex-lines"><thead><tr><th>شناسه</th><th>عنوان / رشته</th><th>مسئولان</th><th className="num">وزن</th><th>تهیه (برنامه / واقعی)</th><th>تأیید (برنامه / واقعی)</th><th>وضعیت</th><th>توضیح مدیریتی</th><th /></tr></thead>
        <tbody>{shown.map((x) => { const fc = m.docFc.get(x.id); return (
          <tr key={x.id} className={x.status === 'approved' ? 'locked' : undefined}>
            <td className="fn-code">{x.docNo}{x.rev && <small> Rev {x.rev}</small>}{x.critical && <Chip tone="bad">بحرانی</Chip>}</td>
            <td>{x.title}<span className="sub">{x.discipline}{x.contract ? ` · ${x.contract}` : ''}</span></td>
            <td className="sub">{x.preparer || '—'} / {x.approver || '—'}</td>
            <td className="num">{can ? <input type="number" min={0} step="0.5" defaultValue={x.weight} onBlur={(e) => Number(e.target.value) !== x.weight && upd(x, { weight: Number(e.target.value) || 0 })} style={{ width: 60 }} aria-label="وزن" /> : fa(x.weight, 1)}</td>
            <td>{d(x.plannedPrepared)} / {can ? <JalaliDateInput value={x.actualPrepared ?? ''} onChange={(v) => upd(x, { actualPrepared: v || null })} /> : d(x.actualPrepared)}</td>
            <td>{d(x.plannedApproved)} / {can ? <JalaliDateInput value={x.actualApproved ?? ''} onChange={(v) => upd(x, { actualApproved: v || null })} /> : d(x.actualApproved)}{fc?.overdue && <small className="ex-bad" style={{ display: 'block' }}>{fa(fc.overdueDays)} روز دیرکرد</small>}</td>
            <td>{can ? <select value={x.status} onChange={(e) => upd(x, { status: e.target.value as EngStatus })} aria-label="وضعیت">{Object.entries(ENG_STATUS_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : ENG_STATUS_LABEL_FA[x.status]}{x.status === 'restricted' && can && <input defaultValue={x.restrictionNote} placeholder="محدودیت اجرایی" dir="auto" onBlur={(e) => e.target.value !== x.restrictionNote && upd(x, { restrictionNote: e.target.value })} />}</td>
            <td style={{ minWidth: 170 }}>{can ? <input defaultValue={x.note} dir="auto" onBlur={(e) => e.target.value !== x.note && upd(x, { note: e.target.value })} aria-label="توضیح" /> : x.note}</td>
            <td>{can && <label title="مدرک بحرانی" style={{ fontSize: 11 }}><input type="checkbox" checked={x.critical} onChange={(e) => upd(x, { critical: e.target.checked })} /></label>}</td>
          </tr>) })}</tbody></table></div></div>
    </div>
  )
}

function Links({ m, projectId, can }: { m: EpcModel; projectId: string; can: boolean }) {
  const epc = useEpcStore()
  const docs = epc.engDocs.filter((x) => x.projectId === projectId)
  const acts = m.ex.activities.filter((a) => a.active && a.approval === 'approved')
  const [f, setF] = useState({ docId: '', activityId: '', front: '', needKind: 'start' as 'start' | 'continue', needDate: '', minStatus: 'approved' as 'issued' | 'approved', allowRestricted: false, altActivityId: '' })
  const links = epc.docLinks.filter((l) => l.projectId === projectId)
  const imp = new Map(m.impacts.map((i) => [i.linkId, i]))
  const doc = (id: string) => m.docById.get(id)
  const act = (id: string) => m.ex.actById.get(id)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>هر ارتباط می‌گوید این مدرک برای شروع یا ادامهٔ کدام فعالیت لازم است، تا چه تاریخی (مستقل از تاریخ برنامه‌ای صدور مدرک) و باید به چه وضعیتی رسیده باشد. اگر برای فعالیتی فعالیت جایگزین تعریف شود، اثر تأخیر روی برنامه با فرض اجرای جایگزین محاسبه می‌شود.</p>
      {can && <div className="im-card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">مدرک<select value={f.docId} onChange={(e) => setF({ ...f, docId: e.target.value })} style={{ maxWidth: 240 }}><option value="">—</option>{docs.map((x) => <option key={x.id} value={x.id}>{x.docNo} — {x.title.slice(0, 30)}</option>)}</select></label>
        <label className="ex-lab">فعالیت<select value={f.activityId} onChange={(e) => setF({ ...f, activityId: e.target.value })} style={{ maxWidth: 300 }}><option value="">—</option>{acts.map((a) => <option key={a.id} value={a.id}>{a.itemNo ? `${a.itemNo} — ` : ''}{a.title}</option>)}</select></label>
        <label className="ex-lab">جبهه<input value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} dir="auto" style={{ width: 90 }} /></label>
        <label className="ex-lab">نوع نیاز<select value={f.needKind} onChange={(e) => setF({ ...f, needKind: e.target.value as 'start' | 'continue' })}><option value="start">برای شروع</option><option value="continue">برای ادامه</option></select></label>
        <label className="ex-lab">تاریخ موردنیاز<JalaliDateInput value={f.needDate} onChange={(x) => setF({ ...f, needDate: x })} /></label>
        <label className="ex-lab">حداقل وضعیت<select value={f.minStatus} onChange={(e) => setF({ ...f, minStatus: e.target.value as 'issued' | 'approved' })}><option value="approved">تأییدشده</option><option value="issued">تهیه‌شده/صادرشده</option></select></label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={f.allowRestricted} onChange={(e) => setF({ ...f, allowRestricted: e.target.checked })} /> تأیید با محدودیت کافی است</label>
        <label className="ex-lab">فعالیت جایگزین<select value={f.altActivityId} onChange={(e) => setF({ ...f, altActivityId: e.target.value })} style={{ maxWidth: 220 }}><option value="">ندارد</option>{acts.filter((a) => a.id !== f.activityId).map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 40)}</option>)}</select></label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.docId || !f.activityId} onClick={() => void epc.saveDocLink({ projectId, docId: f.docId, activityId: f.activityId, front: f.front, needKind: f.needKind, needDate: f.needDate || null, minStatus: f.minStatus, allowRestricted: f.allowRestricted, altActivityId: f.altActivityId || null })}><Plus size={13} /> ارتباط</button>
      </div>}
      <Section title="ارتباط‌های ثبت‌شده" flush><div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>مدرک</th><th>فعالیت</th><th>جبهه</th><th>نوع</th><th>تاریخ موردنیاز</th><th>حداقل وضعیت</th><th>وضعیت مدرک</th><th>نتیجه</th><th /></tr></thead>
        <tbody>{links.map((l) => { const i = imp.get(l.id); return <tr key={l.id}><td className="fn-code">{doc(l.docId)?.code ?? '—'}</td><td>{act(l.activityId)?.title ?? '—'}</td><td>{l.front || '—'}</td><td>{l.needKind === 'start' ? 'شروع' : 'ادامه'}</td><td>{d(l.needDate)}</td><td>{l.minStatus === 'approved' ? 'تأییدشده' : 'تهیه‌شده'}{l.allowRestricted ? ' / با محدودیت' : ''}</td><td>{ENG_STATUS_LABEL_FA[docs.find((x) => x.id === l.docId)?.status ?? 'required']}</td><td>{i ? <Chip tone={i.state === 'ok' ? 'good' : i.state === 'restricted' ? 'warn' : 'bad'}>{i.state === 'ok' ? 'برقرار' : i.state === 'restricted' ? 'با محدودیت' : i.state === 'missing' ? 'مدرک نامعتبر' : 'برقرار نیست'}</Chip> : '—'}</td><td>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void epc.removeDocLink(l.id)}><Trash2 size={12} /></button>}</td></tr> })}
          {!links.length && <tr><td colSpan={9} className="sub">ارتباطی ثبت نشده است.</td></tr>}</tbody></table></div></Section>
    </div>
  )
}

function ImpactView({ m, projectId }: { m: EpcModel; projectId: string }) {
  const epc = useEpcStore()
  const canRaise = useExecutionStore((s) => s.can(projectId, 'raise'))
  const [raised, setRaised] = useState<Map<string, string>>(new Map())
  const [note, setNote] = useState('')
  useEffect(() => { void supabase.from('ex_links').select('source_id, target_type').eq('source_type', 'doc').eq('project_id', projectId).then(({ data }) => setRaised(new Map(((data ?? []) as { source_id: string; target_type: string }[]).map((r) => [`${r.source_id}:${r.target_type}`, 'ثبت‌شده'])))) }, [projectId, epc.docLinks.length])
  const acts = useMemo(() => [...m.insights.values()].filter((i) => i.impacts.length > 0 && i.remaining > 0), [m.insights])
  const title = (id: string) => m.ex.actById.get(id)?.title ?? '—'
  const raise = async (im: Impact, target: 'issue' | 'risk') => {
    const doc = m.docById.get(im.docId); if (!doc) return
    const a = m.ex.actById.get(im.activityId)
    const text = `${target === 'issue' ? 'عدم آمادگی' : 'خطر تأخیر'} مدرک ${doc.code}${doc.title ? ` (${doc.title})` : ''} برای فعالیت «${a?.title}»`
    const desc = `مدرک ${doc.code} باید تا ${im.needDate ?? '—'} به وضعیت لازم برسد.${m.docFc.get(doc.id)?.expectedApproval ? ` تاریخ پیش‌بینی تأیید: ${m.docFc.get(doc.id)!.expectedApproval}.` : ''} اثر محاسبه‌شده بر شروع فعالیت: ${im.startSlipDays ?? 'نامشخص'} روز؛ بر تکمیل پروژه: ${im.projectSlipDays ?? 'نامشخص'} روز.\nمسئول تهیه: ${doc.discipline ? '' : ''}${epc.engDocs.find((x) => x.id === doc.id)?.preparer || '—'}؛ مسئول تأیید: ${epc.engDocs.find((x) => x.id === doc.id)?.approver || '—'}.${note ? `\nاقدام اصلاحی: ${note}` : ''}`
    const r = await epc.raiseDoc({ projectId, docId: doc.id, target, title: text, description: desc, severity: (im.projectSlipDays ?? 0) > 14 ? 'critical' : 'high', impactDays: im.projectSlipDays ?? im.startSlipDays, front: a?.front })
    if (r) setRaised((x) => new Map(x).set(`${doc.id}:${target}`, r.existing ? 'به‌روزرسانی شد' : 'ایجاد شد'))
  }
  if (!acts.length) return <Empty>هنوز مدرکی به فعالیتی وصل نشده است یا فعالیت‌های وصل‌شده کار باقیمانده ندارند. از «ارتباط مدارک و فعالیت‌ها» شروع کنید.</Empty>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>آمادگی هر فعالیت از مدارک لازم <b>و</b> سایر پیش‌نیازها (مصالح، تجهیز، نیرو، مجوز، بازرسی) تعیین می‌شود؛ صدور یک نقشه به‌تنهایی فعالیت را آماده نمی‌کند. اثر تأخیر با تاریخ موردنیاز، شناوری و فعالیت جایگزین سنجیده می‌شود و در نبود داده کافی «نامشخص» می‌ماند. با تغییر وضعیت مدرک، نتایج خودکار دوباره محاسبه می‌شوند.</p>
      <label className="ex-lab" style={{ maxWidth: 520 }}>اقدام اصلاحی پیشنهادی برای درج در مسئله/ریسک<input value={note} onChange={(e) => setNote(e.target.value)} dir="auto" /></label>
      {acts.sort((a, b) => ['not_ready', 'ready_with_restrictions', 'ready'].indexOf(a.exec.state) - ['not_ready', 'ready_with_restrictions', 'ready'].indexOf(b.exec.state)).map((i) => (
        <Section key={i.activityId} title={<span>{title(i.activityId)} <Chip tone={READY_TONE[i.exec.state]}>{READY_FA[i.exec.state]}</Chip></span>} hint={i.exec.reasons.join(' · ') || 'همهٔ پیش‌نیازهای ثبت‌شده برقرارند.'}>
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>مدرک</th><th>تاریخ موردنیاز</th><th>تأیید پیش‌بینی</th><th className="num">تأخیر نسبت به نیاز</th><th className="num">اثر بر شروع</th><th className="num">اثر بر تکمیل پروژه</th><th>فرضیات</th><th /></tr></thead>
            <tbody>{i.impacts.map((im) => { const doc = m.docById.get(im.docId); return <tr key={im.linkId}><td><b>{doc?.code}</b>{doc?.critical && <Chip tone="bad">بحرانی</Chip>}</td><td>{d(im.needDate)}</td><td>{im.state === 'ok' ? 'تأیید شده' : m.docFc.get(im.docId)?.expectedApproval ? d(m.docFc.get(im.docId)!.expectedApproval) : 'نامشخص'}</td>
              <td className="num">{im.lateDays == null ? 'نامشخص' : im.lateDays ? `${fa(im.lateDays)} روز` : '—'}</td><td className="num">{im.startSlipDays == null ? 'نامشخص' : im.startSlipDays ? `${fa(im.startSlipDays)} روز` : '—'}</td>
              <td className="num">{im.projectSlipDays == null ? 'نامشخص' : im.projectSlipDays ? <b className="ex-bad">{fa(im.projectSlipDays)} روز</b> : im.absorbedBy === 'float' ? 'جذب شناوری' : im.absorbedBy === 'alternative' ? 'با فعالیت جایگزین' : '—'}</td>
              <td className="sub" style={{ maxWidth: 320 }}>{im.assumptions.join(' ')}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{canRaise && im.state !== 'ok' && (['issue', 'risk'] as const).map((t) => <button key={t} className="im-btn im-btn-sm" onClick={() => void raise(im, t)} title={raised.get(`${im.docId}:${t}`)}><AlertTriangle size={11} /> {t === 'issue' ? 'مسئله' : 'ریسک'}{raised.get(`${im.docId}:${t}`) ? ` ✓` : ''}</button>)}</td></tr> })}</tbody></table></div>
          {i.exec.open.length > 0 && <p className="im-helper" style={{ margin: '8px 0 0' }}>پیش‌نیازهای باز: {i.exec.open.join('، ')}</p>}
        </Section>))}
    </div>
  )
}
