import type {
  AffectedDocument, ChangeDocument, ChangeHistoryEntry, ChangePriority, ChangeReasonCategory,
  ChangeRequest, ChangeStatus, ChangeTypeTag, CloseoutDocumentType, DocumentApprovalStatus,
  DocumentCategory, IdentifiedChangeRisk, ImpactLevel, ImplementationAction, ProjectPhase,
  RequesterOrganization, ReviewStage, ScopeChangeType, StageReview, StageReviewDecision, StageReviewDetails,
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
  project_code: string
  contract_name: string
  contract_number: string
  contract_date: string
  project_phase: string | null
  requester_name: string
  requester_organization: string | null
  change_types: string[]
  current_situation_description: string
  change_reason_categories: string[]
  change_reason_other: string
  affected_documents: AffectedDocument[]
  scope_change_type: string | null
  scope_effect_description: string
  identified_risks: IdentifiedChangeRisk[]
  requires_new_risk_register_entry: boolean
  creates_new_issue: boolean
  implementation_actions: ImplementationAction[]
  implemented_as_approved: boolean | null
  actual_cost_amount: number | null
  actual_delay_days: number | null
  documents_updated: boolean | null
  updated_document_types: string[]
  lesson_learned_recorded: boolean | null
  lesson_learned_number: string
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
    projectCode: r.project_code ?? '',
    contractName: r.contract_name ?? '',
    contractNumber: r.contract_number ?? '',
    contractDate: r.contract_date ?? '',
    projectPhase: (r.project_phase as ProjectPhase | null) ?? null,
    requesterName: r.requester_name ?? '',
    requesterOrganization: (r.requester_organization as RequesterOrganization | null) ?? null,
    changeTypes: (r.change_types as ChangeTypeTag[]) ?? [],
    currentSituationDescription: r.current_situation_description ?? '',
    changeReasonCategories: (r.change_reason_categories as ChangeReasonCategory[]) ?? [],
    changeReasonOther: r.change_reason_other ?? '',
    affectedDocuments: r.affected_documents ?? [],
    scopeChangeType: (r.scope_change_type as ScopeChangeType | null) ?? null,
    scopeEffectDescription: r.scope_effect_description ?? '',
    identifiedRisks: r.identified_risks ?? [],
    requiresNewRiskRegisterEntry: r.requires_new_risk_register_entry ?? false,
    createsNewIssue: r.creates_new_issue ?? false,
    implementationActions: r.implementation_actions ?? [],
    implementedAsApproved: r.implemented_as_approved,
    actualCostAmount: r.actual_cost_amount,
    actualDelayDays: r.actual_delay_days,
    documentsUpdated: r.documents_updated,
    updatedDocumentTypes: (r.updated_document_types as CloseoutDocumentType[]) ?? [],
    lessonLearnedRecorded: r.lesson_learned_recorded,
    lessonLearnedNumber: r.lesson_learned_number ?? '',
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
  projectCode?: string
  contractName?: string
  contractNumber?: string
  contractDate?: string
  projectPhase?: ProjectPhase | null
  requesterName?: string
  requesterOrganization?: RequesterOrganization | null
  changeTypes?: ChangeTypeTag[]
  currentSituationDescription?: string
  changeReasonCategories?: ChangeReasonCategory[]
  changeReasonOther?: string
  affectedDocuments?: AffectedDocument[]
  scopeChangeType?: ScopeChangeType | null
  scopeEffectDescription?: string
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
    project_code: data.projectCode ?? '',
    contract_name: data.contractName ?? '',
    contract_number: data.contractNumber ?? '',
    contract_date: data.contractDate ?? '',
    project_phase: data.projectPhase ?? null,
    requester_name: data.requesterName ?? '',
    requester_organization: data.requesterOrganization ?? null,
    change_types: data.changeTypes ?? [],
    current_situation_description: data.currentSituationDescription ?? '',
    change_reason_categories: data.changeReasonCategories ?? [],
    change_reason_other: data.changeReasonOther ?? '',
    affected_documents: data.affectedDocuments ?? [],
    scope_change_type: data.scopeChangeType ?? null,
    scope_effect_description: data.scopeEffectDescription ?? '',
  }
}

export function changeRequestToUpdateRow(data: Partial<{
  identifiedRisks: IdentifiedChangeRisk[]
  requiresNewRiskRegisterEntry: boolean
  createsNewIssue: boolean
  implementationActions: ImplementationAction[]
  implementedAsApproved: boolean | null
  actualCostAmount: number | null
  actualDelayDays: number | null
  documentsUpdated: boolean | null
  updatedDocumentTypes: CloseoutDocumentType[]
  lessonLearnedRecorded: boolean | null
  lessonLearnedNumber: string
}>) {
  const row: Record<string, unknown> = {}
  if (data.identifiedRisks !== undefined) row.identified_risks = data.identifiedRisks
  if (data.requiresNewRiskRegisterEntry !== undefined) row.requires_new_risk_register_entry = data.requiresNewRiskRegisterEntry
  if (data.createsNewIssue !== undefined) row.creates_new_issue = data.createsNewIssue
  if (data.implementationActions !== undefined) row.implementation_actions = data.implementationActions
  if (data.implementedAsApproved !== undefined) row.implemented_as_approved = data.implementedAsApproved
  if (data.actualCostAmount !== undefined) row.actual_cost_amount = data.actualCostAmount
  if (data.actualDelayDays !== undefined) row.actual_delay_days = data.actualDelayDays
  if (data.documentsUpdated !== undefined) row.documents_updated = data.documentsUpdated
  if (data.updatedDocumentTypes !== undefined) row.updated_document_types = data.updatedDocumentTypes
  if (data.lessonLearnedRecorded !== undefined) row.lesson_learned_recorded = data.lessonLearnedRecorded
  if (data.lessonLearnedNumber !== undefined) row.lesson_learned_number = data.lessonLearnedNumber
  return row
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
