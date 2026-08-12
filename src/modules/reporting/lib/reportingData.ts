import type {
  Decision,
  DecisionStatus,
  RastaAction,
  RastaActionPriority,
  RastaActionSource,
  RastaActionStatus,
  ReportPayload,
  ReportProfile,
  ReportSnapshot,
  ReportStatus,
  ReportType,
} from '../types'

interface ReportProfileRow {
  id: string
  name: string
  report_type: string
  description: string
  widget_ids: string[]
  is_system: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function reportProfileFromRow(r: ReportProfileRow): ReportProfile {
  return {
    id: r.id,
    name: r.name,
    reportType: r.report_type as ReportType,
    description: r.description,
    widgetIds: r.widget_ids ?? [],
    isSystem: r.is_system,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function reportProfileToRow(p: Partial<ReportProfile>) {
  const row: Record<string, unknown> = {}
  if (p.name !== undefined) row.name = p.name
  if (p.reportType !== undefined) row.report_type = p.reportType
  if (p.description !== undefined) row.description = p.description
  if (p.widgetIds !== undefined) row.widget_ids = p.widgetIds
  if (p.isSystem !== undefined) row.is_system = p.isSystem
  return row
}

interface ReportSnapshotRow {
  id: string
  master_project_id: string
  report_type: string
  profile_id: string | null
  report_number: string
  revision: number
  status: string
  period_start: string | null
  period_end: string | null
  payload: ReportPayload
  widget_ids: string[]
  created_by: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  approved_by: string | null
  approved_at: string | null
  issued_at: string | null
}

export function reportSnapshotFromRow(r: ReportSnapshotRow): ReportSnapshot {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    reportType: r.report_type as ReportType,
    profileId: r.profile_id,
    reportNumber: r.report_number,
    revision: r.revision,
    status: r.status as ReportStatus,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    payload: r.payload ?? {},
    widgetIds: r.widget_ids ?? [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    issuedAt: r.issued_at,
  }
}

export interface DecisionRow {
  id: string
  master_project_id: string
  title: string
  description: string
  reason: string
  required_by: string | null
  impact: string
  recommended_action: string
  decision_owner_id: string | null
  status: string
  final_decision: string
  decided_at: string | null
  related_risk_id: string | null
  related_issue_id: string | null
  related_milestone_label: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function decisionFromRow(r: DecisionRow): Decision {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    title: r.title,
    description: r.description,
    reason: r.reason,
    requiredBy: r.required_by,
    impact: r.impact,
    recommendedAction: r.recommended_action,
    decisionOwnerId: r.decision_owner_id,
    status: r.status as DecisionStatus,
    finalDecision: r.final_decision,
    decidedAt: r.decided_at,
    relatedRiskId: r.related_risk_id,
    relatedIssueId: r.related_issue_id,
    relatedMilestoneLabel: r.related_milestone_label,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function decisionToRow(masterProjectId: string, d: Partial<Decision>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (d.title !== undefined) row.title = d.title
  if (d.description !== undefined) row.description = d.description
  if (d.reason !== undefined) row.reason = d.reason
  if (d.requiredBy !== undefined) row.required_by = d.requiredBy
  if (d.impact !== undefined) row.impact = d.impact
  if (d.recommendedAction !== undefined) row.recommended_action = d.recommendedAction
  if (d.decisionOwnerId !== undefined) row.decision_owner_id = d.decisionOwnerId
  if (d.status !== undefined) row.status = d.status
  if (d.finalDecision !== undefined) row.final_decision = d.finalDecision
  if (d.decidedAt !== undefined) row.decided_at = d.decidedAt
  if (d.relatedRiskId !== undefined) row.related_risk_id = d.relatedRiskId
  if (d.relatedIssueId !== undefined) row.related_issue_id = d.relatedIssueId
  if (d.relatedMilestoneLabel !== undefined) row.related_milestone_label = d.relatedMilestoneLabel
  return row
}

export interface RastaActionRow {
  id: string
  master_project_id: string
  title: string
  owner_id: string | null
  due_date: string | null
  priority: string
  status: string
  source: string
  source_decision_id: string | null
  related_risk_id: string | null
  related_issue_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function rastaActionFromRow(r: RastaActionRow): RastaAction {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    title: r.title,
    ownerId: r.owner_id,
    dueDate: r.due_date,
    priority: r.priority as RastaActionPriority,
    status: r.status as RastaActionStatus,
    source: r.source as RastaActionSource,
    sourceDecisionId: r.source_decision_id,
    relatedRiskId: r.related_risk_id,
    relatedIssueId: r.related_issue_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rastaActionToRow(masterProjectId: string, a: Partial<RastaAction>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (a.title !== undefined) row.title = a.title
  if (a.ownerId !== undefined) row.owner_id = a.ownerId
  if (a.dueDate !== undefined) row.due_date = a.dueDate
  if (a.priority !== undefined) row.priority = a.priority
  if (a.status !== undefined) row.status = a.status
  if (a.source !== undefined) row.source = a.source
  if (a.sourceDecisionId !== undefined) row.source_decision_id = a.sourceDecisionId
  if (a.relatedRiskId !== undefined) row.related_risk_id = a.relatedRiskId
  if (a.relatedIssueId !== undefined) row.related_issue_id = a.relatedIssueId
  return row
}
