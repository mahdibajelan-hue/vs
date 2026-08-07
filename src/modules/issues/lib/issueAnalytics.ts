import { IM_PRIORITIES, IM_STATUSES, type ImIssue, type ImIssuePriority, type ImIssueStatus } from '../types'
import { isIssueOpen, isoDiffDays, todayIso } from './issueRing'

export interface IssueMetrics {
  total: number
  closedCount: number
  onTimeRate: number
  closedRatio: number
  avgDays: number
  weekCounts: number[]
  trendClosedPct: number
}

/** On-time approval rate, closed ratio, average days-to-close (+ 6-week trend) — mirrors the reference app. */
export function computeIssueMetrics(issues: ImIssue[], today = todayIso()): IssueMetrics {
  const total = issues.length
  const closed = issues.filter((i) => i.status === 'approved' && i.closedAt)
  const onTime = closed.filter((i) => i.closedAt! <= i.deadlineDate)
  const onTimeRate = closed.length ? Math.round((onTime.length / closed.length) * 100) : 0
  const closedRatio = total ? Math.round((closed.length / total) * 100) : 0
  const avgDays = closed.length ? closed.reduce((s, i) => s + isoDiffDays(i.createdAt.slice(0, 10), i.closedAt!), 0) / closed.length : 0

  const weeks = 6
  const todayDate = new Date(today + 'T00:00:00')
  const weekCounts: number[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(todayDate)
    end.setDate(end.getDate() - w * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    const sIso = start.toISOString().slice(0, 10)
    const eIso = end.toISOString().slice(0, 10)
    weekCounts.push(closed.filter((i) => i.closedAt! >= sIso && i.closedAt! <= eIso).length)
  }
  const lastW = weekCounts[weekCounts.length - 1]
  const prevW = weekCounts[weekCounts.length - 2] || 0
  const trendClosedPct = prevW ? Math.round(((lastW - prevW) / prevW) * 100) : lastW > 0 ? 100 : 0

  return { total, closedCount: closed.length, onTimeRate, closedRatio, avgDays, weekCounts, trendClosedPct }
}

export function computeStatusDistribution(issues: ImIssue[]): { status: ImIssueStatus; count: number }[] {
  return IM_STATUSES.map((status) => ({ status, count: issues.filter((i) => i.status === status).length }))
}

export function computePriorityDistribution(issues: ImIssue[]): { priority: ImIssuePriority; count: number }[] {
  const open = issues.filter(isIssueOpen)
  return IM_PRIORITIES.map((priority) => ({ priority, count: open.filter((i) => i.priority === priority).length }))
}

/** Green >=66, amber >=33, else coral — used for the dashboard's semi-gauge colors. */
export function goodnessColor(g: number): string {
  if (g >= 66) return 'var(--im-mint)'
  if (g >= 33) return 'var(--im-amber)'
  return 'var(--im-coral)'
}
