/** Change Management — EPC change-control workflow, reached from Project Radar's sidebar.
 *
 * Flow: Draft -> Submitted -> Engineering Review -> Planning Review -> Contract Review ->
 * PM Review -> CCB Approval -> Approved/Rejected -> Implementation -> Verification -> Closed.
 * See lib/changeCalc.ts for the financial/schedule formulas and severity/validation rules.
 */

export type ChangePriority = 'low' | 'medium' | 'high' | 'critical'

export const CHANGE_PRIORITY_LABEL_FA: Record<ChangePriority, string> = {
  low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی',
}

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical'

export const IMPACT_LEVEL_LABEL_FA: Record<ImpactLevel, string> = {
  low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی',
}

export const IMPACT_LEVEL_COLOR: Record<ImpactLevel, string> = {
  low: '#2ecc71', medium: '#f0a836', high: '#f97316', critical: '#ef4444',
}

/** The 12-state lifecycle — each non-terminal state IS the current stage name, so no separate
 * "current stage" field is needed alongside status. */
export type ChangeStatus =
  | 'draft' | 'submitted' | 'engineering_review' | 'planning_review' | 'contract_review'
  | 'pm_review' | 'ccb_review' | 'approved' | 'rejected' | 'implementation' | 'verification' | 'closed'

export const CHANGE_STATUS_LABEL_FA: Record<ChangeStatus, string> = {
  draft: 'پیش‌نویس',
  submitted: 'ثبت درخواست',
  engineering_review: 'بررسی مهندسی',
  planning_review: 'بررسی برنامه‌ریزی',
  contract_review: 'بررسی پیمان',
  pm_review: 'بررسی مدیر پروژه',
  ccb_review: 'تصمیم CCB',
  approved: 'تصویب‌شده',
  rejected: 'رد شده',
  implementation: 'اجرا',
  verification: 'تأیید نهایی',
  closed: 'بسته شده',
}

/** Semantic status color per spec §21 — green=approved/completed, blue=in-progress,
 * amber=waiting/pending, red=rejected/critical, gray=draft/not-started. */
export const CHANGE_STATUS_COLOR: Record<ChangeStatus, string> = {
  draft: '#64748b',
  submitted: '#38bdf8',
  engineering_review: '#38bdf8',
  planning_review: '#38bdf8',
  contract_review: '#38bdf8',
  pm_review: '#38bdf8',
  ccb_review: '#f0a836',
  approved: '#2ecc71',
  rejected: '#ef4444',
  implementation: '#38bdf8',
  verification: '#38bdf8',
  closed: '#2ecc71',
}

/** The ordered timeline nodes shown across the top of the page (spec §3/§19). Terminal/rejected
 * states aren't nodes of their own — a rejected change just stops highlighting past its last stage. */
export interface TimelineNodeDef {
  key: ChangeStatus
  labelFa: string
  role: string
}

export const TIMELINE_STAGES: TimelineNodeDef[] = [
  { key: 'submitted', labelFa: 'ثبت درخواست', role: 'پیمانکار' },
  { key: 'engineering_review', labelFa: 'بررسی مهندسی', role: 'مدیر مهندسی' },
  { key: 'planning_review', labelFa: 'بررسی برنامه‌ریزی', role: 'مدیر برنامه‌ریزی و کنترل پروژه' },
  { key: 'contract_review', labelFa: 'بررسی پیمان', role: 'مدیر امور پیمان' },
  { key: 'pm_review', labelFa: 'بررسی مدیر پروژه', role: 'مدیر پروژه' },
  { key: 'ccb_review', labelFa: 'تصمیم CCB', role: 'عضو کمیته کنترل تغییرات' },
  { key: 'implementation', labelFa: 'اجرا', role: 'مجری' },
  { key: 'verification', labelFa: 'تأیید نهایی', role: 'مدیر پروژه' },
  { key: 'closed', labelFa: 'بسته شدن', role: 'مدیر پروژه' },
]

export type StageReviewDecision = 'pending' | 'approved' | 'approved_with_conditions' | 'rejected' | 'request_revision' | 'returned'

export const STAGE_DECISION_LABEL_FA: Record<StageReviewDecision, string> = {
  pending: 'در انتظار',
  approved: 'تایید',
  approved_with_conditions: 'تایید مشروط',
  rejected: 'رد',
  request_revision: 'نیازمند بازنگری',
  returned: 'عودت‌داده‌شده',
}

export const STAGE_DECISION_COLOR: Record<StageReviewDecision, string> = {
  pending: '#94a3b8',
  approved: '#2ecc71',
  approved_with_conditions: '#2ecc71',
  rejected: '#ef4444',
  request_revision: '#f0a836',
  returned: '#f0a836',
}

export type ReviewStage = 'engineering' | 'planning' | 'contract' | 'pm' | 'ccb'

export const REVIEW_STAGE_LABEL_FA: Record<ReviewStage, string> = {
  engineering: 'بررسی مهندسی',
  planning: 'بررسی برنامه‌ریزی و کنترل پروژه',
  contract: 'بررسی امور پیمان و قراردادها',
  pm: 'بررسی مدیر پروژه',
  ccb: 'کمیته کنترل تغییرات (CCB)',
}

