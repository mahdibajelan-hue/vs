import type { ApprovalStatus, LandRole, Parcel, ReviewAction } from '../types'

/** The four-step chain: contractor enters -> consultant reviews and approves -> employer legal attests -> project manager approves finally. */
export const APPROVAL_STEPS: { status: ApprovalStatus; role: LandRole; label: string; who: string }[] = [
  { status: 'draft', role: 'contractor', label: 'ورود اطلاعات', who: 'پیمانکار (مسئول تحصیل اراضی)' },
  { status: 'submitted', role: 'consultant', label: 'بررسی و تأیید', who: 'مشاور پروژه' },
  { status: 'consultant_approved', role: 'employer_legal', label: 'صحه‌گذاری حقوقی', who: 'حقوقی کارفرما' },
  { status: 'legal_attested', role: 'project_manager', label: 'تأیید نهایی', who: 'مدیر پروژه' },
]
export const ROLE_LABEL: Record<LandRole, string> = {
  contractor: 'پیمانکار (مسئول تحصیل اراضی)',
  consultant: 'مشاور پروژه',
  employer_legal: 'حقوقی کارفرما',
  project_manager: 'مدیر پروژه',
  executive: 'مجری طرح',
}
export const ROLE_HINT: Record<LandRole, string> = {
  contractor: 'اطلاعات قطعه‌ها را وارد و برای بررسی ارسال می‌کند.',
  consultant: 'اطلاعات ارسالی پیمانکار را بررسی، تأیید یا برگشت می‌دهد.',
  employer_legal: 'پس از تأیید مشاور، موضوع را از نظر حقوقی صحه‌گذاری می‌کند.',
  project_manager: 'تأیید نهایی را انجام می‌دهد.',
  executive: 'همهٔ قطعه‌ها را می‌بیند و می‌تواند تأیید نهایی را هم انجام دهد.',
}
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  draft: 'در دست تکمیل (پیمانکار)',
  submitted: 'در انتظار بررسی مشاور',
  consultant_approved: 'در انتظار صحه‌گذاری حقوقی',
  legal_attested: 'در انتظار تأیید نهایی مدیر پروژه',
  approved: 'تأیید نهایی شد',
}
export const ACTION_LABEL: Record<string, string> = { submit: 'ارسال برای بررسی', approve: 'تأیید مشاور', attest: 'صحه‌گذاری حقوقی', final: 'تأیید نهایی', return: 'برگشت برای اصلاح', reopen: 'بازگشایی' }

/** Mirrors la_review() on the server: which actions may this role take on a parcel in this status. */
export function allowedActions(status: ApprovalStatus, role: LandRole | null, isAdmin: boolean): ReviewAction[] {
  const is = (...r: LandRole[]) => isAdmin || (!!role && r.includes(role))
  const out: ReviewAction[] = []
  if (status === 'draft' && is('contractor')) out.push('submit')
  if (status === 'submitted' && is('consultant')) out.push('approve', 'return')
  if (status === 'consultant_approved' && is('employer_legal')) out.push('attest', 'return')
  if (status === 'legal_attested' && is('project_manager', 'executive')) out.push('final', 'return')
  if (status === 'approved' && is('project_manager', 'executive')) out.push('reopen')
  return out
}
export const NEXT_STATUS: Record<ReviewAction, ApprovalStatus | 'draft'> = { submit: 'submitted', approve: 'consultant_approved', attest: 'legal_attested', final: 'approved', return: 'draft', reopen: 'draft' }

/**
 * May this user change the parcel's data? Data entry belongs to the contractor while the parcel is a draft. Users with no project role
 * keep the older permission-based behaviour (`canEditByPermission`), so existing projects are not locked out.
 */
export function canEditData(p: Pick<Parcel, 'approvalStatus'>, role: LandRole | null, isAdmin: boolean, canEditByPermission: boolean): boolean {
  if (isAdmin) return true
  if (role === 'contractor') return p.approvalStatus === 'draft'
  if (role) return false
  return canEditByPermission
}
