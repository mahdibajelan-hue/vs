export type ExRole = 'contractor' | 'supervision' | 'consultant' | 'employer' | 'manager'
export const EX_ROLE_LABEL_FA: Record<ExRole, string> = { contractor: 'پیمانکار', supervision: 'دستگاه نظارت', consultant: 'مشاور', employer: 'کارفرما', manager: 'مدیر اجرا' }
export interface ExProjectRole { id: string; projectId: string; userId: string; role: ExRole; organizationId: string | null; active: boolean }

export type ActivityKind = 'standard' | 'starred' | 'special'
export const ACTIVITY_KIND_LABEL_FA: Record<ActivityKind, string> = { standard: 'ردیف فهرست‌بها', starred: 'ردیف ستاره‌دار', special: 'ردیف خاص (بدون ردیف متناظر)' }
export type ActivityApproval = 'draft' | 'pending' | 'approved' | 'rejected'
export const ACTIVITY_APPROVAL_LABEL_FA: Record<ActivityApproval, string> = { draft: 'پیش‌نویس', pending: 'در انتظار تأیید', approved: 'تأییدشده', rejected: 'ردشده' }

export interface PriceBook { id: string; projectId: string; discipline: string; year: number | null; season: string; title: string; version: number; status: 'active' | 'superseded'; note: string }
export interface PriceItem { id: string; bookId: string; chapter: string; itemNo: string; /** size / weight range of the row (electrical books: one item code, many ranges) */ spec: string; description: string; unit: string; unitPrice: number; starred: boolean; remark: string; groupCode: string; groupTitle: string; /** code of the row a surcharge (اضافه‌بها) is added to */ parentItemNo: string; surchargePct: number | null }

export interface Activity {
  id: string; projectId: string; priceItemId: string | null; itemNo: string; title: string; unit: string; chapter: string; kind: ActivityKind
  baseQty: number; unitPrice: number; weight: number; weightGroup: string; metric: string
  area: string; front: string; station: string; kmFrom: number | null; kmTo: number | null; plannedStart: string | null; plannedEnd: string | null
  active: boolean; approval: ActivityApproval; approvalNote: string; sort: number; note: string
  /** the row's own number in the estimate (ردیف), the size range, the estimate's remark, the chapter number, the price book it came from and — for a surcharge — the row it is added to */
  rowNo: string; spec: string; remark: string; chapterNo: string; bookId: string | null; parentActivityId: string | null; surchargePct: number | null
}
export interface Baseline { id: string; projectId: string; version: number; status: 'draft' | 'approved'; reason: string; effectiveDate: string; createdAt: string; approvedAt: string | null }
export interface BaselineLine { id: string; baselineId: string; activityId: string; itemNo: string; title: string; unit: string; baseQty: number; weight: number; unitPrice: number; weightGroup: string; active: boolean }

export type ReportStatus = 'draft' | 'incomplete' | 'submitted' | 'partially_approved' | 'approved' | 'returned' | 'rejected'
export const REPORT_STATUS_LABEL_FA: Record<ReportStatus, string> = { draft: 'پیش‌نویس', incomplete: 'نیازمند تکمیل', submitted: 'ارسال‌شده — در انتظار بررسی', partially_approved: 'تأیید جزئی', approved: 'تأییدشده', returned: 'بازگشت برای اصلاح', rejected: 'ردشده' }
export interface Report {
  id: string; projectId: string; formKey: string; reportNo: string; reportDate: string; contractorOrgId: string | null; front: string; station: string; shift: string
  status: ReportStatus; data: Record<string, unknown>; notes: string; missing: string[]; completionOf: string | null; dueDate: string | null
  createdBy: string | null; createdAt: string; submittedBy: string | null; submittedAt: string | null; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string
}
export type LineStatus = 'pending' | 'approved' | 'rejected' | 'returned'
export const LINE_STATUS_LABEL_FA: Record<LineStatus, string> = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده', returned: 'برگشت‌خورده' }
export interface ReportLine {
  id: string; reportId: string; lineNo: number; activityId: string | null; qty: number; kmFrom: number | null; kmTo: number | null; location: string; note: string
  detail: Record<string, unknown>; status: LineStatus; approvedQty: number | null; reviewNote: string; sourceReportId: string | null
}
/** One manpower / machinery row of the daily report. Manpower: total, active, leave, stopped, native, non-native; machinery: total, active, inactive (idleQty), stopped, repair. */
export interface ReportResource { id: string; reportId: string; kind: 'man' | 'equip'; section: string; name: string; totalQty: number; activeQty: number; idleQty: number; leaveQty: number; stoppedQty: number; nativeQty: number; nonnativeQty: number; repairQty: number; hours: number; note: string }
export type StoppageCategory = 'material' | 'drawing' | 'land' | 'permit' | 'weather' | 'equipment' | 'manpower' | 'hse' | 'other'
export interface Stoppage { id: string; reportId: string; category: StoppageCategory; hours: number; description: string; materialId: string | null; issueRef: string | null }
export interface ReportHistory { id: number; reportId: string; at: string; actor: string | null; action: string; note: string }
export interface FormMap { id: string; projectId: string; formKey: string; metricKey: string; groupValue: string; activityId: string }

export type GapKind = 'missing_report' | 'incomplete' | 'inconsistent' | 'unreviewed' | 'period_open' | 'form_missing'
export const GAP_KIND_LABEL_FA: Record<GapKind, string> = { missing_report: 'گزارش دریافت‌نشده', incomplete: 'گزارش ناقص', inconsistent: 'اطلاعات ناسازگار', unreviewed: 'بررسی‌نشده', period_open: 'دورهٔ باز', form_missing: 'فیلد فرم کاغذی پیاده‌نشده' }
export type GapStatus = 'open' | 'in_progress' | 'closed' | 'waived'
export const GAP_STATUS_LABEL_FA: Record<GapStatus, string> = { open: 'باز', in_progress: 'در حال پیگیری', closed: 'بسته', waived: 'بی‌اثر شد' }
export interface Gap { id: string; projectId: string; fingerprint: string; kind: GapKind; formKey: string; periodKey: string; front: string; subject: string; existing: Record<string, unknown>; missing: string[]; responsible: string | null; dueDate: string | null; status: GapStatus; note: string; generatedReportId: string | null }
export interface DetectedGap { fingerprint: string; kind: GapKind; formKey: string; periodKey: string; front: string; subject: string; existing: Record<string, unknown>; missing: string[]; dueDate: string | null; reportId?: string }

export interface ExSettings {
  /** 0 = Saturday … 6 = Friday (Iranian week) */
  weekStart: number
  workDays: number[]
  overBasePct: number
  blockOverBase: boolean
  reviewDays: number
  gapDueDays: number
  /** fronts expected to send a daily work report every working day (labels from the shared front list) */
  expectedFronts: string[]
  projectStart: string
  enabledForms: string[]
  /** relative weight of each weighting basis in the overall progress (default: equal) */
  groupWeights?: Record<string, number>
  rolePerms?: Partial<Record<ExRole, string[]>>
}
export const DEFAULT_EX_SETTINGS: ExSettings = { weekStart: 0, workDays: [0, 1, 2, 3, 4, 5], overBasePct: 0, blockOverBase: true, reviewDays: 2, gapDueDays: 2, expectedFronts: [], projectStart: '', enabledForms: [] }
export const WEEKDAY_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
