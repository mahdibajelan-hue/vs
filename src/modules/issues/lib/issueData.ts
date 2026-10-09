import type { ImIssue, ImIssuePriority, ImIssueSource, ImIssueStatus, ImProject, ImStage } from '../types'

export interface ImProjectRow {
  id: string
  name: string
  description: string
  created_by: string | null
  created_at: string
  scope_level?: string | null
}

export function imProjectFromRow(r: ImProjectRow): ImProject {
  return { id: r.id, name: r.name, description: r.description, createdBy: r.created_by, createdAt: r.created_at, scopeLevel: (r.scope_level as ImProject['scopeLevel']) ?? 'project' }
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
  source: string
  related_action_id: string | null
  // v2 columns (select * returns them; optional so older fixtures still parse)
  code?: string | null
  stage?: string | null
  severity?: string | null
  urgency?: string | null
  category?: string | null
  discipline?: string | null
  location?: string | null
  identified_at?: string | null
  owner_id?: string | null
  follow_up_id?: string | null
  resolve_due_date?: string | null
  original_due_date?: string | null
  extension_count?: number | null
  root_cause_summary?: string | null
  root_cause_confirmed?: boolean | null
  acceptance_criteria?: string | null
  resolution_summary?: string | null
  reopen_count?: number | null
  blocked_since?: string | null
  blocked_kind?: string | null
  external_system?: string | null
  external_id?: string | null
  sync_status?: string | null
  corporate_issue_id?: string | null
  tags?: string[] | null
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
    source: (r.source as ImIssueSource) ?? 'manual',
    relatedActionId: r.related_action_id,
    code: r.code ?? undefined,
    stage: (r.stage as ImStage | null) ?? undefined,
    severity: (r.severity as ImIssuePriority | null) ?? undefined,
    urgency: (r.urgency as ImIssuePriority | null) ?? undefined,
    category: r.category ?? null,
    discipline: r.discipline ?? '',
    location: r.location ?? '',
    identifiedAt: r.identified_at ?? null,
    ownerId: r.owner_id ?? null,
    followUpId: r.follow_up_id ?? null,
    resolveDueDate: r.resolve_due_date ?? null,
    originalDueDate: r.original_due_date ?? null,
    extensionCount: r.extension_count ?? 0,
    rootCauseSummary: r.root_cause_summary ?? '',
    rootCauseConfirmed: r.root_cause_confirmed ?? false,
    acceptanceCriteria: r.acceptance_criteria ?? '',
    resolutionSummary: r.resolution_summary ?? '',
    reopenCount: r.reopen_count ?? 0,
    blockedSince: r.blocked_since ?? null,
    blockedKind: r.blocked_kind ?? null,
    externalSystem: r.external_system ?? null,
    externalId: r.external_id ?? null,
    syncStatus: r.sync_status ?? 'none',
    corporateIssueId: r.corporate_issue_id ?? null,
    tags: r.tags ?? [],
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
