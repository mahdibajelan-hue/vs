export type ReportType = 'daily' | 'weekly' | 'monthly' | 'management'

export const REPORT_TYPES: ReportType[] = ['daily', 'weekly', 'monthly', 'management']

export const REPORT_TYPE_LABEL_FA: Record<ReportType, string> = {
  daily: 'گزارش روزانه',
  weekly: 'گزارش هفتگی',
  monthly: 'گزارش ماهانه',
  management: 'گزارش مدیریتی',
}

export type ReportStatus = 'draft' | 'under_review' | 'approved' | 'issued' | 'revised' | 'archived'

export const REPORT_STATUSES: ReportStatus[] = ['draft', 'under_review', 'approved', 'issued', 'revised', 'archived']

export const REPORT_STATUS_LABEL_FA: Record<ReportStatus, string> = {
  draft: 'پیش‌نویس',
  under_review: 'در حال بازبینی',
  approved: 'تاییدشده',
  issued: 'صادرشده',
  revised: 'بازنگری‌شده',
  archived: 'بایگانی‌شده',
}

export interface ReportProfile {
  id: string
  name: string
  reportType: ReportType
  description: string
  widgetIds: string[]
  isSystem: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Computed widget output at generation time, keyed by widget id — the frozen part of a snapshot. */
export type ReportPayload = Record<string, unknown>

export interface ReportSnapshot {
  id: string
  masterProjectId: string
  reportType: ReportType
  profileId: string | null
  reportNumber: string
  revision: number
  status: ReportStatus
  periodStart: string | null
  periodEnd: string | null
  payload: ReportPayload
  widgetIds: string[]
  createdBy: string | null
  createdAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  issuedAt: string | null
}

export type DecisionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'deferred'

export const DECISION_STATUSES: DecisionStatus[] = ['pending', 'in_review', 'approved', 'rejected', 'deferred']

export const DECISION_STATUS_LABEL_FA: Record<DecisionStatus, string> = {
  pending: 'در انتظار',
  in_review: 'در حال بررسی',
  approved: 'تاییدشده',
  rejected: 'ردشده',
  deferred: 'به‌تعویق‌افتاده',
}

export interface Decision {
  id: string
  masterProjectId: string
  title: string
  description: string
  reason: string
  requiredBy: string | null
  impact: string
  recommendedAction: string
  decisionOwnerId: string | null
  status: DecisionStatus
  finalDecision: string
  decidedAt: string | null
  relatedRiskId: string | null
  relatedIssueId: string | null
  relatedMilestoneLabel: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type RastaActionPriority = 'low' | 'medium' | 'high' | 'critical'
export type RastaActionStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled'
export type RastaActionSource = 'risk' | 'issue' | 'decision' | 'management_report'

export const RASTA_ACTION_PRIORITIES: RastaActionPriority[] = ['low', 'medium', 'high', 'critical']
export const RASTA_ACTION_PRIORITY_LABEL_FA: Record<RastaActionPriority, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  critical: 'بحرانی',
}

export const RASTA_ACTION_STATUSES: RastaActionStatus[] = ['not_started', 'in_progress', 'completed', 'cancelled']
export const RASTA_ACTION_STATUS_LABEL_FA: Record<RastaActionStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
}

export const RASTA_ACTION_SOURCE_LABEL_FA: Record<RastaActionSource, string> = {
  risk: 'ریسک',
  issue: 'مسئله',
  decision: 'تصمیم مدیریتی',
  management_report: 'گزارش مدیریتی',
}

export interface RastaAction {
  id: string
  masterProjectId: string
  title: string
  ownerId: string | null
  dueDate: string | null
  priority: RastaActionPriority
  status: RastaActionStatus
  source: RastaActionSource
  sourceDecisionId: string | null
  relatedRiskId: string | null
  relatedIssueId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type WidgetCategory = 'executive' | 'progress' | 'risk' | 'issue' | 'intelligence' | 'decision'

export const WIDGET_CATEGORY_LABEL_FA: Record<WidgetCategory, string> = {
  executive: 'شاخص‌های اجرایی',
  progress: 'پیشرفت پروژه (PipePulse)',
  risk: 'ریسک',
  issue: 'مسائل',
  intelligence: 'هوشمندی و تحلیل',
  decision: 'مرکز تصمیم',
}

/** Semantic status used consistently as icon + label + value + trend, never color alone (spec constraint). */
export type SemanticTone = 'good' | 'attention' | 'critical' | 'info' | 'neutral'

export const SEMANTIC_TONE_COLOR: Record<SemanticTone, string> = {
  good: '#2ecc71',
  attention: '#f1c40f',
  critical: '#e74c3c',
  info: '#38bdf8',
  neutral: '#94a3b8',
}
