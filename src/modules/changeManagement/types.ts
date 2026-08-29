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

export type StageReviewDecision =
  | 'pending' | 'approved' | 'approved_with_conditions' | 'approved_with_cost_revision'
  | 'approved_with_time_revision' | 'suspended' | 'rejected' | 'request_revision' | 'returned'

export const STAGE_DECISION_LABEL_FA: Record<StageReviewDecision, string> = {
  pending: 'در انتظار',
  approved: 'تایید',
  approved_with_conditions: 'تایید مشروط',
  approved_with_cost_revision: 'تصویب با اصلاح هزینه',
  approved_with_time_revision: 'تصویب با اصلاح زمان',
  suspended: 'تعلیق / بررسی بیشتر',
  rejected: 'رد',
  request_revision: 'نیازمند بازنگری',
  returned: 'عودت‌داده‌شده',
}

export const STAGE_DECISION_COLOR: Record<StageReviewDecision, string> = {
  pending: '#94a3b8',
  approved: '#2ecc71',
  approved_with_conditions: '#2ecc71',
  approved_with_cost_revision: '#2ecc71',
  approved_with_time_revision: '#2ecc71',
  suspended: '#f0a836',
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

/** Section 1 of the org's Word template — project/contract identification + classification. */
export type ProjectPhase = 'engineering' | 'procurement' | 'construction' | 'commissioning'
export const PROJECT_PHASE_LABEL_FA: Record<ProjectPhase, string> = {
  engineering: 'Engineering', procurement: 'Procurement', construction: 'Construction', commissioning: 'Commissioning',
}

export type RequesterOrganization = 'employer' | 'consultant' | 'contractor' | 'pm'
export const REQUESTER_ORGANIZATION_LABEL_FA: Record<RequesterOrganization, string> = {
  employer: 'کارفرما', consultant: 'مشاور', contractor: 'پیمانکار', pm: 'مدیریت پروژه',
}

export type ChangeTypeTag = 'scope' | 'design' | 'specification' | 'quantity' | 'schedule' | 'cost' | 'procurement' | 'construction_method' | 'other'
export const CHANGE_TYPE_TAG_LABEL_FA: Record<ChangeTypeTag, string> = {
  scope: 'Scope', design: 'Design', specification: 'Specification', quantity: 'Quantity',
  schedule: 'Schedule', cost: 'Cost', procurement: 'Procurement', construction_method: 'Construction Method', other: 'سایر',
}

/** Section 2 — reason-for-change checkboxes. */
export type ChangeReasonCategory =
  | 'employer_request' | 'site_conditions' | 'design_defect' | 'regulation_change' | 'technical_safety_necessity'
  | 'equipment_material_unavailability' | 'cost_optimization' | 'schedule_optimization' | 'unforeseen_conditions' | 'other'
export const CHANGE_REASON_CATEGORY_LABEL_FA: Record<ChangeReasonCategory, string> = {
  employer_request: 'تغییر درخواست کارفرما',
  site_conditions: 'تغییر در شرایط سایت',
  design_defect: 'مغایرت یا نقص طراحی',
  regulation_change: 'تغییر قوانین، استانداردها یا مقررات',
  technical_safety_necessity: 'ضرورت فنی / ایمنی',
  equipment_material_unavailability: 'عدم دسترسی به تجهیزات یا مصالح',
  cost_optimization: 'بهینه‌سازی هزینه',
  schedule_optimization: 'بهینه‌سازی زمان',
  unforeseen_conditions: 'شرایط پیش‌بینی‌نشده',
  other: 'سایر',
}

export interface AffectedDocument {
  docNumber: string
  title: string
  currentRevision: string
  proposedRevision: string
}

/** Section 3-1 — scope-of-work impact. */
export type ScopeChangeType = 'none' | 'increase' | 'decrease' | 'unchanged_modified'
export const SCOPE_CHANGE_TYPE_LABEL_FA: Record<ScopeChangeType, string> = {
  none: 'بدون اثر', increase: 'افزایش محدوده', decrease: 'کاهش محدوده', unchanged_modified: 'تغییر در محدوده بدون افزایش/کاهش حجم',
}

/** Section 6 — change-level risk register mini-table. */
export type RiskLikertLevel = 'low' | 'medium' | 'high'
export const RISK_LIKERT_LABEL_FA: Record<RiskLikertLevel, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد' }
export interface IdentifiedChangeRisk {
  description: string
  probability: RiskLikertLevel
  impact: RiskLikertLevel
  controlAction: string
}

/** Section 10 — implementation action plan; `seedDefaultImplementationActions()` in changeCalc.ts
 * produces the Word form's 8 default rows when a request first enters 'implementation'. */
export type ImplementationActionStatus = 'pending' | 'in_progress' | 'done'
export const IMPLEMENTATION_ACTION_STATUS_LABEL_FA: Record<ImplementationActionStatus, string> = {
  pending: 'شروع نشده', in_progress: 'در حال انجام', done: 'انجام‌شده',
}
export interface ImplementationAction {
  seq: number
  actionLabel: string
  responsible: string
  plannedStart: string
  plannedEnd: string
  status: ImplementationActionStatus
}

/** Section 11 — closeout checklist. */
export type CloseoutDocumentType = 'drawings' | 'specifications' | 'pid' | 'schedule' | 'budget_forecast' | 'risk_register' | 'issue_register' | 'pmis' | 'as_built'
export const CLOSEOUT_DOCUMENT_TYPE_LABEL_FA: Record<CloseoutDocumentType, string> = {
  drawings: 'نقشه‌ها', specifications: 'Specifications', pid: 'P&ID', schedule: 'Schedule',
  budget_forecast: 'Budget / Cost Forecast', risk_register: 'Risk Register', issue_register: 'Issue Register',
  pmis: 'PMIS', as_built: 'As-Built Documents',
}

/** Free-form per-stage fields (spec §6-10) — kept as a flexible bag rather than dozens of mostly-
 * empty columns, same pattern the Risk module uses for strategy_details. */
/** Section 3-2's 7-row impact matrix (Basic Design, Detailed Design, نقشه‌ها, Datasheet,
 * Specifications, P&ID/PFD, HAZOP/HSE), each rated none/low/medium/high. */
export type EngineeringImpactItem = 'basicDesign' | 'detailedDesign' | 'drawings' | 'datasheet' | 'specifications' | 'pidPfd' | 'hazopHse'
export const ENGINEERING_IMPACT_ITEM_LABEL_FA: Record<EngineeringImpactItem, string> = {
  basicDesign: 'Basic Design', detailedDesign: 'Detailed Design', drawings: 'نقشه‌ها', datasheet: 'Datasheet',
  specifications: 'Specifications', pidPfd: 'P&ID / PFD', hazopHse: 'HAZOP / HSE',
}
export type ImpactMatrixLevel = 'none' | 'low' | 'medium' | 'high'
export const IMPACT_MATRIX_LEVEL_LABEL_FA: Record<ImpactMatrixLevel, string> = { none: 'بدون اثر', low: 'کم', medium: 'متوسط', high: 'زیاد' }

export type ProcurementStatus = 'not_ordered' | 'ordered' | 'in_manufacturing' | 'ready_to_ship' | 'delivered'
export const PROCUREMENT_STATUS_LABEL_FA: Record<ProcurementStatus, string> = {
  not_ordered: 'سفارش نشده', ordered: 'سفارش شده', in_manufacturing: 'در حال ساخت', ready_to_ship: 'آماده حمل', delivered: 'تحویل شده',
}

export type HseImpactType = 'none' | 'hse_review' | 'new_jsa' | 'hazop_hazid_review' | 'new_permits'
export const HSE_IMPACT_TYPE_LABEL_FA: Record<HseImpactType, string> = {
  none: 'بدون اثر', hse_review: 'نیاز به HSE Review', new_jsa: 'نیاز به JSA جدید',
  hazop_hazid_review: 'نیاز به بازنگری HAZOP / HAZID', new_permits: 'نیاز به مجوزهای جدید',
}
export type QualityImpactType = 'none' | 'itp_change' | 'qcp_change' | 'inspection_standard_change' | 'retest_required'
export const QUALITY_IMPACT_TYPE_LABEL_FA: Record<QualityImpactType, string> = {
  none: 'بدون اثر', itp_change: 'تغییر در ITP', qcp_change: 'تغییر در QCP',
  inspection_standard_change: 'تغییر در استانداردهای بازرسی', retest_required: 'نیاز به تست / بازرسی مجدد',
}
export type HseQaqcVerdict = 'approved' | 'approved_with_conditions' | 'corrective_action_required'
export const HSE_QAQC_VERDICT_LABEL_FA: Record<HseQaqcVerdict, string> = {
  approved: 'تأیید', approved_with_conditions: 'تأیید مشروط', corrective_action_required: 'نیازمند اقدام اصلاحی',
}

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
  impactMatrix?: Partial<Record<EngineeringImpactItem, ImpactMatrixLevel>>
  // Section 3-3 — procurement impact, folded into the Engineering stage rather than a new stage.
  procurementItemsInvolved?: string
  procurementCurrentStatus?: ProcurementStatus
  poChangeRequired?: boolean
  vendorChangeRequired?: boolean
  leadTimeImpactDays?: number
  procurementFinancialImpact?: number
  procurementDescription?: string
  // Section 7 — HSE & quality, folded into the Engineering stage rather than a new "HSE/QAQC" stage.
  hseImpactTypes?: HseImpactType[]
  qualityImpactTypes?: QualityImpactType[]
  hseQualityActionsDescription?: string
  hseQaqcVerdict?: HseQaqcVerdict
}

