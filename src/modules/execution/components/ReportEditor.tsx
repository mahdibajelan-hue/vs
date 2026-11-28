import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Copy, History, Plus, Printer, Send, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { projectParties } from '../lib/projectParties'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { DecInput } from '../../material/components/control/DecInput'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { fmtD } from '../../finance/components/fn'
import { useExecutionStore, type LineInput } from '../store/useExecutionStore'
import type { ExecutionModel } from '../lib/useExecutionModel'
import { primaryScope, rowScope, scopeTerms, writeScope } from '../../../lib/projectProfile'
import { FORM_BY_KEY, STOPPAGE_CATEGORY_FA, type FieldDef } from '../lib/formCatalog'
import { mergeCatalog, resUsed, toRow, type ResRow } from '../lib/resourceCatalog'
import { cumulativeMetrics, inconsistenciesForReport, missingForReport } from '../lib/forms'
import { cumulative } from '../lib/progress'
import type { Activity, Report, ReportLine, ReportResource, Stoppage, StoppageCategory } from '../types'
import { LINE_STATUS_LABEL_FA, REPORT_STATUS_LABEL_FA } from '../types'
import { Chip } from '../../finance/components/fn'
import { GitCommitHorizontal, Warehouse } from 'lucide-react'
import { LineStatusChip, ReportStatusChip, fa } from './common'
import { PaperModal, type PaperCtx } from './ReportPaper'
import { ActionLines } from './ActionLines'
import { SignaturesCard } from './SignaturesCard'
import { ReportPhotos } from '../photos/PhotoParts'
import { actionInScope, actionOf } from '../lib/workActions'
import { ResourcePanel } from './ResourcePanel'
import { CrewLogsPanel, type CrewDraft } from './epc/CrewLogsPanel'
import { useEpcStore } from '../store/useEpcStore'
import { weldKey } from '../lib/welds'
import { attrOfKey, centralKey } from '../lib/weldCentral'
import { buildProfile, fillPatch, type Profile } from '../lib/weldProfile'
import { WeatherCard } from './WeatherCard'
import { KmInput } from './KmInput'
import { PipePick } from './PipePick'
import { PipeYard } from './PipeYard'
import { BendDir } from './BendDir'
import { SectionBoard } from './SectionBoard'
import { DEFAULT_SECTION_PLAN, lineSections, nextJointNos, sectionOf, sectionOfJoint, type SectionPlan } from '../lib/sections'
import { jointRecords, strungPipes } from '../lib/lineWork'
import { yardPipes } from '../lib/pipeYard'
import { ResourceSheet } from './ResourceSheet'
import { chainText } from '../lib/chainage'
import { SheetEntry } from './SheetEntry'
import { WELDER_FIELDS, fromScan, checkPipeCell, checkWelderCell, isPipeField, isWelderField, pipeFillPatch, registerKey, splitStamps, welderQualified } from '../lib/registers'
import { epcSettings } from '../lib/epcSettings'
import { GRID_SPECS } from '../forms/gridSpecs'
import { NextDayPlan, NumberedLines, asList, asNext } from './DayNotes'
import { useEntryMeter } from '../lib/useEntryMeter'

/** a stoppage row; the delay-register fields ride along so saving the report never drops an assessment or notice */
interface StopRow { key: string; category: StoppageCategory; hours: number; description: string; materialId: string | null; responsibility?: Stoppage['responsibility']; critical?: boolean; noticeDate?: string | null; noticeRef?: string; assessNote?: string }
/** per form: the columns that are a registered pipe's own facts (read-only once the pipe number is in the register) */
const PIPE_SPEC_FIELDS: Record<string, string[]> = { string: ['lengthM', 'thkIn'], bend: ['diaIn', 'lengthM', 'wtMm'] }
/** per form: bend-direction columns, entered as direction + angle (BendDir) */
const BEND_FIELDS: Record<string, Record<string, 'plan' | 'profile' | 'any'>> = { bend: { dirLR: 'plan', dirSO: 'profile' }, fitup: { bendDeg: 'any' }, welding: {} }

interface LRow { key: string; id?: string; activityId: string | null; qty: number; kmFrom: number | null; kmTo: number | null; location: string; note: string; detail: Record<string, unknown>; status: ReportLine['status']; approvedQty: number | null; reviewNote: string; sourceReportId: string | null }
const uid0 = () => Math.random().toString(36).slice(2, 9)
const EDITABLE = new Set(['draft', 'returned', 'incomplete'])
const WEATHER = [{ value: 'sunny', label: 'آفتابی' }, { value: 'partly', label: 'نیمه‌ابری' }, { value: 'cloudy', label: 'ابری' }, { value: 'rainy', label: 'بارانی' }, { value: 'snowy', label: 'برفی' }, { value: 'stormy', label: 'طوفانی (باد و خاک)' }]

