import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { DEFAULT_CALENDAR } from '../lib/calendar'
import { countIssues, validateParsed } from '../lib/validate'
import type { DurationRisk, RiskEvent } from '../lib/monteCarlo'
import type { ActType, ImportIssue, LinkTarget, ParsedSchedule, RelType, SchActivity, SchCalendar, SchLink, SchRelation, SchVersion, VersionKind, VersionSource } from '../lib/types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ERR: Record<string, string> = {
  version_locked: 'این نسخه تأیید شده و قابل تغییر نیست؛ نسخهٔ جدید بسازید.', use_rpc: 'این تغییر فقط از مسیر مجاز (تأیید/خط مبنا/جاری) انجام می‌شود.', not_allowed: 'اجازهٔ این کار را ندارید.',
  already_approved: 'این نسخه قبلاً تأیید شده است.', approve_first: 'ابتدا نسخه را تأیید کنید، سپس به‌عنوان خط مبنا تعیین کنید.', empty_version: 'نسخهٔ خالی را نمی‌توان تأیید کرد.',
}
const explain = (m: string) => { for (const k of Object.keys(ERR)) if (m.includes(k)) return ERR[k]; if (m.includes('23505')) return 'این برچسب یا کد قبلاً ثبت شده است.'; return m }
const fail = (what: string, error: { message: string } | null): boolean => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${explain(error.message)}`)
  return true
}
const uuid = (): string => globalThis.crypto.randomUUID()
const chunk = <T,>(a: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }

const mapVersion = (r: Row): SchVersion => ({ id: r.id, projectId: r.project_id, label: r.label, kind: r.kind, source: r.source, fileName: r.file_name ?? '', fileHash: r.file_hash ?? '', dataDate: r.data_date, projectStart: r.project_start, projectFinish: r.project_finish, status: r.status, isBaseline: !!r.is_baseline, isCurrent: !!r.is_current, parentVersionId: r.parent_version_id, approvedBy: r.approved_by, approvedAt: r.approved_at, mapping: r.mapping ?? {}, summary: r.summary ?? {}, warnings: r.warnings ?? [], note: r.note ?? '', createdBy: r.created_by, createdAt: r.created_at })
const mapCal = (r: Row): SchCalendar => ({ id: r.id, code: r.code, name: r.name, workDays: r.work_days ?? [], hoursPerDay: Number(r.hours_per_day ?? 8), holidays: r.holidays ?? [], isDefault: !!r.is_default, sourceId: r.source_id ?? '' })
const mapAct = (r: Row): SchActivity => ({ id: r.id, uid: r.uid, versionId: r.version_id, code: r.code, sourceId: r.source_id ?? '', name: r.name ?? '', wbsCode: r.wbs_code ?? '', wbsPath: r.wbs_path ?? '', type: r.activity_type as ActType, calendarId: r.calendar_id, origDuration: Number(r.orig_duration ?? 0), remDuration: r.rem_duration == null ? null : Number(r.rem_duration), plannedStart: r.planned_start, plannedFinish: r.planned_finish, actualStart: r.actual_start, actualFinish: r.actual_finish, pctComplete: r.pct_complete == null ? null : Number(r.pct_complete), constraintType: r.constraint_type ?? '', constraintDate: r.constraint_date, budgetCost: Number(r.budget_cost ?? 0), owner: r.owner ?? '', sort: r.sort ?? 0 })
const mapRel = (r: Row): SchRelation => ({ id: r.id, versionId: r.version_id, predId: r.pred_id, succId: r.succ_id, type: r.rel_type as RelType, lag: Number(r.lag_days ?? 0) })
const mapLink = (r: Row): SchLink => ({ id: r.id, projectId: r.project_id, activityUid: r.activity_uid, targetType: r.target_type as LinkTarget, targetId: r.target_id, needKind: r.need_kind, needDate: r.need_date, note: r.note ?? '' })

export interface VersionBundle { activities: SchActivity[]; relations: SchRelation[]; calendars: SchCalendar[] }
export interface SchSimulation { id: string; versionId: string | null; seed: number; iterations: number; params: Record<string, unknown>; result: Record<string, unknown>; createdAt: string }
export interface ImportRequest {
  projectId: string; parsed: ParsedSchedule; label: string; kind: VersionKind; source: VersionSource; fileName: string; fileHash: string
  dataDate: string | null; mapping: Record<string, string>; parentVersionId: string | null; defaultWorkDays?: number[]; note?: string
}
export interface ImportOutcome { versionId: string | null; duplicateOf?: string; counts?: { activities: number; relations: number; matched: number; created: number }; error?: string }

interface State {
  projectId: string | null
  loading: boolean
  versions: SchVersion[]
  bundles: Map<string, VersionBundle>
  links: SchLink[]
  durationRisks: DurationRisk[]
  riskEvents: RiskEvent[]
  simulations: SchSimulation[]
  history: { id: string; versionId: string | null; action: string; detail: Record<string, unknown>; at: string; actor: string | null }[]
  canEdit: boolean
  canApprove: boolean
  load: (projectId: string) => Promise<void>
  loadBundle: (versionId: string) => Promise<VersionBundle | null>
  importVersion: (req: ImportRequest, force?: boolean) => Promise<ImportOutcome>
  approve: (versionId: string) => Promise<boolean>
  setBaseline: (versionId: string) => Promise<boolean>
  setCurrent: (versionId: string) => Promise<boolean>
  deleteDraft: (versionId: string) => Promise<boolean>
  saveLink: (l: Omit<SchLink, 'id'>) => Promise<boolean>
  removeLink: (id: string) => Promise<boolean>
  saveDurationRisk: (uid: string, min: number, likely: number, max: number) => Promise<boolean>
  removeDurationRisk: (uid: string) => Promise<boolean>
  saveRiskEvent: (e: Omit<RiskEvent, 'id'> & { id?: string }) => Promise<boolean>
  removeRiskEvent: (id: string) => Promise<boolean>
  saveSimulation: (versionId: string | null, seed: number, iterations: number, params: Record<string, unknown>, result: Record<string, unknown>) => Promise<boolean>
}

const BASE_COLS = 'id, project_id, label, kind, source, file_name, file_hash, data_date, project_start, project_finish, status, is_baseline, is_current, parent_version_id, approved_by, approved_at, mapping, summary, warnings, note, created_by, created_at'
const ACT_COLS = 'id, version_id, uid, code, source_id, name, wbs_code, wbs_path, activity_type, calendar_id, orig_duration, rem_duration, planned_start, planned_finish, actual_start, actual_finish, pct_complete, constraint_type, constraint_date, budget_cost, owner, sort'

async function fetchAllRows(table: string, cols: string, versionId: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).eq('version_id', versionId).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export const useSchedulingStore = create<State>((set, get) => ({
  projectId: null, loading: false, versions: [], bundles: new Map(), links: [], durationRisks: [], riskEvents: [], simulations: [], history: [], canEdit: false, canApprove: false,

  load: async (projectId) => {
    set({ projectId, loading: true, versions: [], bundles: new Map(), links: [], durationRisks: [], riskEvents: [], simulations: [], history: [] })
    const [v, l, d, e, s, h, ce, ca] = await Promise.all([
      supabase.from('sch_versions').select(BASE_COLS).eq('project_id', projectId).order('created_at'),
      supabase.from('sch_links').select('*').eq('project_id', projectId),
      supabase.from('sch_duration_risk').select('*').eq('project_id', projectId),
      supabase.from('sch_risk_events').select('*').eq('project_id', projectId),
      supabase.from('sch_simulations').select('id, version_id, seed, iterations, params, result, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(10),
      supabase.from('sch_history').select('id, version_id, action, detail, at, actor').eq('project_id', projectId).order('at', { ascending: false }).limit(60),
      supabase.rpc('sch_can_edit', { p_project: projectId }), supabase.rpc('sch_can_approve', { p_project: projectId }),
    ])
    if (get().projectId !== projectId) return
    if (fail('بارگذاری برنامهٔ زمان‌بندی', v.error ?? l.error ?? d.error ?? e.error)) { set({ loading: false }); return }
    set({
      versions: ((v.data ?? []) as unknown as Row[]).map(mapVersion), links: ((l.data ?? []) as unknown as Row[]).map(mapLink),
      durationRisks: ((d.data ?? []) as unknown as Row[]).map((r): DurationRisk => ({ uid: r.activity_uid, min: Number(r.min_dur), likely: Number(r.likely_dur), max: Number(r.max_dur) })),
      riskEvents: ((e.data ?? []) as unknown as Row[]).map((r): RiskEvent => ({ id: r.id, title: r.title, probability: Number(r.probability), days: { min: Number(r.days_min), likely: Number(r.days_likely), max: Number(r.days_max) }, cost: { min: Number(r.cost_min), likely: Number(r.cost_likely), max: Number(r.cost_max) }, activityUids: r.activity_uids ?? [], active: !!r.active })),
      simulations: ((s.data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, versionId: r.version_id, seed: r.seed, iterations: r.iterations, params: r.params ?? {}, result: r.result ?? {}, createdAt: r.created_at })),
      history: ((h.data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, versionId: r.version_id, action: r.action, detail: r.detail ?? {}, at: r.at, actor: r.actor })),
      canEdit: !!ce.data, canApprove: !!ca.data, loading: false,
    })
  },

  loadBundle: async (versionId) => {
    const have = get().bundles.get(versionId); if (have) return have
    try {
      const [a, r, c] = await Promise.all([fetchAllRows('sch_activities', ACT_COLS, versionId), fetchAllRows('sch_relations', 'id, version_id, pred_id, succ_id, rel_type, lag_days', versionId), supabase.from('sch_calendars').select('*').eq('version_id', versionId)])
      if (c.error) throw new Error(c.error.message)
      const b: VersionBundle = { activities: a.map(mapAct).sort((x, y) => x.sort - y.sort), relations: r.map(mapRel), calendars: ((c.data ?? []) as unknown as Row[]).map(mapCal) }
      set({ bundles: new Map(get().bundles).set(versionId, b) })
      return b
    } catch (e) { fail('بارگذاری فعالیت‌های نسخه', e as Error); return null }
  },

  importVersion: async (req, force = false) => {
    const { projectId, parsed } = req
    const st = get()
    if (!force && req.fileHash) {
      const dup = st.versions.find((v) => v.fileHash && v.fileHash === req.fileHash)
      if (dup) return { versionId: null, duplicateOf: dup.label }
    }
    if (st.versions.some((v) => v.label === req.label)) return { versionId: null, error: 'نسخه‌ای با این برچسب وجود دارد؛ برچسب دیگری بدهید.' }
    const issues: ImportIssue[] = [...parsed.issues, ...validateParsed(parsed)]
    const cnt = countIssues(issues)
    if (cnt.errors > 0) return { versionId: null, error: 'فایل خطای مسدودکننده دارد؛ ابتدا خطاها را اصلاح کنید.' }
    if (!parsed.activities.length) return { versionId: null, error: 'فایل هیچ فعالیتی ندارد.' }

    // stable identity: activities of the parent version keep their uid (matched by code)
    let inherited = 0
    const parentBundle = req.parentVersionId ? await get().loadBundle(req.parentVersionId) : null
    const uidByCode = new Map((parentBundle?.activities ?? []).map((a) => [a.code, a.uid]))

    const versionId = uuid()
    const dates = parsed.activities.flatMap((a) => [a.plannedStart, a.actualStart]).filter((x): x is string => !!x).sort()
    const fins = parsed.activities.flatMap((a) => [a.plannedFinish, a.actualFinish]).filter((x): x is string => !!x).sort()
    const ver = {
      id: versionId, project_id: projectId, label: req.label, kind: req.kind, source: req.source, file_name: req.fileName, file_hash: req.fileHash, data_date: req.dataDate ?? parsed.dataDate,
      project_start: dates[0] ?? null, project_finish: fins[fins.length - 1] ?? null, parent_version_id: req.parentVersionId, mapping: req.mapping, note: req.note ?? '',
      warnings: issues.filter((i) => i.level !== 'info').slice(0, 200),
      summary: { activities: parsed.activities.length, relations: parsed.relations.length, calendars: parsed.calendars.length, errors: cnt.errors, warnings: cnt.warnings, unsupported: parsed.unsupported },
    }
    const cleanup = async () => { await supabase.from('sch_versions').delete().eq('id', versionId) }
    const ins = await supabase.from('sch_versions').insert(ver)
    if (fail('ثبت نسخهٔ برنامه', ins.error)) return { versionId: null, error: ins.error!.message }

    // calendars (a default one when the file has none)
    const cals = parsed.calendars.length ? parsed.calendars : [{ sourceId: 'default', code: 'STD', name: 'تقویم استاندارد', workDays: req.defaultWorkDays?.length ? req.defaultWorkDays : DEFAULT_CALENDAR.workDays, hoursPerDay: 8, holidays: [], isDefault: true }]
    const calIdBySource = new Map<string, string>()
    const calRows = cals.map((c) => { const id = uuid(); calIdBySource.set(c.sourceId, id); return { id, project_id: projectId, version_id: versionId, code: c.code, name: c.name, work_days: c.workDays, hours_per_day: c.hoursPerDay, holidays: c.holidays, is_default: c.isDefault, source_id: c.sourceId } })
    if (!calRows.some((c) => c.is_default)) calRows[0].is_default = true
    const defaultCalId = calRows.find((c) => c.is_default)!.id
    const cr = await supabase.from('sch_calendars').insert(calRows)
    if (cr.error) { fail('ثبت تقویم‌ها', cr.error); await cleanup(); return { versionId: null, error: cr.error.message } }

    const idByCode = new Map<string, string>()
    const actRows = parsed.activities.map((a, i) => {
      const id = uuid(); idByCode.set(a.code, id)
      const uid = uidByCode.get(a.code) ?? uuid(); if (uidByCode.has(a.code)) inherited++
      return { id, project_id: projectId, version_id: versionId, uid, code: a.code, source_id: a.sourceId, name: a.name, wbs_code: a.wbsCode, wbs_path: a.wbsPath, activity_type: a.type, calendar_id: calIdBySource.get(a.calendarSourceId) ?? defaultCalId, orig_duration: a.origDuration, rem_duration: a.remDuration, planned_start: a.plannedStart, planned_finish: a.plannedFinish, actual_start: a.actualStart, actual_finish: a.actualFinish, pct_complete: a.pctComplete, constraint_type: a.constraintType, constraint_date: a.constraintDate, budget_cost: a.budgetCost, owner: a.owner, sort: i }
    })
    for (const part of chunk(actRows, 400)) {
      const r = await supabase.from('sch_activities').insert(part)
      if (r.error) { fail('ثبت فعالیت‌ها', r.error); await cleanup(); return { versionId: null, error: r.error.message } }
    }
    const relRows = parsed.relations.filter((r) => idByCode.has(r.predCode) && idByCode.has(r.succCode)).map((r) => ({ project_id: projectId, version_id: versionId, pred_id: idByCode.get(r.predCode)!, succ_id: idByCode.get(r.succCode)!, rel_type: r.type, lag_days: r.lag }))
    for (const part of chunk(relRows, 500)) {
      const r = await supabase.from('sch_relations').insert(part)
      if (r.error) { fail('ثبت روابط', r.error); await cleanup(); return { versionId: null, error: r.error.message } }
    }
    await supabase.from('sch_imports').insert({ project_id: projectId, version_id: versionId, file_name: req.fileName, file_hash: req.fileHash, format: parsed.format, row_count: parsed.activities.length, ok_count: parsed.activities.length, warn_count: cnt.warnings, error_count: 0, mapping: req.mapping, issues: issues.slice(0, 300) })
    await supabase.rpc('sch_log', { p_project: projectId, p_version: versionId, p_action: 'import', detail: { label: req.label, source: req.source, file: req.fileName, activities: actRows.length, relations: relRows.length, matched: inherited } })
    await get().load(projectId)
    return { versionId, counts: { activities: actRows.length, relations: relRows.length, matched: inherited, created: actRows.length - inherited } }
  },

  approve: async (versionId) => { const { error } = await supabase.rpc('sch_approve', { p_version: versionId }); if (fail('تأیید نسخه', error)) return false; await get().load(get().projectId!); return true },
  setBaseline: async (versionId) => { const { error } = await supabase.rpc('sch_set_baseline', { p_version: versionId }); if (fail('تعیین خط مبنا', error)) return false; await get().load(get().projectId!); return true },
  setCurrent: async (versionId) => { const { error } = await supabase.rpc('sch_set_current', { p_version: versionId }); if (fail('تعیین برنامهٔ جاری', error)) return false; await get().load(get().projectId!); return true },
  deleteDraft: async (versionId) => {
    const v = get().versions.find((x) => x.id === versionId); if (!v || v.status !== 'draft') return false
    const { error } = await supabase.from('sch_versions').delete().eq('id', versionId)
    if (fail('حذف پیش‌نویس', error)) return false
    const b = new Map(get().bundles); b.delete(versionId); set({ bundles: b }); await get().load(get().projectId!); return true
  },

  saveLink: async (l) => {
    const { error } = await supabase.from('sch_links').upsert({ project_id: l.projectId, activity_uid: l.activityUid, target_type: l.targetType, target_id: l.targetId, need_kind: l.needKind, need_date: l.needDate, note: l.note }, { onConflict: 'activity_uid,target_type,target_id' })
    if (fail('ثبت اتصال', error)) return false
    const r = await supabase.from('sch_links').select('*').eq('project_id', l.projectId)
    if (!r.error) set({ links: ((r.data ?? []) as unknown as Row[]).map(mapLink) })
    return true
  },
  removeLink: async (id) => { const { error } = await supabase.from('sch_links').delete().eq('id', id); if (fail('حذف اتصال', error)) return false; set({ links: get().links.filter((x) => x.id !== id) }); return true },
  saveDurationRisk: async (uid, min, likely, max) => {
    const projectId = get().projectId!
    const { error } = await supabase.from('sch_duration_risk').upsert({ project_id: projectId, activity_uid: uid, min_dur: min, likely_dur: likely, max_dur: max }, { onConflict: 'project_id,activity_uid' })
    if (fail('ثبت عدم‌قطعیت مدت', error)) return false
    set({ durationRisks: [...get().durationRisks.filter((d) => d.uid !== uid), { uid, min, likely, max }] }); return true
  },
  removeDurationRisk: async (uid) => { const { error } = await supabase.from('sch_duration_risk').delete().eq('project_id', get().projectId!).eq('activity_uid', uid); if (fail('حذف عدم‌قطعیت', error)) return false; set({ durationRisks: get().durationRisks.filter((d) => d.uid !== uid) }); return true },
  saveRiskEvent: async (e) => {
    const projectId = get().projectId!
    const row = { project_id: projectId, title: e.title, probability: e.probability, days_min: e.days.min, days_likely: e.days.likely, days_max: e.days.max, cost_min: e.cost.min, cost_likely: e.cost.likely, cost_max: e.cost.max, activity_uids: e.activityUids, active: e.active }
    const r = e.id ? await supabase.from('sch_risk_events').update(row).eq('id', e.id) : await supabase.from('sch_risk_events').insert(row)
    if (fail('ثبت رویداد ریسک', r.error)) return false
    const l = await supabase.from('sch_risk_events').select('*').eq('project_id', projectId)
    if (!l.error) set({ riskEvents: ((l.data ?? []) as unknown as Row[]).map((x): RiskEvent => ({ id: x.id, title: x.title, probability: Number(x.probability), days: { min: Number(x.days_min), likely: Number(x.days_likely), max: Number(x.days_max) }, cost: { min: Number(x.cost_min), likely: Number(x.cost_likely), max: Number(x.cost_max) }, activityUids: x.activity_uids ?? [], active: !!x.active })) })
    return true
  },
  removeRiskEvent: async (id) => { const { error } = await supabase.from('sch_risk_events').delete().eq('id', id); if (fail('حذف رویداد ریسک', error)) return false; set({ riskEvents: get().riskEvents.filter((x) => x.id !== id) }); return true },
  saveSimulation: async (versionId, seed, iterations, params, result) => {
    const projectId = get().projectId!
    const { error } = await supabase.from('sch_simulations').insert({ project_id: projectId, version_id: versionId, seed, iterations, params, result })
    if (fail('ثبت نتیجهٔ شبیه‌سازی', error)) return false
    const s = await supabase.from('sch_simulations').select('id, version_id, seed, iterations, params, result, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(10)
    if (!s.error) set({ simulations: ((s.data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, versionId: r.version_id, seed: r.seed, iterations: r.iterations, params: r.params ?? {}, result: r.result ?? {}, createdAt: r.created_at })) })
    return true
  },
}))

/** file fingerprint (SHA-256 of the bytes) used to warn about importing the same file twice */
export async function fileHash(buf: ArrayBuffer): Promise<string> {
  const h = await globalThis.crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
