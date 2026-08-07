export type RmUserRole = 'project_manager' | 'risk_manager' | 'risk_owner' | 'team_member' | 'management'

export const RM_ROLES: RmUserRole[] = ['project_manager', 'risk_manager', 'risk_owner', 'team_member', 'management']

export const RM_ROLE_LABEL_FA: Record<RmUserRole, string> = {
  project_manager: 'مدیر پروژه',
  risk_manager: 'مدیر ریسک (PMO)',
  risk_owner: 'مالک ریسک',
  team_member: 'عضو تیم پروژه',
  management: 'مدیریت ارشد (فقط مشاهده)',
}

export const RM_ROLE_DESCRIPTION_FA: Record<RmUserRole, string> = {
  project_manager: 'دسترسی کامل به ریسک‌های پروژه، تایید، تشدید و گزارش‌ها',
  risk_manager: 'مدیریت ریسک‌ها، انجام بازبینی‌ها، پایش روند و تهیه گزارش',
  risk_owner: 'مشاهده ریسک‌های واگذارشده و به‌روزرسانی اقدامات کنترلی',
  team_member: 'ثبت ریسک، ارائه به‌روزرسانی و نظر',
  management: 'دسترسی فقط‌خواندنی به داشبورد و گزارش‌های مدیریتی',
}

/** Only project_manager/risk_manager may run formal reviews (new assessment snapshots) or delete risks. */
export function rmCanManage(role: RmUserRole | null | undefined): boolean {
  return role === 'project_manager' || role === 'risk_manager'
}

/** Everyone except the read-only "management" role may register risks, add actions and comment. */
export function rmCanEdit(role: RmUserRole | null | undefined): boolean {
  return role === 'project_manager' || role === 'risk_manager' || role === 'risk_owner' || role === 'team_member'
}

export type RmProjectStatus = 'active' | 'on_hold' | 'closed'

export const RM_PROJECT_STATUS_LABEL_FA: Record<RmProjectStatus, string> = {
  active: 'فعال',
  on_hold: 'متوقف‌شده',
  closed: 'بسته‌شده',
}

export interface RmProject {
  id: string
  name: string
  client: string
  projectManagerId: string | null
  startDate: string | null
  finishDate: string | null
  status: RmProjectStatus
  createdBy: string | null
  createdAt: string
}

export type RmRiskCategory = 'technical' | 'schedule' | 'cost' | 'hse' | 'procurement' | 'quality' | 'external' | 'other'

export const RM_CATEGORIES: RmRiskCategory[] = ['technical', 'schedule', 'cost', 'hse', 'procurement', 'quality', 'external', 'other']

export const RM_CATEGORY_LABEL_FA: Record<RmRiskCategory, string> = {
  technical: 'فنی/مهندسی',
  schedule: 'زمان‌بندی',
  cost: 'هزینه',
  hse: 'HSE و ایمنی',
  procurement: 'تامین کالا',
  quality: 'کیفیت',
  external: 'محیطی/خارجی',
  other: 'سایر',
}

export type RmRiskType = 'threat' | 'opportunity'

export const RM_RISK_TYPE_LABEL_FA: Record<RmRiskType, string> = {
  threat: 'تهدید',
  opportunity: 'فرصت',
}

export type RmRiskStatus = 'open' | 'monitoring' | 'escalated' | 'closed'

export const RM_RISK_STATUSES: RmRiskStatus[] = ['open', 'monitoring', 'escalated', 'closed']

export const RM_RISK_STATUS_LABEL_FA: Record<RmRiskStatus, string> = {
  open: 'باز',
  monitoring: 'در حال پایش',
  escalated: 'تشدیدشده',
  closed: 'بسته‌شده',
}

export const RM_RISK_STATUS_COLOR: Record<RmRiskStatus, string> = {
  open: '#e74c3c',
  monitoring: '#f1c40f',
  escalated: '#c026d3',
  closed: '#2ecc71',
}

export type RmResponseStrategy = 'avoid' | 'mitigate' | 'transfer' | 'accept' | 'exploit'

export const RM_RESPONSE_STRATEGIES: RmResponseStrategy[] = ['avoid', 'mitigate', 'transfer', 'accept', 'exploit']

export const RM_RESPONSE_STRATEGY_LABEL_FA: Record<RmResponseStrategy, string> = {
  avoid: 'اجتناب',
  mitigate: 'کاهش',
  transfer: 'انتقال',
  accept: 'پذیرش',
  exploit: 'بهره‌برداری (فرصت)',
}

export type RmProjectPhase = 'engineering' | 'procurement' | 'construction' | 'commissioning'

export const RM_PROJECT_PHASES: RmProjectPhase[] = ['engineering', 'procurement', 'construction', 'commissioning']

export const RM_PROJECT_PHASE_LABEL_FA: Record<RmProjectPhase, string> = {
  engineering: 'مهندسی',
  procurement: 'تامین کالا',
  construction: 'ساخت و نصب',
  commissioning: 'راه‌اندازی',
}

export type RmTrend = 'improving' | 'stable' | 'worsening'

export const RM_TREND_LABEL_FA: Record<RmTrend, string> = {
  improving: 'رو به بهبود',
  stable: 'ثابت',
  worsening: 'رو به وخامت',
}

export const RM_TREND_COLOR: Record<RmTrend, string> = {
  improving: '#2ecc71',
  stable: '#94a3b8',
  worsening: '#e74c3c',
}

export interface RmRisk {
  id: string
  projectId: string
  code: string
  title: string
  description: string
  category: RmRiskCategory
  riskType: RmRiskType
  ownerId: string | null
  identifiedDate: string
  status: RmRiskStatus
  responseStrategy: RmResponseStrategy
  projectPhase: RmProjectPhase | null
  timeToImpactDays: number | null
  initialProbability: number
  initialImpact: number
  initialScore: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface RmRiskAssessment {
  id: string
  riskId: string
  reviewDate: string
  currentProbability: number
  currentImpact: number
  currentScore: number
  residualProbability: number
  residualImpact: number
  residualScore: number
  trend: RmTrend
  reviewerComment: string
  createdBy: string | null
  createdAt: string
}

export type RmActionStatus = 'not_started' | 'in_progress' | 'completed'

export const RM_ACTION_STATUSES: RmActionStatus[] = ['not_started', 'in_progress', 'completed']

export const RM_ACTION_STATUS_LABEL_FA: Record<RmActionStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
}

export interface RmRiskAction {
  id: string
  riskId: string
  description: string
  ownerId: string | null
  dueDate: string | null
  status: RmActionStatus
  completionPercentage: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface RmRiskHistoryEntry {
  id: string
  riskId: string
  userId: string | null
  activity: string
  previousValue: unknown
  newValue: unknown
  comment: string
  createdAt: string
}
