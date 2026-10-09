import type { ImIssue, ImUserRole } from '../types'

/** Client mirror of im_actor_roles(): drives which buttons are offered. The database enforces the same rules. */
export function actorRoles(issue: ImIssue, projectRole: ImUserRole | null, userId: string | null | undefined): string[] {
  const r: string[] = []
  if (!userId) return r
  if (projectRole === 'admin') r.push('admin')
  if (issue.ownerId === userId) r.push('owner')
  if (issue.pursuerId === userId) r.push('pursuer')
  if (issue.approverId === userId) r.push('approver')
  if (issue.followUpId === userId) r.push('follow_up')
  if (projectRole) r.push('member')
  return r
}
