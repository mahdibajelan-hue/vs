import type { ImIssue } from '../types'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** b - a, in days. */
export function isoDiffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

export interface RingState {
  color: string
  label: string
  progress: number
  overdue: boolean
  days: number
}

/** Deadline countdown ring state — mirrors the reference app's ring computation exactly. */
export function ringState(issue: ImIssue, today = todayIso()): RingState {
  if (issue.status === 'approved') return { color: 'var(--im-mint)', label: '✓', progress: 1, overdue: false, days: 0 }
  if (issue.status === 'rejected') return { color: 'var(--im-coral)', label: '✕', progress: 1, overdue: false, days: 0 }

  const diff = isoDiffDays(today, issue.deadlineDate)
  if (diff < 0) {
    return { color: 'var(--im-coral)', label: `+${-diff}`, progress: 1, overdue: true, days: -diff }
  }
  const total = Math.max(1, isoDiffDays(issue.createdAt.slice(0, 10), issue.deadlineDate))
  const elapsed = Math.max(0, isoDiffDays(issue.createdAt.slice(0, 10), today))
  const progress = Math.min(1, elapsed / total)
  const color = diff <= 2 ? 'var(--im-amber)' : 'var(--im-mint)'
  return { color, label: String(diff), progress, overdue: false, days: diff }
}

export function isIssueOpen(issue: ImIssue): boolean {
  return issue.status !== 'approved' && issue.status !== 'rejected'
}

export function isIssueOverdue(issue: ImIssue, today = todayIso()): boolean {
  return isIssueOpen(issue) && isoDiffDays(today, issue.deadlineDate) < 0
}
