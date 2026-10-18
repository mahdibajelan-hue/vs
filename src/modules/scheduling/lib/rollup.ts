import { daysBetween } from '../../execution/lib/periods'
import type { ProgressRow } from './variance'
import { weightsOf } from './variance'
import type { ScheduleResult } from './schedule'
import type { SchActivity } from './types'

/** Roll-up of progress and delay by WBS level (first `depth` segments of the WBS path, split by « > » or « / »). */
export interface WbsRow { key: string; name: string; tasks: number; planned: number | null; actual: number | null; baselineFinish: string | null; forecastFinish: string | null; slip: number | null; critical: number; overdue: number }
const seg = (p: string, depth: number): string => p.split(/\s*[>/]\s*/).filter(Boolean).slice(0, depth).join(' › ') || 'بدون WBS'

export function wbsRollup(o: { baseline: SchActivity[]; current: SchActivity[]; forecast: ScheduleResult; rows: ProgressRow[]; dataDate: string; depth?: number }): WbsRow[] {
  const depth = o.depth ?? 2
  const w = weightsOf(o.baseline), rowOf = new Map(o.rows.map((r) => [r.id, r]))
  const cur = new Map(o.current.map((a) => [a.uid, a]))
  const g = new Map<string, { wt: number; wp: number; wa: number; wn: number; n: number; bf: string; ff: string; crit: number; od: number }>()
  for (const b of o.baseline) {
    if (b.type !== 'task') continue
    const k = seg(b.wbsPath, depth), x = g.get(k) ?? { wt: 0, wp: 0, wa: 0, wn: 0, n: 0, bf: '', ff: '', crit: 0, od: 0 }
    const r = rowOf.get(b.id), c = cur.get(b.uid), f = c ? o.forecast.byId.get(c.id) : undefined, wt = w.get(b.id) ?? 0
    x.n++
    if (r && r.planned != null && wt > 0) { x.wt += wt; x.wp += wt * r.planned; x.wa += wt * (r.actual ?? 0); x.wn++ }
    if (b.plannedFinish && b.plannedFinish > x.bf) x.bf = b.plannedFinish
    if (f?.finish && f.finish > x.ff) x.ff = f.finish
    if (f?.critical) x.crit++
    if (c && !c.actualFinish && (c.pctComplete ?? 0) < 100 && b.plannedFinish && b.plannedFinish < o.dataDate) x.od++
    g.set(k, x)
  }
  return [...g].map(([key, x]) => ({ key, name: key, tasks: x.n, planned: x.wt ? x.wp / x.wt : null, actual: x.wt ? x.wa / x.wt : null, baselineFinish: x.bf || null, forecastFinish: x.ff || null, slip: x.bf && x.ff ? daysBetween(x.bf, x.ff) : null, critical: x.crit, overdue: x.od })).sort((a, b) => (b.slip ?? -1e9) - (a.slip ?? -1e9))
}
