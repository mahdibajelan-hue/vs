import type {
  ChangeDocument, ChangeHistoryEntry, ChangePriority, ChangeRequest, ChangeStatus,
  DocumentApprovalStatus, DocumentCategory, ImpactLevel, ReviewStage, StageReview,
  StageReviewDecision, StageReviewDetails,
} from '../types'

interface ChangeRequestRow {
  id: string
  master_project_id: string
  cr_number: string
  title: string
  description: string
  reason_for_change: string
  priority: string
  currency: string
  original_contract_amount: number
  proposed_change_amount: number
  approved_change_amount: number | null
  original_duration_days: number
  proposed_schedule_impact_days: number
  approved_schedule_impact_days: number | null
  new_risks_count: number
  scope_impact_level: string
  status: string
  submitted_by: string | null
  submitted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function changeRequestFromRow(r: ChangeRequestRow): ChangeRequest {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    crNumber: r.cr_number,
    title: r.title,
    description: r.description,
    reasonForChange: r.reason_for_change,
    priority: r.priority as ChangePriority,
    currency: r.currency,
    originalContractAmount: r.original_contract_amount,
    proposedChangeAmount: r.proposed_change_amount,
    approvedChangeAmount: r.approved_change_amount,
    originalDurationDays: r.original_duration_days,
    proposedScheduleImpactDays: r.proposed_schedule_impact_days,
    approvedScheduleImpactDays: r.approved_schedule_impact_days,
    newRisksCount: r.new_risks_count,
    scopeImpactLevel: r.scope_impact_level as ImpactLevel,
    status: r.status as ChangeStatus,
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function changeRequestToInsertRow(masterProjectId: string, data: {
  title: string
  description: string
  reasonForChange: string
  priority: ChangePriority
  currency: string
  originalContractAmount: number
  proposedChangeAmount: number
  originalDurationDays: number
  proposedScheduleImpactDays: number
  newRisksCount: number
  scopeImpactLevel: ImpactLevel
  status: ChangeStatus
}) {
  return {
    master_project_id: masterProjectId,
    title: data.title,
    description: data.description,
    reason_for_change: data.reasonForChange,
    priority: data.priority,
    currency: data.currency,
    original_contract_amount: data.originalContractAmount,
    proposed_change_amount: data.proposedChangeAmount,
    original_duration_days: data.originalDurationDays,
    proposed_schedule_impact_days: data.proposedScheduleImpactDays,
    new_risks_count: data.newRisksCount,
    scope_impact_level: data.scopeImpactLevel,
    status: data.status,
  }
}

interface StageReviewRow {
  id: string
  change_request_id: string
  stage: string
  decision: string
  responsible_user_id: string | null
  reviewer_user_id: string | null
  approver_user_id: string | null
  comment: string
  details: StageReviewDetails
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export function stageReviewFromRow(r: StageReviewRow): StageReview {
  return {
    id: r.id,
    changeRequestId: r.change_request_id,
    stage: r.stage as ReviewStage,
    decision: r.decision as StageReviewDecision,
    responsibleUserId: r.responsible_user_id,
    reviewerUserId: r.reviewer_user_id,
    approverUserId: r.approver_user_id,
    comment: r.comment,
    details: r.details ?? {},
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

interface DocumentRow {
  id: string
  change_request_id: string
  category: string
  document_number: string
  revision: string
  file_name: string
  file_url: string
  approval_status: string
  uploaded_by: string | null
  uploaded_at: string
}

export function documentFromRow(r: DocumentRow): ChangeDocument {
  return {
    id: r.id,
    changeRequestId: r.change_request_id,
    category: r.category as DocumentCategory,
    documentNumber: r.document_number,
    revision: r.revision,
    fileName: r.file_name,
    fileUrl: r.file_url,
    approvalStatus: r.approval_status as DocumentApprovalStatus,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  }
}

interface HistoryRow {
  id: string
  change_request_id: string
  user_id: string | null
  role_label: string
  action: string
  comment: string
  created_at: string
}

export function historyFromRow(r: HistoryRow): ChangeHistoryEntry {
  return {
    id: r.id,
    changeRequestId: r.change_request_id,
    userId: r.user_id,
    roleLabel: r.role_label,
    action: r.action,
    comment: r.comment,
    createdAt: r.created_at,
  }
}
