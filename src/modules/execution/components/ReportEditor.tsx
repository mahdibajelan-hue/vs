import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Copy, History, Plus, Printer, Send, Trash2, Wand2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { DecInput } from '../../material/components/control/DecInput'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { fmtD } from '../../finance/components/fn'
import { useExecutionStore, type LineInput } from '../store/useExecutionStore'
import type { ExecutionModel } from '../lib/useExecutionModel'
import { FORM_BY_KEY, STOPPAGE_CATEGORY_FA, type FieldDef } from '../lib/formCatalog'
import { mergeCatalog, resUsed, toRow, type ResRow } from '../lib/resourceCatalog'
import { computeMetrics, cumulativeMetrics, inconsistenciesForReport, missingForReport } from '../lib/forms'
import { cumulative } from '../lib/progress'
import type { Activity, Report, ReportLine, ReportResource, Stoppage, StoppageCategory } from '../types'
import { LINE_STATUS_LABEL_FA } from '../types'
import { Chip } from '../../finance/components/fn'
import { LineStatusChip, ReportStatusChip, fa } from './common'
import { PaperModal, type PaperCtx } from './ReportPaper'
import { ActivityPicker } from './ActivityPicker'
import { ResourcePanel } from './ResourcePanel'
import { CrewLogsPanel, type CrewDraft } from './epc/CrewLogsPanel'
import { useEpcStore } from '../store/useEpcStore'
import { WeatherCard } from './WeatherCard'
import { NextDayPlan, NumberedLines, asList, asNext } from './DayNotes'

/** a stoppage row; the delay-register fields ride along so saving the report never drops an assessment or notice */
interface StopRow { key: string; category: StoppageCategory; hours: number; description: string; materialId: string | null; responsibility?: Stoppage['responsibility']; critical?: boolean; noticeDate?: string | null; noticeRef?: string; assessNote?: string }
interface LRow { key: string; id?: string; activityId: string | null; qty: number; kmFrom: number | null; kmTo: number | null; location: string; note: string; detail: Record<string, unknown>; status: ReportLine['status']; approvedQty: number | null; reviewNote: string; sourceReportId: string | null }
const uid0 = () => Math.random().toString(36).slice(2, 9)
const EDITABLE = new Set(['draft', 'returned', 'incomplete'])
const WEATHER = [{ value: 'sunny', label: 'آفتابی' }, { value: 'partly', label: 'نیمه‌ابری' }, { value: 'cloudy', label: 'ابری' }, { value: 'rainy', label: 'بارانی' }, { value: 'snowy', label: 'برفی' }, { value: 'stormy', label: 'طوفانی (باد و خاک)' }]

