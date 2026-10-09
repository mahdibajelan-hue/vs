import type { AuthorityLimit, ChangeException, ChangeHistory, ChangeLink, ChangeRequest, ChangeStep, ChangeStatus, ChangeType, Priority, Route, RouteStep, Rule, RuleAudit, RuleSet, StepKind, StepStatus } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v))
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

export interface ProjectInfo { id: string; name: string; code: string; contractNumber: string; contractType: string | null; contractValue: number; currency: string; start: string | null; end: string | null; revisedEnd: string | null; programId: string | null; portfolioId: string | null; contractorOrgId: string | null }
export interface ContractInfo { id: string; masterProjectId: string; number: string; title: string; value: number; currency: string; contractorOrgId: string | null; start: string | null; end: string | null; role: string | null }

export const projectFromRow = (r: Row): ProjectInfo => ({ id: r.id, name: r.short_name || r.official_name, code: r.project_code || r.project_id_code || '', contractNumber: r.contract_number ?? '', contractType: r.contract_type ?? null, contractValue: num(r.contract_value), currency: r.currency || 'IRR',
  start: r.contract_start_date ?? null, end: r.contractual_completion_date ?? null, revisedEnd: r.revised_completion_date ?? null, programId: r.program_id ?? null, portfolioId: r.portfolio_id ?? null, contractorOrgId: r.contractor_org_id ?? null })
export const contractFromRow = (r: Row): ContractInfo => ({ id: r.id, masterProjectId: r.master_project_id, number: r.contract_number ?? '', title: r.title ?? '', value: num(r.contract_value), currency: r.currency || 'IRR', contractorOrgId: r.contractor_org_id ?? null, start: r.start_date ?? null, end: r.planned_completion_date ?? null, role: r.contract_role ?? null })

