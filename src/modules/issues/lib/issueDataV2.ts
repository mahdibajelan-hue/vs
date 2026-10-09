import type { ImExtension, ImTask, ImTaskStatus } from '../types'

export interface ImTaskRow {
  id: string; issue_id: string; title: string; executor_id: string | null; approver_id: string | null
  start_date: string | null; due_date: string | null; original_due_date: string | null; extension_count: number
  status: string; progress: number; blocked_kind: string | null; blocked_since: string | null
  completion_claimed_at: string | null; verified_at: string | null; verified_by: string | null; last_progress_at: string | null
  description?: string; expected_output?: string
}
export const imTaskFromRow = (r: ImTaskRow): ImTask => ({
  id: r.id, issueId: r.issue_id, title: r.title, executorId: r.executor_id, approverId: r.approver_id, startDate: r.start_date, dueDate: r.due_date,
  originalDueDate: r.original_due_date, extensionCount: r.extension_count ?? 0, status: r.status as ImTaskStatus, progress: r.progress ?? 0,
  blockedKind: r.blocked_kind, blockedSince: r.blocked_since, completionClaimedAt: r.completion_claimed_at, verifiedAt: r.verified_at,
  verifiedBy: r.verified_by, lastProgressAt: r.last_progress_at,
})

export interface ImExtensionRow { id: string; issue_id: string; task_id: string | null; from_due: string; to_due: string; reason: string; status: string; requested_by: string | null; requested_at: string }
export const imExtensionFromRow = (r: ImExtensionRow): ImExtension => ({
  id: r.id, issueId: r.issue_id, taskId: r.task_id, fromDue: r.from_due, toDue: r.to_due, reason: r.reason,
  status: r.status as ImExtension['status'], requestedBy: r.requested_by, requestedAt: r.requested_at,
})

export interface ImEvent { id: number | string; issueId: string; taskId: string | null; kind: string; field: string | null; oldValue: string | null; newValue: string | null; reason: string | null; actorId: string | null; at: string; meta: Record<string, unknown> }
export interface ImEventRow { id: number | string; issue_id: string; task_id: string | null; kind: string; field: string | null; old_value: string | null; new_value: string | null; reason: string | null; actor_id: string | null; at: string; meta: Record<string, unknown> | null }
export const imEventFromRow = (r: ImEventRow): ImEvent => ({ id: r.id, issueId: r.issue_id, taskId: r.task_id, kind: r.kind, field: r.field, oldValue: r.old_value, newValue: r.new_value, reason: r.reason, actorId: r.actor_id, at: r.at, meta: r.meta ?? {} })

export interface ImLink { id: string; issueId: string; targetType: string; targetId: string; targetLabel: string; relation: string }
export interface ImAttachment { id: string; issueId: string; taskId: string | null; kind: string; storagePath: string; fileName: string; mime: string; sizeBytes: number; note: string; uploadedAt: string }
export interface ImRca { id: string; issueId: string; method: 'five_whys' | 'fishbone' | 'free'; data: Record<string, unknown>; rootCause: string; confirmed: boolean }
export interface ImCapa { id: string; issueId: string; kind: 'corrective' | 'preventive'; description: string; ownerId: string | null; dueDate: string | null; status: string; effectiveness: string | null; effectivenessNote: string }

const EVENT_FA: Record<string, string> = {
  created: 'ثبت شد', deleted: 'حذف شد', stage_change: 'تغییر مرحله', assignment_change: 'تغییر مسئول', field_change: 'تغییر مشخصه', due_change: 'تغییر سررسید',
  blocked: 'مسدود شد', unblocked: 'رفع انسداد', extension_requested: 'درخواست تمدید', extension_approved: 'تمدید تأیید شد', extension_rejected: 'تمدید رد شد',
  task_created: 'اقدام ایجاد شد', task_status: 'وضعیت اقدام', task_assignment: 'مسئول اقدام', task_due_change: 'سررسید اقدام',
}
export const eventLabel = (kind: string) => EVENT_FA[kind] ?? kind