/** One report — the work report on the price-list rows, or any technical form of the catalog — with live cumulative figures, live completeness check, save / send / print. */
export function ReportEditor(p: { reportId: string; model: ExecutionModel; onClose: () => void }) {
  return p.model.reports.some((x) => x.id === p.reportId) ? <ReportEditorBody {...p} /> : null
}
function ReportEditorBody({ reportId, model: m, onClose }: { reportId: string; model: ExecutionModel; onClose: () => void }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === m.projectId))
  const r = m.reports.find((x) => x.id === reportId) as Report
  const form = r && r.formKey !== 'work' ? FORM_BY_KEY[r.formKey] ?? null : null
  const mm = useMaterialModel(m.projectId)
  const shortMats = useMemo(() => mm.materials.filter((x) => (mm.positions.get(x.id)?.siteGap ?? 0) > 0).sort((a, b) => (mm.positions.get(b.id)?.uncoveredGap ?? 0) - (mm.positions.get(a.id)?.uncoveredGap ?? 0)).slice(0, 80), [mm.materials, mm.positions])
  const frontOpts = useLookupOptions(m.projectId, 'front', r?.front)
  const stationOpts = useLookupOptions(m.projectId, 'facility', r?.station)

  const [head, setHead] = useState(() => ({ reportDate: r?.reportDate ?? m.today, front: r?.front ?? '', station: r?.station ?? '', shift: r?.shift ?? 'day', contractorOrgId: r?.contractorOrgId ?? '', notes: r?.notes ?? '' }))
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...(r?.data ?? {}) }))
  const [rows, setRows] = useState<LRow[]>(() => (m.linesByReport.get(reportId) ?? []).map((l) => ({ key: l.id, id: l.id, activityId: l.activityId, qty: l.qty, kmFrom: l.kmFrom, kmTo: l.kmTo, location: l.location, note: l.note, detail: { ...l.detail }, status: l.status, approvedQty: l.approvedQty, reviewNote: l.reviewNote, sourceReportId: l.sourceReportId })))
  const [res, setRes] = useState<ResRow[]>(() => mergeCatalog(m.resources.filter((x) => x.reportId === reportId).map(toRow)))
  const [stops, setStops] = useState<StopRow[]>(() => m.stoppages.filter((x) => x.reportId === reportId).map((x) => ({ key: x.id, category: x.category, hours: x.hours, description: x.description, materialId: x.materialId, responsibility: x.responsibility, critical: x.critical, noticeDate: x.noticeDate, noticeRef: x.noticeRef, assessNote: x.assessNote })))
  const [pick, setPick] = useState('')
  const epcAvailable = useEpcStore((x) => x.available)
  const epcCrew = useEpcStore((x) => x.crewLogs)
  const [crews, setCrews] = useState<CrewDraft[]>(() => epcCrew.filter((c) => c.reportId === reportId).map((c) => ({ key: c.id, activityId: c.activityId, crewName: c.crewName, composition: c.composition, usefulHours: c.usefulHours, idleHours: c.idleHours, outputQty: c.outputQty, conditions: c.conditions, note: c.note })))
  const [crewDirty, setCrewDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [paper, setPaper] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [dirty, setDirty] = useState(false)

  const canRecord = ex.can(m.projectId, 'record')
  const editable = canRecord && EDITABLE.has(r.status)
  const setH = (k: keyof typeof head, v: string) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true) }
  const setD = (k: string, v: unknown) => { setData((d) => ({ ...d, [k]: v })); setDirty(true) }
  const patchRow = (key: string, p: Partial<LRow>) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x))); setDirty(true) }
  const patchDetail = (key: string, k: string, v: unknown) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, detail: { ...x.detail, [k]: v } } : x))); setDirty(true) }
  const lockedLine = (l: LRow) => !editable || l.status === 'approved'

  const acts = useMemo(() => m.activities.filter((a) => a.approval === 'approved' && a.active), [m.activities])
  const options = useMemo(() => acts.filter((a) => !rows.some((x) => x.activityId === a.id && x.location === '' && x.kmFrom == null)), [acts, rows])
  const addActivity = () => {
    if (!pick) return
    const blank = (activityId: string, note = ''): LRow => ({ key: uid0(), activityId, qty: 0, kmFrom: null, kmTo: null, location: '', note, detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null })
    // a surcharge (اضافه‌بها) is executed together with the row it is added to: its lines are offered right away
    const kids = acts.filter((x) => x.parentActivityId === pick && !rows.some((r) => r.activityId === x.id && r.location === ''))
    setRows((a) => [...a, blank(pick), ...kids.map((k) => blank(k.id, 'اضافه‌بها — مقدار را وارد یا ردیف را حذف کنید'))]); setPick(''); setDirty(true)
  }
  const addBlank = () => { setRows((a) => [...a, { key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null }]); setDirty(true) }
  const copyRow = (l: LRow) => { setRows((a) => { const i = a.findIndex((x) => x.key === l.key); const c: LRow = { ...l, key: uid0(), id: undefined, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null, detail: { ...l.detail } }; return [...a.slice(0, i + 1), c, ...a.slice(i + 1)] }); setDirty(true) }
  const delRow = (key: string) => { setRows((a) => a.filter((x) => x.key !== key)); setDirty(true) }

  // cumulative figures from every other registered work report (nothing is typed twice)
  const before = useMemo(() => cumulative(m.reports, m.lines, { before: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const upToday = useMemo(() => cumulative(m.reports, m.lines, { until: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const asLines = (): ReportLine[] => rows.map((x, i) => ({ id: x.key, reportId, lineNo: i, activityId: x.activityId, qty: x.qty, kmFrom: x.kmFrom, kmTo: x.kmTo, location: x.location, note: x.note, detail: x.detail, status: x.status, approvedQty: x.approvedQty, reviewNote: x.reviewNote, sourceReportId: x.sourceReportId }))
  const asRes = (): ReportResource[] => res.map((x, i) => ({ ...x, id: String(i), reportId }))
  const missing = missingForReport({ formKey: r.formKey, front: head.front, contractorOrgId: head.contractorOrgId || null, data }, asLines(), form, asRes())
  const incons = form ? [] : inconsistenciesForReport(asLines(), m.actById)
  const overRows = useMemo(() => new Set(rows.filter((x) => { const a = x.activityId ? m.actById.get(x.activityId) : undefined; if (!a) return false; const base = m.baseOf(a, head.reportDate); return base > 0 && (upToday.get(a.id) ?? 0) + rows.filter((y) => y.activityId === a.id).reduce((s, y) => s + y.qty, 0) > base * (1 + m.settings.overBasePct / 100) + 1e-9 }).map((x) => x.key)), [rows, upToday, m, head.reportDate])

  const metrics = useMemo(() => (form ? cumulativeMetrics(form, { ...r, reportDate: head.reportDate }, asLines(), m.reports, m.lines) : []), [form, rows, head.reportDate, m.reports, m.lines]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<boolean> => {
    setBusy(true)
    const okH = await ex.updateReport(reportId, { reportDate: head.reportDate, front: head.front, station: head.station, shift: head.shift, contractorOrgId: head.contractorOrgId || null, data, notes: head.notes })
    const lines: LineInput[] = rows.map((x) => ({ id: x.id, activityId: x.activityId, qty: x.qty, kmFrom: x.kmFrom, kmTo: x.kmTo, location: x.location, note: x.note, detail: x.detail, sourceReportId: x.sourceReportId }))
    const okB = okH && await ex.saveBody(reportId, { lines, resources: res, stoppages: stops.map((s) => ({ category: s.category, hours: s.hours, description: s.description, materialId: s.materialId, responsibility: s.responsibility, critical: s.critical, noticeDate: s.noticeDate, noticeRef: s.noticeRef, assessNote: s.assessNote })) })
    const okC = !okB || !crewDirty || !epcAvailable || await useEpcStore.getState().saveCrewLogs(reportId, crews.map((c) => ({ activityId: c.activityId, crewName: c.crewName, composition: c.composition, usefulHours: c.usefulHours, idleHours: c.idleHours, outputQty: c.outputQty, conditions: c.conditions, note: c.note })))
    setBusy(false)
    if (okB && okC) { setDirty(false); setCrewDirty(false) }
    return !!okB && okC
  }
  const send = async () => {
    if (missing.length) return
    if (!(await save())) return
    // the report remembers which approved sheet version it was printed on
    const tpl = form ? useEpcStore.getState().templates.find((t) => t.formKey === form.key && t.status === 'approved') : undefined
    if (tpl) await useEpcStore.getState().stampTemplate(reportId, tpl.id)
    if (await ex.submitReport(reportId)) onClose()
  }
  const remove = async () => { if (window.confirm('این پیش‌نویس حذف شود؟')) { if (await ex.deleteReport(reportId)) onClose() } }

  // fill the quantities of mapped technical-form counters of the same day (each source form can feed an activity once)
  const prefill = () => {
    const sameDay = m.reports.filter((x) => x.formKey !== 'work' && x.reportDate === head.reportDate && x.status !== 'rejected' && (!head.front || !x.front || x.front === head.front))
    const add: LRow[] = []
    for (const t of sameDay) {
      const f = FORM_BY_KEY[t.formKey]; if (!f) continue
      for (const mr of computeMetrics(f, m.linesByReport.get(t.id) ?? [])) {
        const map = m.maps.find((x) => x.formKey === t.formKey && x.metricKey === mr.metric.key && (x.groupValue === mr.group || x.groupValue === ''))
        if (!map || mr.value <= 0) continue
        if (rows.some((x) => x.sourceReportId === t.id && x.activityId === map.activityId) || add.some((x) => x.sourceReportId === t.id && x.activityId === map.activityId)) continue
        add.push({ key: uid0(), activityId: map.activityId, qty: mr.value, kmFrom: null, kmTo: null, location: '', note: `از ${f.title} ${t.reportNo}${mr.group ? ` (${mr.group})` : ''}`, detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: t.id })
      }
    }
    if (!add.length) { window.alert('فرم فنی امروزی که به فعالیتی وصل شده باشد پیدا نشد. اتصال فرم‌ها در «تنظیمات ← اتصال فرم فنی به فعالیت» تعریف می‌شود.'); return }
    setRows((a) => [...a, ...add]); setDirty(true)
  }

  // the most recent earlier daily report of the same front that carries a resource list — a starting point for today's list
  const lastRes = useMemo(() => m.reports.filter((x) => x.formKey === 'work' && x.id !== reportId && x.reportDate < head.reportDate && (!head.front || x.front === head.front) && m.resources.some((y) => y.reportId === x.id)).sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0], [m.reports, m.resources, head.front, head.reportDate, reportId])
  const copyLastResources = () => {
    if (!lastRes) { window.alert('گزارش قبلی همین جبهه که فهرست نفرات و ماشین‌آلات داشته باشد پیدا نشد.'); return }
    if (res.some(resUsed) && !window.confirm('مقدارهای فعلی نفرات و ماشین‌آلات با گزارش قبلی جایگزین شود؟')) return
    setRes(mergeCatalog(m.resources.filter((y) => y.reportId === lastRes.id).map(toRow))); setDirty(true)
  }
  // continue yesterday's work: the activities (and places) of the latest earlier report of the same front, with empty quantities
  const copyLastRows = () => {
    const prev = m.reports.filter((x) => x.formKey === 'work' && x.id !== reportId && x.reportDate < head.reportDate && (!head.front || x.front === head.front) && (m.linesByReport.get(x.id)?.length ?? 0) > 0).sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0]
    if (!prev) { window.alert('گزارش قبلی همین جبهه با ردیف کارکرد پیدا نشد.'); return }
    const have = new Set(rows.map((x) => `${x.activityId}|${x.location}`))
    const add: LRow[] = (m.linesByReport.get(prev.id) ?? []).filter((l) => l.activityId && m.actById.get(l.activityId)?.active && !have.has(`${l.activityId}|${l.location}`)).map((l) => ({ key: uid0(), activityId: l.activityId, qty: 0, kmFrom: l.kmFrom, kmTo: l.kmTo, location: l.location, note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null }))
    if (!add.length) { window.alert('همهٔ ردیف‌های گزارش قبلی از قبل در این گزارش هست.'); return }
    setRows((a) => [...a, ...add]); setDirty(true)
  }
  const lastRows = useMemo(() => (lastRes ? mergeCatalog(m.resources.filter((y) => y.reportId === lastRes.id).map(toRow)) : null), [lastRes, m.resources])
  // a new report starts from yesterday's roster — the person only records what changed
  const [carried, setCarried] = useState(false)
  useEffect(() => {
    if (carried || !editable || !lastRows || r.formKey !== 'work' || res.some(resUsed)) return
    setCarried(true); setRes(lastRows); setDirty(true)
  }, [carried, editable, lastRows, res, r.formKey])
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? ''
  const paperCtx = (): PaperCtx => ({ projectName: project?.officialName ?? '', orgName: orgName(head.contractorOrgId || null), people: ex.people, report: { ...r, ...head, contractorOrgId: head.contractorOrgId || null, data }, form, lines: asLines(), resources: asRes().filter(resUsed), stoppages: stops.map((s) => ({ id: s.key, reportId, category: s.category, hours: s.hours, description: s.description, materialId: s.materialId, issueRef: null, responsibility: s.responsibility ?? '', critical: !!s.critical, noticeDate: s.noticeDate ?? null, noticeRef: s.noticeRef ?? '', assessNote: s.assessNote ?? '' })) as Stoppage[], acts: m.actById, prev: before, baseOf: (a: Activity) => m.baseOf(a, head.reportDate), metrics })
  const saved = new Set(m.stoppages.filter((x) => x.reportId === reportId).map((x) => x.id))
  const raise = async (s: StopRow) => {
    const mat = s.materialId ? mm.materials.find((x) => x.id === s.materialId) : undefined
    const title = `توقف اجرا — ${STOPPAGE_CATEGORY_FA[s.category]}${mat ? `: ${mat.description || mat.materialCode}` : ''} (${r.reportNo})`
    const res = await ex.raise({ projectId: m.projectId, reportId, stoppageId: s.key, target: 'issue', title, description: `${s.description || title}\nمدت توقف: ${s.hours} ساعت · جبهه: ${r.front || '—'} · تاریخ: ${r.reportDate}`, severity: s.hours >= 8 ? 'high' : 'medium', station: head.station })
    if (res) window.alert(res.existing ? 'برای این توقف قبلاً مسئله ثبت شده است.' : 'مسئله در ماژول مدیریت مسائل ثبت شد.')
  }
  const hist = m.history.filter((h) => h.reportId === reportId)

  const cell = (f: FieldDef, l: LRow) => {
    const v = l.detail[f.key]
    const dis = lockedLine(l)
    if (f.kind === 'select') return <select disabled={dis} value={String(v ?? '')} onChange={(e) => patchDetail(l.key, f.key, e.target.value)} aria-label={f.label}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    if (f.kind === 'num' || f.kind === 'km') return dis ? <span>{fa(Number(v) || 0, 3)}</span> : <DecInput value={Number(v) || 0} onValue={(n) => patchDetail(l.key, f.key, n || '')} label={f.label} />
    if (f.kind === 'date') return dis ? <span>{fmtD(String(v ?? ''))}</span> : <JalaliDateInput value={String(v ?? '')} onChange={(x) => patchDetail(l.key, f.key, x)} />
    if (f.kind === 'time') return <input type="time" disabled={dis} value={String(v ?? '')} onChange={(e) => patchDetail(l.key, f.key, e.target.value)} aria-label={f.label} />
    return <input disabled={dis} value={String(v ?? '')} onChange={(e) => patchDetail(l.key, f.key, e.target.value)} aria-label={f.label} dir="auto" />
  }
  const headField = (f: FieldDef) => (
    <label key={f.key} className={f.wide ? 'wide' : undefined}>{f.label}{f.req ? ' *' : ''}
      {f.kind === 'select' ? <select disabled={!editable} value={String(data[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'date' ? <JalaliDateInput value={String(data[f.key] ?? '')} onChange={(x) => setD(f.key, x)} />
        : f.kind === 'num' ? <DecInput value={Number(data[f.key]) || 0} onValue={(n) => setD(f.key, n || '')} label={f.label} />
        : <input disabled={!editable} value={String(data[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)} placeholder={f.hint} dir="auto" />}
    </label>
  )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        <button className="im-btn im-btn-sm" onClick={() => { if (!dirty || window.confirm('تغییرات ذخیره‌نشده از بین می‌رود. خارج شوید؟')) onClose() }}><ArrowRight size={14} /> بازگشت به فهرست</button>
        <b style={{ fontSize: 15 }}>{form ? form.title : 'گزارش کارکرد روزانه'} · <span className="fn-code">{r.reportNo}</span></b>
        <ReportStatusChip status={r.status} />
        {dirty && <span className="ex-warn">ذخیره نشده</span>}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => setShowHist((x) => !x)}><History size={13} /> سابقه</button>
          <button className="im-btn im-btn-sm" onClick={() => setPaper(true)}><Printer size={13} /> چاپ</button>
          {editable && r.status === 'draft' && <button className="im-btn im-btn-sm im-btn-danger" onClick={() => void remove()}><Trash2 size={13} /> حذف پیش‌نویس</button>}
          {editable && <button className="im-btn im-btn-sm" disabled={busy || !dirty} onClick={() => void save()}>ذخیره پیش‌نویس</button>}
          {editable && ex.can(m.projectId, 'submit') && <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || missing.length > 0} title={missing.length ? 'ابتدا موارد ناقص را تکمیل کنید' : undefined} onClick={() => void send()}><Send size={13} /> ارسال برای دستگاه نظارت</button>}
        </span>
      </div>

      {r.status === 'returned' && r.reviewNote && <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-coral)' }}><b>برگشت برای اصلاح:</b> {r.reviewNote}</div>}
      {r.status === 'incomplete' && <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-amber)' }}><b>فرم نیازمند تکمیل است.</b> این گزارش از اطلاعات موجود پیش‌پر شده؛ فقط بخش‌های ناقص زیر را کامل کنید:<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{r.missing.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {!EDITABLE.has(r.status) && <div className="im-card" style={{ padding: '8px 14px' }}><span className="im-helper" style={{ margin: 0 }}>این گزارش ارسال یا بررسی شده و فقط‌خواندنی است. برای اصلاح، دستگاه نظارت باید آن را برگرداند یا بازگشایی کند.</span></div>}

      <div className="im-card" style={{ padding: 14 }}>
        <div className="ex-sheet-grid">
          <label>تاریخ گزارش *<JalaliDateInput value={head.reportDate} onChange={(x) => editable && setH('reportDate', x)} /></label>
          <label>پیمانکار *<select disabled={!editable} value={head.contractorOrgId} onChange={(e) => setH('contractorOrgId', e.target.value)}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label>جبهه کاری *<select disabled={!editable} value={head.front} onChange={(e) => setH('front', e.target.value)}><option value="">—</option>{frontOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>ایستگاه / محدوده<select disabled={!editable} value={head.station} onChange={(e) => setH('station', e.target.value)}><option value="">—</option>{stationOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>شیفت<select disabled={!editable} value={head.shift} onChange={(e) => setH('shift', e.target.value)}><option value="day">روز</option><option value="night">شب</option></select></label>
          {form && <label>وضعیت آب‌وهوا *<select disabled={!editable} value={String(data.weather ?? '')} onChange={(e) => setD('weather', e.target.value)}><option value="">—</option>{WEATHER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
          {form && form.header.map(headField)}
          <label className="wide">توضیحات<input disabled={!editable} value={head.notes} onChange={(e) => setH('notes', e.target.value)} dir="auto" /></label>
        </div>
      </div>

      {form && epcAvailable && <LinkCard reportId={reportId} projectId={m.projectId} date={head.reportDate} front={head.front} model={m} />}

      {!form && <WeatherCard data={data} editable={editable} onChange={(k, v) => setD(k, v)} />}

      <div className="im-card" style={{ padding: 0 }}>
        <div className="mt-filters no-print" style={{ padding: '10px 14px' }}>
          <b>{form ? 'جدول ردیف‌ها' : 'جدول کارکرد روزانه'}</b>
          {form?.hint && <span className="im-helper" style={{ margin: 0 }}>{form.hint}</span>}
          {editable && !form && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginInlineStart: 'auto' }}>
              <ActivityPicker activities={options} value={pick} onChange={setPick} emptyLabel={`فعالیت را انتخاب کنید (${fa(options.length)})…`} title="انتخاب فعالیت برای گزارش" width={420} />
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!pick} onClick={addActivity}><Plus size={13} /> افزودن</button>
              <button className="im-btn im-btn-sm" onClick={copyLastRows} title="ردیف‌ها و محل‌های آخرین گزارش همین جبهه را با مقدار خالی اضافه می‌کند — فقط مقدار امروز را بنویسید"><Copy size={13} /> ادامهٔ کار قبلی</button>
              <button className="im-btn im-btn-sm" onClick={prefill} title="مقدارهای فرم‌های فنی همین روز را که به فعالیت وصل شده‌اند وارد می‌کند"><Wand2 size={13} /> پیش‌پر از فرم‌های فنی</button>
            </span>
          )}
          {editable && form && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={addBlank}><Plus size={13} /> ردیف جدید</button>}
        </div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          {!form ? (
            <table className="ex-lines">
              <thead><tr><th>#</th><th>فعالیت (ردیف فهرست‌بها)</th><th>محل / کیلومتر</th><th className="num">کارکرد امروز *</th><th>تجمعی</th><th>توضیحات</th><th>وضعیت</th><th /></tr></thead>
              <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="fn-empty">هنوز ردیفی نیست. فعالیت را از بالا انتخاب کنید.</td></tr> : rows.map((l, i) => { const a = l.activityId ? m.actById.get(l.activityId) : undefined; const prev = l.activityId ? before.get(l.activityId) ?? 0 : 0; const others = l.activityId ? (upToday.get(l.activityId) ?? 0) - prev : 0; const base = a ? m.baseOf(a, head.reportDate) : 0; const total = prev + others + l.qty
                return (
                  <tr key={l.key} className={lockedLine(l) ? 'locked' : undefined}>
                    <td>{fa(i + 1)}</td>
                    <td style={{ minWidth: 220 }}>{a ? <><b>{a.title}</b><span className="sub fn-code">{a.rowNo ? `ردیف ${a.rowNo} · ` : ''}{a.itemNo} · {a.unit}{a.kind !== 'standard' ? ' · ★' : ''}{a.parentActivityId ? ' · اضافه‌بها' : ''}</span></> : <span className="ex-bad">فعالیت انتخاب نشده</span>}{l.id && a && epcAvailable && <LineForms lineId={l.id} activityId={a.id} projectId={m.projectId} reportId={reportId} head={head} model={m} editable={editable} />}</td>
                    <td style={{ minWidth: 190 }}><div style={{ display: 'grid', gap: 3 }}><input disabled={lockedLine(l)} placeholder="محل دقیق" value={l.location} onChange={(e) => patchRow(l.key, { location: e.target.value })} dir="auto" aria-label="محل" /><span style={{ display: 'flex', gap: 3 }}><DecInput className="" value={l.kmFrom ?? 0} onValue={(n) => !lockedLine(l) && patchRow(l.key, { kmFrom: n || null })} label="کیلومتر از" placeholder="km از" /><DecInput className="" value={l.kmTo ?? 0} onValue={(n) => !lockedLine(l) && patchRow(l.key, { kmTo: n || null })} label="کیلومتر تا" placeholder="km تا" /></span></div></td>
                    <td className="num" style={{ minWidth: 100 }}>{lockedLine(l) ? <b>{fa(l.qty, 3)}</b> : <DecInput value={l.qty} onValue={(n) => patchRow(l.key, { qty: n })} label="کارکرد امروز" />}{l.status === 'approved' && l.approvedQty != null && l.approvedQty !== l.qty && <small className="ex-warn" style={{ display: 'block' }}>تأییدشده: {fa(l.approvedQty, 3)}</small>}</td>
                    <td style={{ minWidth: 150 }}><div className="ex-cum"><span>تا روز قبل: <b>{fa(prev, 2)}</b></span><span>تجمعی جدید: <b>{fa(total, 2)}</b></span><span>باقی‌مانده: <b className={overRows.has(l.key) ? 'ex-bad' : undefined}>{base ? fa(base - total, 2) : '—'}</b> {a?.unit}</span>{overRows.has(l.key) && <span className="ex-bad">بیش از مقدار مبنا ({fa(base, 2)})</span>}</div></td>
                    <td style={{ minWidth: 140 }}><input disabled={lockedLine(l)} value={l.note} onChange={(e) => patchRow(l.key, { note: e.target.value })} dir="auto" aria-label="توضیح" />{l.sourceReportId && <small className="sub">پیش‌پر از فرم فنی</small>}</td>
                    <td style={{ minWidth: 110 }}>{r.status === 'draft' && l.status === 'pending' ? <span className="sub">—</span> : <LineStatusChip status={l.status} />}{l.reviewNote && <small className="sub" title={LINE_STATUS_LABEL_FA[l.status]}>{l.reviewNote}</small>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{editable && l.status !== 'approved' && <><button className="im-btn im-btn-sm" aria-label="کپی ردیف" onClick={() => copyRow(l)}><Copy size={12} /></button> <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => delRow(l.key)}><Trash2 size={12} /></button></>}</td>
                  </tr>
                ) })}</tbody>
            </table>
          ) : form.columns.length === 0 ? <p className="im-helper" style={{ margin: 14 }}>این فرم فقط شامل اطلاعات سربرگ است.</p> : (
            <table className="ex-lines">
              <thead><tr><th>#</th>{form.columns.map((c) => <th key={c.key}>{c.label}{c.req ? ' *' : ''}</th>)}<th>وضعیت</th><th /></tr></thead>
              <tbody>{rows.length === 0 ? <tr><td colSpan={form.columns.length + 3} className="fn-empty">هنوز ردیفی نیست.</td></tr> : rows.map((l, i) => (
                <tr key={l.key} className={lockedLine(l) ? 'locked' : undefined}><td>{fa(i + 1)}</td>{form.columns.map((c) => <td key={c.key} className={c.kind === 'num' || c.kind === 'km' ? 'num' : undefined} style={c.wide ? { minWidth: 160 } : undefined}>{cell(c, l)}</td>)}
                  <td>{r.status === 'draft' ? <span className="sub">—</span> : <LineStatusChip status={l.status} />}{l.reviewNote && <small className="sub">{l.reviewNote}</small>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{editable && l.status !== 'approved' && <><button className="im-btn im-btn-sm" aria-label="کپی ردیف" onClick={() => copyRow(l)}><Copy size={12} /></button> <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => delRow(l.key)}><Trash2 size={12} /></button></>}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      </div>

      {form && metrics.length > 0 && (
        <div className="im-card" style={{ padding: 0 }}>
          <div className="mt-filters" style={{ padding: '10px 14px' }}><b>جمع‌بندی (همان شمارنده‌های پایین فرم کاغذی)</b><span className="im-helper" style={{ margin: 0 }}>«تا روز قبل» از فرم‌های ثبت‌شدهٔ قبلی همین نوع محاسبه می‌شود.</span></div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>شاخص</th><th>گروه</th><th className="num">تا روز قبل</th><th className="num">امروز</th><th className="num">تا امروز</th></tr></thead>
            <tbody>{metrics.map((x, i) => <tr key={i}><td>{x.metric.label} ({x.metric.unit})</td><td>{x.group || '—'}</td><td className="num">{fa(x.prior, 2)}</td><td className="num"><b>{fa(x.today, 2)}</b></td><td className="num">{fa(x.total, 2)}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {!form && epcAvailable && <CrewLogsPanel rows={crews} editable={editable} activities={acts} onChange={(n) => { setCrews(n); setCrewDirty(true); setDirty(true) }} />}
      {(!form || form.resources) && <ResourcePanel rows={res} editable={editable} onChange={(n) => { setRes(n); setDirty(true) }} baseline={lastRows} baselineLabel={lastRes ? `گزارش ${fmtD(lastRes.reportDate)}` : undefined} onCopyLast={copyLastResources} />}

      {!form && (
        <div className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <b>توقف‌ها، مشکلات اجرایی و HSE</b>
          {stops.map((s) => (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '170px 90px 1fr auto', gap: 6, alignItems: 'center' }}>
              <select disabled={!editable} value={s.category} onChange={(e) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, category: e.target.value as StoppageCategory } : x))); setDirty(true) }}>{Object.entries(STOPPAGE_CATEGORY_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <DecInput value={s.hours} onValue={(n) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, hours: n } : x))); setDirty(true) }} label="ساعت توقف" placeholder="ساعت" />
              <span style={{ display: 'flex', gap: 4 }}>
                {s.category === 'material' && <select disabled={!editable} value={s.materialId ?? ''} onChange={(e) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, materialId: e.target.value || null } : x))); setDirty(true) }} aria-label="کالای کمبود" style={{ maxWidth: 220 }}><option value="">کالا (از کمبودهای ماژول تأمین)…</option>{shortMats.map((x) => <option key={x.id} value={x.id}>{x.description || x.materialCode}</option>)}</select>}
                <input disabled={!editable} placeholder="شرح" value={s.description} onChange={(e) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, description: e.target.value } : x))); setDirty(true) }} dir="auto" style={{ flex: 1 }} />
              </span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {saved.has(s.key) && ex.can(m.projectId, 'raise') && !(m.stoppages.find((x) => x.id === s.key)?.issueRef) && <button className="im-btn im-btn-sm" title="مسئلهٔ اجرایی در ماژول مدیریت مسائل ثبت می‌شود" onClick={() => void raise(s)}>ثبت مسئله</button>}
                {m.stoppages.find((x) => x.id === s.key)?.issueRef && <Chip tone="good">مسئله ثبت شد</Chip>}
                {editable && <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => { setStops((a) => a.filter((x) => x.key !== s.key)); setDirty(true) }}><Trash2 size={12} /></button>}
              </span>
            </div>
          ))}
          {editable && <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} onClick={() => { setStops((a) => [...a, { key: uid0(), category: 'material', hours: 0, description: '', materialId: null }]); setDirty(true) }}><Plus size={13} /> افزودن توقف یا مشکل</button>}
          <div className="ex-sheet-grid">
            <label className="wide">موارد مهم HSE و حوادث<input disabled={!editable} value={String(data.hse ?? '')} onChange={(e) => setD('hse', e.target.value)} dir="auto" /></label>
            <label className="wide">بازرسی و کنترل کیفیت<input disabled={!editable} value={String(data.qc ?? '')} onChange={(e) => setD('qc', e.target.value)} dir="auto" /></label>
            <label className="wide">مشکلات اجرایی (نقشه، زمین، مجوز، شرایط نامتعارف)<input disabled={!editable} value={String(data.problems ?? '')} onChange={(e) => setD('problems', e.target.value)} dir="auto" /></label>
          </div>
        </div>
      )}

      {!form && (
        <div className="im-card" style={{ padding: 14, display: 'grid', gap: 14 }}>
          <NumberedLines title="شرح عملیات" hint="خلاصهٔ عملیات انجام‌شده امروز — هر مورد در یک ردیف." value={asList(data.ops)} max={12} editable={editable} onChange={(v) => setD('ops', v)} />
          <NumberedLines title="موانع و مشکلات" hint="هر مانع یا مشکل اجرایی امروز در یک ردیف؛ برای توقف مشخص بالاتر «توقف‌ها» را هم ثبت کنید." value={asList(data.obstacles)} max={6} editable={editable} onChange={(v) => setD('obstacles', v)} />
        </div>
      )}
      {!form && <NextDayPlan value={asNext(data.nextDay)} editable={editable} onChange={(v) => setD('nextDay', v)} />}

      {(missing.length > 0 || incons.length > 0) && editable && (
        <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-amber)' }}>
          {missing.length > 0 && <><b>تا ارسال، این موارد باید تکمیل شود:</b><ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{missing.slice(0, 12).map((x) => <li key={x}>{x}</li>)}{missing.length > 12 && <li>و {fa(missing.length - 12)} مورد دیگر</li>}</ul></>}
          {incons.length > 0 && <><b style={{ display: 'block', marginTop: 6 }}>ناسازگاری:</b><ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{incons.map((x) => <li key={x} className="ex-bad">{x}</li>)}</ul></>}
        </div>
      )}
      {showHist && <div className="im-card" style={{ padding: 14 }}><b>سابقهٔ ارسال، اصلاح و تأیید</b><div className="ex-hist" style={{ marginTop: 8 }}>{hist.length === 0 ? <span className="im-helper">هنوز سابقه‌ای نیست.</span> : hist.map((h) => <div key={h.id}><b>{h.action.startsWith('review:') ? `بررسی (${h.action.slice(7)})` : h.action === 'submit' ? 'ارسال' : h.action === 'reopen' ? 'بازگشایی' : h.action}</b><span>{ex.people.get(h.actor ?? '') ?? 'کاربر'}</span><small>{fmtD(h.at.slice(0, 10))} {new Date(h.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>{h.note && <span>— {h.note}</span>}</div>)}</div></div>}
      {paper && <PaperModal c={paperCtx()} onClose={() => setPaper(false)} />}
    </div>
  )
}

