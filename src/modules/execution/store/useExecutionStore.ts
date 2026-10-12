import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { explainExecutionError } from '../lib/errors'
import { roleAllows } from '../lib/perms'
import {
  DEFAULT_EX_SETTINGS, type Activity, type Baseline, type BaselineLine, type DetectedGap, type ExProjectRole, type ExRole, type ExSettings, type FormMap, type Gap, type GapStatus, type PriceBook, type PriceItem,
  type Report, type ReportHistory, type ReportLine, type ReportResource, type ReportStatus, type Stoppage,
} from '../types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function report(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${explainExecutionError(error)}`)
  return true
}
const n = (x: unknown) => Number(x ?? 0)
const nn = (x: unknown): number | null => (x == null || x === '' ? null : Number(x))

export interface ReportDraft { projectId: string; formKey: string; reportDate: string; front?: string; station?: string; shift?: string; contractorOrgId?: string | null; data?: Record<string, unknown>; notes?: string; status?: 'draft' | 'incomplete'; completionOf?: string | null; missing?: string[]; dueDate?: string | null }
export interface LineInput { id?: string; activityId?: string | null; qty?: number; kmFrom?: number | null; kmTo?: number | null; location?: string; note?: string; detail?: Record<string, unknown>; sourceReportId?: string | null }
export interface ResourceInput { kind: 'man' | 'equip'; name: string; activeQty: number; idleQty: number; hours: number; note?: string }
export interface StoppageInput { category: Stoppage['category']; hours: number; description: string; materialId?: string | null }
export interface ReviewDecision { lineId: string; decision: 'approved' | 'rejected' | 'returned'; qty?: number; note?: string }

interface State {
  loaded: boolean; loading: boolean
  roles: ExProjectRole[]; settingsByProject: Map<string, ExSettings>
  books: PriceBook[]; priceItems: PriceItem[]; activities: Activity[]; baselines: Baseline[]; blines: BaselineLine[]
  reports: Report[]; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[]; history: ReportHistory[]; maps: FormMap[]; gaps: Gap[]
  people: Map<string, string>
  /** a report another page wants opened (e.g. the completion form generated from a gap) */
  focusReportId: string | null
  setFocus: (id: string | null) => void
  fetchAll: () => Promise<void>
  myRoles: (projectId: string) => ExRole[]
  can: (projectId: string, action: string) => boolean
  settings: (projectId: string) => ExSettings
  saveSettings: (projectId: string, patch: Partial<ExSettings>) => Promise<boolean>
  addRole: (projectId: string, userId: string, role: ExRole, organizationId?: string | null) => Promise<boolean>
  setRoleActive: (id: string, active: boolean) => Promise<boolean>
  saveBook: (b: Partial<PriceBook> & { projectId: string; title: string }) => Promise<string | null>
  saveItems: (bookId: string, rows: Omit<PriceItem, 'id' | 'bookId'>[]) => Promise<boolean>
  removeItem: (id: string) => Promise<boolean>
  saveActivity: (a: Partial<Activity> & { projectId: string; title: string }) => Promise<string | null>
  removeActivity: (id: string) => Promise<boolean>
  importActivities: (projectId: string, rows: Omit<Activity, 'id' | 'projectId' | 'approval' | 'approvalNote' | 'priceItemId'>[]) => Promise<number>
  newBookVersion: (bookId: string, note: string) => Promise<string | null>
  decideActivity: (id: string, approve: boolean, note?: string) => Promise<boolean>
  createBaseline: (projectId: string, reason: string, effective: string) => Promise<string | null>
  saveBaselineLine: (id: string, patch: { baseQty?: number; weight?: number; weightGroup?: string; active?: boolean }) => Promise<boolean>
  approveBaseline: (id: string) => Promise<boolean>
  cancelBaseline: (id: string) => Promise<boolean>
  createReport: (d: ReportDraft) => Promise<string | null>
  updateReport: (id: string, patch: Partial<Pick<Report, 'reportDate' | 'front' | 'station' | 'shift' | 'contractorOrgId' | 'data' | 'notes'>>) => Promise<boolean>
  deleteReport: (id: string) => Promise<boolean>
  saveBody: (reportId: string, body: { lines?: LineInput[]; resources?: ResourceInput[]; stoppages?: StoppageInput[] }) => Promise<boolean>
  submitReport: (id: string) => Promise<boolean>
  reviewReport: (id: string, decisions: ReviewDecision[], note: string) => Promise<boolean>
  decideWhole: (id: string, decision: 'approved' | 'rejected' | 'returned', note: string) => Promise<boolean>
  reopenReport: (id: string, reason: string) => Promise<boolean>
  syncGaps: (projectId: string, items: DetectedGap[]) => Promise<boolean>
  updateGap: (id: string, patch: { status?: GapStatus; responsible?: string | null; dueDate?: string | null; note?: string; generatedReportId?: string | null }) => Promise<boolean>
  saveMap: (projectId: string, formKey: string, metricKey: string, groupValue: string, activityId: string | null) => Promise<boolean>
}

