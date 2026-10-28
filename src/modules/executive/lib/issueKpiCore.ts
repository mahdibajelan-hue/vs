/**
 * Portfolio issue indicators (moved here from the issue module's three-level analysis and extended).
 *
 * Every figure is computed from the issues themselves at each level (project, program, portfolio) — a program's
 * indicator is the indicator of all its projects' issues together, never an average of project averages.
 *
 *  backlog        open issues; of which critical / high
 *  overdueRate    open issues past their (resolve) due date ÷ open issues
 *  medianAge      median age in days of the open issues (since identified, else created)
 *  mttr           median days to close, issues closed in the last 90 days
 *  onTimeRate     share of issues closed in the last 90 days on or before their due date
 *  flowRatio      closed ÷ opened in the last 30 days — below 1 the backlog grows
 *  blocked        open issues marked blocked
 *  reopenRate     share of closed issues that were reopened at least once — quality of closure
 *  extendedRate   share of open issues whose due date was extended — schedule discipline
 *  rootCauseRate  share of closed issues (90 days) with a confirmed root cause — learning discipline
 *  trend          open backlog at the last six month-ends
 * Signal colours use explicit bands (ISSUE_BANDS), shown on the page.
 */
import type { ImIssue } from '../../issues/types'

export interface IssueKpi {
  total: number
  backlog: number
  critical: number
  high: number
  overdue: number
  overdueRate: number | null
  medianAge: number | null
  mttr: number | null
  badDates: number
  onTimeRate: number | null
  closed90: number
  opened30: number
  closed30: number
  flowRatio: number | null
  blocked: number
  reopenRate: number | null
  extendedRate: number | null
  rootCauseRate: number | null
  trend: { date: string; open: number }[]
  categories: { key: string; count: number }[]
}

export const ISSUE_BANDS = {
  overdueRate: { watch: 0.15, bad: 0.3 },
  flowRatio: { watch: 1, bad: 0.8 },
  reopenRate: { watch: 0.05, bad: 0.1 },
  onTimeRate: { watch: 0.8, bad: 0.6 },
}

const DAY = 86400000
const t = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

const isOpen = (i: ImIssue) => i.status !== 'approved' && i.status !== 'rejected'
const isClosed = (i: ImIssue) => i.status === 'approved' && !!i.closedAt
const due = (i: ImIssue) => i.resolveDueDate ?? i.deadlineDate ?? null
const born = (i: ImIssue) => (i.identifiedAt ?? i.createdAt).slice(0, 10)

export function monthEnds(today: string, n = 6): string[] {
  const d = new Date(`${today.slice(0, 10)}T00:00:00Z`)
  const out: string[] = []
  for (let k = n - 1; k >= 1; k--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k + 1, 0)).toISOString().slice(0, 10))
  out.push(today.slice(0, 10))
  return out
}

export function issueKpi(issues: ImIssue[], today: string): IssueKpi {
  const open = issues.filter(isOpen)
  const overdue = open.filter((i) => { const d = due(i); return !!d && d.slice(0, 10) < today })
  const closed = issues.filter(isClosed)
  const closed90 = closed.filter((i) => days(i.closedAt as string, today) <= 90)
  const opened30 = issues.filter((i) => days(born(i), today) <= 30).length
  const closed30 = closed.filter((i) => days(i.closedAt as string, today) <= 30).length
  const onTime = closed90.filter((i) => { const d = due(i); return !!d && (i.closedAt as string).slice(0, 10) <= d.slice(0, 10) })
  const cats = new Map<string, number>()
  for (const i of issues) { const k = i.category || 'بدون دسته'; cats.set(k, (cats.get(k) ?? 0) + 1) }
  return {
    total: issues.length,
    backlog: open.length,
    critical: open.filter((i) => i.priority === 'critical').length,
    high: open.filter((i) => i.priority === 'high').length,
    overdue: overdue.length,
    overdueRate: ratio(overdue.length, open.length),
    medianAge: median(open.map((i) => days(born(i), today))),
    // a close date before the identified date is a data-entry error: left out of the median, counted in badDates
    mttr: median(closed90.map((i) => days(born(i), i.closedAt as string)).filter((d) => d >= 0)),
    badDates: closed.filter((i) => days(born(i), i.closedAt as string) < 0).length,
    onTimeRate: ratio(onTime.length, closed90.length),
    closed90: closed90.length,
    opened30, closed30,
    flowRatio: opened30 > 0 ? closed30 / opened30 : null,
    blocked: open.filter((i) => !!i.blockedSince).length,
    reopenRate: ratio(closed.filter((i) => (i.reopenCount ?? 0) > 0).length, closed.length),
    extendedRate: ratio(open.filter((i) => (i.extensionCount ?? 0) > 0).length, open.length),
    rootCauseRate: ratio(closed90.filter((i) => i.rootCauseConfirmed).length, closed90.length),
    trend: monthEnds(today).map((d) => ({ date: d, open: issues.filter((i) => born(i) <= d && (!i.closedAt || i.closedAt.slice(0, 10) > d) && i.status !== 'rejected').length })),
    categories: [...cats].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
  }
}

export type Signal = 'good' | 'watch' | 'bad' | 'none'
export function signalOf(k: keyof typeof ISSUE_BANDS, v: number | null): Signal {
  if (v == null) return 'none'
  const b = ISSUE_BANDS[k]
  // overdue and reopen: higher is worse; flow and on-time: lower is worse
  if (k === 'overdueRate' || k === 'reopenRate') return v >= b.bad ? 'bad' : v >= b.watch ? 'watch' : 'good'
  return v < b.bad ? 'bad' : v < b.watch ? 'watch' : 'good'
}

/** categories that recur in several projects — a portfolio-level problem rather than a project one */
export function sharedCategories(byProject: { projectId: string; name: string; issues: ImIssue[] }[], minProjects = 2) {
  const m = new Map<string, { count: number; open: number; projects: Set<string> }>()
  for (const p of byProject) for (const i of p.issues) {
    if (!i.category) continue
    const e = m.get(i.category) ?? { count: 0, open: 0, projects: new Set() }
    e.count++; if (isOpen(i)) e.open++; e.projects.add(p.name)
    m.set(i.category, e)
  }
  return [...m].filter(([, e]) => e.projects.size >= minProjects).map(([key, e]) => ({ key, count: e.count, open: e.open, projects: [...e.projects] })).sort((a, b) => b.projects.length - a.projects.length || b.open - a.open)
}

/** projects ordered by pressure: critical overdue first, then overdue, then backlog — a ranking, not a score */
export function pressureOrder<T extends { kpi: IssueKpi; criticalOverdue: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.criticalOverdue - a.criticalOverdue || b.kpi.overdue - a.kpi.overdue || b.kpi.backlog - a.kpi.backlog)
}

export function criticalOverdue(issues: ImIssue[], today: string) {
  return issues.filter((i) => isOpen(i) && (i.priority === 'critical' || i.priority === 'high') && (() => { const d = due(i); return !!d && d.slice(0, 10) < today })()).length
}