/** one activity can carry many technical forms: pick the work-report row(s) this form belongs to, nothing is retyped */
function LinkCard({ reportId, projectId, date, front, model: m }: { reportId: string; projectId: string; date: string; front: string; model: ExecutionModel }) {
  const links = useEpcStore((x) => x.reportLinks)
  const mine = useMemo(() => links.filter((l) => l.techReportId === reportId), [links, reportId])
  const [pick, setPick] = useState('')
  const lineLabel = (id: string) => {
    const l = m.lines.find((x) => x.id === id)
    const a = l?.activityId ? m.actById.get(l.activityId) : undefined
    const rep = l ? m.reports.find((x) => x.id === l.reportId) : undefined
    return l ? `${a ? `${a.itemNo} — ${a.title}` : 'ردیف'}${l.location ? ` · ${l.location}` : ''}${rep ? ` (${rep.reportNo})` : ''}` : 'ردیف حذف‌شده'
  }
  const options = useMemo(() => {
    const used = new Set(mine.map((x) => x.lineId))
    const days = new Set(m.reports.filter((x) => x.formKey === 'work' && x.reportDate === date && (!front || !x.front || x.front === front)).map((x) => x.id))
    return m.lines.filter((l) => days.has(l.reportId) && !used.has(l.id))
  }, [m.reports, m.lines, mine, date, front])
  return (
    <div className="im-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <b>اتصال به ردیف گزارش کارکرد روزانه</b>
      <span className="im-helper" style={{ margin: 0 }}>یک فعالیت می‌تواند چند فرم فنی داشته باشد؛ تاریخ و جبهه از همین گزارش خوانده می‌شود و دوباره وارد نمی‌شود.</span>
      {mine.length === 0 && <span className="im-helper" style={{ margin: 0 }}>هنوز به ردیفی وصل نشده است.</span>}
      {mine.map((l) => <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1 }}>{lineLabel(l.lineId)}</span><button className="im-btn im-btn-sm" onClick={() => void useEpcStore.getState().unlinkReport(l.id)}>جداکردن</button></div>)}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="ردیف گزارش کارکرد" style={{ minWidth: 260, maxWidth: 480 }}>
          <option value="">ردیف گزارش کارکرد همین روز ({fa(options.length)})…</option>
          {options.map((l) => <option key={l.id} value={l.id}>{lineLabel(l.id)}</option>)}
        </select>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!pick} onClick={async () => { if (await useEpcStore.getState().linkReport(projectId, pick, reportId)) setPick('') }}>اتصال</button>
      </div>
    </div>
  )
}

