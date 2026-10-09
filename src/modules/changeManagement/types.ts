/** Change Management v2 — one standalone module. Request lifecycle, rule engine (data-driven approval matrix), links to risk/issue modules.
 *  Server (`cm_*` RPCs) is authoritative; this file only mirrors its shapes. */

export type ChangeStatus = 'draft' | 'submitted' | 'evaluating' | 'awaiting_approval' | 'approved' | 'rejected' | 'returned' | 'implementing' | 'implemented' | 'closed' | 'cancelled'
export const STATUS_FA: Record<ChangeStatus, string> = {
  draft: 'پیش‌نویس', submitted: 'ثبت‌شده', evaluating: 'در حال ارزیابی', awaiting_approval: 'در انتظار تصویب', approved: 'مصوب', rejected: 'ردشده', returned: 'عودت‌شده',
  implementing: 'در حال اجرا', implemented: 'اجراشده', closed: 'بسته‌شده', cancelled: 'لغوشده',
}
export const STATUS_COLOR: Record<ChangeStatus, string> = {
  draft: '#94a3b8', submitted: '#38bdf8', evaluating: '#38bdf8', awaiting_approval: '#f59e0b', approved: '#22c55e', rejected: '#ef4444', returned: '#f97316',
  implementing: '#6366f1', implemented: '#14b8a6', closed: '#16a34a', cancelled: '#64748b',
}
export const OPEN_STATUSES: ChangeStatus[] = ['submitted', 'evaluating', 'awaiting_approval', 'returned']
export const STATUS_ORDER: ChangeStatus[] = ['draft', 'submitted', 'evaluating', 'awaiting_approval', 'approved', 'implementing', 'implemented', 'closed', 'returned', 'rejected', 'cancelled']

export type ChangeType = 'additional_work' | 'new_work' | 'quantity' | 'technical' | 'time_extension' | 'other'
export const TYPE_FA: Record<ChangeType, string> = { additional_work: 'کار اضافی', new_work: 'کار جدید', quantity: 'تغییر مقادیر', technical: 'تغییر فنی (طراحی/مشخصات/روش)', time_extension: 'تمدید مدت', other: 'سایر' }
export const TYPE_ORDER: ChangeType[] = ['additional_work', 'new_work', 'quantity', 'technical', 'time_extension', 'other']