/** One report — the work report on the price-list rows, or any technical form of the catalog — with live cumulative figures, live completeness check, save / send / print. */
/** `paperOnly`: open straight on the signed paper (print / PDF / Excel) — the archive's view, no entry tables */
export function ReportEditor(p: { reportId: string; model: ExecutionModel; onClose: () => void; paperOnly?: boolean }) {
  return p.model.reports.some((x) => x.id === p.reportId) ? <ReportEditorBody {...p} /> : null
}
function ReportEditorBody({ reportId, model: m, onClose, paperOnly }: { reportId: string; model: ExecutionModel; onClose: () => void; paperOnly?: boolean }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === m.projectId))
  const parties = projectParties(project, orgs)
  const r = m.reports.find((x) => x.id === reportId) as Report
  const form = r && r.formKey !== 'work' ? FORM_BY_KEY[r.formKey] ?? null : null
  const mm = useMaterialModel(m.projectId)
  const shortMats = useMemo(() => mm.materials.filter((x) => (mm.positions.get(x.id)?.siteGap ?? 0) > 0).sort((a, b) => (mm.positions.get(b.id)?.uncoveredGap ?? 0) - (mm.positions.get(a.id)?.uncoveredGap ?? 0)).slice(0, 80), [mm.materials, mm.positions])
  const frontOpts = useLookupOptions(m.projectId, 'front', r?.front)
  // the report's scope (pipeline or compressor station) decides the location words and whether kilometres are asked
  const repScope = r ? rowScope(r.scope, m.kind) : (writeScope(m.kind, m.scopeView) ?? primaryScope(m.kind))
  const terms = scopeTerms(repScope)
  const stationOpts = useLookupOptions(m.projectId, 'facility', r?.station)

  const [head, setHead] = useState(() => ({ reportDate: r?.reportDate ?? m.today, front: r?.front ?? '', station: r?.station ?? '', shift: r?.shift ?? 'day', contractorOrgId: r?.contractorOrgId ?? projectParties(project, orgs).contractor?.id ?? '', notes: r?.notes ?? '' }))
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...(r?.data ?? {}) }))
  const [rows, setRows] = useState<LRow[]>(() => (m.linesByReport.get(reportId) ?? []).map((l) => ({ key: l.id, id: l.id, activityId: l.activityId, qty: l.qty, kmFrom: l.kmFrom, kmTo: l.kmTo, location: l.location, note: l.note, detail: { ...l.detail }, status: l.status, approvedQty: l.approvedQty, reviewNote: l.reviewNote, sourceReportId: l.sourceReportId })))
  const [res, setRes] = useState<ResRow[]>(() => mergeCatalog(m.resources.filter((x) => x.reportId === reportId).map(toRow)))
  const [stops, setStops] = useState<StopRow[]>(() => m.stoppages.filter((x) => x.reportId === reportId).map((x) => ({ key: x.id, category: x.category, hours: x.hours, description: x.description, materialId: x.materialId, responsibility: x.responsibility, critical: x.critical, noticeDate: x.noticeDate, noticeRef: x.noticeRef, assessNote: x.assessNote })))
  const epcAvailable = useEpcStore((x) => x.available)
  const epcCrew = useEpcStore((x) => x.crewLogs)
  const [crews, setCrews] = useState<CrewDraft[]>(() => epcCrew.filter((c) => c.reportId === reportId).map((c) => ({ key: c.id, activityId: c.activityId, crewName: c.crewName, composition: c.composition, usefulHours: c.usefulHours, idleHours: c.idleHours, outputQty: c.outputQty, conditions: c.conditions, note: c.note })))
  const [crewDirty, setCrewDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [paper, setPaper] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [resSheet, setResSheet] = useState(false) // manpower / machinery shown as the printed sheet instead of the entry panel

  const canRecord = ex.can(m.projectId, 'record')
  const slotsAll = useEpcStore((x) => x.signSlots), sigsAll = useEpcStore((x) => x.signatures)
  const reportSigs = sigsAll.filter((g) => g.reportId === reportId)
  const contractorSlots = slotsAll.filter((x) => x.projectId === m.projectId && x.formKey === r.formKey && x.active && x.required && x.party === 'contractor')
  // once the technical office and the site manager have signed, the draft is final on the contractor's side: it is sent as
  // signed, and a correction goes through the supervision returning it (the server enforces the same)
  const signedLock = (r.status === 'draft' || r.status === 'incomplete') && contractorSlots.length > 0 && contractorSlots.every((x) => reportSigs.some((g) => g.slotKey === x.slotKey))
  const sendable = canRecord && EDITABLE.has(r.status)
  const editable = sendable && !signedLock
  const [issues, setIssues] = useState<{ title: string; items: string[] } | null>(null)
  // the day's site-status report: the general facts (weather, contractor, manpower) of every site minute of the same day and front
  const siteDay = form ? m.reports.find((x) => x.formKey === 'work' && x.reportDate === r.reportDate && (x.front ?? '') === (r.front ?? '') && x.status !== 'rejected' && !x.completionOf) : undefined
  // entry time on real use (056): only sittings of someone who can enter the report; a report created in the last two minutes counts as new
  const [isNew] = useState(() => Date.now() - new Date(r.createdAt).getTime() < 120_000)
  const meter = useEntryMeter({ enabled: editable, projectId: m.projectId, reportId, formKey: r.formKey, newReport: isNew })
  const lineCount = () => rows.filter((x) => x.activityId || x.qty > 0 || Object.keys(x.detail ?? {}).length > 0).length
  const setH = (k: keyof typeof head, v: string) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true) }
  const setD = (k: string, v: unknown) => { setData((d) => ({ ...d, [k]: v })); setDirty(true) }
  const patchRow = (key: string, p: Partial<LRow>) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x))); setDirty(true) }
  const patchDetail = (key: string, k: string, v: unknown) => { setRows((a) => a.map((x) => (x.key === key ? { ...x, detail: { ...x.detail, [k]: v } } : x))); setDirty(true) }
  const lockedLine = (l: LRow) => !editable || l.status === 'approved'

  const acts = useMemo(() => m.activities.filter((a) => a.approval === 'approved' && a.active), [m.activities])
  // the form opens on its approved sheet (exactly as the paper); the table stays one click away
  const sheetMode = false // site minutes are entered in the table; the approved sheet is used for printing
  const sheetTpl = useEpcStore((x) => (form && GRID_SPECS[form.key] && form.key !== 'welding' ? x.templates.find((t) => t.formKey === form.key && t.status === 'approved') : undefined))
  const exSettings = useExecutionStore((x) => x.settingsByProject.get(m.projectId))
  const ensureRows = (n: number) => { setRows((a) => (a.length >= n ? a : [...a, ...Array.from({ length: n - a.length }, () => ({ key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending' as const, approvedQty: null, reviewNote: '', sourceReportId: null }))])); setDirty(true) }
  const addBlank = () => { setRows((a) => [...a, { key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null }]); setDirty(true) }
  const copyRow = (l: LRow) => { setRows((a) => { const i = a.findIndex((x) => x.key === l.key); const c: LRow = { ...l, key: uid0(), id: undefined, status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null, detail: { ...l.detail } }; return [...a.slice(0, i + 1), c, ...a.slice(i + 1)] }); setDirty(true) }
  const delRow = (key: string) => { setRows((a) => a.filter((x) => x.key !== key)); setDirty(true) }

  // cumulative figures from every other registered work report (nothing is typed twice)
  const before = useMemo(() => cumulative(m.reports, m.lines, { before: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const upToday = useMemo(() => cumulative(m.reports, m.lines, { until: head.reportDate, excludeReportId: reportId, mode: 'registered' }), [m.reports, m.lines, head.reportDate, reportId])
  const asLines = (): ReportLine[] => rows.map((x, i) => ({ id: x.key, reportId, lineNo: i, activityId: x.activityId, qty: x.qty, kmFrom: x.kmFrom, kmTo: x.kmTo, location: x.location, note: x.note, detail: x.detail, status: x.status, approvedQty: x.approvedQty, reviewNote: x.reviewNote, sourceReportId: x.sourceReportId }))
  const asRes = (): ReportResource[] => res.map((x, i) => ({ ...x, id: String(i), reportId }))
  const unsignedPrep = contractorSlots.filter((x) => !reportSigs.some((g) => g.slotKey === x.slotKey)).map((x) => `امضای «${x.label}»`)
  // identity registers (welders, pipes received into the warehouse): a name that is not in the register is flagged; with the project flag «strictRegisters» it also blocks sending
  const regWelders = useEpcStore((x) => x.welders), regQuals = useEpcStore((x) => x.quals), regPipes = useEpcStore((x) => x.pipes)
  const strictRegs = !!(useExecutionStore((x) => x.settingsByProject.get(m.projectId)) as unknown as { flags?: { strictRegisters?: boolean } } | undefined)?.flags?.strictRegisters
  const welderList = useMemo(() => regWelders.filter((w) => w.projectId === m.projectId && w.kind === 'welder' && w.cardStatus === 'issued'), [regWelders, m.projectId])
  const pipeList = useMemo(() => regPipes.filter((p) => p.projectId === m.projectId), [regPipes, m.projectId])
  /** the small read-only line under a picked pipe number: size · length · wall */
  const pipeSpec = (v: unknown): string => { const p = pipeList.find((x) => x.key === registerKey(v)); return p ? [p.odIn != null ? `${fa(p.odIn)}″` : '', p.lengthM != null ? `${fa(p.lengthM, 2)} متر` : '', p.wtIn != null ? `ضخامت ${fa(p.wtIn, 3)}″` : ''].filter(Boolean).join(' · ') : '' }
  // pipes registered by a delivery record sent a moment ago are offered at once
  useEffect(() => { if (form?.key === 'string' || form?.key === 'fitup') void useEpcStore.getState().refreshRegisters(m.projectId) }, [form?.key, m.projectId])
  const regWarnings = useMemo(() => {
    if (!form) return []
    const out: string[] = [], toNum = (v: unknown) => { const n = Number(String(v ?? '').replace('٫', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null }
    rows.forEach((l, i) => {
      const at = `ردیف ${i + 1}`
      if (welderList.length) {
        const seen = new Set<string>()
        for (const f of WELDER_FIELDS) {
          if (!(f in l.detail)) continue
          const c = checkWelderCell(l.detail[f], welderList)
          for (const u of c.unknown) out.push(`${at}: جوشکار «${u}» در فهرست جوشکاران تأییدصلاحیت‌شدهٔ این پروژه نیست`)
          for (const b of c.blocked) out.push(`${at}: جوشکار «${b}» فعال نیست (معلق یا ترک‌کار)`)
          if (form.key === 'welding' || form.key === 'tie_in') for (const t of splitStamps(l.detail[f])) {
            if (seen.has(t)) continue; seen.add(t)
            const w = welderList.find((x) => x.key === t); if (!w || w.status !== 'active') continue
            const vd = /^\d{4}-\d{2}-\d{2}$/.test(w.card.validity ?? '') ? w.card.validity : null // card validity is the expiry of the qualification
            const r = welderQualified(regQuals.filter((q) => q.welderId === w.id && q.wqtStatus === 'confirmed' && q.wqt.qualified === 'YES').map((q) => ({ ...q, expiryDate: vd })), { date: head.reportDate, thk: toNum(l.detail.thkIn), dia: toNum(l.detail.sizeIn) })
            if (!r.ok) out.push(`${at}: جوشکار «${t}» آزمون تأییدشده یا صلاحیت معتبر برای این جوش ندارد (${r.reasons.join('، ')})`)
          }
        }
      }
      if (pipeList.length && isPipeField('pipeNo') && 'pipeNo' in l.detail) {
        const c = checkPipeCell(l.detail.pipeNo, pipeList)
        if (c.unknown && form.key !== 'pipe_entry') out.push(`${at}: لولهٔ «${String(l.detail.pipeNo).trim()}» در رجیستر لوله‌های ورودی نیست`)
        if (c.bad) out.push(`${at}: لولهٔ «${String(l.detail.pipeNo).trim()}» مردود/اسقاط ثبت شده است`)
        if (form.key === 'string' && !c.unknown) {
          const k = registerKey(l.detail.pipeNo), formOf = new Map(m.reports.map((x) => [x.id, x]))
          const other = m.lines.find((x) => x.reportId !== reportId && formOf.get(x.reportId)?.formKey === 'string' && x.status !== 'rejected' && registerKey(x.detail.pipeNo) === k)
          if (other) out.push(`${at}: لولهٔ «${String(l.detail.pipeNo).trim()}» قبلاً در گزارش ریسهٔ ${formOf.get(other.reportId)?.reportNo ?? ''} ثبت شده است`)
        }
      }
    })
    return [...new Set(out)]
  }, [form, rows, welderList, pipeList, regQuals, head.reportDate, m.reports, m.lines, reportId])
  const missing = [...missingForReport({ formKey: r.formKey, front: head.front, contractorOrgId: head.contractorOrgId || null, data }, asLines(), form, asRes()), ...unsignedPrep, ...(strictRegs ? regWarnings : [])]
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
    if (okB) void useEpcStore.getState().loadSignatures(reportId) // a real change clears the signatures in the database; show that at once
    if (okB && okC) { meter.mark('saved', lineCount()); setDirty(false); setCrewDirty(false); if (form) void (async () => { await useEpcStore.getState().syncWelds(reportId); if (centralOn) await useEpcStore.getState().weldAbsorb(reportId) })() } // keeps the weld registry (an index over the forms) in step; never blocks saving
    return !!okB && okC
  }
  const send = async () => {
    if (missing.length) { setIssues({ title: 'ارسال انجام نشد — این موارد را کنترل و تکمیل کنید', items: missing }); return }
    // only unsaved edits are written before sending: re-saving an unchanged, signed report must not touch its rows
    if (dirty || crewDirty) {
      if (!(await save())) return
      // saving changed rows clears the signatures given on the previous version: they have to be given again on what is sent
      if (reportSigs.length) { window.alert('تغییرات ذخیره شد و امضاهای قبلی (مربوط به نسخهٔ پیش از تغییر) پاک شد؛ دوباره امضا کنید و سپس ارسال کنید.'); return }
    }
    // the report remembers which approved sheet version it was printed on
    const tpl = form ? useEpcStore.getState().templates.find((t) => t.formKey === form.key && t.status === 'approved') : undefined
    if (tpl) await useEpcStore.getState().stampTemplate(reportId, tpl.id)
    const err = await ex.submitReportMsg(reportId)
    if (!err) { meter.mark('submitted', lineCount()); onClose() } else setIssues({ title: 'ارسال انجام نشد', items: [err] })
  }
  // the site manager's signature also sends: check the form first, so nothing is signed that cannot go
  const beforeSend = async (): Promise<boolean> => {
    const open = missing.filter((x) => !unsignedPrep.includes(x))
    if (open.length) { setIssues({ title: 'امضا و ارسال انجام نشد — این موارد را کنترل و تکمیل کنید', items: open }); return false }
    const tpl = form ? useEpcStore.getState().templates.find((t) => t.formKey === form.key && t.status === 'approved') : undefined
    if (tpl) await useEpcStore.getState().stampTemplate(reportId, tpl.id)
    return true
  }
  const remove = async () => { if (window.confirm('این پیش‌نویس حذف شود؟')) { if (await ex.deleteReport(reportId)) onClose() } }


  // the most recent earlier daily report of the same front that carries a resource list — a starting point for today's list
  const lastRes = useMemo(() => m.reports.filter((x) => x.formKey === 'work' && x.id !== reportId && x.reportDate < head.reportDate && (!head.front || x.front === head.front) && m.resources.some((y) => y.reportId === x.id)).sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0], [m.reports, m.resources, head.front, head.reportDate, reportId])
  const copyLastResources = () => {
    if (!lastRes) { window.alert('گزارش قبلی همین جبهه که فهرست نفرات و ماشین‌آلات داشته باشد پیدا نشد.'); return }
    if (res.some(resUsed) && !window.confirm('مقدارهای فعلی نفرات و ماشین‌آلات با گزارش قبلی جایگزین شود؟')) return
    setRes(mergeCatalog(m.resources.filter((y) => y.reportId === lastRes.id).map(toRow))); setDirty(true)
  }
  const lastRows = useMemo(() => (lastRes ? mergeCatalog(m.resources.filter((y) => y.reportId === lastRes.id).map(toRow)) : null), [lastRes, m.resources])
  // a new report starts from yesterday's roster — the person only records what changed
  const [carried, setCarried] = useState(false)
  useEffect(() => {
    if (carried || !editable || !lastRows || r.formKey !== 'work' || res.some(resUsed)) return
    setCarried(true); setRes(lastRows); setDirty(true)
  }, [carried, editable, lastRows, res, r.formKey])
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? ''
  const paperCtx = (): PaperCtx => ({ projectName: project?.officialName ?? '', orgName: orgName(head.contractorOrgId || null), signatures: reportSigs, people: ex.people, report: { ...r, ...head, contractorOrgId: head.contractorOrgId || null, data: form && !data.weather && siteDay?.data.weather ? { ...data, weather: siteDay.data.weather } : data }, form, lines: asLines(), resources: asRes().filter(resUsed), stoppages: stops.map((s) => ({ id: s.key, reportId, category: s.category, hours: s.hours, description: s.description, materialId: s.materialId, issueRef: null, responsibility: s.responsibility ?? '', critical: !!s.critical, noticeDate: s.noticeDate ?? null, noticeRef: s.noticeRef ?? '', assessNote: s.assessNote ?? '' })) as Stoppage[], acts: m.actById, prev: before, baseOf: (a: Activity) => m.baseOf(a, head.reportDate), metrics })
  const saved = new Set(m.stoppages.filter((x) => x.reportId === reportId).map((x) => x.id))
  const raise = async (s: StopRow) => {
    const mat = s.materialId ? mm.materials.find((x) => x.id === s.materialId) : undefined
    const title = `توقف اجرا — ${STOPPAGE_CATEGORY_FA[s.category]}${mat ? `: ${mat.description || mat.materialCode}` : ''} (${r.reportNo})`
    const res = await ex.raise({ projectId: m.projectId, reportId, stoppageId: s.key, target: 'issue', title, description: `${s.description || title}\nمدت توقف: ${s.hours} ساعت · جبهه: ${r.front || '—'} · تاریخ: ${r.reportDate}`, severity: s.hours >= 8 ? 'high' : 'medium', station: head.station })
    if (res) window.alert(res.existing ? 'برای این توقف قبلاً مسئله ثبت شده است.' : 'مسئله در ماژول مدیریت مسائل ثبت شد.')
  }
  const hist = m.history.filter((h) => h.reportId === reportId)

  const welds = useEpcStore((x) => x.welds)
  const lineWelds = useEpcStore((x) => x.lineWelds)
  // the facts already known about each weld (pipe, size, thickness …), derived from every saved row of every form of that weld
  const profiles = useMemo(() => {
    const byId = new Map(welds.filter((w) => w.projectId === m.projectId).map((w) => [w.id, `${w.sectionKey}|${w.weldKey}`]))
    const repById = new Map(m.reports.map((x) => [x.id, x])), lineById = new Map(m.lines.map((x) => [x.id, x]))
    const acc = new Map<string, { formKey: string; date: string; detail: Record<string, unknown> }[]>()
    for (const lw of lineWelds) {
      if (lw.projectId !== m.projectId) continue
      const k = byId.get(lw.weldId), l = lineById.get(lw.lineId), rp = l ? repById.get(l.reportId) : undefined
      if (!k || !l || !rp) continue
      acc.set(k, [...(acc.get(k) ?? []), { formKey: rp.formKey, date: rp.reportDate, detail: l.detail }])
    }
    return new Map([...acc].map(([k, v]) => [k, buildProfile(v)] as [string, Profile]))
  }, [welds, lineWelds, m.reports, m.lines, m.projectId])
  const actionOn = !!(useExecutionStore((x) => x.settingsByProject.get(m.projectId)) as unknown as { flags?: { actionEntry?: boolean } } | undefined)?.flags?.actionEntry
  const allActions = useEpcStore((x) => x.workActions)
  const actions = useMemo(() => allActions.filter((a) => a.projectId === m.projectId && a.active && (m.kind !== 'hybrid' || actionInScope(a.key, repScope))).sort((a, b) => a.sort - b.sort), [allActions, m.projectId, m.kind, repScope])
  const allRules = useEpcStore((x) => x.actionRules)
  const actionRules = useMemo(() => allRules.filter((x) => x.projectId === m.projectId), [allRules, m.projectId])
  // cumulative per ACTION from the other registered work reports (what was entered, in the action's own unit)
  const actionCum = (key: string, today: number) => {
    const ids = new Set(m.reports.filter((x) => x.formKey === 'work' && x.id !== reportId && x.reportDate < head.reportDate && x.status !== 'rejected' && x.status !== 'draft').map((x) => x.id))
    // work recorded earlier straight on the price-book row this action maps to (default rule, plain factor) counts too, converted back to the action's unit —
    // otherwise a site switching to action entry would see its cumulative restart from zero
    const rule = actionRules.find((x) => x.actionKey === key && !x.whenField && !(x.multFields ?? '').trim() && x.factor > 0)
    let prev = 0; for (const [rid, ls] of m.linesByReport) if (ids.has(rid)) for (const l of ls) { if (l.status === 'rejected') continue; if (actionOf(l) === key) prev += l.qty; else if (rule && l.activityId === rule.activityId) prev += l.qty / rule.factor }
    return { prev, total: prev + today }
  }
  const centralOn = !!(useExecutionStore((x) => x.settingsByProject.get(m.projectId)) as unknown as { flags?: { centralWeld?: boolean } } | undefined)?.flags?.centralWeld
  const centralByKey = useMemo(() => new Map(welds.filter((w) => w.projectId === m.projectId && w.status !== 'merged').map((w) => [`${w.sectionKey}|${w.weldKey}`, w])), [welds, m.projectId])
  // what the sheet shows: the typed values plus the facts the central weld record already holds (never typed again)
  const shownRows = useMemo(() => rows.map((l) => {
    if (!centralOn || !form) return l
    const ck = centralKey(l.detail), w = ck ? centralByKey.get(ck) : undefined; if (!w) return l
    const extra: Record<string, unknown> = {}
    for (const f of form.columns) { const at = attrOfKey(form.key, f.key); const v = at ? w.central[at] : undefined; if (v && (l.detail[f.key] == null || l.detail[f.key] === '')) extra[f.key] = v }
    return Object.keys(extra).length ? { ...l, detail: { ...l.detail, ...extra } } : l
  }), [rows, centralOn, form, centralByKey])
  const [autoFilled, setAutoFilled] = useState<Record<string, string[]>>({})
  const colKeys = useMemo(() => new Set(form?.columns.map((c) => c.key) ?? []), [form])
  const weldHints = useMemo(() => welds.filter((w) => w.projectId === m.projectId && w.status !== 'merged').map((w) => ({ weld: w.weldRaw, sec: w.sectionRaw, pipe: w.pipeNo ?? '' })), [welds, m.projectId])
  // pipe numbers offered in the row: on the stringing record only pipes registered by a delivery record, not rejected,
  // and not strung yet (in another record or another row of this one); elsewhere every registered pipe
  // where each strung pipe lies (its stringing row's chainage): a bend is made where the pipe was strung
  const strungKm = useMemo(() => {
    const formOf = new Map(m.reports.map((r) => [r.id, r.formKey])), out = new Map<string, unknown>()
    for (const l of m.lines) if (formOf.get(l.reportId) === 'string' && l.status !== 'rejected') { const k = registerKey(l.detail.pipeNo); if (k) out.set(k, l.detail.km ?? '') }
    return out
  }, [m.lines, m.reports])
  // ── sections (سکشن) and joints: the strung line, the fit-ups made, and the state of each joint ──────────────
  const plan: SectionPlan = useMemo(() => ({ ...DEFAULT_SECTION_PLAN, ...(m.settings.sectionPlan ?? {}) }), [m.settings.sectionPlan])
  const jointRecs = useMemo(() => jointRecords(m.lines, m.reports, reportId, form?.key === 'fitup' ? rows.map((r) => r.detail) : []), [m.lines, m.reports, reportId, rows, form?.key])
  const [boardOpen, setBoardOpen] = useState(false)
  const boardSections = useMemo(() => {
    if (!boardOpen) return []
    return lineSections(strungPipes(m.lines, m.reports, pipeList), jointRecs.filter((j) => j.before && j.after), plan)
  }, [boardOpen, m.lines, m.reports, pipeList, jointRecs, plan])
  const addJoints = (picked: Record<string, unknown>[]) => {
    setRows((a) => {
      const out = [...a]; let i = 0
      for (let j = 0; j < out.length && i < picked.length; j++) { const r = out[j]; if (!lockedLine(r) && !String(r.detail.jointNo ?? '').trim() && !String(r.detail.pipeNo ?? '').trim()) out[j] = { ...r, detail: { ...r.detail, ...picked[i++] } } }
      for (; i < picked.length; i++) out.push({ key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: picked[i], status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null })
      return out
    })
    setDirty(true); setBoardOpen(false)
  }
  const pipeHints = useMemo(() => {
    const lineStatus = new Map(m.lines.map((l) => [l.id, l.status]))
    const label = (p: (typeof pipeList)[number]) => [p.lengthM != null ? `${p.lengthM} m` : '', p.wtIn != null ? `${p.wtIn}"` : '', p.entryLineId && lineStatus.get(p.entryLineId) === 'pending' ? 'در انتظار تأیید ناظر' : ''].filter(Boolean).join(' · ')
    if (form?.key === 'string') {
      const formOf = new Map(m.reports.map((r) => [r.id, r.formKey]))
      const strung = new Set(m.lines.filter((l) => l.reportId !== reportId && formOf.get(l.reportId) === 'string' && l.status !== 'rejected').map((l) => registerKey(l.detail.pipeNo)).filter(Boolean))
      for (const r of rows) { const k = registerKey(r.detail.pipeNo); if (k) strung.add(k) }
      return pipeList.filter((p) => p.status === 'in_stock' && !strung.has(p.key)).map((p) => ({ value: p.raw, label: label(p) }))
    }
    if (form?.key === 'fitup') return fitupPicks('pipeNo')
    if (form?.key === 'bend') {
      const formOf = new Map(m.reports.map((r) => [r.id, r.formKey]))
      const bent = new Set(m.lines.filter((l) => l.reportId !== reportId && formOf.get(l.reportId) === 'bend' && l.status !== 'rejected').map((l) => registerKey(l.detail.pipeNo)).filter(Boolean))
      for (const r of rows) { const k = registerKey(r.detail.pipeNo); if (k) bent.add(k) }
      return pipeList.filter((p) => strungKm.has(p.key) && !bent.has(p.key) && p.status !== 'rejected')
        .map((p) => ({ value: p.raw, label: [label(p), strungKm.get(p.key) ? `km ${chainText(strungKm.get(p.key))}` : ''].filter(Boolean).join(' · ') }))
    }
    return [...new Map([...pipeList.map((p) => [p.raw, { value: p.raw, label: label(p) }] as const), ...weldHints.filter((w) => w.pipe).map((w) => [w.pipe, { value: w.pipe, label: '' }] as const)]).values()].slice(0, 800)
  }, [form?.key, pipeList, m.lines, m.reports, reportId, rows, strungKm]) // eslint-disable-line react-hooks/exhaustive-deps
  // fit-up joins two strung pipes: the pipe before the joint (pipeNo2) and the pipe after it (pipeNo). A pipe has one joint
  // at each end, so it is offered again for the other side but never twice for the same side.
  function fitupPicks(field: 'pipeNo' | 'pipeNo2') {
    const formOf = new Map(m.reports.map((r) => [r.id, r.formKey]))
    const strungAt = new Map<string, string>()
    for (const l of m.lines) if (formOf.get(l.reportId) === 'string' && l.status !== 'rejected') { const k = registerKey(l.detail.pipeNo); if (k) strungAt.set(k, String(l.detail.km ?? '')) }
    const used = new Set(m.lines.filter((l) => l.reportId !== reportId && formOf.get(l.reportId) === 'fitup' && l.status !== 'rejected').map((l) => registerKey(l.detail[field])).filter(Boolean))
    for (const r of rows) { const k = registerKey(r.detail[field]); if (k) used.add(k) }
    return pipeList.filter((p) => strungAt.has(p.key) && !used.has(p.key) && p.status !== 'rejected')
      .map((p) => ({ value: p.raw, label: [p.lengthM != null ? `${p.lengthM} m` : '', p.wtIn != null ? `${p.wtIn}"` : '', strungAt.get(p.key) ? `ریسه: km ${strungAt.get(p.key)}` : 'ریسه‌شده'].filter(Boolean).join(' · ') }))
  }
  // «انتخاب لوله از دپو» (stringing): the yard without the strung pipes, and where today's stringing goes on from
  const [yardOpen, setYardOpen] = useState(false)
  const yard = useMemo(() => (form?.key === 'string' && yardOpen ? yardPipes(pipeList, m.lines, m.reports, reportId, rows.map((r) => r.detail.pipeNo)) : []), [form?.key, yardOpen, pipeList, m.lines, m.reports, reportId, rows])
  const nextKm = useMemo(() => {
    if (form?.key !== 'string') return null
    const formOf = new Map(m.reports.map((r) => [r.id, r.formKey]))
    let end: number | null = null
    const see = (d: Record<string, unknown>) => { const k = Number(d.km); if (d.km !== '' && d.km != null && Number.isFinite(k) && k > 0) { const e = k + (Number(d.lengthM) || 0) / 1000; if (end == null || e > end) end = e } }
    for (const l of m.lines) if (l.reportId !== reportId && formOf.get(l.reportId) === 'string' && l.status !== 'rejected') see(l.detail)
    for (const r of rows) see(r.detail)
    return end == null ? null : Math.round((end as number) * 1000) / 1000
  }, [form?.key, m.lines, m.reports, reportId, rows])
  const addFromYard = (picked: Record<string, unknown>[]) => {
    setRows((a) => {
      const out = [...a]; let i = 0
      // empty rows (no pipe typed yet) are filled first, then new rows follow
      for (let j = 0; j < out.length && i < picked.length; j++) { const r = out[j]; if (!lockedLine(r) && !String(r.detail.pipeNo ?? '').trim()) out[j] = { ...r, detail: { ...r.detail, ...picked[i++] } } }
      for (; i < picked.length; i++) out.push({ key: uid0(), activityId: null, qty: 0, kmFrom: null, kmTo: null, location: '', note: '', detail: picked[i], status: 'pending', approvedQty: null, reviewNote: '', sourceReportId: null })
      return out
    })
    setDirty(true); setYardOpen(false)
  }
  const pipeHints2 = useMemo(() => (form?.key === 'fitup' ? fitupPicks('pipeNo2') : []), [form?.key, pipeList, m.lines, m.reports, reportId, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const cell = (f: FieldDef, l: LRow) => {
    const v = l.detail[f.key]
    const dis = lockedLine(l)
    // central weld table: a fact the weld's central record already has is shown, not typed again
    const cattr = centralOn && form ? attrOfKey(form.key, f.key) : null
    const ck = cattr ? centralKey(l.detail) : null
    const cval = cattr && ck ? centralByKey.get(ck)?.central[cattr] : undefined
    if (cval) return <span dir="ltr" className="ex-central" title="از جدول مرکزی سرجوش — برای تغییر، «کارت سرجوش» را باز کنید" style={{ background: 'rgba(14,165,233,.12)', padding: '2px 6px', borderRadius: 6, display: 'inline-block' }}>{cval}</span>
    // a registered pipe's own facts (size, wall, length) are not typed: they follow the pipe number, shown read-only
    const specOf = form ? PIPE_SPEC_FIELDS[form.key] : undefined
    if (specOf?.includes(f.key)) {
      const pp = pipeList.find((x) => x.key === registerKey(l.detail.pipeNo))
      if (pp) { const shown = v !== '' && v != null ? v : f.key === 'wtMm' ? (pp.wtIn != null ? Math.round(pp.wtIn * 2540) / 100 : '') : f.key === 'lengthM' ? pp.lengthM : f.key === 'thkIn' ? pp.wtIn : pp.odIn
        return <span className="ex-spec-ro" dir="ltr" title="از شناسنامهٔ لوله (صورتجلسهٔ ورود) — با تغییر شمارهٔ لوله عوض می‌شود">{shown === '' || shown == null ? '—' : fa(Number(shown), 3)}</span> }
    }
    if (form && BEND_FIELDS[form.key]?.[f.key]) return <BendDir value={v} onValue={(x) => patchDetail(l.key, f.key, x)} which={BEND_FIELDS[form.key][f.key]} label={f.label} disabled={dis} />
    if (f.kind === 'select') return <select disabled={dis} value={String(v ?? '')} onChange={(e) => patchDetail(l.key, f.key, e.target.value)} aria-label={f.label}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    if (f.kind === 'km') return dis ? <span dir="ltr">{chainText(v) || '—'}</span> : <KmInput value={v} onValue={(n) => patchDetail(l.key, f.key, n ?? '')} label={f.label} />
    if (f.kind === 'num') return dis ? <span>{fa(Number(v) || 0, 3)}</span> : <DecInput value={Number(v) || 0} onValue={(n) => patchDetail(l.key, f.key, n || '')} label={f.label} />
    if (f.kind === 'date') return dis ? <span>{fmtD(String(v ?? ''))}</span> : <JalaliDateInput value={String(v ?? '')} onChange={(x) => patchDetail(l.key, f.key, x)} />
    if (f.kind === 'time') return <input type="time" disabled={dis} value={String(v ?? '')} onChange={(e) => patchDetail(l.key, f.key, e.target.value)} aria-label={f.label} />
    // the delivery record DEFINES pipe numbers: no list there; stringing and fit-up PICK them from the register
    const known = f.key === 'weldNo' || f.key === 'jointNo' ? 'weld' : f.key === 'pipeNo' && form?.key !== 'pipe_entry' ? 'pipe' : f.key === 'pipeNo2' ? 'pipe2' : null
    const onText = (val: string) => {
      patchDetail(l.key, f.key, val)
      // a pipe from the warehouse register brings its size / thickness (and length on pipe-level forms) into the EMPTY fields
      if (form && isPipeField(f.key)) {
        const pp = pipeList.find((x) => x.key === registerKey(val))
        const prev = pipeList.find((x) => x.key === registerKey(l.detail[f.key]))
        if (pp && form.key === 'bend' && strungKm.get(pp.key) !== undefined && (l.detail.km == null || l.detail.km === '' || (prev && l.detail.km === strungKm.get(prev.key)))) patchDetail(l.key, 'km', strungKm.get(pp.key))
        // columns that are the pipe's own facts are read-only here: the register's value always replaces them
        const base: Record<string, unknown> = { ...l.detail, [f.key]: val }; if (f.key === 'pipeNo') for (const k of PIPE_SPEC_FIELDS[form.key] ?? []) base[k] = ''
        if (pp) { const patch = pipeFillPatch(form.key, colKeys, base, pp, prev && prev.key !== pp.key ? prev : undefined); for (const [kk, vv] of Object.entries(patch)) patchDetail(l.key, kk, vv); if (Object.keys(patch).length) setAutoFilled((a) => ({ ...a, [l.key]: [...new Set([...(a[l.key] ?? []), ...Object.keys(patch)])] })) }
      }
      setAutoFilled((a) => (a[l.key]?.includes(f.key) ? { ...a, [l.key]: a[l.key].filter((x) => x !== f.key) } : a)) // typing over a filled value makes it the person's own
      // fit-up with both pipes chosen: the joint gets its section (from where the pipe after it was strung) and the
      // section's next joint number — when the row does not have them yet
      if (form?.key === 'fitup' && (f.key === 'pipeNo' || f.key === 'pipeNo2')) {
        const after = f.key === 'pipeNo' ? val : l.detail.pipeNo, before = f.key === 'pipeNo2' ? val : l.detail.pipeNo2
        const km = Number(strungKm.get(registerKey(after)))
        if (registerKey(after) && registerKey(before) && Number.isFinite(km) && km > 0) {
          const sec = String(l.detail.sec ?? '').trim() || String(sectionOf(km, plan))
          if (!String(l.detail.sec ?? '').trim()) patchDetail(l.key, 'sec', sec)
          if (!String(l.detail.jointNo ?? '').trim()) patchDetail(l.key, 'jointNo', nextJointNos(sec, 1, jointRecs.filter((j) => !(j.mine && j.no === '')))[0])
        }
      }
      // later forms (welding, radiography, coating, lowering …): a joint number brings its section from the fit-up records
      if (form && ['weldNo', 'jointNo', 'weldFrom', 'jointFrom'].includes(f.key) && form.key !== 'fitup') {
        const secKey = colKeys.has('sec') ? 'sec' : colKeys.has('lineSec') ? 'lineSec' : null
        const found = secKey && !String(l.detail[secKey] ?? '').trim() ? sectionOfJoint(val, jointRecs) : null
        if (secKey && found) patchDetail(l.key, secKey, found)
      }
      // a known weld brings its facts along (pipe, size, thickness …) into the EMPTY fields of this row — a suggestion the person can overwrite
      if (form && (f.key === 'sec' || f.key === 'weldNo' || f.key === 'jointNo')) {
        const sec = f.key === 'sec' ? val : (String(l.detail.sec ?? '').trim() ? l.detail.sec : sectionOfJoint(val, jointRecs) ?? l.detail.sec), wd = f.key === 'sec' ? (l.detail.weldNo ?? l.detail.jointNo) : val
        const k = weldKey(sec, wd), prof = k ? profiles.get(k) : undefined
        if (prof) {
          const patch = fillPatch(form.key, colKeys, { ...l.detail, [f.key]: val }, prof)
          for (const [kk, vv] of Object.entries(patch)) patchDetail(l.key, kk, vv)
          if (Object.keys(patch).length) setAutoFilled((a) => ({ ...a, [l.key]: [...new Set([...(a[l.key] ?? []), ...Object.keys(patch)])] }))
        }
      }
    }
    const auto = autoFilled[l.key]?.includes(f.key)
    if (form && (form.key === 'string' || form.key === 'fitup' || form.key === 'bend') && (f.key === 'pipeNo' || f.key === 'pipeNo2')) return <PipePick spec={pipeSpec(v)} value={String(v ?? '')} options={f.key === 'pipeNo2' ? pipeHints2 : pipeHints} onText={onText} label={f.label} disabled={dis} empty={form.key === 'bend' ? 'لولهٔ ریسه‌شدهٔ خم‌نشده‌ای نیست.' : form.key === 'string' ? 'لولهٔ ریسه‌نشده‌ای در رجیستر نیست؛ ابتدا صورتجلسهٔ ورود لوله را ثبت و ارسال کنید.' : 'لولهٔ ریسه‌شدهٔ آزادی برای این سمت اتصال نیست.'} />
    const badReg = isWelderField(f.key) ? (welderList.length ? (() => { const c = checkWelderCell(v, welderList); return c.unknown.length || c.blocked.length })() : 0) : isPipeField(f.key) && pipeList.length && form?.key !== 'pipe_entry' ? (() => { const c = checkPipeCell(v, pipeList); return c.unknown || c.bad ? 1 : 0 })() : 0
    return <input disabled={dis} value={String(v ?? '')} onChange={(e) => onText(e.target.value)} onKeyDown={isWelderField(f.key) ? (e) => { if (e.key === 'Enter') { const x = fromScan(e.currentTarget.value); if (x !== e.currentTarget.value) { e.preventDefault(); onText(x) } } } : undefined} onBlur={isWelderField(f.key) ? (e) => { const x = fromScan(e.currentTarget.value); if (x !== e.currentTarget.value) onText(x) } : undefined} aria-label={f.label} dir="auto" list={known ? `ex-hint-${known}` : isWelderField(f.key) ? 'ex-hint-welder' : undefined} title={badReg ? 'در رجیستر ثبت نشده یا فعال نیست' : auto ? 'از اطلاعات ثبت‌شدهٔ همین سرجوش پر شد' : undefined} style={badReg ? { outline: '2px solid #ef4444', outlineOffset: -1 } : auto ? { background: 'rgba(14,165,233,.12)' } : undefined} />
  }
  const headField = (f: FieldDef) => (
    <label key={f.key} className={f.wide ? 'wide' : undefined}>{f.label}{f.req ? ' *' : ''}
      {f.kind === 'select' ? <select disabled={!editable} value={String(data[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'date' ? <JalaliDateInput value={String(data[f.key] ?? '')} onChange={(x) => setD(f.key, x)} />
        : f.kind === 'num' ? <DecInput value={Number(data[f.key]) || 0} onValue={(n) => setD(f.key, n || '')} label={f.label} />
        : <input disabled={!editable} value={String(data[f.key] ?? '')} onChange={(e) => setD(f.key, e.target.value)} placeholder={f.hint} dir="auto" />}
    </label>
  )

  const finishBar = sendable ? (
        <div className="ex-finish no-print">
          <div className="ex-finish-btns">
            {editable && <button className={`im-btn${dirty ? ' im-btn-primary' : ''}`} disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : dirty ? 'ذخیرهٔ اطلاعات' : '✓ اطلاعات ذخیره شده'}</button>}
            {contractorSlots.length > 0 ? <span className="im-helper" style={{ margin: 0, alignSelf: 'center' }}>{dirty ? 'ابتدا اطلاعات را ذخیره کنید؛ امضاها پس از ذخیره فعال می‌شوند.' : 'اکنون امضا کنید؛ «امضا و ارسال» سرپرست کارگاه گزارش را برای نظارت می‌فرستد.'}</span>
              : ex.can(m.projectId, 'submit') && <button className="im-btn im-btn-primary" disabled={busy} onClick={() => void send()}><Send size={14} /> ارسال برای دستگاه نظارت{missing.length > 0 && <span className="ex-actbar-badge" title="موارد ناقص">{fa(missing.length)}</span>}</button>}
          </div>
        </div>
  ) : null
  // order at the bottom of the form: (photos) → save → signatures — a signature is given on saved data only
  const signs = <SignaturesCard report={{ id: reportId, projectId: m.projectId, formKey: r.formKey, status: r.status }} dirty={dirty} beforeSend={beforeSend} />

  if (paperOnly) return <PaperModal c={paperCtx()} onClose={onClose} />

  return (
    <div ref={meter.root as React.RefObject<HTMLDivElement>} style={{ display: 'grid', gap: 12 }}>
      <div className="ex-actbar no-print">
        <button className="im-btn im-btn-sm" onClick={() => { if (!dirty || window.confirm('تغییرات ذخیره‌نشده از بین می‌رود. خارج شوید؟')) onClose() }}><ArrowRight size={14} /> بازگشت</button>
        <span className="ex-actbar-title"><b>{form ? form.title : 'گزارش وضعیت کارگاه'}</b><span className="fn-code">{r.reportNo}</span><ReportStatusChip status={r.status} />{dirty && <span className="ex-warn">ذخیره نشده</span>}</span>
        <span className="ex-actbar-btns">
          <button className="im-btn im-btn-sm" onClick={() => setShowHist((x) => !x)} aria-pressed={showHist}><History size={13} /> سابقه</button>
          <button className="im-btn im-btn-sm" onClick={() => setPaper(true)}><Printer size={13} /> چاپ</button>
          {editable && r.status === 'draft' && reportSigs.length === 0 && <button className="im-btn im-btn-sm im-btn-danger" onClick={() => void remove()}><Trash2 size={13} /> حذف</button>}
        </span>
      </div>
      {sendable && <Steps filled={missing.filter((x) => !unsignedPrep.includes(x)).length === 0} saved={!dirty} signed={unsignedPrep.length === 0} />}
      {signedLock && <div className="im-card ex-lockmsg"><b>امضا شده و قفل است.</b> دفتر فنی و سرپرست کارگاه این گزارش را امضا کرده‌اند؛ محتوای آن دیگر تغییر نمی‌کند. آن را برای دستگاه نظارت ارسال کنید — اگر اصلاحی لازم باشد، نظارت آن را برمی‌گرداند و سابقهٔ هر دو نسخه می‌ماند.</div>}
      {issues && <IssuePanel title={issues.title} items={issues.items} onClose={() => setIssues(null)} />}

      {r.status === 'returned' && r.reviewNote && <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-coral)' }}><b>برگشت برای اصلاح:</b> {r.reviewNote}</div>}
      {r.status === 'incomplete' && <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-amber)' }}><b>فرم نیازمند تکمیل است.</b> این گزارش از اطلاعات موجود پیش‌پر شده؛ فقط بخش‌های ناقص زیر را کامل کنید:<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{r.missing.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      {!EDITABLE.has(r.status) && <div className="im-card" style={{ padding: '8px 14px' }}><span className="im-helper" style={{ margin: 0 }}>این گزارش ارسال یا بررسی شده و فقط‌خواندنی است. برای اصلاح، دستگاه نظارت باید آن را برگرداند یا بازگشایی کند.</span></div>}

      {form && <><datalist id="ex-hint-welder">{welderList.filter((w) => w.status === 'active').map((w) => <option key={w.id} value={w.raw}>{w.fullName}</option>)}</datalist><datalist id="ex-hint-weld">{[...new Set(weldHints.map((w) => w.weld))].slice(0, 400).map((x) => <option key={x} value={x} />)}</datalist><datalist id="ex-hint-pipe">{pipeHints.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</datalist><datalist id="ex-hint-pipe2">{pipeHints2.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</datalist></>}
      {!form && <SecTitle n={1} title="وضعیت سایت" hint="تاریخ، جبهه، شیفت و شرایط جوی کارگاه" />}
      {form ? (
        <>
          {/* a site minute asks only its own subject: date and front come from the day page, contractor and weather from the day's site-status report */}
          <div className="ex-ctx">
            <span><small>تاریخ</small><b>{fmtD(head.reportDate)}</b></span>
            <span><small>{terms.front}</small><b>{head.front || '—'}</b></span>
            <span><small>پیمانکار</small><b dir="auto">{orgName(head.contractorOrgId || null) || '—'}</b></span>
            <span><small>وضعیت جوی</small><b>{siteDay ? (WEATHER.find((o) => o.value === String(siteDay.data.weather ?? ''))?.label ?? '—') : '—'}</b></span>
            {!siteDay && <em>گزارش وضعیت کارگاهِ این روز هنوز ثبت نشده؛ وضعیت جوی و نفرات از آن خوانده می‌شود.</em>}
          </div>
          {(form.header.length > 0 || editable || head.notes) && (
            <div className="im-card ex-form-head">
              <div className="ex-sheet-grid">
                {form.header.map(headField)}
                <label className="wide">توضیحات<input disabled={!editable} value={head.notes} onChange={(e) => setH('notes', e.target.value)} dir="auto" /></label>
              </div>
            </div>
          )}
        </>
      ) : (
      <div className="im-card" style={{ padding: 14 }}>
        <div className="ex-sheet-grid">
          <label>تاریخ گزارش *<JalaliDateInput value={head.reportDate} onChange={(x) => editable && setH('reportDate', x)} /></label>
          {parties.contractor && head.contractorOrgId === parties.contractor.id
            ? <label>پیمانکار<input readOnly value={parties.contractor.name} title="از اطلاعات پایهٔ پروژه" dir="auto" /></label>
            : <label>پیمانکار *<select disabled={!editable} value={head.contractorOrgId} onChange={(e) => setH('contractorOrgId', e.target.value)}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>{!parties.contractor && <small className="im-helper">پیمانکار پروژه در «اطلاعات پایه» تعریف نشده است.</small>}</label>}
          <label>{terms.front} *<select disabled={!editable} value={head.front} onChange={(e) => setH('front', e.target.value)}><option value="">—</option>{frontOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>ایستگاه / محدوده<select disabled={!editable} value={head.station} onChange={(e) => setH('station', e.target.value)}><option value="">—</option>{stationOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>شیفت<select disabled={!editable} value={head.shift} onChange={(e) => setH('shift', e.target.value)}><option value="day">روز</option><option value="night">شب</option></select></label>
          <label className="wide">توضیحات<input disabled={!editable} value={head.notes} onChange={(e) => setH('notes', e.target.value)} dir="auto" /></label>
        </div>
      </div>
      )}

      {form && regWarnings.length > 0 && <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: `3px solid ${strictRegs ? 'var(--im-coral)' : 'var(--im-amber)'}` }}><b>{strictRegs ? 'موارد رجیستر که پیش از ارسال باید اصلاح شود' : 'هشدار رجیستر لوله و جوشکار'} ({fa(regWarnings.length)})</b>
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{regWarnings.slice(0, 12).map((w) => <li key={w}>{w}</li>)}{regWarnings.length > 12 && <li>و {fa(regWarnings.length - 12)} مورد دیگر…</li>}</ul>
        <small className="sub">جوشکاران در «ارزیابی شایستگی ← صلاحیت جوشکاران و عایق‌کاران» و لوله‌ها در «کالا ← ورود لوله به کارگاه (MRS)» ثبت می‌شوند؛ شناسهٔ تازه را آنجا ثبت کنید.</small></div>}


      {!form && <WeatherCard data={data} editable={editable} onChange={(k, v) => setD(k, v)} />}

      {!form && <>
        <SecTitle n={2} title="نیروی انسانی کارگاه" />
        {editable && <SheetToggle on={resSheet} set={setResSheet} />}
        {editable && !resSheet ? <ResourcePanel only="man" rows={res} editable={editable} onChange={(n) => { setRes(n); setDirty(true) }} baseline={lastRows} baselineLabel={lastRes ? `گزارش ${fmtD(lastRes.reportDate)}` : undefined} onCopyLast={copyLastResources} /> : <div className="rs-wrap"><ResourceSheet rows={res} kind="man" /></div>}
        <SecTitle n={3} title="ماشین‌آلات کارگاه" />
        {editable && !resSheet ? <ResourcePanel only="equip" rows={res} editable={editable} onChange={(n) => { setRes(n); setDirty(true) }} baseline={lastRows} baselineLabel={lastRes ? `گزارش ${fmtD(lastRes.reportDate)}` : undefined} /> : <div className="rs-wrap"><ResourceSheet rows={res} kind="equip" /></div>}
        {epcAvailable && <CrewLogsPanel rows={crews} editable={editable} activities={acts} onChange={(n) => { setCrews(n); setCrewDirty(true); setDirty(true) }} />}
      </>}

      {(form || rows.length > 0) && <div className="im-card" style={{ padding: 0 }}>
        <div className="mt-filters no-print" style={{ padding: '10px 14px' }}>
          <b>{form ? 'جدول ردیف‌ها' : 'ردیف‌های کارکرد (ثبت‌شده پیش از انتقال کارکرد به صورتجلسات کارگاهی)'}</b>
          {form?.hint && <span className="im-helper" style={{ margin: 0 }}>{form.hint}</span>}
          {editable && form?.key === 'string' && !sheetMode && <button className="im-btn im-btn-primary im-btn-sm" style={sheetTpl ? undefined : { marginInlineStart: 'auto' }} onClick={() => setYardOpen(true)}><Warehouse size={13} /> انتخاب لوله از دپو</button>}
          {editable && form?.key === 'fitup' && !sheetMode && <button className="im-btn im-btn-primary im-btn-sm" style={sheetTpl ? undefined : { marginInlineStart: 'auto' }} onClick={() => setBoardOpen(true)}><GitCommitHorizontal size={13} /> سرجوش‌گذاری روی خط</button>}
          {editable && form && !sheetMode && <button className={`im-btn im-btn-sm${form.key === 'string' || form.key === 'fitup' ? '' : ' im-btn-primary'}`} style={form && (sheetTpl || form.key === 'string' || form.key === 'fitup') ? undefined : { marginInlineStart: 'auto' }} onClick={addBlank}><Plus size={13} /> ردیف جدید</button>}
        </div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          {!form && actionOn ? (
            <ActionLines rows={rows} actions={actions} locked={lockedLine} editable={editable} cum={actionCum} onPatch={patchRow} onDetail={patchDetail} onCopy={copyRow} onDelete={delRow} km={terms.km} placeLabel={terms.place} />
          ) : !form ? (
            <table className="ex-lines">
              <thead><tr><th>#</th><th>فعالیت (ردیف فهرست‌بها)</th><th>{terms.place}</th><th className="num">کارکرد امروز *</th><th>تجمعی</th><th>توضیحات</th><th>وضعیت</th><th /></tr></thead>
              <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="fn-empty">هنوز ردیفی نیست. فعالیت را از بالا انتخاب کنید.</td></tr> : rows.map((l, i) => { const a = l.activityId ? m.actById.get(l.activityId) : undefined; const prev = l.activityId ? before.get(l.activityId) ?? 0 : 0; const others = l.activityId ? (upToday.get(l.activityId) ?? 0) - prev : 0; const base = a ? m.baseOf(a, head.reportDate) : 0; const total = prev + others + l.qty
                return (
                  <tr key={l.key} className={lockedLine(l) ? 'locked' : undefined}>
                    <td>{fa(i + 1)}</td>
                    <td style={{ minWidth: 220 }}>{a ? <><b>{a.title}</b><span className="sub fn-code">{a.rowNo ? `ردیف ${a.rowNo} · ` : ''}{a.itemNo} · {a.unit}{a.kind !== 'standard' ? ' · ★' : ''}{a.parentActivityId ? ' · اضافه‌بها' : ''}</span></> : <span className="ex-bad">فعالیت انتخاب نشده</span>}{l.id && a && epcAvailable && <LineForms lineId={l.id} activityId={a.id} projectId={m.projectId} reportId={reportId} head={head} model={m} editable={editable} />}</td>
                    <td style={{ minWidth: 190 }}><div style={{ display: 'grid', gap: 3 }}><input disabled={lockedLine(l)} placeholder="محل دقیق" value={l.location} onChange={(e) => patchRow(l.key, { location: e.target.value })} dir="auto" aria-label="محل" />{a?.unitCount ? <DecInput className="" value={Number(l.detail.count ?? 0)} onValue={(n) => !lockedLine(l) && patchDetail(l.key, 'count', n || null)} label={`تعداد تکمیل‌شده امروز (از ${a.unitCount.toLocaleString('fa-IR')})`} placeholder="تعداد" /> : null}{terms.km && <span style={{ display: 'flex', gap: 3 }}><KmInput value={l.kmFrom} disabled={lockedLine(l)} onValue={(n) => patchRow(l.key, { kmFrom: n })} label="کیلومتر از" placeholder="km از" /><KmInput value={l.kmTo} disabled={lockedLine(l)} onValue={(n) => patchRow(l.key, { kmTo: n })} label="کیلومتر تا" placeholder="km تا" /></span>}</div></td>
                    <td className="num" style={{ minWidth: 100 }}>{lockedLine(l) ? <b>{fa(l.qty, 3)}</b> : <DecInput value={l.qty} onValue={(n) => patchRow(l.key, { qty: n })} label="کارکرد امروز" />}{l.status === 'approved' && l.approvedQty != null && l.approvedQty !== l.qty && <small className="ex-warn" style={{ display: 'block' }}>تأییدشده: {fa(l.approvedQty, 3)}</small>}</td>
                    <td style={{ minWidth: 150 }}><div className="ex-cum"><span>تا روز قبل: <b>{fa(prev, 2)}</b></span><span>تجمعی جدید: <b>{fa(total, 2)}</b></span><span>باقی‌مانده: <b className={overRows.has(l.key) ? 'ex-bad' : undefined}>{base ? fa(base - total, 2) : '—'}</b> {a?.unit}</span>{overRows.has(l.key) && <span className="ex-bad">بیش از مقدار مبنا ({fa(base, 2)})</span>}</div></td>
                    <td style={{ minWidth: 140 }}><input disabled={lockedLine(l)} value={l.note} onChange={(e) => patchRow(l.key, { note: e.target.value })} dir="auto" aria-label="توضیح" />{l.sourceReportId && <small className="sub">پیش‌پر از فرم فنی</small>}</td>
                    <td style={{ minWidth: 110 }}>{r.status === 'draft' && l.status === 'pending' ? <span className="sub">—</span> : <LineStatusChip status={l.status} />}{l.reviewNote && <small className="sub" title={LINE_STATUS_LABEL_FA[l.status]}>{l.reviewNote}</small>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{editable && l.status !== 'approved' && <><button className="im-btn im-btn-sm" aria-label="کپی ردیف" onClick={() => copyRow(l)}><Copy size={12} /></button> <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => delRow(l.key)}><Trash2 size={12} /></button></>}</td>
                  </tr>
                ) })}</tbody>
            </table>
          ) : form && sheetTpl && sheetMode ? (
            <SheetEntry template={sheetTpl} form={form} report={{ ...r, ...head, contractorOrgId: head.contractorOrgId || null, data }} rows={shownRows} identity={epcSettings(exSettings as unknown as Record<string, unknown>).identity} metrics={metrics} editable={editable} ensureRows={ensureRows}
              renderRow={(f, rk) => { const l = rows.find((x) => x.key === rk); return l ? cell(f, l) : null }} renderHeader={(f) => headField(f)} />
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
      </div>}

      {/* every entry of a site minute (rows, manpower, photos) comes before «save»; the signatures come after it */}
      {form?.resources && <ResourcePanel rows={res} editable={editable} onChange={(n) => { setRes(n); setDirty(true) }} baseline={lastRows} baselineLabel={lastRes ? `گزارش ${fmtD(lastRes.reportDate)}` : undefined} onCopyLast={copyLastResources} />}
      {boardOpen && <SectionBoard sections={boardSections} plan={plan} joints={jointRecs} canPlan={ex.can(m.projectId, 'configure')} onPlan={(p) => ex.saveSettings(m.projectId, { sectionPlan: p })} onAdd={addJoints} onClose={() => setBoardOpen(false)} />}
      {yardOpen && <PipeYard pipes={yard} startKm={nextKm} onAdd={addFromYard} onClose={() => setYardOpen(false)} />}
      {form && <><ReportPhotos projectId={m.projectId} reportId={reportId} date={head.reportDate} front={head.front} can={ex.can(m.projectId, 'record') || ex.can(m.projectId, 'review')} />{finishBar}{signs}</>}

      {!form && (
        <div className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <b>۴. توقف‌ها، مشکلات اجرایی و HSE</b>
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
          <b>۵. شرح عملیات، موانع و مشکلات</b>
          <NumberedLines title="شرح عملیات" hint="خلاصهٔ عملیات انجام‌شده امروز — هر مورد در یک ردیف." value={asList(data.ops)} max={12} editable={editable} onChange={(v) => setD('ops', v)} />
          <NumberedLines title="موانع و مشکلات" hint="هر مانع یا مشکل اجرایی امروز در یک ردیف؛ برای توقف مشخص بالاتر «توقف‌ها» را هم ثبت کنید." value={asList(data.obstacles)} max={6} editable={editable} onChange={(v) => setD('obstacles', v)} />
        </div>
      )}
      {!form && <><SecTitle n={6} title="پیش‌بینی عملیات اجرایی روز آتی" /><NextDayPlan value={asNext(data.nextDay)} editable={editable} onChange={(v) => setD('nextDay', v)} /></>}
      {!form && <><ReportPhotos projectId={m.projectId} reportId={reportId} date={head.reportDate} front={head.front} can={ex.can(m.projectId, 'record') || ex.can(m.projectId, 'review')} />{finishBar}{signs}</>}


      {incons.length > 0 && editable && (
        <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid var(--im-amber)' }}>
          <b>ناسازگاری:</b><ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{incons.map((x) => <li key={x} className="ex-bad">{x}</li>)}</ul>
        </div>
      )}
      {showHist && <div className="im-card" style={{ padding: 14 }}><b>سابقهٔ ارسال، اصلاح و تأیید</b><div className="ex-hist" style={{ marginTop: 8 }}>{hist.length === 0 ? <span className="im-helper">هنوز سابقه‌ای نیست.</span> : hist.map((h) => <div key={h.id}><b>{h.action.startsWith('review:') ? `بررسی نظارت: ${REPORT_STATUS_LABEL_FA[h.action.slice(7) as keyof typeof REPORT_STATUS_LABEL_FA] ?? h.action.slice(7)}` : h.action === 'submit' ? 'ارسال برای نظارت' : h.action === 'reopen' ? 'بازگشایی' : h.action === 'signatures_cleared' ? 'نسخهٔ تازه — گردش امضا از ابتدا (امضاهای قبلی در سابقه)' : h.action === 'unsign' ? 'لغو امضا' : h.action}</b><span>{ex.people.get(h.actor ?? '') ?? 'کاربر'}</span><small>{fmtD(h.at.slice(0, 10))} {new Date(h.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>{h.note && <span>— {h.note}</span>}</div>)}</div></div>}
      {paper && <PaperModal c={paperCtx()} onClose={() => setPaper(false)} />}
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

/** numbered section heading of the daily work report */
function SecTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return <div className="ex-sec-title"><span>{n.toLocaleString('fa-IR')}</span><b>{title}</b>{hint && <small>{hint}</small>}</div>
}

/** where the report stands: fill in → save → contractor signatures → send */
function Steps({ filled, saved, signed }: { filled: boolean; saved: boolean; signed: boolean }) {
  const steps = [{ t: 'تکمیل فرم', ok: filled }, { t: 'ذخیره', ok: saved && filled }, { t: 'امضای دفتر فنی و سرپرست کارگاه', ok: signed && saved }, { t: 'ارسال برای نظارت', ok: false }]
  const cur = steps.findIndex((x) => !x.ok)
  return (
    <ol className="ex-steps no-print" aria-label="مراحل ثبت گزارش">
      {steps.map((x, i) => <li key={x.t} className={x.ok ? 'done' : i === cur ? 'cur' : undefined} aria-current={i === cur ? 'step' : undefined}><span>{x.ok ? '✓' : (i + 1).toLocaleString('fa-IR')}</span>{x.t}</li>)}
    </ol>
  )
}

/** floating box with what blocks the action — the user sees why «send» did not go through */
function IssuePanel({ title, items, onClose }: { title: string; items: string[]; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="ex-issues no-print" role="alertdialog" aria-labelledby="ex-issues-t">
      <div className="ex-issues-head"><b id="ex-issues-t">{title}</b><button className="im-btn im-btn-sm" onClick={onClose} aria-label="بستن">بستن</button></div>
      <ul>{items.slice(0, 20).map((x) => <li key={x}>{x}</li>)}{items.length > 20 && <li>و {(items.length - 20).toLocaleString('fa-IR')} مورد دیگر…</li>}</ul>
      <small>پس از اصلاح، دوباره «ارسال برای نظارت» را بزنید.</small>
    </div>
  )
}

/** entry panel ↔ the list as printed on the daily sheet */
function SheetToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="rs-toggle no-print" role="group" aria-label="نحوهٔ نمایش نیروی انسانی و ماشین‌آلات">
      <button type="button" className={!on ? 'on' : undefined} onClick={() => set(false)} aria-pressed={!on}>ثبت و ویرایش</button>
      <button type="button" className={on ? 'on' : undefined} onClick={() => set(true)} aria-pressed={on}>نمایش مثل فرم چاپی</button>
    </div>
  )
}