/** Technical forms of one work-report row: the linked ones as chips, and a picker that offers only the forms mapped to this activity; a new form starts with date, front and contractor already filled. */
function LineForms({ lineId, activityId, projectId, reportId, head, model: m, editable }: { lineId: string; activityId: string; projectId: string; reportId: string; head: { reportDate: string; front: string; station: string; shift: string; contractorOrgId: string }; model: ExecutionModel; editable: boolean }) {
  const ex = useExecutionStore()
  const links = useEpcStore((x) => x.reportLinks)
  const mine = links.filter((x) => x.lineId === lineId)
  const keys = useMemo(() => [...new Set(m.maps.filter((x) => x.activityId === activityId).map((x) => x.formKey))].filter((k) => FORM_BY_KEY[k]), [m.maps, activityId])
  const [busy, setBusy] = useState(false)
  const create = async (formKey: string) => {
    setBusy(true)
    const id = await ex.createReport({ projectId, formKey, reportDate: head.reportDate, front: head.front, station: head.station, shift: head.shift, contractorOrgId: head.contractorOrgId || null })
    if (id) await useEpcStore.getState().linkReport(projectId, lineId, id)
    setBusy(false)
    if (id) window.alert('فرم فنی ساخته و به این ردیف وصل شد؛ از «گزارش روزانه ← فرم‌های فنی» آن را تکمیل کنید.')
  }
  void reportId
  if (!mine.length && !(editable && keys.length)) return null
  return (
    <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {mine.map((x) => { const t = m.reports.find((r) => r.id === x.techReportId); return <Chip key={x.id} tone={t?.status === 'approved' ? 'good' : 'neutral'}>{t ? `${FORM_BY_KEY[t.formKey]?.title ?? t.formKey} · ${t.reportNo}` : 'فرم حذف‌شده'}</Chip> })}
      {editable && keys.length > 0 && (
        <select value="" disabled={busy} onChange={(e) => e.target.value && void create(e.target.value)} aria-label="ثبت فرم فنی" style={{ maxWidth: 170 }}>
          <option value="">+ فرم فنی…</option>{keys.map((k) => <option key={k} value={k}>{FORM_BY_KEY[k].title}</option>)}
        </select>
      )}
    </div>
  )
}
