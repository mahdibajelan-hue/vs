import type { ImIssue, ImIssuePriority, ImStage, ImTask, ImTaskStatus } from '../types'

export const IM_STAGE_LABEL_FA: Record<ImStage, string> = {
  registered: 'ثبت‌شده',
  validated: 'اعتبارسنجی‌شده',
  analysis: 'تحلیل علت',
  action_plan: 'برنامه اقدام',
  in_progress: 'در حال رفع',
  resolution_review: 'بررسی نتیجه رفع',
  effectiveness_check: 'راستی‌آزمایی اثربخشی',
  closed: 'بسته‌شده',
  returned: 'بازگشت برای اصلاح',
  reopened: 'بازگشایی‌شده',
  cancelled: 'ابطال‌شده',
  duplicate: 'تکراری',
}

/** fine stage → coarse legacy status (mirrors trigger im_issue_guard) */
export const IM_STAGE_COARSE: Record<ImStage, 'open' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'> = {
  registered: 'open', validated: 'open', analysis: 'open', action_plan: 'open', reopened: 'open',
  in_progress: 'in_progress',
  resolution_review: 'pending_approval', effectiveness_check: 'pending_approval',
  closed: 'approved',
  returned: 'rejected', cancelled: 'rejected', duplicate: 'rejected',
}

export const IM_STAGE_ORDER: ImStage[] = ['registered', 'validated', 'analysis', 'action_plan', 'in_progress', 'resolution_review', 'effectiveness_check', 'closed']
export const IM_TERMINAL_STAGES: ImStage[] = ['closed', 'cancelled', 'duplicate']

export const IM_TASK_STATUS_LABEL_FA: Record<ImTaskStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  blocked: 'مسدود',
  pending_verification: 'منتظر تأیید',
  done: 'انجام و تأییدشده',
  cancelled: 'لغوشده',
}

export const IM_BLOCK_KIND_FA: Record<string, string> = {
  decision: 'منتظر تصمیم',
  approval: 'منتظر تأیید',
  document: 'منتظر مدرک',
  resource: 'کمبود منبع',
  external: 'وابسته به بیرون',
  other: 'سایر',
}

export const IM_CATEGORY_FA: Record<string, string> = {
  engineering: 'مهندسی', document_approval: 'تأیید مدارک', procurement: 'تدارکات', contractor: 'پیمانکار',
  contract_commercial: 'قرارداد و بازرگانی', land_right_of_way: 'اراضی و حریم', permits: 'مجوزها', hse: 'ایمنی و محیط‌زیست',
  quality: 'کیفیت', finance: 'مالی', interface: 'تداخل و رابط', other: 'سایر',
}

export const IM_SOURCE_FA: Record<string, string> = {
  manual: 'ثبت دستی', lifecycle_action: 'اقدام چرخه عمر', mission_debrief: 'گزارش بازدید/مأموریت', land_acquisition: 'تملک اراضی',
  risk: 'ریسک محقق‌شده', correspondence: 'مکاتبات', meeting: 'جلسه', report: 'گزارش', import: 'ورود انبوه', api: 'سامانهٔ خارجی',
}

const PRIORITY_RANK: Record<ImIssuePriority, number> = { low: 1, medium: 2, high: 3, critical: 4 }
export const priorityRank = (p: ImIssuePriority) => PRIORITY_RANK[p]
export const rankToPriority = (r: number): ImIssuePriority => (['low', 'low', 'medium', 'high', 'critical'] as const)[Math.max(1, Math.min(4, Math.round(r)))]

export const isoDay = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
}

/** The effective due date: approved extension target if any, else the legacy deadline. */
export function effectiveDue(i: Pick<ImIssue, 'resolveDueDate' | 'deadlineDate'>): string {
  return i.resolveDueDate ?? i.deadlineDate
}

export function stageOf(i: ImIssue): ImStage {
  if (i.stage) return i.stage
  return i.status === 'approved' ? 'closed' : i.status === 'rejected' ? 'returned' : i.status === 'pending_approval' ? 'resolution_review' : i.status === 'in_progress' ? 'in_progress' : 'registered'
}

export const isClosedIssue = (i: ImIssue) => i.status === 'approved' || stageOf(i) === 'closed'
export const isActiveIssue = (i: ImIssue) => !IM_TERMINAL_STAGES.includes(stageOf(i))

export function isTaskOpen(t: Pick<ImTask, 'status'>): boolean {
  return t.status !== 'done' && t.status !== 'cancelled'
}