export type ConstructionImpactType = 'none' | 'work_stoppage' | 'rework' | 'demolition' | 'volume_increase' | 'method_change'
export const CONSTRUCTION_IMPACT_TYPE_LABEL_FA: Record<ConstructionImpactType, string> = {
  none: 'بدون اثر', work_stoppage: 'نیاز به توقف کار', rework: 'نیاز به اصلاح کار انجام‌شده',
  demolition: 'Demolition / Rework', volume_increase: 'افزایش حجم عملیات', method_change: 'تغییر روش اجرا',
}
export type ScheduleAnalysisResult = 'no_impact' | 'recoverable' | 'needs_extension'
export const SCHEDULE_ANALYSIS_RESULT_LABEL_FA: Record<ScheduleAnalysisResult, string> = {
  no_impact: 'بدون تأثیر بر Completion Date', recoverable: 'تأثیر دارد ولی قابل جبران است', needs_extension: 'نیازمند تمدید مدت قرارداد است',
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
  // Section 3-4 — construction/execution impact
  constructionImpactTypes?: ConstructionImpactType[]
  resourceProductivityImpact?: string
  // Section 4 — expanded schedule-impact analysis
  originalAffectedDurationDays?: number
  recoverableDelayDays?: number
  eotRequestedDays?: number
  completionDateImpactDays?: number
  scheduleAnalysisResult?: ScheduleAnalysisResult
  attachedScheduleImpactAnalysis?: boolean
  attachedUpdatedBaseline?: boolean
}