const initial = { loaded: false, loading: false, roles: [], settingsByProject: new Map<string, ExSettings>(), books: [], priceItems: [], activities: [], baselines: [], blines: [], reports: [], lines: [], resources: [], stoppages: [], history: [], maps: [], gaps: [], people: new Map<string, string>(), focusReportId: null as string | null }

const actRow = (r: Row): Activity => ({ id: r.id, projectId: r.project_id, priceItemId: r.price_item_id, itemNo: r.item_no ?? '', title: r.title, unit: r.unit ?? '', chapter: r.chapter ?? '', kind: r.kind, baseQty: n(r.base_qty), unitPrice: n(r.unit_price), weight: n(r.weight), weightGroup: r.weight_group ?? '', metric: r.metric ?? '', area: r.area ?? '', front: r.front ?? '', station: r.station ?? '', kmFrom: nn(r.km_from), kmTo: nn(r.km_to), plannedStart: r.planned_start, plannedEnd: r.planned_end, active: !!r.active, approval: r.approval, approvalNote: r.approval_note ?? '', sort: r.sort ?? 0, note: r.note ?? '' })
const repRow = (r: Row): Report => ({ id: r.id, projectId: r.project_id, formKey: r.form_key, reportNo: r.report_no, reportDate: r.report_date, contractorOrgId: r.contractor_org_id, front: r.front ?? '', station: r.station ?? '', shift: r.shift ?? 'day', status: r.status, data: r.data ?? {}, notes: r.notes ?? '', missing: Array.isArray(r.missing) ? r.missing : [], completionOf: r.completion_of, dueDate: r.due_date, createdBy: r.created_by, createdAt: r.created_at, submittedBy: r.submitted_by, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, reviewNote: r.review_note ?? '' })
const lineRow = (r: Row): ReportLine => ({ id: r.id, reportId: r.report_id, lineNo: r.line_no ?? 0, activityId: r.activity_id, qty: n(r.qty), kmFrom: nn(r.km_from), kmTo: nn(r.km_to), location: r.location ?? '', note: r.note ?? '', detail: r.detail ?? {}, status: r.status, approvedQty: nn(r.approved_qty), reviewNote: r.review_note ?? '', sourceReportId: r.source_report_id })