export type Priority = 'low' | 'medium' | 'high' | 'critical'
export const PRIORITY_FA: Record<Priority, string> = { low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی' }

export type StepKind = 'opinion' | 'approval' | 'body'
export const STEP_KIND_FA: Record<StepKind, string> = { opinion: 'نظر', approval: 'تصویب', body: 'مصوبهٔ مرجع (هیئت/کمیته)' }
export type StepStatus = 'waiting' | 'active' | 'approved' | 'rejected' | 'returned' | 'skipped'
export const STEP_STATUS_FA: Record<StepStatus, string> = { waiting: 'در نوبت', active: 'جاری', approved: 'تأیید', rejected: 'رد', returned: 'عودت', skipped: 'منتفی' }

export interface ChangeRequest {
  id: string; masterProjectId: string; crNumber: string; title: string; description: string; reason: string; priority: Priority; status: ChangeStatus; changeType: ChangeType | null
  currency: string; contractId: string | null; contractorOrgId: string | null; orgUnit: string; contractNumber: string; contractName: string
  originalContractAmount: number; originalDurationDays: number; proposedCost: number; proposedDays: number; approvedCost: number | null; approvedDays: number | null
  ruleSetId: string | null; routeStatus: 'none' | 'resolved' | 'blocked'; routeSnapshot: RouteResolution | null; routeBlockers: Blocker[]; baseAmount: number | null; cumPrevAmount: number | null; cumPrevDays: number | null
  evaluationNote: string; impactQuality: string; impactSafety: string; evaluationCompletedAt: string | null; approvedAt: string | null; decisionNote: string; cancelReason: string
  implementationOwnerId: string | null; implementationDue: string | null; implementationStartedAt: string | null; resultNote: string; resultRecordedAt: string | null; closedAt: string | null
  implementedAsApproved: boolean | null; actualCost: number | null; actualDelayDays: number | null; documentsUpdated: boolean | null; executedUnderException: boolean; attempt: number; stageEnteredAt: string
  requesterName: string; requesterOrganization: string | null; projectPhase: string | null; currentSituation: string; reasonCategories: string[]; affectedDocuments: AffectedDoc[]; scopeEffect: string
  submittedBy: string | null; submittedAt: string | null; createdBy: string | null; createdAt: string; updatedAt: string
}
export interface AffectedDoc { docNumber: string; title: string; revision?: string }

export interface ChangeStep {
  id: string; requestId: string; attempt: number; seq: number; groupNo: number | null; kind: StepKind; roleName: string; label: string; routeCode: string; ruleCodes: string[]; status: StepStatus
  opinion: string; referenceNo: string; referenceDate: string | null; requiresReference: boolean; decidedBy: string | null; decidedByName: string | null; decidedAsAdmin: boolean; decidedAt: string | null
  enteredAt: string | null; dueAt: string | null; slaDays: number
}
export interface ChangeHistory { id: string; requestId: string; userId: string | null; roleLabel: string; action: string; comment: string; createdAt: string }
export interface ChangeLink { id: string; requestId: string; targetType: 'risk' | 'issue'; targetId: string; targetLabel: string; relation: 'raises' | 'caused_by' | 'mitigates' | 'related'; source: 'manual' | 'suggestion' | 'auto'; createdAt: string }
export interface ChangeException { id: string; requestId: string; justification: string; evidenceRef: string; status: 'requested' | 'authorised' | 'refused'; requestedBy: string | null; requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string }

// ---- rule engine data
export type RuleDimension = 'cost' | 'time' | 'type'
export interface RuleSet { id: string; version: number; name: string; status: 'draft' | 'active' | 'archived'; effectiveFrom: string | null; effectiveTo: string | null; note: string; isSample: boolean; activatedAt: string | null }
export interface Route { id: string; ruleSetId: string; code: string; title: string; mode: 'sequential' | 'parallel'; level: number }
export interface RouteStep { id: string; routeId: string; seq: number; kind: StepKind; roleName: string; label: string; parallelGroup: number | null; slaDays: number; requiresReference: boolean }
export interface Rule {
  id: string; ruleSetId: string; code: string; title: string; dimension: RuleDimension; changeTypes: ChangeType[]; costBasis: 'current' | 'cumulative'; pctMin: number | null; pctMax: number | null; amountMin: number | null; amountMax: number | null
  daysBasis: 'current' | 'cumulative'; daysMin: number | null; daysMax: number | null; daysPctMin: number | null; daysPctMax: number | null; contractTypes: string[]; projectIds: string[]; orgUnits: string[]; requiresOpinions: string[]
  routeId: string; priority: number; active: boolean; validFrom: string | null; validTo: string | null; escalateAfterDays: number | null; escalationRole: string | null; notes: string
}
export interface AuthorityLimit { id: string; roleName: string; maxCostPct: number | null; maxCostAmount: number | null; maxDays: number | null; active: boolean; validFrom: string | null; validTo: string | null; note: string }
export interface RuleAudit { id: number; at: string; userId: string | null; tableName: string; rowId: string | null; action: string; oldData: unknown; newData: unknown }
export interface ValidationIssue { level: 'error' | 'warn'; code: string; message: string }

// ---- engine I/O (mirrors cm_resolve_core)
export interface Basis {
  base_amount: number | null; base_source: string; duration_days: number | null; duration_source: string; current_cost: number; current_pct: number | null; cum_prev_amount: number; cum_amount: number; cum_pct: number | null
  pending_other_amount: number; pending_pct: number | null; current_days: number; current_days_pct: number | null; cum_prev_days: number; cum_days: number; cum_days_pct: number | null; change_type: string | null; contract_type?: string | null
}
export interface Blocker { code: string; dimension?: string; message: string }
export interface ResolvedStep { kind: StepKind; role: string; label: string; sla_days: number; requires_reference: boolean; route: string; pg: number | null }
export interface DimensionTrace { dimension: RuleDimension; applicable: boolean; matched: { code: string; title: string; priority: number; route: string }[]; chosen: { route: string } | null }
export interface RouteResolution {
  status: 'resolved' | 'blocked'; rule_set?: { id: string; version: number; name: string }; basis: Basis; dimensions: DimensionTrace[]; blockers: Blocker[]
  route?: { code: string; title: string; mode: string; level: number; combined: boolean; steps: ResolvedStep[]; reason: string }; applied_rules?: string[]; escalate_after_days?: number | null; escalation_role?: string | null; resolved_at?: string
}

export const REASON_FA: Record<string, string> = {
  employer_request: 'درخواست کارفرما', site_conditions: 'تغییر شرایط سایت', design_defect: 'مغایرت یا نقص طراحی', regulation_change: 'تغییر قوانین/استانداردها', technical_safety_necessity: 'ضرورت فنی یا ایمنی',
  equipment_material_unavailability: 'عدم دسترسی به تجهیزات/مصالح', cost_optimization: 'بهینه‌سازی هزینه', schedule_optimization: 'بهینه‌سازی زمان', unforeseen_conditions: 'شرایط پیش‌بینی‌نشده', other: 'سایر',
}
export const PHASE_FA: Record<string, string> = { engineering: 'مهندسی', procurement: 'تدارکات', construction: 'ساخت', commissioning: 'راه‌اندازی' }
export const REQUESTER_ORG_FA: Record<string, string> = { employer: 'کارفرما', consultant: 'مشاور', contractor: 'پیمانکار', pm: 'مدیریت پروژه' }
