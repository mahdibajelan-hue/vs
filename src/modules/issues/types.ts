export type ImUserRole = 'admin' | 'pursuer' | 'approver'

export const IM_ROLES: ImUserRole[] = ['admin', 'pursuer', 'approver']

export const IM_ROLE_LABEL_FA: Record<ImUserRole, string> = {
  admin: 'مدیر سیستم',
  pursuer: 'مسئول انجام',
  approver: 'مسئول تایید',
}

export function imCanManage(role: ImUserRole | null | undefined): boolean {
  return role === 'admin'
}

export interface ImProject {
  id: string
  name: string
  description: string
  createdBy: string | null
  createdAt: string
}

export type ImIssuePriority = 'low' | 'medium' | 'high' | 'critical'

export const IM_PRIORITIES: ImIssuePriority[] = ['low', 'medium', 'high', 'critical']

export const IM_PRIORITY_LABEL_FA: Record<ImIssuePriority, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'بالا',
  critical: 'بحرانی',
}

export const IM_PRIORITY_COLOR: Record<ImIssuePriority, string> = {
  low: 'var(--im-muted-2)',
  medium: 'var(--im-amber)',
  high: '#ff9d6e',
  critical: 'var(--im-coral)',
}

export type ImIssueStatus = 'open' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'

export const IM_STATUSES: ImIssueStatus[] = ['open', 'in_progress', 'pending_approval', 'approved', 'rejected']

export const IM_STATUS_LABEL_FA: Record<ImIssueStatus, string> = {
  open: 'باز',
  in_progress: 'در حال اقدام',
  pending_approval: 'منتظر تایید',
  approved: 'تایید شده',
  rejected: 'رد شده',
}

export const IM_STATUS_COLOR: Record<ImIssueStatus, string> = {
  open: 'var(--im-violet)',
  in_progress: 'var(--im-amber)',
  pending_approval: 'var(--im-muted-2)',
  approved: 'var(--im-mint)',
  rejected: 'var(--im-coral)',
}

export type ImIssueSource = 'manual' | 'lifecycle_action' | 'mission_debrief' | 'land_acquisition' | 'risk' | 'correspondence' | 'meeting' | 'report' | 'import' | 'api'

export interface ImIssue {
  id: string
  projectId: string
  title: string
  description: string
  pursuerId: string | null
  approverId: string | null
  priority: ImIssuePriority
  deadlineDays: number
  deadlineDate: string
  actionDate: string | null
  status: ImIssueStatus
  closedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  source: ImIssueSource
  relatedActionId: string | null
  /** v2 (all optional so legacy callers keep compiling) */
  code?: string
  stage?: ImStage
  severity?: ImIssuePriority
  urgency?: ImIssuePriority
  category?: string | null
  discipline?: string
  location?: string
  identifiedAt?: string | null
  ownerId?: string | null
  followUpId?: string | null
  resolveDueDate?: string | null
  originalDueDate?: string | null
  extensionCount?: number
  rootCauseSummary?: string
  rootCauseConfirmed?: boolean
  acceptanceCriteria?: string
  resolutionSummary?: string
  reopenCount?: number
  blockedSince?: string | null
  blockedKind?: string | null
  externalSystem?: string | null
  externalId?: string | null
  syncStatus?: string
  corporateIssueId?: string | null
  tags?: string[]
}

export type ImStage =
  | 'registered' | 'validated' | 'analysis' | 'action_plan' | 'in_progress' | 'resolution_review'
  | 'effectiveness_check' | 'closed' | 'returned' | 'reopened' | 'cancelled' | 'duplicate'

export type ImTaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'pending_verification' | 'done' | 'cancelled'

export interface ImTask {
  id: string
  issueId: string
  title: string
  executorId: string | null
  approverId: string | null
  startDate: string | null
  dueDate: string | null
  originalDueDate: string | null
  extensionCount: number
  status: ImTaskStatus
  progress: number
  blockedKind: string | null
  blockedSince: string | null
  completionClaimedAt: string | null
  verifiedAt: string | null
  verifiedBy: string | null
  lastProgressAt: string | null
  dependsOn?: string[]
}

export interface ImExtension {
  id: string
  issueId: string
  taskId: string | null
  fromDue: string
  toDue: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedBy: string | null
  requestedAt: string
}