export function requestFromRow(r: Row): ChangeRequest {
  return {
    id: r.id, masterProjectId: r.master_project_id, crNumber: r.cr_number, title: r.title ?? '', description: r.description ?? '', reason: r.reason_for_change ?? '', priority: (r.priority || 'medium') as Priority, status: r.status as ChangeStatus, changeType: (r.change_type ?? null) as ChangeType | null,
    currency: r.currency || 'IRR', contractId: r.contract_id ?? null, contractorOrgId: r.contractor_org_id ?? null, orgUnit: r.org_unit ?? '', contractNumber: r.contract_number ?? '', contractName: r.contract_name ?? '',
    originalContractAmount: num(r.original_contract_amount), originalDurationDays: num(r.original_duration_days), proposedCost: num(r.proposed_change_amount), proposedDays: num(r.proposed_schedule_impact_days), approvedCost: numN(r.approved_change_amount), approvedDays: numN(r.approved_schedule_impact_days),
    ruleSetId: r.rule_set_id ?? null, routeStatus: r.route_status ?? 'none', routeSnapshot: r.route_snapshot ?? null, routeBlockers: r.route_blockers ?? [], baseAmount: numN(r.base_amount), cumPrevAmount: numN(r.cum_prev_amount), cumPrevDays: numN(r.cum_prev_days),
    evaluationNote: r.evaluation_note ?? '', impactQuality: r.impact_quality ?? '', impactSafety: r.impact_safety ?? '', evaluationCompletedAt: r.evaluation_completed_at ?? null, approvedAt: r.approved_at ?? null, decisionNote: r.decision_note ?? '', cancelReason: r.cancel_reason ?? '',
    implementationOwnerId: r.implementation_owner_id ?? null, implementationDue: r.implementation_due ?? null, implementationStartedAt: r.implementation_started_at ?? null, resultNote: r.result_note ?? '', resultRecordedAt: r.result_recorded_at ?? null, closedAt: r.closed_at ?? null,
    implementedAsApproved: r.implemented_as_approved ?? null, actualCost: numN(r.actual_cost_amount), actualDelayDays: numN(r.actual_delay_days), documentsUpdated: r.documents_updated ?? null, executedUnderException: !!r.executed_under_exception, attempt: r.attempt ?? 1, stageEnteredAt: r.stage_entered_at ?? r.updated_at,
    requesterName: r.requester_name ?? '', requesterOrganization: r.requester_organization ?? null, projectPhase: r.project_phase ?? null, currentSituation: r.current_situation_description ?? '', reasonCategories: r.change_reason_categories ?? [], affectedDocuments: r.affected_documents ?? [], scopeEffect: r.scope_effect_description ?? '',
    submittedBy: r.submitted_by ?? null, submittedAt: r.submitted_at ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** Only fields a user may write while the request is a draft / returned (the server refuses the rest). */
export function requestToRow(d: Partial<ChangeRequest>): Row {
  const m: Record<string, string> = {
    masterProjectId: 'master_project_id', title: 'title', description: 'description', reason: 'reason_for_change', priority: 'priority', changeType: 'change_type', currency: 'currency', contractId: 'contract_id', contractorOrgId: 'contractor_org_id', orgUnit: 'org_unit',
    contractNumber: 'contract_number', contractName: 'contract_name', originalContractAmount: 'original_contract_amount', originalDurationDays: 'original_duration_days', proposedCost: 'proposed_change_amount', proposedDays: 'proposed_schedule_impact_days',
    evaluationNote: 'evaluation_note', impactQuality: 'impact_quality', impactSafety: 'impact_safety', requesterName: 'requester_name', requesterOrganization: 'requester_organization', projectPhase: 'project_phase', currentSituation: 'current_situation_description',
    reasonCategories: 'change_reason_categories', affectedDocuments: 'affected_documents', scopeEffect: 'scope_effect_description',
  }
  const row: Row = {}
  for (const k of Object.keys(d) as (keyof ChangeRequest)[]) if (m[k as string] && d[k] !== undefined) row[m[k as string]] = d[k]
  return row
}

export const stepFromRow = (r: Row): ChangeStep => ({ id: r.id, requestId: r.request_id, attempt: r.attempt, seq: r.seq, groupNo: r.group_no ?? null, kind: r.kind as StepKind, roleName: r.role_name, label: r.label ?? '', routeCode: r.route_code ?? '', ruleCodes: r.rule_codes ?? [], status: r.status as StepStatus,
  opinion: r.opinion ?? '', referenceNo: r.reference_no ?? '', referenceDate: r.reference_date ?? null, requiresReference: !!r.requires_reference, decidedBy: r.decided_by ?? null, decidedByName: r.decided_by_name ?? null, decidedAsAdmin: !!r.decided_as_admin, decidedAt: r.decided_at ?? null,
  enteredAt: r.entered_at ?? null, dueAt: r.due_at ?? null, slaDays: r.sla_days ?? 5 })
export const historyFromRow = (r: Row): ChangeHistory => ({ id: r.id, requestId: r.change_request_id, userId: r.user_id ?? null, roleLabel: r.role_label ?? '', action: r.action, comment: r.comment ?? '', createdAt: r.created_at })
export const linkFromRow = (r: Row): ChangeLink => ({ id: r.id, requestId: r.request_id, targetType: r.target_type, targetId: r.target_id, targetLabel: r.target_label ?? '', relation: r.relation, source: r.source, createdAt: r.created_at })
export const exceptionFromRow = (r: Row): ChangeException => ({ id: r.id, requestId: r.request_id, justification: r.justification, evidenceRef: r.evidence_ref ?? '', status: r.status, requestedBy: r.requested_by ?? null, requestedAt: r.requested_at, decidedBy: r.decided_by ?? null, decidedAt: r.decided_at ?? null, decisionNote: r.decision_note ?? '' })

export const ruleSetFromRow = (r: Row): RuleSet => ({ id: r.id, version: r.version, name: r.name, status: r.status, effectiveFrom: r.effective_from ?? null, effectiveTo: r.effective_to ?? null, note: r.note ?? '', isSample: !!r.is_sample, activatedAt: r.activated_at ?? null })
export const routeFromRow = (r: Row): Route => ({ id: r.id, ruleSetId: r.rule_set_id, code: r.code, title: r.title, mode: r.mode, level: r.level })
export const routeStepFromRow = (r: Row): RouteStep => ({ id: r.id, routeId: r.route_id, seq: r.seq, kind: r.kind, roleName: r.role_name, label: r.label ?? '', parallelGroup: r.parallel_group ?? null, slaDays: r.sla_days, requiresReference: !!r.requires_reference })
export const ruleFromRow = (r: Row): Rule => ({ id: r.id, ruleSetId: r.rule_set_id, code: r.code, title: r.title, dimension: r.dimension, changeTypes: r.change_types ?? [], costBasis: r.cost_basis, pctMin: numN(r.pct_min), pctMax: numN(r.pct_max), amountMin: numN(r.amount_min), amountMax: numN(r.amount_max),
  daysBasis: r.days_basis, daysMin: numN(r.days_min), daysMax: numN(r.days_max), daysPctMin: numN(r.days_pct_min), daysPctMax: numN(r.days_pct_max), contractTypes: r.contract_types ?? [], projectIds: r.project_ids ?? [], orgUnits: r.org_units ?? [], requiresOpinions: r.requires_opinions ?? [],
  routeId: r.route_id, priority: r.priority, active: !!r.active, validFrom: r.valid_from ?? null, validTo: r.valid_to ?? null, escalateAfterDays: numN(r.escalate_after_days), escalationRole: r.escalation_role ?? null, notes: r.notes ?? '' })
export function ruleToRow(r: Partial<Rule>): Row {
  const m: Record<string, string> = { code: 'code', title: 'title', dimension: 'dimension', changeTypes: 'change_types', costBasis: 'cost_basis', pctMin: 'pct_min', pctMax: 'pct_max', amountMin: 'amount_min', amountMax: 'amount_max', daysBasis: 'days_basis', daysMin: 'days_min', daysMax: 'days_max',
    daysPctMin: 'days_pct_min', daysPctMax: 'days_pct_max', contractTypes: 'contract_types', projectIds: 'project_ids', orgUnits: 'org_units', requiresOpinions: 'requires_opinions', routeId: 'route_id', priority: 'priority', active: 'active', validFrom: 'valid_from', validTo: 'valid_to',
    escalateAfterDays: 'escalate_after_days', escalationRole: 'escalation_role', notes: 'notes', ruleSetId: 'rule_set_id' }
  const row: Row = {}
  for (const k of Object.keys(r) as (keyof Rule)[]) if (m[k as string] && r[k] !== undefined) row[m[k as string]] = r[k]
  return row
}
export const limitFromRow = (r: Row): AuthorityLimit => ({ id: r.id, roleName: r.role_name, maxCostPct: numN(r.max_cost_pct), maxCostAmount: numN(r.max_cost_amount), maxDays: numN(r.max_days), active: !!r.active, validFrom: r.valid_from ?? null, validTo: r.valid_to ?? null, note: r.note ?? '' })
export const auditFromRow = (r: Row): RuleAudit => ({ id: r.id, at: r.at, userId: r.user_id ?? null, tableName: r.table_name, rowId: r.row_id ?? null, action: r.action, oldData: r.old_data, newData: r.new_data })