/** The project role allowed to make the decision at each review stage. */
export const REVIEW_STAGE_ROLE_NAME: Record<ReviewStage, string> = {
  engineering: 'مدیر مهندسی',
  planning: 'مدیر برنامه‌ریزی و کنترل پروژه',
  contract: 'مدیر امور پیمان',
  pm: 'مدیر پروژه',
  ccb: 'عضو کمیته کنترل تغییرات',
}

/** Which ChangeStatus a stage's decision advances the request into. */
export const NEXT_STATUS_AFTER_STAGE: Record<ReviewStage, ChangeStatus> = {
  engineering: 'planning_review',
  planning: 'contract_review',
  contract: 'pm_review',
  pm: 'ccb_review',
  ccb: 'approved',
}

export const CHANGE_ROLE_NAME = {
  contractor: 'پیمانکار',
  executor: 'مجری',
} as const

/** Free-form per-stage fields (spec §6-10) — kept as a flexible bag rather than dozens of mostly-
 * empty columns, same pattern the Risk module uses for strategy_details. */
export interface EngineeringReviewDetails {
  technicalImpact?: string
  affectedDrawings?: string
  affectedSpecifications?: string
  affectedPids?: string
  designReworkRequired?: boolean
  engineeringDurationDays?: number
  hseImpact?: string
  qualityImpact?: string
  technicalRisks?: string
}

export interface PlanningReviewDetails {
  originalCompletionDate?: string
  revisedCompletionDate?: string
  criticalPathImpact?: string
  affectedActivities?: string
  milestonesAffected?: string
  floatConsumptionDays?: number
  eotRequired?: boolean
  recoveryPossible?: boolean
}

export interface ContractReviewDetails {
  contractualBasis?: string
  relevantClause?: string
  variationOrderRequired?: boolean
  changeOrderRequired?: boolean
  claimPotential?: boolean
  responsibilityForCost?: string
  responsibilityForDelay?: string
  financialEntitlement?: number
  eotEntitlementDays?: number
  contractorClaimAmount?: number
  evaluatedAmount?: number
  recommendedAmount?: number
}

export interface PmReviewDetails {
  managementComment?: string
  conditions?: string
  requiredActions?: string
}

export interface CcbReviewDetails {
  meetingNumber?: string
  members?: string
  conditions?: string
  finalApprovedAmount?: number
  finalApprovedScheduleImpactDays?: number
  finalEotDays?: number
}

export type StageReviewDetails = EngineeringReviewDetails & PlanningReviewDetails & ContractReviewDetails & PmReviewDetails & CcbReviewDetails

export interface StageReview {
  id: string
  changeRequestId: string
  stage: ReviewStage
  decision: StageReviewDecision
  responsibleUserId: string | null
  reviewerUserId: string | null
  approverUserId: string | null
  comment: string
  details: StageReviewDetails
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export type DocumentCategory =
  | 'contractor_proposal' | 'technical' | 'drawing' | 'boq_mto' | 'cost_breakdown'
  | 'schedule_analysis' | 'contract' | 'correspondence' | 'ccb_minutes' | 'other'

export const DOCUMENT_CATEGORY_LABEL_FA: Record<DocumentCategory, string> = {
  contractor_proposal: 'پیشنهاد پیمانکار',
  technical: 'مستندات فنی',
  drawing: 'نقشه‌ها',
  boq_mto: 'BOQ / MTO',
  cost_breakdown: 'ریز هزینه',
  schedule_analysis: 'تحلیل اثر زمانی',
  contract: 'مستندات قرارداد',
  correspondence: 'مکاتبات',
  ccb_minutes: 'صورت‌جلسه CCB',
  other: 'سایر',
}

export type DocumentApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ChangeDocument {
  id: string
  changeRequestId: string
  category: DocumentCategory
  documentNumber: string
  revision: string
  fileName: string
  fileUrl: string
  approvalStatus: DocumentApprovalStatus
  uploadedBy: string | null
  uploadedAt: string
}

export interface ChangeHistoryEntry {
  id: string
  changeRequestId: string
  userId: string | null
  roleLabel: string
  action: string
  comment: string
  createdAt: string
}

export interface ChangeRequest {
  id: string
  masterProjectId: string
  crNumber: string
  title: string
  description: string
  reasonForChange: string
  priority: ChangePriority

  currency: string
  originalContractAmount: number
  proposedChangeAmount: number
  approvedChangeAmount: number | null

  originalDurationDays: number
  proposedScheduleImpactDays: number
  approvedScheduleImpactDays: number | null

  newRisksCount: number
  scopeImpactLevel: ImpactLevel

  status: ChangeStatus

  submittedBy: string | null
  submittedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Everything one Change Request screen needs, loaded in a single pass — mirrors the
 * ProjectLifecycleBundle pattern already used by the Lifecycle module. */
export interface ChangeRequestBundle {
  request: ChangeRequest
  reviews: StageReview[]
  documents: ChangeDocument[]
  history: ChangeHistoryEntry[]
}
