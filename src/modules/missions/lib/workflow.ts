import type { Mission, MissionStatus } from '../types'
import type { CurrentUser } from '../repo/types'
import type { View } from '../nav'
import { daysBetween, todayIso } from './fa'

export const STEPS = ['درخواست', 'تأیید مأموریت', 'بازدید و گزارش‌گیری', 'تأیید گزارش', 'حق مأموریت']

/** Index of the step a mission is currently on (STEPS.length = everything done). */
export function stepIndex(status: MissionStatus): number {
  switch (status) {
    case 'draft':
    case 'returned':
      return 0
    case 'pending_approval':
      return 1
    case 'approved':
    case 'debrief':
    case 'revision_requested':
      return 2
    case 'report_review':
      return 3
    case 'ready_for_claim':
      return 4
    case 'claimed':
      return 5
    default:
      return -1
  }
}

export interface NextStep {
  label: string
  view: View
  tone: 'accent' | 'warn' | 'good' | 'info'
  hint: string
  /** Whose court the ball is in. */
  owner: 'requester' | 'manager'
}

/** What this user can do next with this mission, if anything. */
export function nextStepFor(m: Mission, user: CurrentUser | null): NextStep | null {
  if (!user) return null
  const isReq = m.requesterId === user.id
  const isMgr = user.isManager || m.approverId === user.id
  switch (m.status) {
    case 'draft':
      return isReq ? { label: 'تکمیل و ارسال درخواست', view: { kind: 'form', id: m.id }, tone: 'accent', hint: 'درخواست هنوز ارسال نشده است.', owner: 'requester' } : null
    case 'returned':
      return isReq ? { label: 'اصلاح درخواست', view: { kind: 'form', id: m.id }, tone: 'warn', hint: m.managerComment || 'مدیر درخواست را برای اصلاح برگرداند.', owner: 'requester' } : null
    case 'pending_approval':
      return isMgr ? { label: 'بررسی درخواست', view: { kind: 'mission', id: m.id }, tone: 'warn', hint: 'منتظر تأیید شماست.', owner: 'manager' } : null
    case 'approved': {
      if (!isReq) return null
      const late = m.endDate < todayIso() ? daysBetween(m.endDate, todayIso()) : 0
      return { label: 'ثبت گزارش بازدید', view: { kind: 'interview', id: m.id }, tone: 'accent', hint: late > 0 ? `${late} روز از پایان مأموریت گذشته است.` : 'پس از بازدید، گفت‌وگوی گزارش را شروع کنید.', owner: 'requester' }
    }
    case 'debrief':
      return isReq ? { label: 'ادامه گزارش‌گیری', view: { kind: 'interview', id: m.id }, tone: 'accent', hint: 'گفت‌وگوی گزارش نیمه‌تمام است.', owner: 'requester' } : null
    case 'revision_requested':
      return isReq ? { label: 'اصلاح گزارش', view: { kind: 'interview', id: m.id }, tone: 'warn', hint: m.managerComment || 'مدیر گزارش را برای اصلاح برگرداند.', owner: 'requester' } : null
    case 'report_review':
      return isMgr ? { label: 'بررسی گزارش', view: { kind: 'report', id: m.id }, tone: 'warn', hint: 'گزارش منتظر تأیید نهایی شماست.', owner: 'manager' } : null
    case 'ready_for_claim':
      return isReq ? { label: 'ثبت حق مأموریت', view: { kind: 'mission', id: m.id }, tone: 'good', hint: 'گزارش تأیید شد؛ می‌توانید حق مأموریت را ثبت کنید.', owner: 'requester' } : null
    default:
      return null
  }
}
