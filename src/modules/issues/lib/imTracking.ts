import type { ImIssue, ImIssuePriority, ImTask } from '../types'
import type { ImDecision } from './imDecisions'
import { IM_STAGE_LABEL_FA, IM_TASK_STATUS_LABEL_FA, dayDiff, effectiveDue, isClosedIssue, isTaskOpen, priorityRank, stageOf } from './imModel'

export type ItemKind = 'issue' | 'task' | 'decision'

export interface TrackItem {
  key: string
  kind: ItemKind
  id: string
  issueId: string | null
  projectId: string
  title: string
  code: string
  done: boolean
  /** ISO due date (effective). null = no due date */
  due: string | null
  /** positive = days late (open items only); 0 otherwise */
  lateDays: number
  /** days left for open items in time (>= 0), null when late/done/no due */
  leftDays: number | null
  statusLabel: string
  severity: ImIssuePriority | null
  assigneeId: string | null
  blocked: boolean
}

export function itemFromIssue(i: ImIssue, today: string): TrackItem {
  const due = effectiveDue(i)
  const done = isClosedIssue(i) || stageOf(i) === 'cancelled' || stageOf(i) === 'duplicate'
  const diff = dayDiff(today, due)
  return {
    key: 'i:' + i.id, kind: 'issue', id: i.id, issueId: i.id, projectId: i.projectId, title: i.title, code: i.code ?? '', done, due,
    lateDays: !done && diff < 0 ? -diff : 0, leftDays: !done && diff >= 0 ? diff : null,
    statusLabel: IM_STAGE_LABEL_FA[stageOf(i)], severity: i.severity ?? i.priority, assigneeId: i.pursuerId ?? i.followUpId ?? i.ownerId ?? null, blocked: !!i.blockedSince,
  }
}

export function itemFromTask(t: ImTask, issue: ImIssue, today: string): TrackItem {
  const done = !isTaskOpen(t)
  const diff = t.dueDate ? dayDiff(today, t.dueDate) : null
  return {
    key: 't:' + t.id, kind: 'task', id: t.id, issueId: t.issueId, projectId: issue.projectId, title: t.title, code: issue.code ?? '', done, due: t.dueDate,
    lateDays: !done && diff !== null && diff < 0 ? -diff : 0, leftDays: !done && diff !== null && diff >= 0 ? diff : null,
    statusLabel: IM_TASK_STATUS_LABEL_FA[t.status], severity: issue.severity ?? issue.priority, assigneeId: t.executorId, blocked: t.status === 'blocked',
  }
}

export function itemFromDecision(d: ImDecision, projectId: string, today: string): TrackItem {
  const done = d.status === 'decided' || d.status === 'cancelled'
  const diff = d.neededBy ? dayDiff(today, d.neededBy) : null
  return {
    key: 'd:' + d.id, kind: 'decision', id: d.id, issueId: d.issueId, projectId, title: d.title, code: d.code, done, due: d.neededBy,
    lateDays: !done && diff !== null && diff < 0 ? -diff : 0, leftDays: !done && diff !== null && diff >= 0 ? diff : null,
    statusLabel: d.status === 'decided' ? 'اتخاذ شد' : d.status === 'cancelled' ? 'لغو شد' : d.status === 'deferred' ? 'به تعویق افتاد' : 'منتظر تصمیم',
    severity: null, assigneeId: d.deciderId, blocked: false,
  }
}

export function buildItems(issues: ImIssue[], tasks: ImTask[], decisions: ImDecision[], today: string, kinds: ItemKind[] = ['issue', 'task']): TrackItem[] {
  const out: TrackItem[] = []
  const byId = new Map(issues.map((i) => [i.id, i]))
  if (kinds.includes('issue')) for (const i of issues) out.push(itemFromIssue(i, today))
  if (kinds.includes('task')) for (const t of tasks) { const i = byId.get(t.issueId); if (i) out.push(itemFromTask(t, i, today)) }
  if (kinds.includes('decision')) for (const d of decisions) out.push(itemFromDecision(d, d.projectId, today))
  return out
}

/** Open items first (most late first, then nearest due), finished items last (most recent due first). */
export function sortItems(items: TrackItem[]): TrackItem[] {
  const open = items.filter((x) => !x.done).sort((a, b) => b.lateDays - a.lateDays || (a.due ?? '9999').localeCompare(b.due ?? '9999') || (b.severity ? priorityRank(b.severity) : 0) - (a.severity ? priorityRank(a.severity) : 0))
  const done = items.filter((x) => x.done).sort((a, b) => (b.due ?? '').localeCompare(a.due ?? ''))
  return [...open, ...done]
}

export interface TrackGroup { projectId: string; items: TrackItem[]; open: number; late: number; done: number; blocked: number; progress: number }

export function groupByProject(items: TrackItem[]): TrackGroup[] {
  const m = new Map<string, TrackItem[]>()
  for (const it of items) m.set(it.projectId, [...(m.get(it.projectId) ?? []), it])
  const groups = [...m.entries()].map(([projectId, list]) => {
    const sorted = sortItems(list)
    const done = sorted.filter((x) => x.done).length
    return { projectId, items: sorted, open: sorted.length - done, late: sorted.filter((x) => x.lateDays > 0).length, done, blocked: sorted.filter((x) => x.blocked && !x.done).length, progress: sorted.length ? Math.round((done / sorted.length) * 100) : 0 }
  })
  return groups.sort((a, b) => b.late - a.late || b.open - a.open)
}

/** Human delay text used in the list: «۹ روز تأخیر» / «امروز سررسید» / «۳ روز مانده» / «انجام‌شده». */
export function delayText(it: Pick<TrackItem, 'done' | 'lateDays' | 'leftDays' | 'due'>): { text: string; tone: 'done' | 'late' | 'today' | 'soon' | 'ok' | 'none' } {
  if (it.done) return { text: 'انجام‌شده', tone: 'done' }
  if (it.lateDays > 0) return { text: `${it.lateDays} روز تأخیر`, tone: 'late' }
  if (it.leftDays === 0) return { text: 'امروز سررسید', tone: 'today' }
  if (it.leftDays !== null) return { text: `${it.leftDays} روز مانده`, tone: it.leftDays <= 3 ? 'soon' : 'ok' }
  return { text: 'بدون سررسید', tone: 'none' }
}