export const useExecutionStore = create<State>((set, get) => ({
  ...initial,

  setFocus: (id) => set({ focusReportId: id }),
  fetchAll: async () => {
    set({ loading: true })
    const t = (name: string) => supabase.from(name).select('*')
    const [roles, sets, books, items, acts, bases, blines, reps, lns, res, stp, his, maps, gaps, profs] = await Promise.all([
      t('ex_project_roles'), t('ex_settings'), t('ex_price_books').order('created_at'), t('ex_price_items'), t('ex_activities').order('sort'), t('ex_baselines').order('version'), t('ex_baseline_lines'),
      t('ex_reports').order('report_date', { ascending: false }), t('ex_report_lines').order('line_no'), t('ex_report_resources'), t('ex_report_stoppages'), t('ex_report_history').order('at', { ascending: false }).limit(2000), t('ex_form_activity_map'), t('ex_gap_items'),
      supabase.from('profiles').select('id, full_name'),
    ])
    // an un-migrated database leaves these empty rather than breaking the module
    const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] => (r.error ? [] : r.data ?? [])
    const sm = new Map<string, ExSettings>()
    for (const r of ok<Row>(sets)) sm.set(r.project_id, { ...DEFAULT_EX_SETTINGS, ...(r.values_json ?? {}) })
    set({
      roles: ok<Row>(roles).map((r): ExProjectRole => ({ id: r.id, projectId: r.project_id, userId: r.user_id, role: r.role, organizationId: r.organization_id, active: !!r.active })),
      settingsByProject: sm,
      books: ok<Row>(books).map((r): PriceBook => ({ id: r.id, projectId: r.project_id, discipline: r.discipline ?? '', year: r.year, season: r.season ?? '', title: r.title, version: r.version, status: r.status, note: r.note ?? '' })),
      priceItems: ok<Row>(items).map((r): PriceItem => ({ id: r.id, bookId: r.book_id, chapter: r.chapter ?? '', itemNo: r.item_no, description: r.description, unit: r.unit ?? '', unitPrice: n(r.unit_price), starred: !!r.starred })),
      activities: ok<Row>(acts).map(actRow),
      baselines: ok<Row>(bases).map((r): Baseline => ({ id: r.id, projectId: r.project_id, version: r.version, status: r.status, reason: r.reason ?? '', effectiveDate: r.effective_date, createdAt: r.created_at, approvedAt: r.approved_at })),
      blines: ok<Row>(blines).map((r): BaselineLine => ({ id: r.id, baselineId: r.baseline_id, activityId: r.activity_id, itemNo: r.item_no ?? '', title: r.title ?? '', unit: r.unit ?? '', baseQty: n(r.base_qty), weight: n(r.weight), unitPrice: n(r.unit_price), weightGroup: r.weight_group ?? '', active: !!r.active })),
      reports: ok<Row>(reps).map(repRow),
      lines: ok<Row>(lns).map(lineRow),
      resources: ok<Row>(res).map((r): ReportResource => ({ id: r.id, reportId: r.report_id, kind: r.kind, name: r.name, activeQty: n(r.active_qty), idleQty: n(r.idle_qty), hours: n(r.hours), note: r.note ?? '' })),
      stoppages: ok<Row>(stp).map((r): Stoppage => ({ id: r.id, reportId: r.report_id, category: r.category, hours: n(r.hours), description: r.description ?? '', materialId: r.material_id, issueRef: r.issue_ref })),
      history: ok<Row>(his).map((r): ReportHistory => ({ id: r.id, reportId: r.report_id, at: r.at, actor: r.actor, action: r.action, note: r.note ?? '' })),
      maps: ok<Row>(maps).map((r): FormMap => ({ id: r.id, projectId: r.project_id, formKey: r.form_key, metricKey: r.metric_key, groupValue: r.group_value ?? '', activityId: r.activity_id })),
      gaps: ok<Row>(gaps).map((r): Gap => ({ id: r.id, projectId: r.project_id, fingerprint: r.fingerprint, kind: r.kind, formKey: r.form_key ?? '', periodKey: r.period_key ?? '', front: r.front ?? '', subject: r.subject ?? '', existing: r.existing ?? {}, missing: Array.isArray(r.missing) ? r.missing : [], responsible: r.responsible, dueDate: r.due_date, status: r.status, note: r.note ?? '', generatedReportId: r.generated_report_id })),
      people: new Map(ok<Row>(profs).map((p) => [p.id as string, (p.full_name as string) || 'کاربر'])),
      loaded: true, loading: false,
    })
  },

  myRoles: (projectId) => {
    const uid = useAuthStore.getState().profile?.id
    return get().roles.filter((r) => r.projectId === projectId && r.userId === uid && r.active).map((r) => r.role)
  },
  settings: (projectId) => get().settingsByProject.get(projectId) ?? DEFAULT_EX_SETTINGS,
  can: (projectId, action) => {
    if (useAuthStore.getState().profile?.isAdmin) return true
    return roleAllows(get().myRoles(projectId), action, get().settings(projectId))
  },

  saveSettings: async (projectId, patch) => {
    const next = { ...get().settings(projectId), ...patch }
    const { error } = await supabase.from('ex_settings').upsert({ project_id: projectId, values_json: next, updated_at: new Date().toISOString() })
    if (report('ذخیرهٔ تنظیمات اجرا', error)) return false
    await get().fetchAll(); return true
  },
  addRole: async (projectId, userId, role, organizationId) => {
    const { error } = await supabase.from('ex_project_roles').upsert({ project_id: projectId, user_id: userId, role, organization_id: organizationId ?? null, active: true }, { onConflict: 'project_id,user_id,role' })
    if (report('افزودن نقش', error)) return false
    await get().fetchAll(); return true
  },
  setRoleActive: async (id, active) => {
    const { error } = await supabase.from('ex_project_roles').update({ active }).eq('id', id)
    if (report('تغییر نقش', error)) return false
    await get().fetchAll(); return true
  },

  saveBook: async (b) => {
    const row = { project_id: b.projectId, discipline: b.discipline ?? '', year: b.year ?? null, season: b.season ?? '', title: b.title, version: b.version ?? 1, status: b.status ?? 'active', note: b.note ?? '' }
    const res = b.id ? await supabase.from('ex_price_books').update(row).eq('id', b.id).select('id').single() : await supabase.from('ex_price_books').insert(row).select('id').single()
    if (report('ذخیرهٔ فهرست‌بها', res.error)) return null
    await get().fetchAll(); return (res.data as Row).id as string
  },
  saveItems: async (bookId, rows) => {
    const payload = rows.map((r) => ({ book_id: bookId, chapter: r.chapter, item_no: r.itemNo, description: r.description, unit: r.unit, unit_price: r.unitPrice, starred: r.starred }))
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('ex_price_items').upsert(payload.slice(i, i + 500), { onConflict: 'book_id,item_no' })
      if (report('ذخیرهٔ ردیف‌های فهرست‌بها', error)) return false
    }
    await get().fetchAll(); return true
  },
  removeItem: async (id) => {
    const { error } = await supabase.from('ex_price_items').delete().eq('id', id)
    if (report('حذف ردیف فهرست‌بها', error)) return false
    await get().fetchAll(); return true
  },

  saveActivity: async (a) => {
    const row = { project_id: a.projectId, price_item_id: a.priceItemId ?? null, item_no: a.itemNo ?? '', title: a.title, unit: a.unit ?? '', chapter: a.chapter ?? '', kind: a.kind ?? 'standard', base_qty: a.baseQty ?? 0, unit_price: a.unitPrice ?? 0, weight: a.weight ?? 0, weight_group: a.weightGroup ?? '', metric: a.metric ?? '', area: a.area ?? '', front: a.front ?? '', station: a.station ?? '', km_from: a.kmFrom ?? null, km_to: a.kmTo ?? null, planned_start: a.plannedStart || null, planned_end: a.plannedEnd || null, active: a.active ?? true, sort: a.sort ?? 0, note: a.note ?? '', ...(a.id ? {} : { approval: (a.kind ?? 'standard') === 'standard' ? 'approved' : 'pending' }) }
    const res = a.id ? await supabase.from('ex_activities').update(row).eq('id', a.id).select('id').single() : await supabase.from('ex_activities').insert(row).select('id').single()
    if (report('ذخیرهٔ فعالیت', res.error)) return null
    await get().fetchAll(); return (res.data as Row).id as string
  },
  removeActivity: async (id) => {
    if (get().lines.some((l) => l.activityId === id)) { useSystemStore.getState().setStorageError('برای این فعالیت کارکرد ثبت شده است و حذف نمی‌شود؛ آن را غیرفعال کنید.'); return false }
    const { error } = await supabase.from('ex_activities').delete().eq('id', id)
    if (report('حذف فعالیت', error)) return false
    await get().fetchAll(); return true
  },
  importActivities: async (projectId, rows) => {
    const payload = rows.map((a, i) => ({ project_id: projectId, item_no: a.itemNo, title: a.title, unit: a.unit, chapter: a.chapter, kind: a.kind, base_qty: a.baseQty, unit_price: a.unitPrice, weight: a.weight, weight_group: a.weightGroup, metric: a.metric ?? '', area: a.area, front: a.front, station: a.station, km_from: a.kmFrom, km_to: a.kmTo, planned_start: a.plannedStart || null, planned_end: a.plannedEnd || null, active: a.active, sort: a.sort || i + 1, note: a.note, approval: a.kind === 'standard' ? 'approved' : 'pending' }))
    let done = 0
    for (let i = 0; i < payload.length; i += 300) {
      const { error } = await supabase.from('ex_activities').insert(payload.slice(i, i + 300))
      if (report('ورود فعالیت‌ها', error)) break
      done += Math.min(300, payload.length - i)
    }
    await get().fetchAll(); return done
  },
  newBookVersion: async (bookId, note) => {
    const src = get().books.find((b) => b.id === bookId); if (!src) return null
    const { data, error } = await supabase.from('ex_price_books').insert({ project_id: src.projectId, discipline: src.discipline, year: src.year, season: src.season, title: src.title, version: src.version + 1, status: 'active', note }).select('id').single()
    if (report('ایجاد نسخهٔ جدید فهرست‌بها', error)) return null
    const nid = (data as Row).id as string
    const items = get().priceItems.filter((i) => i.bookId === bookId).map((i) => ({ book_id: nid, chapter: i.chapter, item_no: i.itemNo, description: i.description, unit: i.unit, unit_price: i.unitPrice, starred: i.starred }))
    for (let k = 0; k < items.length; k += 500) { const r = await supabase.from('ex_price_items').insert(items.slice(k, k + 500)); if (report('کپی ردیف‌های فهرست‌بها', r.error)) return null }
    await supabase.from('ex_price_books').update({ status: 'superseded' }).eq('id', bookId)
    await get().fetchAll(); return nid
  },
  decideActivity: async (id, approve, note) => {
    const { error } = await supabase.rpc('ex_activity_decide', { p_id: id, p_approve: approve, p_note: note ?? '' })
    if (report('تصمیم دربارهٔ فعالیت', error)) return false
    await get().fetchAll(); return true
  },

  createBaseline: async (projectId, reason, effective) => {
    const { data, error } = await supabase.rpc('ex_baseline_create', { p_project: projectId, p_reason: reason, p_effective: effective })
    if (report('ایجاد نسخهٔ مبنا', error)) return null
    await get().fetchAll(); return data as string
  },
  saveBaselineLine: async (id, patch) => {
    const row: Row = {}
    if (patch.baseQty != null) row.base_qty = patch.baseQty
    if (patch.weight != null) row.weight = patch.weight
    if (patch.weightGroup != null) row.weight_group = patch.weightGroup
    if (patch.active != null) row.active = patch.active
    const { error } = await supabase.from('ex_baseline_lines').update(row).eq('id', id)
    if (report('ویرایش ردیف نسخهٔ مبنا', error)) return false
    await get().fetchAll(); return true
  },
  approveBaseline: async (id) => {
    const { error } = await supabase.rpc('ex_baseline_approve', { p_id: id })
    if (report('تصویب نسخهٔ مبنا', error)) return false
    // the approved version also becomes the live row of every activity, so the next draft starts from it
    const b = get().baselines.find((x) => x.id === id)
    for (const l of get().blines.filter((x) => x.baselineId === id)) await supabase.from('ex_activities').update({ base_qty: l.baseQty, weight: l.weight, weight_group: l.weightGroup, active: l.active }).eq('id', l.activityId)
    void b
    await get().fetchAll(); return true
  },
  cancelBaseline: async (id) => {
    const { error } = await supabase.from('ex_baselines').delete().eq('id', id)
    if (report('لغو نسخهٔ مبنا', error)) return false
    await get().fetchAll(); return true
  },

  createReport: async (d) => {
    const row = { project_id: d.projectId, form_key: d.formKey, report_date: d.reportDate, front: d.front ?? '', station: d.station ?? '', shift: d.shift ?? 'day', contractor_org_id: d.contractorOrgId ?? null, data: d.data ?? {}, notes: d.notes ?? '', status: d.status ?? 'draft', completion_of: d.completionOf ?? null, missing: d.missing ?? [], due_date: d.dueDate ?? null }
    const { data, error } = await supabase.from('ex_reports').insert(row).select('id').single()
    if (report('ایجاد گزارش', error)) return null
    await get().fetchAll(); return (data as Row).id as string
  },
  updateReport: async (id, p) => {
    const row: Row = {}
    if (p.reportDate != null) row.report_date = p.reportDate
    if (p.front != null) row.front = p.front
    if (p.station != null) row.station = p.station
    if (p.shift != null) row.shift = p.shift
    if (p.contractorOrgId !== undefined) row.contractor_org_id = p.contractorOrgId
    if (p.data != null) row.data = p.data
    if (p.notes != null) row.notes = p.notes
    const { error } = await supabase.from('ex_reports').update(row).eq('id', id)
    if (report('ذخیرهٔ گزارش', error)) return false
    return true
  },
  deleteReport: async (id) => {
    const { error } = await supabase.from('ex_reports').delete().eq('id', id)
    if (report('حذف گزارش', error)) return false
    await get().fetchAll(); return true
  },
  saveBody: async (reportId, body) => {
    if (body.lines) {
      const existing = get().lines.filter((l) => l.reportId === reportId)
      const keep = new Set(body.lines.map((l) => l.id).filter(Boolean) as string[])
      const gone = existing.filter((l) => !keep.has(l.id)).map((l) => l.id)
      if (gone.length) { const { error } = await supabase.from('ex_report_lines').delete().in('id', gone); if (report('حذف ردیف گزارش', error)) return false }
      let i = 0
      for (const l of body.lines) {
        i++
        const row = { report_id: reportId, line_no: i, activity_id: l.activityId ?? null, qty: l.qty ?? 0, km_from: l.kmFrom ?? null, km_to: l.kmTo ?? null, location: l.location ?? '', note: l.note ?? '', detail: l.detail ?? {}, source_report_id: l.sourceReportId ?? null }
        const { error } = l.id ? await supabase.from('ex_report_lines').update(row).eq('id', l.id) : await supabase.from('ex_report_lines').insert(row)
        if (report('ذخیرهٔ ردیف گزارش', error)) return false
      }
    }
    if (body.resources) {
      const del = await supabase.from('ex_report_resources').delete().eq('report_id', reportId)
      if (report('ذخیرهٔ منابع', del.error)) return false
      const rows = body.resources.filter((r) => r.activeQty || r.idleQty || r.hours).map((r) => ({ report_id: reportId, kind: r.kind, name: r.name, active_qty: r.activeQty, idle_qty: r.idleQty, hours: r.hours, note: r.note ?? '' }))
      if (rows.length) { const { error } = await supabase.from('ex_report_resources').insert(rows); if (report('ذخیرهٔ منابع', error)) return false }
    }
    if (body.stoppages) {
      const del = await supabase.from('ex_report_stoppages').delete().eq('report_id', reportId)
      if (report('ذخیرهٔ توقف‌ها', del.error)) return false
      const rows = body.stoppages.filter((s) => s.hours > 0 || s.description.trim()).map((s) => ({ report_id: reportId, category: s.category, hours: s.hours, description: s.description, material_id: s.materialId ?? null }))
      if (rows.length) { const { error } = await supabase.from('ex_report_stoppages').insert(rows); if (report('ذخیرهٔ توقف‌ها', error)) return false }
    }
    await get().fetchAll(); return true
  },
  submitReport: async (id) => {
    const { error } = await supabase.rpc('ex_report_submit', { p_id: id })
    if (report('ارسال گزارش', error)) return false
    await get().fetchAll(); return true
  },
  reviewReport: async (id, decisions, note) => {
    const { error } = await supabase.rpc('ex_report_review', { p_id: id, p_decisions: decisions.map((d) => ({ line_id: d.lineId, decision: d.decision, qty: d.qty ?? null, note: d.note ?? '' })), p_note: note })
    if (report('ثبت نتیجهٔ بررسی', error)) return false
    await get().fetchAll(); return true
  },
  decideWhole: async (id, decision, note) => {
    const { error } = await supabase.rpc('ex_report_decide_whole', { p_id: id, p_decision: decision, p_note: note })
    if (report('ثبت نتیجهٔ بررسی', error)) return false
    await get().fetchAll(); return true
  },
  reopenReport: async (id, reason) => {
    const { error } = await supabase.rpc('ex_report_reopen', { p_id: id, p_reason: reason })
    if (report('بازگشایی گزارش', error)) return false
    await get().fetchAll(); return true
  },

  syncGaps: async (projectId, items) => {
    const payload = items.filter((i) => i.kind !== 'form_missing').map((i) => ({ fingerprint: i.fingerprint, kind: i.kind, form_key: i.formKey, period_key: i.periodKey, front: i.front, subject: i.subject, existing: i.existing, missing: i.missing, due_date: i.dueDate }))
    const { error } = await supabase.rpc('ex_gap_sync', { p_project: projectId, p_items: payload })
    if (report('همگام‌سازی کسری‌ها', error)) return false
    await get().fetchAll(); return true
  },
  updateGap: async (id, p) => {
    const row: Row = { updated_at: new Date().toISOString() }
    if (p.status) row.status = p.status
    if (p.responsible !== undefined) row.responsible = p.responsible
    if (p.dueDate !== undefined) row.due_date = p.dueDate
    if (p.note !== undefined) row.note = p.note
    if (p.generatedReportId !== undefined) row.generated_report_id = p.generatedReportId
    const { error } = await supabase.from('ex_gap_items').update(row).eq('id', id)
    if (report('ثبت پیگیری کسری', error)) return false
    await get().fetchAll(); return true
  },
  saveMap: async (projectId, formKey, metricKey, groupValue, activityId) => {
    const q = supabase.from('ex_form_activity_map')
    const { error } = activityId
      ? await q.upsert({ project_id: projectId, form_key: formKey, metric_key: metricKey, group_value: groupValue, activity_id: activityId }, { onConflict: 'project_id,form_key,metric_key,group_value' })
      : await q.delete().eq('project_id', projectId).eq('form_key', formKey).eq('metric_key', metricKey).eq('group_value', groupValue)
    if (report('ذخیرهٔ اتصال فرم به فعالیت', error)) return false
    await get().fetchAll(); return true
  },
}))
export type { ReportStatus }
