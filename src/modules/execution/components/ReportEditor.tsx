import { useMemo, useState } from 'react'
import { ArrowRight, Copy, History, Plus, Printer, Send, Trash2, Wand2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { DecInput } from '../../material/components/control/DecInput'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { fmtD } from '../../finance/components/fn'
import { useExecutionStore, type LineInput } from '../store/useExecutionStore'
import type { ExecutionModel } from '../lib/useExecutionModel'
import { FORM_BY_KEY, EQUIP_PRESET, MAN_PRESET, STOPPAGE_CATEGORY_FA, type FieldDef } from '../lib/formCatalog'
import { computeMetrics, cumulativeMetrics, inconsistenciesForReport, missingForReport } from '../lib/forms'
import { cumulative } from '../lib/progress'
import type { Activity, ReportLine, ReportResource, Stoppage, StoppageCategory } from '../types'
import { LINE_STATUS_LABEL_FA } from '../types'
import { LineStatusChip, ReportStatusChip, fa } from './common'
import { PaperModal, type PaperCtx } from './ReportPaper'

interface LRow { key: string; id?: string; activityId: string | null; qty: number; kmFrom: number | null; kmTo: number | null; location: string; note: string; detail: Record<string, unknown>; status: ReportLine['status']; approvedQty: number | null; reviewNote: string; sourceReportId: string | null }
const uid0 = () => Math.random().toString(36).slice(2, 9)
const EDITABLE = new Set(['draft', 'returned', 'incomplete'])
const WEATHER = [{ value: 'sunny', label: 'آفتابی' }, { value: 'cloudy', label: 'ابری' }, { value: 'rainy', label: 'بارانی' }, { value: 'snowy', label: 'برفی' }, { value: 'stormy', label: 'طوفانی (باد و خاک)' }]

/** One report — the work report on the price-list rows, or any technical form of the catalog — with live cumulative figures, live completeness check, save / send / print. */
export function ReportEditor({ reportId, model: m, onClose }: { reportId: string; model: ExecutionModel; onClose: () => void }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === m.projectId))
  const r = m.reports.find((x) => x.id === reportId)
  const form = r && r.formKey !== 'work' ? FORM_BY_KEY[r.formKey] ?? null : null
  const frontOpts = useLookupOptions(m.projectId, 'front', r?.front)
  const stationOpts = useLookupOptions(m.projectId, 'facility', r?.station)

  const [head, setHead] = useState(() => ({ reportDate: r?.reportDate ?? m.today, front: r?.front ?? '', station: r?.station ?? '', shift: r?.shift ?? 'day', contractorOrgId: r?.contractorOrgId ?? '', notes: r?.notes ?? '' }))
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...(r?.data ?? {}) }))
  const [rows, setRows] = useState<LRow[]>(() => (m.linesByReport.get(reportId) ?? []).map((l) => ({ key: l.id, id: l.id, activityId: l.activityId, qty: l.qty, kmFrom: l.kmFrom, kmTo: l.kmTo, location: l.location, note: l.note, detail: { ...l.detail }, status: l.status, approvedQty: l.approvedQty, reviewNote: l.reviewNote, sourceReportId: l.sourceReportId })))
  const [res, setRes] = useState<{ kind: 'man' | 'equip'; name: string; activeQty: number; idleQty: number; hours: number }[]>(() => {
    const saved = m.resources.filter((x) => x.reportId === reportId)
    const preset = [...MAN_PRESET.map((n) => ['man', n] as const), ...EQUIP_PRESET.map((n) => ['equip', n] as const)]
    const merged = preset.map(([kind, name]) => { const s = saved.find((x) => x.kind === kind && x.name === name); return { kind, name, activeQty: s?.activeQty ?? 0, idleQty: s?.idleQty ?? 0, hours: s?.hours ?? 0 } })
    for (const s of saved) if (!merged.some((x) => x.kind === s.kind && x.name === s.name)) merged.push({ kind: s.kind, name: s.name, activeQty: s.activeQty, idleQty: s.idleQty, hours: s.hours })
    return merged
  })
  const [stops, setStops] = useState<{ key: string; category: StoppageCategory; hours: number; description: string; materialId: string | null }[]>(() => m.stoppages.filter((x) => x.reportId === reportId).map((x) => ({ key: x.id, category: x.category, hours: x.hours, description: x.description, materialId: x.materialId })))
  const [pick, setPick] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [paper, setPaper] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  if (!r) return null

  const canRecord = ex.can(m.projectId, 'record')
  const editable = canRecord && EDITABLE.has(r.status)
  const touch = <T,>(f: (x: T) => void) => (x: T) => { f(x); setDirty(true) }
  const setH = (k: keyof typeof head, v: string) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true) }
  const setD = (k: string, v: unknown) => { setData((d) => ({ ...d, [k]: v })); setDirty(true) }
  const patchRow = (key: string, p: Partial<LRow>) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x))); setDirty(true) }
  const patchDetail = (key: string, k: string, v: unknown) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, detail: { ...x.detail, [k]: v } } : x))); setDirty(true) }
  const lockedLine = (l: LRow) => !editable || l.status === 'approved'

  const acts = useMemo(() => m.activities.filter((a) => a.approval === 'approved' && a.active), [m.activities])
  const options = useMemo(() => acts.filter((a) => !search || `${a.itemNo} ${a.title}`.includes(search)).filter((a) => !rows.some((x) => x.activityId === a.id && x.location === '' && x.kmFrom == null)), [acts, search, rows])
  const addActivity = () => { if (!pick) return; setRows((a) => [...a, { key: uid0(), activityId: pick, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null }]); setPick(''); setDirty(true) }
  const addBlank = () => { setRows((a) => [...a, { key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null }]); setDirty(true) }
  const copyRow = (l: LRow) => { setRows((a) => { const i = a.findIndex((x) => x.key === l.key); const c: LRow = { ...l, key: uid0(), id: undefined, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null, detail: { ...l.detail } }; return [...a.slice(0, i + 1), c, ...a.slice(i + 1)] }); setDirty(true) }
  const delRow = (key: string) => { setRows((a) => a.filter((x) => x.key !== key)); setDirty(true) }

  // cumulative figures from every other registered work report (nothing is typed twice)
  const before = useMemo(() => cumulative(m.reports, m.lines, { before: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const upToday = useMemo(() => cumulative(m.reports, m.lines, { until: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const asLines = (): ReportLine[] => rows.map((x, i) => ({ id: x.key, reportId, lineNo: i, activityId: x.activityId, qty: x.qty, kmFrom: x.kmFrom, kmTo: x.kmTo, location: x.location, note: x.note, detail: x.detail, status: x.status, approvedQty: x.approvedQty, reviewNote: x.reviewNote, sourceReportId: x.sourceReportId }))
  const asRes = (): ReportResource[] => res.map((x, i) => ({ id: String(i), reportId, kind: x.kind, name: x.name, activeQty: x.activeQty, idleQty: x.idleQty, hours: x.hours, note: '' }))
  const missing = missingForReport({ formKey: r.formKey, front: head.front, contractorOrgId: head.contractorOrgId || null, data }, asLines(), form, asRes())
  const incons = form ? [] : inconsistenciesForReport(asLines(), m.actById)
  const overRows = useMemo(() => new Set(rows.filter((x) => { const a = x.activityId ? m.actById.get(x.activityId) : undefined; if (!a) return false; const base = m.baseOf(a, head.reportDate); return base > 0 && (upToday.get(a.id) ?? 0) + rows.filter((y) => y.activityId === a.id).reduce((s, y) => s + y.qty, 0) > base * (1 + m.settings.overBasePct / 100) + 1e-9 }).map((x) => x.key)), [rows, upToday, m, head.reportDate])

  const metrics = useMemo(() => (form ? cumulativeMetrics(form, { ...r, reportDate: head.reportDate }, asLines(), m.reports, m.lines) : []), [form, rows, head.reportDate, m.reports, m.lines]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<boolean> => {
    setBusy(true)
    const okH = await ex.updateReport(reportId, { reportDate: head.reportDate, front: head.front, station: head.station, shift: head.shift, contractorOrgId: head.contractorOrgId || null, data, notes: head.notes })
    const lines: LineInput[] = rows.map((x) => ({ id: x.id, activityId: x.activityId, qty: x.qty, kmFrom: x.kmFrom, kmTo: x.kmTo, location: x.location, note: x.note, detail: x.detail, sourceReportId: x.sourceReportId }))
    const okB = okH && await ex.saveBody(reportId, { lines, resources: res, stoppages: stops.map((s) => ({ category: s.category, hours: s.hours, description: s.description, materialId: s.materialId })) })
    setBusy(false)
    if (okB) setDirty(false)
    return !!okB
  }
  const send = async () => {
    if (missing.length) return
    if (!(await save())) return
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

  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? ''
  const paperCtx = (): PaperCtx => ({ projectName: project?.officialName ?? '', orgName: orgName(head.contractorOrgId || null), people: ex.people, report: { ...r, ...head, contractorOrgId: head.contractorOrgId || null, data }, form, lines: asLines(), resources: asRes().filter((x) => x.activeQty || x.idleQty || x.hours), stoppages: stops.map((s) => ({ id: s.key, reportId, category: s.category, hours: s.hours, description: s.description, materialId: s.materialId, issueRef: null })) as Stoppage[], acts: m.actById, prev: before, baseOf: (a: Activity) => m.baseOf(a, head.reportDate), metrics })
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
          <label>وضعیت آب‌وهوا *<select disabled={!editable} value={String(data.weather ?? '')} onChange={(e) => setD('weather', e.target.value)}><option value="">—</option>{WEATHER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          {!form && <label>ساعت کار مفید<DecInput value={Number(data.usefulHours) || 0} onValue={(n) => setD('usefulHours', n)} label="ساعت کار مفید" /></label>}
          {form && form.header.map(headField)}
          <label className="wide">توضیحات<input disabled={!editable} value={head.notes} onChange={(e) => setH('notes', e.target.value)} dir="auto" /></label>
        </div>
      </div>

      <div className="im-card" style={{ padding: 0 }}>
        <div className="mt-filters no-print" style={{ padding: '10px 14px' }}>
          <b>{form ? 'جدول ردیف‌ها' : 'جدول کارکرد روزانه'}</b>
          {form?.hint && <span className="im-helper" style={{ margin: 0 }}>{form.hint}</span>}
          {editable && !form && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginInlineStart: 'auto' }}>
              <input placeholder="جست‌وجوی ردیف یا شرح…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 170 }} aria-label="جست‌وجو" />
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="فعالیت" style={{ minWidth: 260, maxWidth: 420 }}><option value="">فعالیت را انتخاب کنید ({fa(options.length)})…</option>{options.slice(0, 300).map((a) => <option key={a.id} value={a.id}>{a.itemNo} — {a.title} ({a.unit})</option>)}</select>
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!pick} onClick={addActivity}><Plus size={13} /> افزودن</button>
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
                    <td style={{ minWidth: 220 }}>{a ? <><b>{a.title}</b><span className="sub fn-code">{a.itemNo} · {a.unit}{a.kind !== 'standard' ? ' · ★' : ''}</span></> : <span className="ex-bad">فعالیت انتخاب نشده</span>}</td>
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

      {(!form || form.resources) && (
        <div className="im-card" style={{ padding: 14 }}>
          <b>نفرات و ماشین‌آلات</b>
          <div className="ex-res" style={{ marginTop: 8 }}>
            {(['man', 'equip'] as const).map((k) => (
              <table key={k}><thead><tr><th>{k === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات'}</th><th>فعال</th><th>غیرفعال</th><th>ساعت</th></tr></thead>
                <tbody>{res.map((x, i) => x.kind !== k ? null : (
                  <tr key={x.name}><td>{x.name}</td>
                    {(['activeQty', 'idleQty', 'hours'] as const).map((f) => <td key={f}>{editable ? <DecInput value={x[f]} onValue={touch((n: number) => setRes((a) => a.map((y, j) => (j === i ? { ...y, [f]: n } : y))))} label={`${x.name} ${f}`} /> : fa(x[f], 1)}</td>)}</tr>))}
                  {editable && <tr><td colSpan={4}><span style={{ display: 'flex', gap: 4 }}><input placeholder={k === 'man' ? 'نقش دیگر…' : 'ماشین دیگر…'} value={newName} onChange={(e) => setNewName(e.target.value)} dir="auto" style={{ flex: 1 }} /><button className="im-btn im-btn-sm" disabled={!newName.trim()} onClick={() => { setRes((a) => [...a, { kind: k, name: newName.trim(), activeQty: 0, idleQty: 0, hours: 0 }]); setNewName(''); setDirty(true) }}>افزودن</button></span></td></tr>}</tbody></table>
            ))}
          </div>
        </div>
      )}

      {!form && (
        <div className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <b>توقف‌ها، مشکلات اجرایی و HSE</b>
          {stops.map((s) => (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '170px 90px 1fr auto', gap: 6, alignItems: 'center' }}>
              <select disabled={!editable} value={s.category} onChange={(e) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, category: e.target.value as StoppageCategory } : x))); setDirty(true) }}>{Object.entries(STOPPAGE_CATEGORY_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <DecInput value={s.hours} onValue={(n) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, hours: n } : x))); setDirty(true) }} label="ساعت توقف" placeholder="ساعت" />
              <input disabled={!editable} placeholder={s.category === 'material' ? 'کمبود کدام کالا؟ (کالا و مقدار)' : 'شرح'} value={s.description} onChange={(e) => { setStops((a) => a.map((x) => (x.key === s.key ? { ...x, description: e.target.value } : x))); setDirty(true) }} dir="auto" />
              {editable && <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => { setStops((a) => a.filter((x) => x.key !== s.key)); setDirty(true) }}><Trash2 size={12} /></button>}
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
