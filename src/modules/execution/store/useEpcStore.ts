import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { explainExecutionError } from '../lib/errors'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { DEFAULT_ACTIONS, type ActionField, type ActionRule, type WorkAction } from '../lib/workActions'
import type { FormTemplateRow, ReportLinkRow, QcFindingRow, FormEntryRow, WeldRow, LineWeldRow, WeldConflictRow, WeldSuspectRow, WeldMergeRow, WeldHistoryRow, ArchiveRow, StatementRow0, StatementLine, NcrRow, NcrEventRow, NcrLinkRow, RequiredFormRow, MappingApprovalRow, NcrStatus, CrewLogRow, DepRow, DocLinkRow, EngDocRow, EngStatus, FormProposalRow, LegalText, LookaheadRow, MeasurementRow, PrereqRow, ScheduleImportRow, VersionRow } from '../epcTypes'

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
  templates: FormTemplateRow[]; reportLinks: ReportLinkRow[]; findings: QcFindingRow[]; entries: FormEntryRow[]
  welds: WeldRow[]; lineWelds: LineWeldRow[]; weldConflicts: WeldConflictRow[]; weldSuspects: WeldSuspectRow[]; weldMerges: WeldMergeRow[]
  ncrs: NcrRow[]; ncrEvents: NcrEventRow[]; ncrLinks: NcrLinkRow[]
  fetchAll: (projectIds?: string[]) => Promise<void>
  loadLegal: (projectId: string) => Promise<void>
  loadVersions: (reportId: string) => Promise<void>
  saveCrewLogs: (reportId: string, rows: Omit<CrewLogRow, 'id' | 'reportId'>[]) => Promise<boolean>
  saveTemplateDraft: (t: { formKey: string; title: string; layout: FormTemplateRow['layout']; bindings: FormTemplateRow['bindings'] }) => Promise<boolean>
  approveTemplate: (id: string, code: string, revision: string) => Promise<boolean>
  requiredForms: RequiredFormRow[]; mappingApprovals: MappingApprovalRow[]
  addRequiredForm: (projectId: string, activityId: string, formKey: string, note?: string) => Promise<boolean>
  removeRequiredForm: (id: string) => Promise<boolean>
  approveMapping: (templateId: string, note: string) => Promise<boolean>
  revokeMapping: (id: string) => Promise<boolean>
  saveFinding: (f: { projectId: string; techReportId?: string | null; kind: QcFindingRow['kind']; severity: QcFindingRow['severity']; weldRef: string; note: string }) => Promise<boolean>
  closeFinding: (id: string, reopen?: boolean) => Promise<boolean>
  syncWelds: (reportId: string) => Promise<void>
  weldHistory: WeldHistoryRow[]; archive: ArchiveRow[]
  workActions: (WorkAction & { projectId: string })[]; actionRules: (ActionRule & { projectId: string })[]
  saveAction: (projectId: string, a: { key: string; title: string; unit: string; group: string; fields: ActionField[]; sort?: number; active?: boolean; billable?: boolean }) => Promise<boolean>
  seedActions: (projectId: string) => Promise<boolean>
  statements: StatementRow0[]; statementLines: StatementLine[]
  createStatement: (projectId: string, from: string, to: string, rows: { activity_id: string; sys: number; unit_price: number; base_qty: number }[]) => Promise<string | null>
  refreshStatement: (id: string, rows: { activity_id: string; sys: number; unit_price: number; base_qty: number }[]) => Promise<boolean>
  setStatementCell: (rowId: string, col: 'req' | 'con' | 'prev_sys' | 'prev_req' | 'prev_con', value: number | null) => Promise<boolean>
  acceptRequests: (id: string) => Promise<number | null>
  finalizeStatement: (id: string) => Promise<boolean>
  reopenStatement: (id: string) => Promise<boolean>
  updateRule: (id: string, patch: { factor?: number; multFields?: string }) => Promise<boolean>
  saveRule: (projectId: string, r: { actionKey: string; activityId: string; factor: number; whenField?: string; whenValue?: string; note?: string; multFields?: string }) => Promise<boolean>
  removeRule: (id: string) => Promise<boolean>
  loadWeldHistory: (weldId: string) => Promise<void>
  weldSetAttr: (weldId: string, attr: string, value: string, note: string) => Promise<boolean>
  weldAbsorb: (reportId: string) => Promise<void>
  weldBackfill: (projectId: string) => Promise<number | null>
  archiveReport: (reportId: string, silent?: boolean) => Promise<boolean>
  loadSnapshot: (archiveId: string) => Promise<Record<string, unknown> | null>
  weldAction: (fn: 'ex_weld_merge' | 'ex_weld_unmerge' | 'ex_weld_set_status' | 'ex_weld_dismiss_suspect' | 'ex_weld_conflict_resolve', args: Record<string, unknown>) => Promise<boolean>
  ncrFromFinding: (findingId: string) => Promise<string | null>
  ncrTransition: (ncrId: string, to: NcrStatus, note: string, disposition?: string) => Promise<boolean>
  ncrAssign: (ncrId: string, owner: string | null, due: string | null) => Promise<boolean>
  ncrLink: (ncrId: string, target: 'issue' | 'risk') => Promise<{ status: string; error?: string } | null>
  saveEntry: (e: { id?: string; projectId: string; templateId: string; entryDate: string; header: string[]; rows: string[][] }) => Promise<boolean>
  deleteEntry: (id: string) => Promise<boolean>
  stampTemplate: (reportId: string, templateId: string) => Promise<boolean>
  linkReport: (projectId: string, lineId: string, techReportId: string) => Promise<boolean>
  unlinkReport: (id: string) => Promise<boolean>
  saveEngDoc: (d: Partial<EngDocRow> & { projectId: string; docNo: string }) => Promise<boolean>
  saveEngDocsBulk: (rows: (Partial<EngDocRow> & { projectId: string; docNo: string })[]) => Promise<number>
  transitionDoc: (docId: string, to: EngStatus, note?: string) => Promise<boolean>
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
  crewLogs: [], engDocs: [], docLinks: [], prereqs: [], deps: [], lookahead: [], measurements: [], versions: [], proposals: [], imports: [], legalByProject: new Map(), templates: [], weldHistory: [], archive: [], workActions: [], actionRules: [], statements: [], statementLines: [], requiredForms: [], mappingApprovals: [], reportLinks: [], findings: [], entries: [], welds: [], lineWelds: [], weldConflicts: [], weldSuspects: [], weldMerges: [], ncrs: [], ncrEvents: [], ncrLinks: [],

  fetchAll: async () => {
    // library of approved sheets and links to work-report lines (tables of migration 015; a missing table is not an error)
    const [tpl, lnk] = await Promise.all([supabase.from('ex_form_templates').select('*').order('form_key').order('version', { ascending: false }), supabase.from('ex_report_links').select('*')])
    if (!tpl.error) set({ templates: ((tpl.data ?? []) as Row[]).map((r): FormTemplateRow => ({ id: r.id, formKey: r.form_key, version: r.version, title: r.title ?? '', code: r.code ?? '', revision: r.revision ?? '', status: r.status, layout: r.layout, bindings: r.bindings ?? [], sourceFile: r.source_file ?? '', sourceSha256: r.source_sha256 ?? '', approvedAt: r.approved_at })) })
    if (!lnk.error) set({ reportLinks: ((lnk.data ?? []) as Row[]).map((r): ReportLinkRow => ({ id: r.id, projectId: r.project_id, lineId: r.line_id, techReportId: r.tech_report_id })) })
    const [rq, ma] = await Promise.all([supabase.from('ex_required_forms').select('*'), supabase.from('ex_form_mapping_approvals').select('*')])
    if (!rq.error) set({ requiredForms: ((rq.data ?? []) as Row[]).map((r): RequiredFormRow => ({ id: r.id, projectId: r.project_id, activityId: r.activity_id, formKey: r.form_key, note: r.note ?? '' })) })
    if (!ma.error) set({ mappingApprovals: ((ma.data ?? []) as Row[]).map((r): MappingApprovalRow => ({ id: r.id, templateId: r.template_id, approvedAt: r.approved_at, note: r.note ?? '', revokedAt: r.revoked_at })) })
    const fnd = await supabase.from('ex_qc_findings').select('*').order('created_at', { ascending: false })
    if (!fnd.error) set({ findings: ((fnd.data ?? []) as Row[]).map((r): QcFindingRow => ({ id: r.id, projectId: r.project_id, techReportId: r.tech_report_id, lineId: r.line_id, kind: r.kind, severity: r.severity, status: r.status, weldRef: r.weld_ref ?? '', note: r.note ?? '', createdAt: r.created_at, closedAt: r.closed_at })) })
    const [wl, lw, wc, ws, wm, nc, ne, nl] = await Promise.all([supabase.from('ex_welds').select('*'), supabase.from('ex_line_welds').select('line_id, weld_id, project_id, raw_pipe'), supabase.from('ex_weld_conflicts').select('*').eq('status', 'open'), supabase.from('ex_weld_suspects').select('*'), supabase.from('ex_weld_merges').select('*').is('undone_at', null), supabase.from('ex_ncr').select('*').order('seq', { ascending: false }), supabase.from('ex_ncr_events').select('*').order('at'), supabase.from('ex_ncr_links').select('*')])
    if (!wl.error) set({ welds: ((wl.data ?? []) as Row[]).map((r): WeldRow => ({ id: r.id, projectId: r.project_id, sectionKey: r.section_key, weldKey: r.weld_key, sectionRaw: r.section_raw, weldRaw: r.weld_raw, pipeNo: r.pipe_no, status: r.status, mergedInto: r.merged_into, central: Object.fromEntries(([['pipe', r.c_pipe], ['size', r.c_size], ['thk', r.c_thk], ['length', r.c_length], ['bend', r.c_bend]] as [string, string | null][]).filter(([, v]) => v != null && v !== '')) })) })
    if (!lw.error) set({ lineWelds: ((lw.data ?? []) as Row[]).map((r): LineWeldRow => ({ lineId: r.line_id, weldId: r.weld_id, projectId: r.project_id, rawPipe: r.raw_pipe })) })
    if (!wc.error) set({ weldConflicts: ((wc.data ?? []) as Row[]).map((r): WeldConflictRow => ({ id: r.id, projectId: r.project_id, weldId: r.weld_id, kind: r.kind, detail: r.detail, status: r.status })) })
    if (!ws.error) set({ weldSuspects: ((ws.data ?? []) as Row[]).map((r): WeldSuspectRow => ({ projectId: r.project_id, n2: r.n2, weldIds: r.weld_ids, raws: r.raws })) })
    if (!wm.error) set({ weldMerges: ((wm.data ?? []) as Row[]).map((r): WeldMergeRow => ({ id: r.id, projectId: r.project_id, fromWeld: r.from_weld, intoWeld: r.into_weld, reason: r.reason, undoneAt: r.undone_at })) })
    if (!nc.error) set({ ncrs: ((nc.data ?? []) as Row[]).map((r): NcrRow => ({ id: r.id, projectId: r.project_id, code: r.code, findingId: r.finding_id, weldId: r.weld_id, weldRef: r.weld_ref ?? '', techReportId: r.tech_report_id, kind: r.kind, severity: r.severity, description: r.description ?? '', disposition: r.disposition, status: r.status, ownerId: r.owner_id, dueDate: r.due_date, rcaRequired: !!r.rca_required, createdAt: r.created_at, closedAt: r.closed_at })) })
    if (!ne.error) set({ ncrEvents: ((ne.data ?? []) as Row[]).map((r): NcrEventRow => ({ id: r.id, ncrId: r.ncr_id, at: r.at, by: r.by, kind: r.kind, fromStatus: r.from_status, toStatus: r.to_status, note: r.note ?? '' })) })
    if (!nl.error) set({ ncrLinks: ((nl.data ?? []) as Row[]).map((r): NcrLinkRow => ({ id: r.id, ncrId: r.ncr_id, targetType: r.target_type, targetId: r.target_id, status: r.status, error: r.error ?? '' })) })
    const arc = await supabase.from('ex_report_archive').select('id, project_id, report_id, version, form_key, form_title, category, report_no, report_date, status, note, created_at').order('report_date', { ascending: false }).limit(2000)
    if (!arc.error) set({ archive: ((arc.data ?? []) as Row[]).map((r): ArchiveRow => ({ id: r.id, projectId: r.project_id, reportId: r.report_id, version: r.version, formKey: r.form_key, formTitle: r.form_title ?? '', category: r.category ?? '', reportNo: r.report_no ?? '', reportDate: r.report_date, status: r.status, note: r.note ?? '', createdAt: r.created_at })) })
    const [wa, ar] = await Promise.all([supabase.from('ex_work_actions').select('*').order('sort'), supabase.from('ex_action_map').select('*')])
    if (!wa.error) set({ workActions: ((wa.data ?? []) as Row[]).map((r) => ({ id: r.id, projectId: r.project_id, key: r.key, title: r.title, unit: r.unit ?? '', group: r.group_label ?? '', fields: (r.fields ?? []) as ActionField[], sort: r.sort ?? 0, active: !!r.active, billable: r.billable !== false })) })
    if (!ar.error) set({ actionRules: ((ar.data ?? []) as Row[]).map((r) => ({ id: r.id, projectId: r.project_id, actionKey: r.action_key, activityId: r.activity_id, factor: Number(r.factor) || 1, whenField: r.when_field ?? '', whenValue: r.when_value ?? '', note: r.note ?? '', multFields: r.mult_fields ?? '' })) })
    const [sts, stl] = await Promise.all([supabase.from('ex_statements').select('*').order('no'), supabase.from('ex_statement_rows').select('*')])
    if (!sts.error) set({ statements: ((sts.data ?? []) as Row[]).map((r): StatementRow0 => ({ id: r.id, projectId: r.project_id, no: r.no, periodFrom: r.period_from, periodTo: r.period_to, status: r.status, note: r.note ?? '', finalizedAt: r.finalized_at })) })
    if (!stl.error) set({ statementLines: ((stl.data ?? []) as Row[]).map((r): StatementLine => ({ id: r.id, statementId: r.statement_id, activityId: r.activity_id, unitPrice: Number(r.unit_price) || 0, baseQty: Number(r.base_qty) || 0, sys: Number(r.sys_cum) || 0, req: r.req_cum == null ? null : Number(r.req_cum), con: r.con_cum == null ? null : Number(r.con_cum), reqEdited: !!r.req_edited, prevSys: Number(r.prev_sys) || 0, prevReq: Number(r.prev_req) || 0, prevCon: Number(r.prev_con) || 0 })) })
    const ent = await supabase.from('ex_form_entries').select('*').order('created_at', { ascending: false })
    if (!ent.error) set({ entries: ((ent.data ?? []) as Row[]).map((r): FormEntryRow => ({ id: r.id, projectId: r.project_id, templateId: r.template_id, entryDate: r.entry_date, header: r.header ?? [], rows: r.rows ?? [], createdAt: r.created_at })) })
    const t = (name: string) => supabase.from(name).select('*')
    const [crew, docs, dlinks, pre, deps, look, meas, props, imps] = await Promise.all([t('ex_crew_logs'), t('ex_eng_docs').order('doc_no'), t('ex_doc_links'), t('ex_prereqs'), t('ex_activity_deps'), t('ex_lookahead').order('week_start'), t('ex_measurements'), t('ex_form_proposals'), t('ex_schedule_imports').order('imported_at', { ascending: false }).limit(50)])
    // a missing table (migration not applied) is not an error the user can act on screen by screen: remember it once
    if (crew.error && /does not exist|schema cache|relation/i.test(crew.error.message)) { set({ available: false, loaded: true }); return }
    const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] => (r.error ? [] : r.data ?? [])
    set({
      available: true, loaded: true,
      crewLogs: ok<Row>(crew).map(crewRow),
      engDocs: ok<Row>(docs).map((r): EngDocRow => ({ id: r.id, projectId: r.project_id, docNo: r.doc_no, title: r.title ?? '', discipline: r.discipline ?? '', rev: r.rev ?? '', contract: r.contract ?? '', preparer: r.preparer ?? '', approver: r.approver ?? '', weight: n(r.weight ?? 1), critical: !!r.critical, status: r.status, restrictionNote: r.restriction_note ?? '', dueDate: r.due_date, issuedDate: r.issued_date, plannedPrepared: r.planned_prepared, plannedApproved: r.planned_approved, actualPrepared: r.actual_prepared, actualApproved: r.actual_approved, note: r.note ?? '', category: r.category ?? '', phase: r.phase ?? '', targetIssue: r.target_issue ?? '', price: n(r.price ?? 0) })),
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
  saveTemplateDraft: async (t) => {
    const ver = Math.max(0, ...get().templates.filter((x) => x.formKey === t.formKey).map((x) => x.version)) + 1
    const { error } = await supabase.from('ex_form_templates').insert({ form_key: t.formKey, version: ver, title: t.title, layout: t.layout, bindings: t.bindings, source_file: t.layout.source.file, source_sha256: t.layout.source.sha256, status: 'draft' })
    if (fail('ثبت الگوی فرم', error)) return false
    await get().fetchAll(); return true
  },
  approveTemplate: async (id, code, revision) => {
    const { error } = await supabase.rpc('ex_form_template_approve', { p_id: id, p_code: code, p_revision: revision })
    if (fail('تأیید الگوی فرم', error)) return false
    await get().fetchAll(); return true
  },
  addRequiredForm: async (projectId, activityId, formKey, note = '') => {
    const { error } = await supabase.from('ex_required_forms').insert({ project_id: projectId, activity_id: activityId, form_key: formKey, note })
    if (error?.code === '23505') return true // already required: nothing to do
    if (fail('ثبت فرم لازم فعالیت', error)) return false
    await get().fetchAll(); return true
  },
  removeRequiredForm: async (id) => {
    const { error } = await supabase.from('ex_required_forms').delete().eq('id', id)
    if (fail('حذف فرم لازم فعالیت', error)) return false
    await get().fetchAll(); return true
  },
  approveMapping: async (templateId, note) => {
    const { error } = await supabase.from('ex_form_mapping_approvals').insert({ template_id: templateId, note })
    if (error?.code === '23505') return true
    if (fail('تأیید نگاشت سلول‌ها', error)) return false
    await get().fetchAll(); return true
  },
  revokeMapping: async (id) => {
    const { error } = await supabase.from('ex_form_mapping_approvals').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (fail('ابطال تأیید نگاشت', error)) return false
    await get().fetchAll(); return true
  },
  saveFinding: async (f) => {
    const { error } = await supabase.from('ex_qc_findings').insert({ project_id: f.projectId, tech_report_id: f.techReportId ?? null, kind: f.kind, severity: f.severity, weld_ref: f.weldRef, note: f.note })
    if (error?.code === '23505') { window.alert('این مغایرت برای همین گزارش و سرجوش قبلاً ثبت شده و هنوز باز است.'); return false }
    if (fail('ثبت مغایرت کنترل کیفیت', error)) return false
    await get().fetchAll(); return true
  },
  closeFinding: async (id, reopen) => {
    const { error } = await supabase.from('ex_qc_findings').update({ status: reopen ? 'open' : 'closed', closed_at: reopen ? null : new Date().toISOString() }).eq('id', id)
    if (fail('بستن مغایرت', error)) return false
    await get().fetchAll(); return true
  },
  syncWelds: async (reportId) => {
    const { error } = await supabase.rpc('ex_weld_sync', { p_report: reportId })
    if (!error) await get().fetchAll() // a missing function/table is not an error the user can act on
  },
  saveAction: async (projectId, a) => {
    const { error } = await supabase.from('ex_work_actions').upsert({ project_id: projectId, key: a.key, title: a.title, unit: a.unit, group_label: a.group, fields: a.fields, sort: a.sort ?? 0, active: a.active ?? true, billable: a.billable ?? true }, { onConflict: 'project_id,key' })
    if (fail('ذخیرهٔ اقدام کارگاهی', error)) return false
    await get().fetchAll(); return true
  },
  seedActions: async (projectId) => {
    const have = new Set(get().workActions.filter((x) => x.projectId === projectId).map((x) => x.key))
    const rows = DEFAULT_ACTIONS.filter((a) => !have.has(a.key)).map((a) => ({ project_id: projectId, key: a.key, title: a.title, unit: a.unit, group_label: a.group, fields: a.fields, sort: a.sort, active: true, billable: a.billable !== false }))
    if (!rows.length) return true
    const { error } = await supabase.from('ex_work_actions').insert(rows)
    if (fail('افزودن اقدام‌های پیش‌فرض', error)) return false
    await get().fetchAll(); return true
  },
  createStatement: async (projectId, from, to, rows) => {
    const { data, error } = await supabase.rpc('ex_statement_create', { p_project: projectId, p_from: from, p_to: to, p_rows: rows })
    if (error) { const m = error.message; window.alert(/draft_exists/.test(m) ? 'یک صورت‌وضعیت پیش‌نویس باز است؛ ابتدا آن را نهایی کنید.' : /exists/.test(m) ? 'برای این دوره قبلاً صورت‌وضعیت ساخته شده است.' : /not_allowed/.test(m) ? 'دسترسی ساخت صورت‌وضعیت را ندارید.' : `ساخت صورت‌وضعیت ممکن نشد: ${m}`); return null }
    await get().fetchAll(); return data as string
  },
  refreshStatement: async (id, rows) => {
    const { error } = await supabase.rpc('ex_statement_refresh', { p_stmt: id, p_rows: rows })
    if (fail('به‌روزرسانی مقادیر سیستمی', error)) return false
    await get().fetchAll(); return true
  },
  setStatementCell: async (rowId, col, value) => {
    const { error } = await supabase.rpc('ex_statement_set', { p_row: rowId, p_col: col, p_value: value })
    if (error) { window.alert(/locked/.test(error.message) ? 'صورت‌وضعیت نهایی شده و قابل تغییر نیست.' : /not_allowed/.test(error.message) ? 'این ستون را فقط نقش مربوط (پیمانکار برای درخواست، مشاور برای نظر) می‌تواند ثبت کند.' : /not_first/.test(error.message) ? 'مقادیر قبلی فقط در اولین صورت‌وضعیت قابل ورود است.' : `ثبت نشد: ${error.message}`); return false }
    await get().fetchAll(); return true
  },
  acceptRequests: async (id) => {
    const { data, error } = await supabase.rpc('ex_statement_accept', { p_stmt: id })
    if (fail('پذیرش مقادیر درخواستی', error)) return null
    await get().fetchAll(); return Number(data ?? 0)
  },
  finalizeStatement: async (id) => {
    const { error } = await supabase.rpc('ex_statement_finalize', { p_stmt: id })
    if (fail('نهایی‌کردن صورت‌وضعیت', error)) return false
    await get().fetchAll(); return true
  },
  reopenStatement: async (id) => {
    const { error } = await supabase.rpc('ex_statement_reopen', { p_stmt: id })
    if (fail('بازگشایی صورت‌وضعیت', error)) return false
    await get().fetchAll(); return true
  },
  updateRule: async (id, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.factor !== undefined) row.factor = patch.factor
    if (patch.multFields !== undefined) row.mult_fields = patch.multFields
    const { error } = await supabase.from('ex_action_map').update(row).eq('id', id)
    if (fail('ویرایش تطبیق', error)) return false
    await get().fetchAll(); return true
  },
  saveRule: async (projectId, r) => {
    const { error } = await supabase.from('ex_action_map').insert({ project_id: projectId, action_key: r.actionKey, activity_id: r.activityId, factor: r.factor, when_field: r.whenField ?? '', when_value: r.whenValue ?? '', note: r.note ?? '', mult_fields: r.multFields ?? '' })
    if (error?.code === '23505') { window.alert('این تطبیق قبلاً ثبت شده است.'); return false }
    if (fail('ثبت تطبیق اقدام با فهرست‌بها', error)) return false
    await get().fetchAll(); return true
  },
  removeRule: async (id) => {
    const { error } = await supabase.from('ex_action_map').delete().eq('id', id)
    if (fail('حذف تطبیق', error)) return false
    await get().fetchAll(); return true
  },
  loadWeldHistory: async (weldId) => {
    const { data, error } = await supabase.from('ex_weld_attr_history').select('*').eq('weld_id', weldId).order('at', { ascending: false }).limit(100)
    if (error) return
    set({ weldHistory: [...get().weldHistory.filter((h) => h.weldId !== weldId), ...((data ?? []) as Row[]).map((r): WeldHistoryRow => ({ id: r.id, weldId: r.weld_id, attr: r.attr, oldValue: r.old_value, newValue: r.new_value, source: r.source, note: r.note ?? '', at: r.at }))] })
  },
  weldSetAttr: async (weldId, attr, value, note) => {
    const { error } = await supabase.rpc('ex_weld_set_attr', { p_weld: weldId, p_attr: attr, p_value: value, p_source: 'manual', p_note: note })
    if (fail('ثبت مشخصات سرجوش', error)) return false
    await get().fetchAll(); await get().loadWeldHistory(weldId); return true
  },
  weldAbsorb: async (reportId) => {
    const { error } = await supabase.rpc('ex_weld_absorb', { p_report: reportId })
    if (!error) await get().fetchAll()
  },
  weldBackfill: async (projectId) => {
    const { data, error } = await supabase.rpc('ex_weld_central_backfill', { p_project: projectId })
    if (fail('تکمیل جدول مرکزی از فرم‌های ثبت‌شده', error)) return null
    await get().fetchAll(); return Number((data as { filled?: number } | null)?.filled ?? 0)
  },
  archiveReport: async (reportId, silent) => {
    const { data: rep } = await supabase.from('ex_reports').select('form_key').eq('id', reportId).single()
    const fk = String((rep as Row | null)?.form_key ?? ''), form = FORM_BY_KEY[fk]
    const { error } = await supabase.rpc('ex_archive_report', { p_report: reportId, p_category: form?.group ?? 'other', p_title: form?.title ?? fk, p_note: '' })
    if (error) { if (!silent) fail('بایگانی گزارش', error); return false }
    await get().fetchAll(); return true
  },
  loadSnapshot: async (archiveId) => {
    const { data, error } = await supabase.from('ex_report_archive').select('snapshot').eq('id', archiveId).single()
    return error ? null : ((data as Row).snapshot as Record<string, unknown>)
  },
  weldAction: async (fn, args) => {
    const { error } = await supabase.rpc(fn, args)
    if (fail('عملیات سرجوش', error)) return false
    await get().fetchAll(); return true
  },
  ncrFromFinding: async (findingId) => {
    const { data, error } = await supabase.rpc('ex_ncr_from_finding', { p_finding: findingId })
    if (fail('ثبت عدم انطباق (NCR)', error)) return null
    await get().fetchAll(); return data as string
  },
  ncrTransition: async (ncrId, to, note, disposition) => {
    const { error } = await supabase.rpc('ex_ncr_transition', { p_ncr: ncrId, p_to: to, p_note: note, p_disposition: disposition ?? null })
    if (fail('تغییر وضعیت NCR', error)) return false
    await get().fetchAll(); return true
  },
  ncrAssign: async (ncrId, owner, due) => {
    const { error } = await supabase.rpc('ex_ncr_assign', { p_ncr: ncrId, p_owner: owner, p_due: due })
    if (fail('تعیین مسئول NCR', error)) return false
    await get().fetchAll(); return true
  },
  ncrLink: async (ncrId, target) => {
    const { data, error } = await supabase.rpc('ex_ncr_link', { p_ncr: ncrId, p_target: target })
    if (fail('اتصال NCR', error)) return null
    await get().fetchAll(); return data as { status: string; error?: string }
  },
  saveEntry: async (e) => {
    const row = { project_id: e.projectId, template_id: e.templateId, entry_date: e.entryDate, header: e.header, rows: e.rows }
    const { error } = e.id ? await supabase.from('ex_form_entries').update(row).eq('id', e.id) : await supabase.from('ex_form_entries').insert(row)
    if (fail('ذخیرهٔ فرم', error)) return false
    await get().fetchAll(); return true
  },
  deleteEntry: async (id) => {
    const { error } = await supabase.from('ex_form_entries').delete().eq('id', id)
    if (fail('حذف فرم', error)) return false
    await get().fetchAll(); return true
  },
  stampTemplate: async (reportId, templateId) => {
    const { error } = await supabase.from('ex_reports').update({ template_id: templateId }).eq('id', reportId)
    return !fail('ثبت نسخهٔ قالب گزارش', error)
  },
  linkReport: async (projectId, lineId, techReportId) => {
    const { error } = await supabase.from('ex_report_links').upsert({ project_id: projectId, line_id: lineId, tech_report_id: techReportId }, { onConflict: 'line_id,tech_report_id' })
    if (fail('اتصال فرم فنی به ردیف گزارش', error)) return false
    await get().fetchAll(); return true
  },
  unlinkReport: async (id) => {
    const { error } = await supabase.from('ex_report_links').delete().eq('id', id)
    if (fail('حذف اتصال', error)) return false
    await get().fetchAll(); return true
  },
  saveEngDoc: async (d) => {
    const row = { project_id: d.projectId, doc_no: d.docNo, title: d.title ?? '', discipline: d.discipline ?? '', rev: d.rev ?? '', contract: d.contract ?? '', preparer: d.preparer ?? '', approver: d.approver ?? '', weight: d.weight ?? 1, critical: d.critical ?? false, status: d.status ?? 'required', restriction_note: d.restrictionNote ?? '', due_date: d.dueDate || null, issued_date: d.issuedDate || null, planned_prepared: d.plannedPrepared || null, planned_approved: d.plannedApproved || null, actual_prepared: d.actualPrepared || null, actual_approved: d.actualApproved || null, note: d.note ?? '', category: d.category ?? '', phase: d.phase ?? '', target_issue: d.targetIssue ?? '', price: d.price ?? 0 }
    const { error } = d.id ? await supabase.from('ex_eng_docs').update(row).eq('id', d.id) : await supabase.from('ex_eng_docs').insert(row)
    if (fail('ذخیرهٔ مدرک مهندسی', error)) return false
    await get().fetchAll(); return true
  },
  saveEngDocsBulk: async (rows) => {
    const mapRow = (d: (typeof rows)[number]) => ({ project_id: d.projectId, doc_no: d.docNo, rev: d.rev ?? '0', title: d.title ?? '', discipline: d.discipline ?? '', category: d.category ?? '', phase: d.phase ?? '', target_issue: d.targetIssue ?? '', price: d.price ?? 0, weight: d.weight ?? 1,
      ...(d.contract != null ? { contract: d.contract } : {}), ...(d.preparer != null ? { preparer: d.preparer } : {}), ...(d.approver != null ? { approver: d.approver } : {}), ...(d.status ? { status: d.status } : {}), ...(d.critical != null ? { critical: d.critical } : {}),
      ...(d.plannedPrepared ? { planned_prepared: d.plannedPrepared } : {}), ...(d.plannedApproved ? { planned_approved: d.plannedApproved } : {}) })
    let ok = 0
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100).map(mapRow)
      const { error } = await supabase.from('ex_eng_docs').upsert(chunk, { onConflict: 'project_id,doc_no,rev' })
      if (fail('ورود مدارک مهندسی', error)) break
      ok += chunk.length
    }
    await get().fetchAll(); return ok
  },
  transitionDoc: async (docId, to, note = '') => {
    const { error } = await supabase.rpc('ex_doc_transition', { p_doc: docId, p_to: to, p_note: note })
    if (fail('تغییر وضعیت مدرک', error)) return false
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
