import type { ImIssue, ImIssuePriority, ImIssueStatus, ImProject } from '../types'

export interface ImProjectRow {
  id: string
  name: string
  description: string
  created_by: string | null
  created_at: string
}

export function imProjectFromRow(r: ImProjectRow): ImProject {
  return { id: r.id, name: r.name, description: r.description, createdBy: r.created_by, createdAt: r.created_at }
}

export interface ImIssueRow {
  id: string
  project_id: string
  title: string
  description: string
  pursuer_id: string | null
  approver_id: string | null
  priority: string
  deadline_days: number
  deadline_date: string
  action_date: string | null
  status: string
  closed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function imIssueFromRow(r: ImIssueRow): ImIssue {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    pursuerId: r.pursuer_id,
    approverId: r.approver_id,
    priority: r.priority as ImIssuePriority,
    deadlineDays: r.deadline_days,
    deadlineDate: r.deadline_date,
    actionDate: r.action_date,
    status: r.status as ImIssueStatus,
    closedAt: r.closed_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function imIssueToRow(projectId: string, i: Partial<ImIssue>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (i.title !== undefined) row.title = i.title
  if (i.description !== undefined) row.description = i.description
  if (i.pursuerId !== undefined) row.pursuer_id = i.pursuerId
  if (i.approverId !== undefined) row.approver_id = i.approverId
  if (i.priority !== undefined) row.priority = i.priority
  if (i.deadlineDays !== undefined) row.deadline_days = i.deadlineDays
  if (i.actionDate !== undefined) row.action_date = i.actionDate
  if (i.status !== undefined) row.status = i.status
  if (i.closedAt !== undefined) row.closed_at = i.closedAt
  return row
}
