import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Coins, Plus, Search, Trash2, Upload } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { supabase } from '../../../lib/supabaseClient'
import { useEpcModel, type EpcModel } from '../../execution/lib/useEpcModel'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { readXlsx } from '../../material/lib/control/xlsx'
import { jalaliText } from '../../execution/lib/periods'
import type { Impact } from '../../execution/lib/engine/engineering'
import { Chip, Section } from '../../finance/components/fn'
import { NumInput } from '../../finance/components/fn'
import { Empty, fa } from '../../execution/components/common'
import { EpcGate } from '../../execution/components/epc/EpcBanner'
import { ActivityPicker } from '../components/ActivityPicker'
import { EngDash } from './EngDash'
import { EngMyTasks } from './EngMyTasks'
import { isMdlLayout, parseMdl, type MdlResult } from '../lib/mdlImport'
import { readSheetRows } from '../lib/readRows'
import { COURT_LABEL_FA, courtOf } from '../lib/roles'
import { canonDiscipline } from '../lib/disciplines'
import { DocTable } from '../components/DocTable'
import { useLens } from '../components/LensBar'
import { ENG_STATUS_LABEL_FA, type EngDocRow } from '../../execution/epcTypes'

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
  if (sub === 'my') return <EngMyTasks m={m} projectId={projectId} />
  return <EngDash m={m} projectId={projectId} />
}

