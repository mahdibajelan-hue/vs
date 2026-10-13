import type { InboxGroup, InboxItem, InboxSource } from '../types'
import { KIND_META } from '../types'

export interface InboxFilter { q: string; source: InboxSource | 'all'; group: InboxGroup | 'all'; project: string; urgentOnly: boolean }
export const EMPTY_FILTER: InboxFilter = { q: '', source: 'all', group: 'all', project: '', urgentOnly: false }

const day = 86400000
/** Ordering rule of the inbox: overdue / urgent first, then closest due date, then the longest-waiting. */
export function rank(a: InboxItem, b: InboxItem, now = Date.now()): number {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
  const da = a.due ? Date.parse(a.due) : Infinity, db = b.due ? Date.parse(b.due) : Infinity
  if (da !== db) return da < db ? -1 : 1
  return Math.abs(Date.parse(a.since) - now) < Math.abs(Date.parse(b.since) - now) ? 1 : -1
}

export function applyFilter(items: InboxItem[], f: InboxFilter, snoozed: ReadonlySet<string> = new Set()): InboxItem[] {
  const q = f.q.trim()
  return items
    .filter((i) => !snoozed.has(i.key))
    .filter((i) => (f.source === 'all' || i.source === f.source) && (f.group === 'all' || KIND_META[i.kind].group === f.group) && (!f.project || i.projectName === f.project) && (!f.urgentOnly || i.urgent))
    .filter((i) => !q || `${i.title} ${i.sub} ${i.projectName} ${KIND_META[i.kind].label}`.includes(q))
    .sort((a, b) => rank(a, b))
}

export function counts(items: InboxItem[]) {
  const bySource = new Map<InboxSource, number>(), byGroup = new Map<InboxGroup, number>()
  for (const i of items) { bySource.set(i.source, (bySource.get(i.source) ?? 0) + 1); const g = KIND_META[i.kind].group; byGroup.set(g, (byGroup.get(g) ?? 0) + 1) }
  return { total: items.length, urgent: items.filter((i) => i.urgent).length, bySource, byGroup }
}

/** Whole days between now and the item's due date (negative = overdue), or null without a due date. */
export function dueIn(due: string | null, now = Date.now()): number | null {
  if (!due) return null
  const d = Date.parse(due.slice(0, 10) + 'T00:00:00')
  const t = new Date(now); t.setHours(0, 0, 0, 0)
  return Math.round((d - t.getTime()) / day)
}
