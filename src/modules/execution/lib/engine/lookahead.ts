import { addDays } from '../periods'

export interface LookaheadItem { id: string; weekStart: string; activityId: string; front: string; responsible: string; plannedQty: number; committed: boolean; achievedQty: number | null; deviationCause: string; recoveryPlan: string }

/** Percent Plan Complete of a past week: committed items whose achieved quantity reached `threshold` of the commitment ÷ committed items. */
export function ppc(items: LookaheadItem[], weekStart: string, threshold = 0.9): { committed: number; met: number; ppc: number | null } {
  const c = items.filter((i) => i.weekStart === weekStart && i.committed)
  const met = c.filter((i) => (i.achievedQty ?? 0) >= i.plannedQty * threshold - 1e-9).length
  return { committed: c.length, met, ppc: c.length ? met / c.length : null }
}
export function deviationCauses(items: LookaheadItem[]): { cause: string; count: number }[] {
  const m = new Map<string, number>()
  for (const i of items) if (i.committed && i.achievedQty != null && i.achievedQty < i.plannedQty * 0.9 && i.deviationCause.trim()) m.set(i.deviationCause.trim(), (m.get(i.deviationCause.trim()) ?? 0) + 1)
  return [...m].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count)
}
export interface WeekCell { weekStart: string; weekEnd: string; items: LookaheadItem[]; overCommit: LookaheadItem[] }
/** Three consecutive weeks from the week containing `today`; an item is over-committed when its planned quantity exceeds the predicted weekly capacity of its activity. */
export function lookaheadWeeks(items: LookaheadItem[], today: string, weekStart: number, weekdayOf: (iso: string) => number, capacityPerWeek: Map<string, number | null>, weeks = 3): WeekCell[] {
  const back = (weekdayOf(today) - weekStart + 7) % 7
  const first = addDays(today, -back)
  return Array.from({ length: weeks }, (_, k) => {
    const ws = addDays(first, 7 * k)
    const its = items.filter((i) => i.weekStart === ws)
    return { weekStart: ws, weekEnd: addDays(ws, 6), items: its, overCommit: its.filter((i) => { const c = capacityPerWeek.get(i.activityId); return c != null && i.plannedQty > c * 1.05 }) }
  })
}
