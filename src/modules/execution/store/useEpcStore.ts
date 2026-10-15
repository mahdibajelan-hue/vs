import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { explainExecutionError } from '../lib/errors'
import type { CrewLogRow, DepRow, DocLinkRow, EngDocRow, FormProposalRow, LegalText, LookaheadRow, MeasurementRow, PrereqRow, ScheduleImportRow, VersionRow } from '../epcTypes'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (x: unknown) => Number(x ?? 0)
const nn = (x: unknown): number | null => (x == null || x === '' ? null : Number(x))
function fail(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${explainEpcError(error.message)}`)
  return true
}
/** Messages of the migration-010 guards, translated; anything else goes through the shared explainer. */
export function explainEpcError(msg: string): string {
  const m = msg.match(/measured_exceeds_approved|billed_exceeds_measured|paid_exceeds_billed|employer_step_off|supervision_not_approved|note_required|empty_text|self_approval|use_rpc/)
  const map: Record<string, string> = {
    measured_exceeds_approved: 'مجموع حجم اندازه‌گیری‌شده از مقدار تأییدشدهٔ این فعالیت بیشتر می‌شود.', billed_exceeds_measured: 'مقدار صورت‌وضعیت‌شده از حجم اندازه‌گیری‌شده بیشتر می‌شود.', paid_exceeds_billed: 'مقدار پرداخت‌شده از مقدار صورت‌وضعیت‌شده بیشتر می‌شود.',
    employer_step_off: 'مرحلهٔ کارفرما برای این پروژه فعال نیست (تنظیمات ← مرحلهٔ کارفرما).', supervision_not_approved: 'فقط ردیف‌هایی که نظارت تأیید کرده‌اند قابل بررسی کارفرما هستند.', note_required: 'برای رد یا بازگرداندن، علت کتبی لازم است.',
    empty_text: 'متن خالی است.', self_approval: 'پیشنهاددهنده نمی‌تواند پیشنهاد خودش را تأیید کند.', use_rpc: 'این مقدار فقط از مسیر مجاز قابل تغییر است.',
  }
  return m ? map[m[0]] : explainExecutionError({ message: msg })
}

const crewRow = (r: Row): CrewLogRow => ({ id: r.id, reportId: r.report_id, activityId: r.activity_id, crewName: r.crew_name ?? '', composition: r.composition ?? {}, usefulHours: n(r.useful_hours), idleHours: n(r.idle_hours), outputQty: n(r.output_qty), conditions: r.conditions ?? {}, note: r.note ?? '' })

interface State {
  /** false when migration 010 is not applied yet (the tables are missing) — the EPC pages then show an explanatory banner instead of failing */
  available: boolean; loaded: boolean
  crewLogs: CrewLogRow[]; engDocs: EngDocRow[]; docLinks: DocLinkRow[]; prereqs: PrereqRow[]; deps: DepRow[]; lookahead: LookaheadRow[]; measurements: MeasurementRow[]; versions: VersionRow[]; proposals: FormProposalRow[]; imports: ScheduleImportRow[]
  legalByProject: Map<string, LegalText>
  fetchAll: (projectIds?: string[]) => Promise<void>
  loadLegal: (projectId: string) => Promise<void>
  loadVersions: (reportId: string) => Promise<void>
  saveCrewLogs: (reportId: string, rows: Omit<CrewLogRow, 'id' | 'reportId'>[]) => Promise<boolean>
  saveEngDoc: (d: Partial<EngDocRow> & { projectId: string; docNo: string }) => Promise<boolean>
  saveDocLink: (l: Partial<DocLinkRow> & { projectId: string; docId: string; activityId: string }) => Promise<boolean>
  removeDocLink: (id: string) => Promise<boolean>
  raiseDoc: (a: { projectId: string; docId: string; target: 'issue' | 'risk'; title: string; description: string; severity: string; impactDays?: number | null; front?: string }) => Promise<{ id: string; existing: boolean } | null>
  savePrereq: (p: Partial<PrereqRow> & { projectId: string; activityId: string; title: string }) => Promise<boolean>
  removePrereq: (id: string) => Promise<boolean>
  saveLookahead: (l: Partial<LookaheadRow> & { projectId: string; weekStart: string; activityId: string }) => Promise<boolean>
  saveDeps: (projectId: string, deps: Omit<DepRow, 'id' | 'projectId'>[]) => Promise<boolean>
  applySchedule: (projectId: string, dates: { activityId: string; start: string | null; finish: string | null }[]) => Promise<number>
  logImport: (projectId: string, fileName: string, summary: Record<string, unknown>, issues: unknown[]) => Promise<void>
  saveMeasurement: (m: Partial<MeasurementRow> & { projectId: string; activityId: string; periodKey: string }) => Promise<boolean>
  employerReview: (reportId: string, decisions: { lineId: string; decision: 'approved' | 'rejected' | 'returned'; qty?: number; note?: string }[]) => Promise<boolean>
  setLegal: (projectId: string | null, body: string, status: 'draft' | 'legal_approved', note: string) => Promise<boolean>
  proposeForm: (p: { projectId: string; formKey: string; title: string; definition: Record<string, unknown>; reason: string }) => Promise<boolean>
  decideProposal: (id: string, approve: boolean, note: string) => Promise<boolean>
}

export const useEpcStore = create<State>((set, get) => ({
  available: true, loaded: false,
  crewLogs: [], engDocs: [], docLinks: [], prereqs: [], deps: [], lookahead: [], measurements: [], versions: [], proposals: [], imports: [], legalByProject: new Map(),

  fetchAll: async () => {
    const t = (name: string) => supabase.from(name).select('*')
    const [crew, docs, dlinks, pre, deps, look, meas, props, imps] = await Promise.all([t('ex_crew_logs'), t('ex_eng_docs').order('doc_no'), t('ex_doc_links'), t('ex_prereqs'), t('ex_activity_deps'), t('ex_lookahead').order('week_start'), t('ex_measurements'), t('ex_form_proposals'), t('ex_schedule_imports').order('imported_at', { ascending: false }).limit(50)])
    // a missing table (migration not applied) is not an error the user can act on screen by screen: remember it once
    if (crew.error && /does not exist|schema cache|relation/i.test(crew.error.message)) { set({ available: false, loaded: true }); return }
    const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] => (r.error ? [] : r.data ?? [])
    set({
      available: true, loaded: true,
      crewLogs: ok<Row>(crew).map(crewRow),
      engDocs: ok<Row>(docs).map((r): EngDocRow => ({ id: r.id, projectId: r.project_id, docNo: r.doc_no, title: r.title ?? '', discipline: r.discipline ?? '', rev: r.rev ?? '', contract: r.contract ?? '', preparer: r.preparer ?? '', approver: r.approver ?? '', weight: n(r.weight ?? 1), critical: !!r.critical, status: r.status, restrictionNote: r.restriction_note ?? '', dueDate: r.due_date, issuedDate: r.issued_date, plannedPrepared: r.planned_prepared, plannedApproved: r.planned_approved, actualPrepared: r.actual_prepared, actualApproved: r.actual_approved, note: r.note ?? '' })),
      docLinks: ok<Row>(dlinks).map((r): DocLinkRow => ({ id: r.id, projectId: r.project_id, docId: r.doc_id, activityId: r.activity_id, front: r.front ?? '', contract: r.contract ?? '', needKind: r.need_kind, needDate: r.need_date, minStatus: r.min_status, allowRestricted: !!r.allow_restricted, altActivityId: r.alt_activity_id, note: r.note ?? '' })),
      prereqs: ok<Row>(pre).map((r): PrereqRow => ({ id: r.id, projectId: r.project_id, activityId: r.activity_id, kind: r.kind, title: r.title ?? '', refType: r.ref_type ?? '', refId: r.ref_id, status: r.status, neededDate: r.needed_date, readyDate: r.ready_date, note: r.note ?? '' })),
      deps: ok<Row>(deps).map((r): DepRow => ({ id: r.id, projectId: r.project_id, predId: r.pred_id, succId: r.succ_id, type: r.dep_type, lag: n(r.lag_days) })),
      lookahead: ok<Row>(look).map((r): LookaheadRow => ({ id: r.id, projectId: r.project_id, weekStart: r.week_start, activityId: r.activity_id, front: r.front ?? '', responsible: r.responsible ?? '', plannedQty: n(r.planned_qty), resources: r.resources ?? {}, committed: !!r.committed, achievedQty: nn(r.achieved_qty), deviationCause: r.deviation_cause ?? '', recoveryPlan: r.recovery_plan ?? '', note: r.note ?? '' })),
      measurements: ok<Row>(meas).map((r): MeasurementRow => ({ id: r.id, projectId: r.project_id, activityId: r.activity_id, periodKey: r.period_key, measured: n(r.measured_qty), billed: n(r.billed_qty), paid: n(r.paid_qty), certificateId: r.certificate_id, note: r.note ?? '' })),
      proposals: ok<Row>(props).map((r): FormProposalRow => ({ id: r.id, projectId: r.project_id, formKey: r.form_key, title: r.title, definition: r.definition ?? {}, reason: r.reason ?? '', status: r.status, proposedBy: r.proposed_by, decidedBy: r.decided_by, decisionNote: r.decision_note ?? '' })),
      imports: ok<Row>(imps).map((r): ScheduleImportRow => ({ id: r.id, projectId: r.project_id, fileName: r.file_name ?? '', summary: r.summary ?? {}, importedAt: r.imported_at })),
    })
  },
  loadLegal: async (projectId) => {
    const { data, error } = await supabase.rpc('ex_legal_current', { p_project: projectId })
    if (error || !data?.length) return
    const r = data[0] as Row
    set({ legalByProject: new Map(get().legalByProject).set(projectId, { body: r.body, status: r.status, version: r.version, scope: r.scope }) })
  },
  loadVersions: async (reportId) => {
    const { data, error } = await supabase.from('ex_report_versions').select('*').eq('report_id', reportId).order('version')
    if (error) return
    const rows = (data as Row[]).map((r): VersionRow => ({ id: r.id, reportId: r.report_id, version: r.version, status: r.status, snapshot: r.snapshot ?? {}, actor: r.actor, at: r.at }))
    set({ versions: [...get().versions.filter((v) => v.reportId !== reportId), ...rows] })
  },

  saveCrewLogs: async (reportId, rows) => {
    const del = await supabase.from('ex_crew_logs').delete().eq('report_id', reportId)
    if (fail('ذخیرهٔ اکیپ‌ها', del.error)) return false
    if (rows.length) {
      const { error } = await supabase.from('ex_crew_logs').insert(rows.map((r) => ({ report_id: reportId, activity_id: r.activityId, crew_name: r.crewName, composition: r.composition, useful_hours: r.usefulHours, idle_hours: r.idleHours, output_qty: r.outputQty, conditions: r.conditions, note: r.note })))
      if (fail('ذخیرهٔ اکیپ‌ها', error)) return false
    }
    await get().fetchAll(); return true
  },
  saveEngDoc: async (d) => {
    const row = { project_id: d.projectId, doc_no: d.docNo, title: d.title ?? '', discipline: d.discipline ?? '', rev: d.rev ?? '', contract: d.contract ?? '', preparer: d.preparer ?? '', approver: d.approver ?? '', weight: d.weight ?? 1, critical: d.critical ?? false, status: d.status ?? 'required', restriction_note: d.restrictionNote ?? '', due_date: d.dueDate || null, issued_date: d.issuedDate || null, planned_prepared: d.plannedPrepared || null, planned_approved: d.plannedApproved || null, actual_prepared: d.actualPrepared || null, actual_approved: d.actualApproved || null, note: d.note ?? '' }
    const { error } = d.id ? await supabase.from('ex_eng_docs').update(row).eq('id', d.id) : await supabase.from('ex_eng_docs').insert(row)
    if (fail('ذخیرهٔ مدرک مهندسی', error)) return false
    await get().fetchAll(); return true
  },
  saveDocLink: async (l) => {
    const row = { project_id: l.projectId, doc_id: l.docId, activity_id: l.activityId, front: l.front ?? '', contract: l.contract ?? '', need_kind: l.needKind ?? 'start', need_date: l.needDate || null, min_status: l.minStatus ?? 'approved', allow_restricted: l.allowRestricted ?? false, alt_activity_id: l.altActivityId || null, note: l.note ?? '' }
    const { error } = await supabase.from('ex_doc_links').upsert(row, { onConflict: 'doc_id,activity_id' })
    if (fail('ذخیرهٔ ارتباط مدرک و فعالیت', error)) return false
    await get().fetchAll(); return true
  },
  removeDocLink: async (id) => {
    const { error } = await supabase.from('ex_doc_links').delete().eq('id', id)
    if (fail('حذف ارتباط', error)) return false
    await get().fetchAll(); return true
  },
  raiseDoc: async (a) => {
    const { data, error } = await supabase.rpc('ex_raise_doc', { p_project: a.projectId, p_doc: a.docId, p_target: a.target, p_title: a.title, p_description: a.description, p_severity: a.severity, p_extra: { impact_days: a.impactDays ?? null, front: a.front ?? '' } })
    if (error) { useSystemStore.getState().setStorageError(`خطا در ثبت ${a.target === 'issue' ? 'مسئله' : 'ریسک'}: ${error.message.includes('no_issue_mapping') || error.message.includes('no_risk_mapping') ? 'این پروژه هنوز به ماژول مربوط نگاشت نشده است.' : error.message}`); return null }
    return { id: String((data as Row).id), existing: !!(data as Row).existing }
  },
  savePrereq: async (p) => {
    const row = { project_id: p.projectId, activity_id: p.activityId, kind: p.kind ?? 'other', title: p.title, ref_type: p.refType ?? '', ref_id: p.refId ?? null, status: p.status ?? 'pending', needed_date: p.neededDate || null, ready_date: p.readyDate || null, note: p.note ?? '' }
    const { error } = p.id ? await supabase.from('ex_prereqs').update(row).eq('id', p.id) : await supabase.from('ex_prereqs').insert(row)
    if (fail('ذخیرهٔ پیش‌نیاز', error)) return false
    await get().fetchAll(); return true
  },
  removePrereq: async (id) => {
    const { error } = await supabase.from('ex_prereqs').delete().eq('id', id)
    if (fail('حذف پیش‌نیاز', error)) return false
    await get().fetchAll(); return true
  },
  saveLookahead: async (l) => {
    const row = { project_id: l.projectId, week_start: l.weekStart, activity_id: l.activityId, front: l.front ?? '', responsible: l.responsible ?? '', planned_qty: l.plannedQty ?? 0, resources: l.resources ?? {}, committed: l.committed ?? false, achieved_qty: l.achievedQty ?? null, deviation_cause: l.deviationCause ?? '', recovery_plan: l.recoveryPlan ?? '', note: l.note ?? '' }
    const { error } = await supabase.from('ex_lookahead').upsert(row, { onConflict: 'project_id,week_start,activity_id,front' })
    if (fail('ذخیرهٔ برنامهٔ سه‌هفته‌ای', error)) return false
    await get().fetchAll(); return true
  },
  saveDeps: async (projectId, deps) => {
    if (!deps.length) return true
    const { error } = await supabase.from('ex_activity_deps').upsert(deps.map((d) => ({ project_id: projectId, pred_id: d.predId, succ_id: d.succId, dep_type: d.type, lag_days: d.lag })), { onConflict: 'pred_id,succ_id' })
    if (fail('ذخیرهٔ وابستگی‌ها', error)) return false
    await get().fetchAll(); return true
  },
  applySchedule: async (projectId, dates) => {
    let done = 0
    for (const d of dates) {
      const patch: Record<string, string> = {}
      if (d.start) patch.planned_start = d.start
      if (d.finish) patch.planned_end = d.finish
      if (!Object.keys(patch).length) continue
      const { error } = await supabase.from('ex_activities').update(patch).eq('id', d.activityId).eq('project_id', projectId)
      if (fail('اعمال تاریخ‌های برنامه', error)) break
      done++
    }
    return done
  },
  logImport: async (projectId, fileName, summary, issues) => {
    await supabase.from('ex_schedule_imports').insert({ project_id: projectId, file_name: fileName, summary, issues })
    await get().fetchAll()
  },
  saveMeasurement: async (m) => {
    const row = { project_id: m.projectId, activity_id: m.activityId, period_key: m.periodKey, measured_qty: m.measured ?? 0, billed_qty: m.billed ?? 0, paid_qty: m.paid ?? 0, certificate_id: m.certificateId ?? null, note: m.note ?? '' }
    const { error } = await supabase.from('ex_measurements').upsert(row, { onConflict: 'project_id,activity_id,period_key' })
    if (fail('ذخیرهٔ حجم اندازه‌گیری/صورت‌وضعیت', error)) return false
    await get().fetchAll(); return true
  },
  employerReview: async (reportId, decisions) => {
    const { error } = await supabase.rpc('ex_report_employer_review', { p_id: reportId, p_decisions: decisions.map((d) => ({ line_id: d.lineId, decision: d.decision, qty: d.qty, note: d.note ?? '' })) })
    if (fail('ثبت نظر کارفرما', error)) return false
    return true
  },
  setLegal: async (projectId, body, status, note) => {
    const { error } = await supabase.rpc('ex_legal_set', { p_project: projectId, p_body: body, p_status: status, p_note: note })
    if (fail('ذخیرهٔ متن تحفظ', error)) return false
    if (projectId) await get().loadLegal(projectId)
    return true
  },
  proposeForm: async (p) => {
    const { error } = await supabase.from('ex_form_proposals').insert({ project_id: p.projectId, form_key: p.formKey, title: p.title, definition: p.definition, reason: p.reason })
    if (fail('ثبت فرم پیشنهادی', error)) return false
    await get().fetchAll(); return true
  },
  decideProposal: async (id, approve, note) => {
    const { error } = await supabase.rpc('ex_form_proposal_decide', { p_id: id, p_approve: approve, p_note: note })
    if (fail('تصمیم دربارهٔ فرم پیشنهادی', error)) return false
    await get().fetchAll(); return true
  },
}))
