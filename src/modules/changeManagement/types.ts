/** Change Management — the Project Radar sidebar's "Change Management" module.
 *
 * Workflow: Contractor (پیمانکار) submits a change with its time/cost impact → Consultant
 * (مشاور) reviews and recommends/does-not-recommend (a required checkpoint, not a veto) →
 * Employer (کارفرما) makes the final call. Decision authority is tiered by the *cumulative*
 * cost impact this change would bring the project to, as a percent of the contract's current
 * value: up to 10% needs the "مجری" project role, up to 25% needs "مدیرعامل" — beyond 25% the
 * change cannot be approved at all. See lib/changeCalc.ts for the tier/ceiling engine.
 */

export type ConsultantDecision = 'pending' | 'recommended' | 'not_recommended'

export const CONSULTANT_DECISION_LABEL_FA: Record<ConsultantDecision, string> = {
  pending: 'در انتظار بررسی مشاور',
  recommended: 'تایید مشاور',
  not_recommended: 'عدم تایید مشاور',
}

export type EmployerDecision = 'pending' | 'approved' | 'rejected'

export const EMPLOYER_DECISION_LABEL_FA: Record<EmployerDecision, string> = {
  pending: 'در انتظار تصمیم کارفرما',
  approved: 'تصویب و ابلاغ شده',
  rejected: 'رد شده',
}

/** Which project role may make the employer-side decision on this change, based on the
 * cumulative cost impact it would bring the project to. */
export type ApprovalTier = 'executor' | 'ceo' | 'over_ceiling'

export const APPROVAL_TIER_LABEL_FA: Record<ApprovalTier, string> = {
  executor: 'مجری',
  ceo: 'مدیرعامل',
  over_ceiling: 'خارج از سقف مجاز (۲۵٪)',
}

export type ChangeStatus = 'submitted' | 'pending_employer_decision' | 'approved' | 'rejected' | 'over_ceiling_blocked'

export const CHANGE_STATUS_LABEL_FA: Record<ChangeStatus, string> = {
  submitted: 'ثبت‌شده — در انتظار بررسی مشاور',
  pending_employer_decision: 'در انتظار تصمیم کارفرما',
  approved: 'تصویب و ابلاغ‌شده',
  rejected: 'رد شده',
  over_ceiling_blocked: 'مسدود — خارج از سقف ۲۵٪',
}

export const CHANGE_STATUS_COLOR: Record<ChangeStatus, string> = {
  submitted: '#38bdf8',
  pending_employer_decision: '#f0a836',
  approved: '#2ecc71',
  rejected: '#ef4444',
  over_ceiling_blocked: '#7c2d12',
}

/** The two project roles (spec: مجری up to 10%, مدیرعامل up to 25%) this module's decisions
 * gate on — plus پیمانکار/مشاور, all held in the existing rasta_project_roles roster and
 * assigned per-project via the existing Project Role Assignment UI. */
export const CHANGE_ROLE_NAME = {
  contractor: 'پیمانکار',
  consultant: 'مشاور',
  executor: 'مجری',
  ceo: 'مدیرعامل',
} as const

export interface ChangeRequest {
  id: string
  masterProjectId: string
  changeNumber: string
  title: string
  description: string
  justification: string

  timeImpactDays: number
  costImpactAmount: number
  submittedBy: string | null
  submittedAt: string

  consultantDecision: ConsultantDecision
  consultantComment: string
  consultantReviewedBy: string | null
  consultantReviewedAt: string | null

  requiredApprovalTier: ApprovalTier
  employerDecision: EmployerDecision
  employerComment: string
  decidedBy: string | null
  decidedAt: string | null
  communicatedAt: string | null

  status: ChangeStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
}
