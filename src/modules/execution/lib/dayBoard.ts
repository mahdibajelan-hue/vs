import type { Report } from '../types'

/** where one daily form (or the daily work report) stands for a day and a front */
export type DayState = 'todo' | 'open' | 'sent' | 'approved' | 'rejected'
export interface DayCell { formKey: string; state: DayState; report: Report | null }

const OPEN = new Set(['draft', 'returned', 'incomplete']), SENT = new Set(['submitted', 'partially_approved'])

/**
 * One report per form, day and front. The day's tile is «todo» until a report exists, «open» while it is a draft (the
 * same report is continued, never a second one), and closed once sent («sent») or approved. A rejected report leaves the
 * tile free for a new one. A completion report (gap follow-up) does not count as the day's report.
 */
export function dayCell(reports: Report[], formKey: string, date: string, front: string): DayCell {
  const mine = reports.filter((r) => r.formKey === formKey && r.reportDate === date && (r.front ?? '') === front && !r.completionOf)
  const live = mine.find((r) => r.status !== 'rejected')
  if (!live) return { formKey, state: mine.length ? 'rejected' : 'todo', report: mine[0] ?? null }
  return { formKey, report: live, state: OPEN.has(live.status) ? 'open' : SENT.has(live.status) ? 'sent' : live.status === 'approved' ? 'approved' : 'open' }
}

export const isClosed = (s: DayState) => s === 'sent' || s === 'approved'

/** the day's board: one cell per form, and how many are closed */
export function dayBoard(reports: Report[], formKeys: string[], date: string, front: string) {
  const cells = formKeys.map((k) => dayCell(reports, k, date, front))
  return { cells, closed: cells.filter((c) => isClosed(c.state)).length, open: cells.filter((c) => c.state === 'open').length, total: cells.length }
}
