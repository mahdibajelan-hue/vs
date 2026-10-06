import type { Mission, MissionStatus } from '../types'
import type { CurrentUser } from '../repo/types'
import type { View } from '../nav'
import { daysBetween, todayIso } from './fa'

/**
 * The mission workflow and who owns each step:
 *   ۱ کارمند            درخواست مأموریت را ثبت و ارسال می‌کند
 *   ۲ مجری طرح          تأیید اولیه درخواست
 *   ۳ امور اداری        درخواست بلیط هواپیما را انجام و بلیط را ثبت می‌کند
 *   ۴ کارمند            پس از بازگشت، گزارش بازدید را ثبت می‌کند
 *   ۵ مجری طرح          تأیید گزارش
 *   ۶ امور اداری        تأیید کلیم مأموریت
 */
export const STEPS = ['درخواست', 'تأیید مجری طرح', 'بلیط (امور اداری)', 'بازدید و گزارش', 'تأیید گزارش (مجری)', 'کلیم (امور اداری)']
export const STEP_OWNER = ['کارمند', 'مجری طرح', 'امور اداری', 'کارمند', 'مجری طرح', 'امور اداری']

/** Index of the step a mission is currently on (STEPS.length = everything done). */
export function stepIndex(status: MissionStatus): number {
  switch (status) {
    case 'draft':
    case 'returned':
      return 0
    case 'pending_approval':
      return 1
    case 'ticketing':
      return 2
    case 'approved':
    case 'debrief':
    case 'revision_requested':
      return 3
    case 'report_review':
      return 4
    case 'ready_for_claim':
      return 5
    case 'claimed':
      return 6
    default:
      return -1
  }
}

/** Who currently has to act on the mission. */
export function waitingOn(m: Mission): string | null {
  switch (m.status) {
    case 'draft':
    case 'returned':
    case 'approved':
    case 'debrief':
    case 'revision_requested':
      return 'کارمند'
    case 'pending_approval':
    case 'report_review':
      return 'مجری طرح'
    case 'ticketing':
    case 'ready_for_claim':
      return 'امور اداری'
    default:
      return null
  }
}

export interface NextStep {
  label: string
  view: View
  tone: 'accent' | 'warn' | 'good' | 'info'
  hint: string
  /** Whose court the ball is in. */
  owner: 'requester' | 'manager' | 'adminAffairs'
}

/** What this user can do next with this mission, if anything. */
export function nextStepFor(m: Mission, user: CurrentUser | null): NextStep | null {
  if (!user) return null
  const isReq = m.requesterId === user.id
  const isMgr = user.isManager || m.approverId === user.id
  const isAA = user.isAdminAffairs
  switch (m.status) {
    case 'draft':
      return isReq ? { label: 'تکمیل و ارسال درخواست', view: { kind: 'form', id: m.id }, tone: 'accent', hint: 'درخواست هنوز ارسال نشده است.', owner: 'requester' } : null
    case 'returned':
      return isReq ? { label: 'اصلاح درخواست', view: { kind: 'form', id: m.id }, tone: 'warn', hint: m.managerComment || m.adminComment || 'درخواست برای اصلاح برگردانده شد.', owner: 'requester' } : null
    case 'pending_approval':
      return isMgr ? { label: 'بررسی درخواست', view: { kind: 'mission', id: m.id }, tone: 'warn', hint: 'منتظر تأیید شما (مجری طرح) است.', owner: 'manager' } : null
    case 'ticketing':
      return isAA ? { label: 'درخواست و ثبت بلیط', view: { kind: 'mission', id: m.id }, tone: 'warn', hint: `بلیط ${m.requesterName} از ${m.originCity || 'مبدأ'} به ${m.destinationCity || m.destination || 'مقصد'}${m.companions.length ? ` (+${m.companions.length} همراه)` : ''}`, owner: 'adminAffairs' } : null
    case 'approved': {
      if (!isReq) return null
      const late = m.endDate < todayIso() ? daysBetween(m.endDate, todayIso()) : 0
      return { label: 'ثبت گزارش بازدید', view: { kind: 'interview', id: m.id }, tone: 'accent', hint: late > 0 ? `${late} روز از پایان مأموریت گذشته است.` : 'پس از بازگشت از مأموریت، گزارش بازدید را ثبت کنید.', owner: 'requester' }
    }
    case 'debrief':
      return isReq ? { label: 'ادامه گزارش‌گیری', view: { kind: 'interview', id: m.id }, tone: 'accent', hint: 'گفت‌وگوی گزارش نیمه‌تمام است.', owner: 'requester' } : null
    case 'revision_requested':
      return isReq ? { label: 'اصلاح گزارش', view: { kind: 'interview', id: m.id }, tone: 'warn', hint: m.managerComment || 'مجری طرح گزارش را برای اصلاح برگرداند.', owner: 'requester' } : null
    case 'report_review':
      return isMgr ? { label: 'بررسی گزارش', view: { kind: 'report', id: m.id }, tone: 'warn', hint: 'گزارش منتظر تأیید نهایی شماست.', owner: 'manager' } : null
    case 'ready_for_claim':
      return isAA ? { label: 'تأیید کلیم مأموریت', view: { kind: 'mission', id: m.id }, tone: 'warn', hint: 'گزارش تأیید شده؛ کلیم منتظر تأیید امور اداری است.', owner: 'adminAffairs' } : null
    default:
      return null
  }
}