export type ContractualClassification = 'variation_order' | 'change_order' | 'change_in_scope' | 'claim' | 'contract_amendment' | 'no_contractual_effect'
export const CONTRACTUAL_CLASSIFICATION_LABEL_FA: Record<ContractualClassification, string> = {
  variation_order: 'Variation Order', change_order: 'Change Order', change_in_scope: 'Change in Scope',
  claim: 'Claim', contract_amendment: 'Contract Amendment', no_contractual_effect: 'بدون اثر قراردادی',
}
export type ContractorFaultStatus = 'yes' | 'no' | 'needs_review'
export const CONTRACTOR_FAULT_STATUS_LABEL_FA: Record<ContractorFaultStatus, string> = { yes: 'بله', no: 'خیر', needs_review: 'نیازمند بررسی' }
export type CostResponsibleParty = 'employer' | 'contractor' | 'consultant' | 'shared_undetermined'
export const COST_RESPONSIBLE_PARTY_LABEL_FA: Record<CostResponsibleParty, string> = {
  employer: 'کارفرما', contractor: 'پیمانکار', consultant: 'مشاور', shared_undetermined: 'مشترک / نیازمند تعیین تکلیف',
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
  // Section 5 — cost breakdown (folds in the Word form's separate "امور مالی/کنترل هزینه" reviewer
  // block: these are cost-control figures the Contract stage records, not a 6th pipeline stage).
  // جمع افزایش هزینه / جمع کاهش هزینه / اثر خالص تغییر are always derived live — see changeCalc.ts.
  costEngineering?: number
  costProcurement?: number
  costConstruction?: number
  costRework?: number
  costOverhead?: number
  costDelay?: number
  costOther?: number
  costDecreaseTotal?: number
  contractualClassification?: ContractualClassification[]
  contractorFaultStatus?: ContractorFaultStatus
  costResponsibleParty?: CostResponsibleParty
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
  resolutionNumber?: string
  effectiveDate?: string
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

  // Section 1 — general/contract identification + classification
  projectCode: string
  contractName: string
  contractNumber: string
  contractDate: string
  projectPhase: ProjectPhase | null
  requesterName: string
  requesterOrganization: RequesterOrganization | null
  changeTypes: ChangeTypeTag[]

  // Section 2 — expanded description
  currentSituationDescription: string
  changeReasonCategories: ChangeReasonCategory[]
  changeReasonOther: string
  affectedDocuments: AffectedDocument[]

  // Section 3-1 — scope impact
  scopeChangeType: ScopeChangeType | null
  scopeEffectDescription: string

  // Section 6 — change-level risk register
  identifiedRisks: IdentifiedChangeRisk[]
  requiresNewRiskRegisterEntry: boolean
  createsNewIssue: boolean

  // Section 10 — implementation action plan
  implementationActions: ImplementationAction[]

  // Section 11 — closeout
  implementedAsApproved: boolean | null
  actualCostAmount: number | null
  actualDelayDays: number | null
  documentsUpdated: boolean | null
  updatedDocumentTypes: CloseoutDocumentType[]
  lessonLearnedRecorded: boolean | null
  lessonLearnedNumber: string
}

/** Everything one Change Request screen needs, loaded in a single pass — mirrors the
 * ProjectLifecycleBundle pattern already used by the Lifecycle module. */
export interface ChangeRequestBundle {
  request: ChangeRequest
  reviews: StageReview[]
  documents: ChangeDocument[]
  history: ChangeHistoryEntry[]
}