const EMPTY = { docNo: '', title: '', discipline: '', contract: '', preparer: '', approver: '', rev: '', weight: 1, plannedPrepared: '', plannedApproved: '', critical: false }
function Register({ m, projectId, can }: { m: EpcModel; projectId: string; can: boolean }) {
  const epc = useEpcStore()
  const docs = epc.engDocs.filter((x) => x.projectId === projectId)
  const [f, setF] = useState(EMPTY)
  const [flt, setFlt] = useState({ disc: '', st: '', phase: '', cat: '', court: '', q: '' })
  const [mdl, setMdl] = useState<{ res: MdlResult; file: string } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const ex = useExecutionStore()
  const { lens } = useLens(projectId)
  const settingsAmount = ex.settings(projectId).engAmount ?? 0
  const sumPrice = docs.reduce((a, x) => a + x.price, 0)
  const total = settingsAmount > 0 ? settingsAmount : sumPrice
  const [msg, setMsg] = useState('')
  const [panel, setPanel] = useState<'' | 'add' | 'filter' | 'amount'>('')
  const nFlt = Object.values(flt).filter(Boolean).length
  const discs = [...new Set(docs.map((x) => canonDiscipline(x.discipline, x.docNo)).filter(Boolean))].sort()
  const phases = [...new Set(docs.map((x) => x.phase).filter(Boolean))], cats = [...new Set(docs.map((x) => x.category).filter(Boolean))].sort()
  const qn = flt.q.trim().toLowerCase()
  const shown = docs.filter((x) => (!flt.disc || canonDiscipline(x.discipline, x.docNo) === flt.disc) && (!flt.st || x.status === flt.st) && (!flt.phase || x.phase === flt.phase) && (!flt.cat || x.category === flt.cat) && (!flt.court || courtOf(x.status) === flt.court) && (!qn || `${x.docNo} ${x.title}`.toLowerCase().includes(qn)))
  const upd = (x: EngDocRow, p: Partial<EngDocRow>) => void epc.saveEngDoc({ ...x, ...p })
  const importFile = async (file: File) => {
    const raw = await readSheetRows(file)
    if (isMdlLayout(raw)) { setMdl({ res: parseMdl(raw), file: file.name }); setMsg(''); return }
    const rows = await readXlsx(file), pick = (r: Record<string, unknown>, ...k: string[]) => { for (const key of Object.keys(r)) if (k.includes(key.trim().toLowerCase())) return r[key]; return '' }
    let ok = 0
    for (const r of rows) {
      const no = String(pick(r, 'شناسه', 'شماره مدرک', 'doc_no', 'document no', 'کد')).trim(); if (!no) continue
      const okSave = await epc.saveEngDoc({ projectId, docNo: no, rev: String(pick(r, 'rev', 'ویرایش')), title: String(pick(r, 'عنوان', 'title')), discipline: canonDiscipline(String(pick(r, 'رشته', 'discipline', 'دیسیپلین', 'دسته', 'دسته‌بندی', 'category')), no), contract: String(pick(r, 'پیمان', 'contract')), preparer: String(pick(r, 'مسئول تهیه', 'preparer')), approver: String(pick(r, 'مسئول تأیید', 'approver')), weight: Number(pick(r, 'وزن', 'weight')) || 1 })
      if (okSave) ok++; else break
    }
    setMsg(`${fa(ok)} مدرک وارد شد.`)
  }
  const commitMdl = async () => {
    if (!mdl) return
    const n = await epc.saveEngDocsBulk(mdl.res.docs.map((x) => ({ projectId, docNo: x.docNo, title: x.title, discipline: x.discipline, category: x.category, phase: x.phase, targetIssue: x.targetIssue, price: x.price, weight: x.weight })))
    setMsg(`${fa(n)} مدرک از فهرست MDL وارد/به‌روز شد (وضعیت و تاریخ مدارک موجود دست‌نخورده ماند).`); setMdl(null)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`im-btn im-btn-sm${panel === 'filter' || nFlt ? ' im-btn-primary' : ''}`} onClick={() => setPanel(panel === 'filter' ? '' : 'filter')}><Search size={13} /> جست‌وجو و فیلتر{nFlt ? ` (${fa(nFlt)})` : ''}</button>
        {can && <button className={`im-btn im-btn-sm${panel === 'add' ? ' im-btn-primary' : ''}`} onClick={() => setPanel(panel === 'add' ? '' : 'add')}><Plus size={13} /> مدرک جدید</button>}
        {can && <button className="im-btn im-btn-sm" onClick={() => ref.current?.click()}><Upload size={13} /> ورود از اکسل</button>}
        <button className={`im-btn im-btn-sm${panel === 'amount' ? ' im-btn-primary' : ''}`} onClick={() => setPanel(panel === 'amount' ? '' : 'amount')} title="هزینهٔ هر مدرک = سهم وزن آن از مبلغ کل"><Coins size={13} /> مبلغ کل{total > 0 ? `: ${fa(Math.round(total / 1e6))} م.ر` : ''}</button>
        <span className="im-helper" style={{ margin: 0, marginInlineStart: 'auto' }} title="این فهرست فقط شناسه، وزن، تاریخ‌ها و وضعیت مدارک را پایش می‌کند؛ فایل‌ها و مکاتبات در سامانهٔ مدیریت مدارک می‌مانند. گردش فقط بین پیمانکار و مشاور نظارت است؛ کارفرما می‌تواند کامنت بگذارد.">{fa(shown.length)} مدرک · وزن کل {fa(docs.reduce((a, x) => a + (x.status === 'superseded' ? 0 : x.weight), 0), 1)}</span>
      </div>
      {can && panel === 'add' && <div className="im-card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">شناسه *<input value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} dir="ltr" style={{ width: 120 }} /></label>
        <label className="ex-lab">Rev<input value={f.rev} onChange={(e) => setF({ ...f, rev: e.target.value })} dir="ltr" style={{ width: 50 }} /></label>
        <label className="ex-lab">عنوان<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" style={{ width: 200 }} /></label>
        <label className="ex-lab">رشته<input list="eng-disc" value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} onBlur={(e) => setF((v) => ({ ...v, discipline: canonDiscipline(e.target.value, v.docNo) }))} dir="auto" style={{ width: 110 }} /></label><datalist id="eng-disc">{discs.map((x) => <option key={x} value={x} />)}</datalist>
        <label className="ex-lab">پیمان<input value={f.contract} onChange={(e) => setF({ ...f, contract: e.target.value })} dir="auto" style={{ width: 100 }} /></label>
        <label className="ex-lab">مسئول تهیه<input value={f.preparer} onChange={(e) => setF({ ...f, preparer: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
        <label className="ex-lab">مسئول تأیید<input value={f.approver} onChange={(e) => setF({ ...f, approver: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
        <label className="ex-lab">وزن<input type="number" min={0} step="0.5" value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) || 0 })} style={{ width: 70 }} /></label>
        <label className="ex-lab">تهیه (برنامه)<JalaliDateInput value={f.plannedPrepared} onChange={(x) => setF({ ...f, plannedPrepared: x })} /></label>
        <label className="ex-lab">تأیید (برنامه)<JalaliDateInput value={f.plannedApproved} onChange={(x) => setF({ ...f, plannedApproved: x })} /></label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={f.critical} onChange={(e) => setF({ ...f, critical: e.target.checked })} /> بحرانی</label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.docNo.trim()} onClick={() => void epc.saveEngDoc({ projectId, ...f, discipline: canonDiscipline(f.discipline, f.docNo), plannedPrepared: f.plannedPrepared || null, plannedApproved: f.plannedApproved || null }).then((ok) => ok && setF(EMPTY))}><Plus size={13} /> مدرک</button>
      </div>}
      <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void importFile(x); e.target.value = '' }} />
      {mdl && (
        <div className="im-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
          <b>فهرست MDL شناسایی شد — {mdl.file}</b>
          <span className="im-helper" style={{ margin: 0 }}>{fa(mdl.res.docs.length)} مدرک · {fa(mdl.res.sections)} سرفصل · {fa(mdl.res.duplicates.length)} ردیف تکراری کنار گذاشته شد · مجموع وزن {fa(mdl.res.weightSum, 2)}٪ · مجموع مبلغ {fa(mdl.res.priceSum / 1e9, 1)} میلیارد ریال</span>
          {mdl.res.warnings.map((w) => <span key={w} className="ex-bad" style={{ fontSize: 12 }}>{w}</span>)}
          <div style={{ display: 'flex', gap: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => void commitMdl()}>ورود {fa(mdl.res.docs.length)} مدرک</button><button className="im-btn im-btn-sm" onClick={() => setMdl(null)}>انصراف</button></div>
        </div>
      )}
      {msg && <div className="im-card" style={{ padding: 10 }}>{msg}</div>}
      {panel === 'amount' && <div className="im-card" style={{ padding: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="ex-lab">مبلغ کل مهندسی (ریال)<NumInput value={settingsAmount} label="مبلغ کل مهندسی" decimals={0} onCommit={(n) => can && void ex.saveSettings(projectId, { engAmount: n })} /></label>
        <span className="im-helper" style={{ margin: 0 }}>هزینهٔ هر مدرک = سهم وزن آن از مبلغ کل{settingsAmount > 0 ? '' : sumPrice > 0 ? ' (مبلغ کل از جمع مبلغ مدارک MDL برداشته شد)' : ' — برای نمایش هزینه، مبلغ را وارد کنید'}.</span>
      </div>}
      {panel === 'filter' && <div className="mt-filters" style={{ flexWrap: 'wrap' }}>
        <input value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} placeholder="جست‌وجوی شماره یا عنوان…" dir="auto" aria-label="جست‌وجو" style={{ minWidth: 180 }} />
        <select value={flt.disc} onChange={(e) => setFlt({ ...flt, disc: e.target.value })} aria-label="رشته"><option value="">همهٔ رشته‌ها</option>{discs.map((x) => <option key={x}>{x}</option>)}</select>
        {phases.length > 0 && <select value={flt.phase} onChange={(e) => setFlt({ ...flt, phase: e.target.value })} aria-label="مرحله"><option value="">همهٔ مراحل</option>{phases.map((x) => <option key={x}>{x}</option>)}</select>}
        {cats.length > 0 && <select value={flt.cat} onChange={(e) => setFlt({ ...flt, cat: e.target.value })} aria-label="نوع مدرک"><option value="">همهٔ انواع</option>{cats.map((x) => <option key={x}>{x}</option>)}</select>}
        <select value={flt.st} onChange={(e) => setFlt({ ...flt, st: e.target.value })} aria-label="وضعیت"><option value="">همهٔ وضعیت‌ها</option>{Object.entries(ENG_STATUS_LABEL_FA).filter(([k]) => k !== 'pending_approval').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={flt.court} onChange={(e) => setFlt({ ...flt, court: e.target.value })} aria-label="توپ دست"><option value="">همهٔ طرف‌ها</option>{(['contractor', 'consultant', 'done'] as const).map((c) => <option key={c} value={c}>{COURT_LABEL_FA[c]}</option>)}</select>
      </div>}
      <DocTable docs={shown} all={docs} m={m} can={can} lens={lens} projectId={projectId} total={total} upd={upd} />
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
        <label className="ex-lab">فعالیت<ActivityPicker activities={acts} value={f.activityId} onChange={(id) => setF({ ...f, activityId: id, altActivityId: f.altActivityId === id ? '' : f.altActivityId })} emptyLabel="انتخاب فعالیت…" /></label>
        <label className="ex-lab">جبهه<input value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} dir="auto" style={{ width: 90 }} /></label>
        <label className="ex-lab">نوع نیاز<select value={f.needKind} onChange={(e) => setF({ ...f, needKind: e.target.value as 'start' | 'continue' })}><option value="start">برای شروع</option><option value="continue">برای ادامه</option></select></label>
        <label className="ex-lab">تاریخ موردنیاز<JalaliDateInput value={f.needDate} onChange={(x) => setF({ ...f, needDate: x })} /></label>
        <label className="ex-lab">حداقل وضعیت<select value={f.minStatus} onChange={(e) => setF({ ...f, minStatus: e.target.value as 'issued' | 'approved' })}><option value="approved">تأییدشده</option><option value="issued">تهیه‌شده/صادرشده</option></select></label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={f.allowRestricted} onChange={(e) => setF({ ...f, allowRestricted: e.target.checked })} /> تأیید با محدودیت کافی است</label>
        <label className="ex-lab">فعالیت جایگزین<ActivityPicker activities={acts} value={f.altActivityId} onChange={(id) => setF({ ...f, altActivityId: id })} allowEmpty emptyLabel="ندارد" exclude={f.activityId} title="انتخاب فعالیت جایگزین" width={220} /></label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.docId || !f.activityId} onClick={() => void epc.saveDocLink({ projectId, docId: f.docId, activityId: f.activityId, front: f.front, needKind: f.needKind, needDate: f.needDate || null, minStatus: f.minStatus, allowRestricted: f.allowRestricted, altActivityId: f.altActivityId || null })}><Plus size={13} /> ارتباط</button>
      </div>}
      <Section title="ارتباط‌های ثبت‌شده" flush><div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>مدرک</th><th>فعالیت</th><th>جبهه</th><th>نوع</th><th>تاریخ موردنیاز</th><th>حداقل وضعیت</th><th>وضعیت مدرک</th><th>نتیجه</th><th /></tr></thead>
        <tbody>{links.map((l) => { const i = imp.get(l.id); return <tr key={l.id}><td className="fn-code">{doc(l.docId)?.code ?? '—'}</td><td style={{ maxWidth: 320, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{act(l.activityId) ? `${act(l.activityId)!.itemNo ? `${act(l.activityId)!.itemNo} — ` : ''}${act(l.activityId)!.title}` : '—'}</td><td>{l.front || '—'}</td><td>{l.needKind === 'start' ? 'شروع' : 'ادامه'}</td><td>{d(l.needDate)}</td><td>{l.minStatus === 'approved' ? 'تأییدشده' : 'تهیه‌شده'}{l.allowRestricted ? ' / با محدودیت' : ''}</td><td>{ENG_STATUS_LABEL_FA[docs.find((x) => x.id === l.docId)?.status ?? 'required']}</td><td>{i ? <Chip tone={i.state === 'ok' ? 'good' : i.state === 'restricted' ? 'warn' : 'bad'}>{i.state === 'ok' ? 'برقرار' : i.state === 'restricted' ? 'با محدودیت' : i.state === 'missing' ? 'مدرک نامعتبر' : 'برقرار نیست'}</Chip> : '—'}</td><td>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void epc.removeDocLink(l.id)}><Trash2 size={12} /></button>}</td></tr> })}
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
