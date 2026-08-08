export type LineStatus = 'not_started' | 'in_progress' | 'testing' | 'completed'

export const STATUS_COLOR: Record<LineStatus, string> = {
  completed: '#2ecc71',
  in_progress: '#f1c40f',
  not_started: '#e74c3c',
  testing: '#3498db',
}

export const STATUS_LABEL_FA: Record<LineStatus, string> = {
  completed: 'تکمیل شده',
  in_progress: 'در حال اجرا',
  not_started: 'اجرا نشده',
  testing: 'در حال تست',
}

export interface IsoLine {
  id: string
  /** Line number / label shown throughout the UI. */
  svgElementId: string
  /** Raw SVG element ids that make up this line on the map — can be several when merged from fragmented CAD exports. */
  svgElementIds: string[]
  size: string
  spec: string
  service: string
  contractor: string
  plannedLength: number
  totalWelds: number
  /** How many of totalWelds came from placed fittings/valves (2 each) rather than pipe butt welds — 0 if unknown (e.g. lines from an uploaded SVG). */
  fittingWeldCount: number
  status: LineStatus
  createdAt: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export const APPROVAL_LABEL_FA: Record<ApprovalStatus, string> = {
  pending: 'در انتظار تایید',
  approved: 'تایید شده',
  rejected: 'رد شده',
}

export const APPROVAL_COLOR: Record<ApprovalStatus, string> = {
  pending: '#f1c40f',
  approved: '#2ecc71',
  rejected: '#e74c3c',
}

export interface DailyLog {
  id: string
  lineId: string
  date: string
  lengthDone: number
  weldCount: number
  /** Which schedule activity this entry's work counts toward — feeds directly into the Schedule module's auto-computed actual progress. */
  activity: ActivityKind
  contractor: string
  notes: string
  delayReason: string
  approvalStatus: ApprovalStatus
  reviewedBy: string | null
  reviewNote: string
  createdAt: string
  /** Snapshot of lengthDone/weldCount as originally entered — frozen at creation, for the 3-way audit comparison. */
  contractorLengthDone: number
  contractorWeldCount: number
  /** Snapshot taken the moment the consultant approves — null until then. */
  consultantLengthDone: number | null
  consultantWeldCount: number | null
  /** Set only if the owner audits this entry — outside the approve/reject cycle. */
  ownerLengthDone: number | null
  ownerWeldCount: number | null
  ownerReviewedAt: string | null
  ownerReviewedBy: string | null
  ownerNote: string
}

/** What a new daily log entry needs from a caller — the audit-trail fields are always computed by the store, never supplied by hand. */
export type NewDailyLogInput = Omit<
  DailyLog,
  | 'id'
  | 'createdAt'
  | 'contractorLengthDone'
  | 'contractorWeldCount'
  | 'consultantLengthDone'
  | 'consultantWeldCount'
  | 'ownerLengthDone'
  | 'ownerWeldCount'
  | 'ownerReviewedAt'
  | 'ownerReviewedBy'
  | 'ownerNote'
>

export type UserRole = 'contractor' | 'consultant' | 'owner'

export const ROLE_LABEL_FA: Record<UserRole, string> = {
  contractor: 'پیمانکار',
  consultant: 'مشاور پروژه',
  owner: 'کارفرما',
}

export const ROLE_DESCRIPTION_FA: Record<UserRole, string> = {
  contractor: 'ورود اطلاعات کارکرد روزانه و برنامه زمان‌بندی',
  consultant: 'بررسی و صحه‌گذاری (تایید یا رد) اطلاعات ثبت‌شده',
  owner: 'مشاهده گزارش‌ها و ارسال برای مدیران ستادی (فقط خواندنی)',
}

export interface PlannedProgressPoint {
  date: string
  plannedPercent: number
}

export type ActivityKind = 'welding' | 'ndt' | 'coating' | 'hydrotest'

export const ACTIVITY_KINDS: ActivityKind[] = ['welding', 'ndt', 'coating', 'hydrotest']

export const ACTIVITY_LABEL_FA: Record<ActivityKind, string> = {
  welding: 'جوشکاری',
  ndt: 'تست NDT',
  coating: 'پوشش',
  hydrotest: 'تست هیدرواستاتیک',
}

export interface ActivitySchedule {
  id: string
  lineId: string
  activity: ActivityKind
  plannedStart: string
  plannedEnd: string
  actualStart: string | null
  actualEnd: string | null
  percentComplete: number
  /** Consultant's per-row confirmation that this planned schedule is correct — reset whenever the contractor edits the plan. */
  consultantApprovedAt?: string | null
  consultantApprovedBy?: string | null
}

export interface Milestone {
  id: string
  label: string
  percentComplete: number
  color: string
  /** Consultant's confirmation that this milestone's value is correct. */
  consultantApprovedAt?: string | null
  consultantApprovedBy?: string | null
  /** Owner's audit — outside the consultant approve cycle, confirms as-is or corrects the value. */
  ownerReviewedAt?: string | null
  ownerReviewedBy?: string | null
}

export type ReportTemplate = 'standard' | 'detailed'

export interface ReportSections {
  kpis: boolean
  map: boolean
  legend: boolean
  linesTable: boolean
  milestones: boolean
  scheduleSCurve: boolean
  weldsChart: boolean
}

export const REPORT_SECTION_LABEL_FA: Record<keyof ReportSections, string> = {
  kpis: 'شاخص‌های کلیدی (KPI)',
  map: 'نقشه ایزومتریک رنگی',
  legend: 'راهنمای رنگ‌ها (Legend)',
  linesTable: 'جدول خطوط و پیشرفت',
  milestones: 'مراحل کلی پروژه (مایلستون‌ها)',
  scheduleSCurve: 'نمودار S-Curve برنامه زمان‌بندی',
  weldsChart: 'نمودار سرجوش به تفکیک سایز',
}

export interface ReportConfig {
  template: ReportTemplate
  sections: ReportSections
}

/** A valve/fitting/equipment symbol placed in the schematic tool, kept as a project-level record so it can be listed (e.g. next to the line list in Schedule) after the drawing is saved. */
export interface PlacedEquipmentItem {
  id: string
  /** Real (DB-assigned) line id it's attached to, if any. */
  lineId: string | null
  type: import('../data/pipingSymbols').SymbolType
  category: import('../data/pipingSymbols').SymbolCategory
  label: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  client: string
  location: string
  unit: string
  svgRaw: string | null
  svgFileName: string | null
  lines: IsoLine[]
  logs: DailyLog[]
  plannedCurve: PlannedProgressPoint[]
  schedules: ActivitySchedule[]
  equipment: PlacedEquipmentItem[]
  milestones: Milestone[]
  reportConfig: ReportConfig
  /** Owner's sign-off on the whole schedule (all lines/activities) — outside the per-row consultant approve cycle. */
  scheduleApprovedAt: string | null
  scheduleApprovedBy: string | null
  createdAt: string
}

export type ThemeMode = 'dark' | 'light'

export interface DraftLine {
  id: string
  svgElementId: string
  size: string
  points: { x: number; y: number }[]
  /** Set when the line was created via real-world coordinate entry (true 3D length, meters). */
  realLengthMeters?: number
}

export interface PlacedSymbol {
  id: string
  type: import('../data/pipingSymbols').SymbolType
  x: number
  y: number
  rotation: number
  /** DraftLine.id this symbol was snapped to, if any — used for weld-count estimation. */
  lineId?: string
  /** Tee fittings only: main run size and branch/outlet size. */
  mainSize?: string
  branchSize?: string
}
