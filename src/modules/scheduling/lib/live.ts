import type { SchActivity, SchLink } from './types'

/**
 * «Live status»: the schedule's actuals taken from the work really approved in the execution module, so the forecast and every delay figure follow the site without importing a new file.
 * Only linked tasks change, and only when the linked execution activities have approved work: start = first approved report date, % = mean approved %, finish = last approved report date once all are complete.
 * The execution module's supervision-approved figure is the settled fact; where it disagrees with the file, it wins (and the activity is listed as changed).
 */
export interface ExecFact { approvedPct: number | null; firstDate: string | null; lastDate: string | null }
export interface LiveResult { activities: SchActivity[]; dataDate: string | null; changed: string[]; unlinkedStarted: number }

export function applyLiveStatus(acts: SchActivity[], links: SchLink[], facts: Map<string, ExecFact>, lastApprovedDate: string | null): LiveResult {
  const byUid = new Map<string, ExecFact[]>()
  for (const l of links) {
    if (l.targetType !== 'exec_activity') continue
    const f = facts.get(l.targetId); if (!f) continue
    byUid.set(l.activityUid, [...(byUid.get(l.activityUid) ?? []), f])
  }
  const changed: string[] = []
  const out = acts.map((a) => {
    if (a.type !== 'task') return a
    const fs = byUid.get(a.uid); if (!fs?.length) return a
    const pcts = fs.map((f) => f.approvedPct).filter((x): x is number => x != null)
    if (!pcts.length) return a
    const pct = Math.min(100, pcts.reduce((s, x) => s + x, 0) / pcts.length)
    const starts = fs.map((f) => f.firstDate).filter((x): x is string => !!x).sort()
    if (pct <= 0 && !starts.length) return a
    const done = pct >= 99.5 && fs.every((f) => (f.approvedPct ?? 0) >= 99.5)
    const lasts = fs.map((f) => f.lastDate).filter((x): x is string => !!x).sort()
    const actualStart = starts[0] ?? a.actualStart
    const actualFinish = done ? lasts[lasts.length - 1] ?? a.actualFinish : null
    const pctComplete = done ? 100 : Math.round(pct * 10) / 10
    const remDuration = done ? 0 : Math.round(a.origDuration * (1 - pct / 100) * 100) / 100
    if (actualStart === a.actualStart && actualFinish === a.actualFinish && pctComplete === a.pctComplete && remDuration === a.remDuration) return a
    changed.push(a.code)
    return { ...a, actualStart, actualFinish, pctComplete, remDuration }
  })
  // started according to the file but without any linked execution fact: the live figure cannot confirm it
  const linkedUids = new Set(byUid.keys())
  return { activities: out, dataDate: lastApprovedDate, changed, unlinkedStarted: out.filter((a) => a.type === 'task' && (a.actualStart || (a.pctComplete ?? 0) > 0) && !linkedUids.has(a.uid)).length }
}
