import type {
  RmAcceptance, RmCategoryDef, RmContingency, RmControl, RmCorporateRisk, RmEvidence, RmKri, RmKriEvent, RmKriReading, RmLink, RmNotifRule, RmPolicy, RmProject, RmRisk, RmRiskAction,
  RmRiskAssessment, RmRiskHistoryEntry, RmSuggestion,
} from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

export function rmProjectFromRow(r: Row): RmProject & { masterRefId: string | null; shortCode: string } {
  return { id: r.id, name: r.name, client: r.client ?? '', projectManagerId: r.project_manager_id ?? null, startDate: r.start_date ?? null, finishDate: r.finish_date ?? null, status: r.status, createdBy: r.created_by ?? null, createdAt: r.created_at, masterRefId: r.master_ref_id ?? null, shortCode: r.short_code ?? '' }
}

export function rmRiskFromRow(r: Row): RmRisk {
  return {
    id: r.id, projectId: r.project_id, code: r.code, title: r.title, description: r.description ?? '', category: r.category, riskType: r.risk_type, ownerId: r.owner_id ?? null,
    identifiedDate: r.identified_date, status: r.status, responseStrategy: r.response_strategy, strategyDetails: r.strategy_details || {}, projectPhase: r.project_phase ?? null,
    timeToImpactDays: r.time_to_impact_days ?? null, initialProbability: r.initial_probability, initialImpact: r.initial_impact, initialScore: r.initial_score,
    escalationLevel: r.escalation_level ?? null, escalatedTo: str(r.escalated_to), escalationReason: str(r.escalation_reason), escalationDate: r.escalation_date ?? null,
    requiredDecision: str(r.required_decision), escalationDecision: str(r.escalation_decision), escalationDecisionDate: r.escalation_decision_date ?? null, escalationStatus: r.escalation_status || 'none',
    cause: str(r.cause), riskEvent: str(r.risk_event), consequence: str(r.consequence), source: r.source || 'manual', sourceRefType: r.source_ref_type ?? null, sourceRefId: r.source_ref_id ?? null,
    sourceSnapshot: r.source_snapshot || {}, externalSystem: r.external_system ?? null, externalId: r.external_id ?? null, syncStatus: str(r.sync_status) || 'none', syncedAt: r.synced_at ?? null,
    subcategory: r.subcategory ?? null, discipline: str(r.discipline), impactDims: r.impact_dims || {}, impactTimeDays: r.impact_time_days ?? null, impactCost: num(r.impact_cost), impactObjectives: str(r.impact_objectives),
    assumptions: str(r.assumptions), assessmentBasis: str(r.assessment_basis), kmFrom: num(r.km_from), kmTo: num(r.km_to), routeSegment: str(r.route_segment), station: str(r.station), workFront: str(r.work_front),
    contractor: str(r.contractor), workPackage: str(r.work_package), execStage: str(r.exec_stage), monitorId: r.monitor_id ?? null, approverId: r.approver_id ?? null, responseOwnerId: r.response_owner_id ?? null,
    reviewIntervalDays: r.review_interval_days ?? null, nextReviewDate: r.next_review_date ?? null, reviewRequestedAt: r.review_requested_at ?? null, reviewRequestReason: str(r.review_request_reason),
    corporateRiskId: r.corporate_risk_id ?? null, realizedAt: r.realized_at ?? null, closedAt: r.closed_at ?? null, closedReason: str(r.closed_reason), tags: r.tags || [],
    createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** Only fields a user may write; scores of the inherent assessment are written once at creation. */
export function rmRiskToRow(r: Partial<RmRisk>): Row {
  const m: Record<string, string> = {
    title: 'title', description: 'description', category: 'category', subcategory: 'subcategory', riskType: 'risk_type', ownerId: 'owner_id', identifiedDate: 'identified_date', status: 'status',
    responseStrategy: 'response_strategy', strategyDetails: 'strategy_details', projectPhase: 'project_phase', timeToImpactDays: 'time_to_impact_days', initialProbability: 'initial_probability', initialImpact: 'initial_impact',
    escalationLevel: 'escalation_level', escalatedTo: 'escalated_to', escalationReason: 'escalation_reason', escalationDate: 'escalation_date', requiredDecision: 'required_decision',
    escalationDecision: 'escalation_decision', escalationDecisionDate: 'escalation_decision_date', escalationStatus: 'escalation_status', cause: 'cause', riskEvent: 'risk_event', consequence: 'consequence',
    discipline: 'discipline', impactDims: 'impact_dims', impactTimeDays: 'impact_time_days', impactCost: 'impact_cost', impactObjectives: 'impact_objectives', assumptions: 'assumptions', assessmentBasis: 'assessment_basis',
    kmFrom: 'km_from', kmTo: 'km_to', routeSegment: 'route_segment', station: 'station', workFront: 'work_front', contractor: 'contractor', workPackage: 'work_package', execStage: 'exec_stage',
    monitorId: 'monitor_id', approverId: 'approver_id', responseOwnerId: 'response_owner_id', reviewIntervalDays: 'review_interval_days', nextReviewDate: 'next_review_date',
    reviewRequestedAt: 'review_requested_at', reviewRequestReason: 'review_request_reason', corporateRiskId: 'corporate_risk_id', closedReason: 'closed_reason', tags: 'tags',
  }
  const row: Row = {}
  for (const k of Object.keys(r) as (keyof RmRisk)[]) if (m[k as string] && r[k] !== undefined) row[m[k as string]] = r[k]
  return row
}

export function rmAssessmentFromRow(r: Row): RmRiskAssessment {
  return {
    id: r.id, riskId: r.risk_id, reviewDate: r.review_date, currentProbability: r.current_probability, currentImpact: r.current_impact, currentScore: r.current_score,
    residualProbability: r.residual_probability, residualImpact: r.residual_impact, residualScore: r.residual_score, trend: r.trend, reviewerComment: str(r.reviewer_comment),
    responseStrategy: r.response_strategy ?? null, method: r.method || 'qualitative', basis: str(r.basis), impactDims: r.impact_dims || {}, probabilityPct: num(r.probability_pct), exposureCost: num(r.exposure_cost),
    kind: r.kind || 'review', relatedActionIds: r.related_action_ids || [], approvedBy: r.approved_by ?? null, approvedAt: r.approved_at ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at,
  }
}

export function rmActionFromRow(r: Row): RmRiskAction {
  return {
    id: r.id, riskId: r.risk_id, description: r.description, ownerId: r.owner_id ?? null, dueDate: r.due_date ?? null, status: r.status, completionPercentage: r.completion_percentage,
    actionType: r.action_type || 'mitigating', expectedOutput: str(r.expected_output), expectedEffect: str(r.expected_effect), resources: str(r.resources), completionCriteria: str(r.completion_criteria),
    costEstimate: num(r.cost_estimate), benefitEstimate: num(r.benefit_estimate), plannedStart: r.planned_start ?? null, parentActionId: r.parent_action_id ?? null, blockedReason: str(r.blocked_reason),
    blockedSince: r.blocked_since ?? null, completedAt: r.completed_at ?? null, evidenceNote: str(r.evidence_note), effectStatus: r.effect_status || 'pending', effectNote: str(r.effect_note),
    effectVerifiedBy: r.effect_verified_by ?? null, effectVerifiedAt: r.effect_verified_at ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export function rmActionToRow(a: Partial<RmRiskAction>): Row {
  const m: Record<string, string> = {
    description: 'description', ownerId: 'owner_id', dueDate: 'due_date', status: 'status', completionPercentage: 'completion_percentage', actionType: 'action_type', expectedOutput: 'expected_output',
    expectedEffect: 'expected_effect', resources: 'resources', completionCriteria: 'completion_criteria', costEstimate: 'cost_estimate', benefitEstimate: 'benefit_estimate', plannedStart: 'planned_start',
    parentActionId: 'parent_action_id', blockedReason: 'blocked_reason', evidenceNote: 'evidence_note', effectStatus: 'effect_status', effectNote: 'effect_note',
  }
  const row: Row = {}
  for (const k of Object.keys(a) as (keyof RmRiskAction)[]) if (m[k as string] && a[k] !== undefined) row[m[k as string]] = a[k]
  return row
}

export function rmHistoryFromRow(r: Row): RmRiskHistoryEntry {
  return { id: r.id, riskId: r.risk_id, userId: r.user_id ?? null, activity: r.activity, previousValue: r.previous_value, newValue: r.new_value, comment: str(r.comment), createdAt: r.created_at }
}

export function rmControlFromRow(r: Row): RmControl {
  return { id: r.id, riskId: r.risk_id, name: r.name, description: str(r.description), controlType: r.control_type, ownerId: r.owner_id ?? null, isCritical: !!r.is_critical, status: r.status, effectiveness: r.effectiveness, lastTestedAt: r.last_tested_at ?? null, testIntervalDays: r.test_interval_days ?? null, expiresOn: r.expires_on ?? null, evidenceNote: str(r.evidence_note), createdAt: r.created_at, updatedAt: r.updated_at }
}
export function rmControlToRow(c: Partial<RmControl>): Row {
  const m: Record<string, string> = { name: 'name', description: 'description', controlType: 'control_type', ownerId: 'owner_id', isCritical: 'is_critical', status: 'status', effectiveness: 'effectiveness', lastTestedAt: 'last_tested_at', testIntervalDays: 'test_interval_days', expiresOn: 'expires_on', evidenceNote: 'evidence_note' }
  const row: Row = {}
  for (const k of Object.keys(c) as (keyof RmControl)[]) if (m[k as string] && c[k] !== undefined) row[m[k as string]] = c[k]
  return row
}
export function rmContingencyFromRow(r: Row): RmContingency {
  return { id: r.id, riskId: r.risk_id, triggerCondition: r.trigger_condition, plan: r.plan, ownerId: r.owner_id ?? null, budget: num(r.budget), status: r.status, activatedAt: r.activated_at ?? null, createdAt: r.created_at }
}
export function rmEvidenceFromRow(r: Row): RmEvidence {
  return { id: r.id, riskId: r.risk_id, kind: r.kind, title: r.title, note: str(r.note), url: str(r.url), createdBy: r.created_by ?? null, createdAt: r.created_at }
}
export function rmLinkFromRow(r: Row): RmLink {
  return { id: r.id, riskId: r.risk_id, targetType: r.target_type, targetId: r.target_id, targetLabel: str(r.target_label), relation: r.relation, createdAt: r.created_at }
}
export function rmCorporateFromRow(r: Row): RmCorporateRisk {
  return { id: r.id, code: r.code, title: r.title, description: str(r.description), category: r.category ?? null, ownerId: r.owner_id ?? null, status: r.status, correctivePlan: str(r.corrective_plan), createdAt: r.created_at }
}
export function rmAcceptanceFromRow(r: Row): RmAcceptance {
  return { id: r.id, riskId: r.risk_id, requestedBy: r.requested_by ?? null, requestedAt: r.requested_at, residualScore: r.residual_score, rationale: r.rationale, validUntil: r.valid_until ?? null, status: r.status, decidedBy: r.decided_by ?? null, decidedAt: r.decided_at ?? null, decisionNote: str(r.decision_note) }
}
export function rmKriFromRow(r: Row): RmKri {
  return {
    id: r.id, projectId: r.project_id, riskId: r.risk_id ?? null, name: r.name, definition: str(r.definition), unit: str(r.unit), domain: r.domain || 'general', direction: r.direction, baseline: num(r.baseline),
    warnThreshold: Number(r.warn_threshold), criticalThreshold: Number(r.critical_threshold), frequencyDays: r.frequency_days, ownerId: r.owner_id ?? null, dataSource: r.data_source, externalSystem: r.external_system ?? null,
    externalKey: r.external_key ?? null, active: !!r.active, currentValue: num(r.current_value), lastReadingAt: r.last_reading_at ?? null, state: r.state, createdAt: r.created_at,
  }
}
export function rmKriReadingFromRow(r: Row): RmKriReading { return { id: r.id, kriId: r.kri_id, value: Number(r.value), readAt: r.read_at, source: r.source, note: str(r.note) } }
export function rmKriEventFromRow(r: Row): RmKriEvent { return { id: r.id, kriId: r.kri_id, fromState: r.from_state, toState: r.to_state, value: num(r.value), at: r.at } }
export function rmPolicyFromRow(r: Row): RmPolicy {
  const b = (r.level_bounds as number[] | null) ?? [6, 11, 16]
  return { id: r.id, projectId: r.project_id ?? null, appetiteMax: r.appetite_max, toleranceMax: r.tolerance_max, escalationMin: r.escalation_min, levelBounds: [b[0], b[1], b[2]], reviewDays: r.review_days, staleAssessmentDays: r.stale_assessment_days, scaleLabels: r.scale_labels || {}, autoAcceptConfidence: num(r.auto_accept_confidence) }
}
export function rmCategoryFromRow(r: Row): RmCategoryDef { return { key: r.key, labelFa: r.label_fa, parentKey: r.parent_key ?? null, sort: r.sort, active: !!r.active } }
export function rmSuggestionFromRow(r: Row): RmSuggestion {
  return { id: r.id, projectId: r.project_id, source: r.source, sourceRefType: r.source_ref_type, sourceRefId: r.source_ref_id, title: r.title, description: str(r.description), payload: r.payload || {}, confidence: Number(r.confidence), status: r.status, createdRiskId: r.created_risk_id ?? null, createdAt: r.created_at }
}
export function rmNotifRuleFromRow(r: Row): RmNotifRule {
  return { key: r.key, name: r.name, description: str(r.description), kind: r.kind, recipients: r.recipients || [], escalateTo: r.escalate_to || [], channels: r.channels || [], thresholdHours: r.threshold_hours, dedupeHours: r.dedupe_hours, isActive: !!r.is_active }
}

// Row shapes consumed by the reporting module's data adapters (loose on purpose: the database is the source of truth).
export type RmRiskRow = Row
export type RmRiskAssessmentRow = Row
export type RmRiskActionRow = Row
