import type {
  ApprovalTier, ChangeRequest, ChangeStatus, ConsultantDecision, EmployerDecision,
} from '../types'

interface ChangeRequestRow {
  id: string
  master_project_id: string
  change_number: string
  title: string
  description: string
  justification: string
  time_impact_days: number
  cost_impact_amount: number
  submitted_by: string | null
  submitted_at: string
  consultant_decision: string
  consultant_comment: string
  consultant_reviewed_by: string | null
  consultant_reviewed_at: string | null
  required_approval_tier: string
  employer_decision: string
  employer_comment: string
  decided_by: string | null
  decided_at: string | null
  communicated_at: string | null
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function changeRequestFromRow(r: ChangeRequestRow): ChangeRequest {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    changeNumber: r.change_number,
    title: r.title,
    description: r.description,
    justification: r.justification,
    timeImpactDays: r.time_impact_days,
    costImpactAmount: r.cost_impact_amount,
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
    consultantDecision: r.consultant_decision as ConsultantDecision,
    consultantComment: r.consultant_comment,
    consultantReviewedBy: r.consultant_reviewed_by,
    consultantReviewedAt: r.consultant_reviewed_at,
    requiredApprovalTier: r.required_approval_tier as ApprovalTier,
    employerDecision: r.employer_decision as EmployerDecision,
    employerComment: r.employer_comment,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    communicatedAt: r.communicated_at,
    status: r.status as ChangeStatus,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function changeRequestToInsertRow(masterProjectId: string, data: {
  changeNumber: string
  title: string
  description: string
  justification: string
  timeImpactDays: number
  costImpactAmount: number
  requiredApprovalTier: ApprovalTier
  status: ChangeStatus
}) {
  return {
    master_project_id: masterProjectId,
    change_number: data.changeNumber,
    title: data.title,
    description: data.description,
    justification: data.justification,
    time_impact_days: data.timeImpactDays,
    cost_impact_amount: data.costImpactAmount,
    required_approval_tier: data.requiredApprovalTier,
    status: data.status,
  }
}
