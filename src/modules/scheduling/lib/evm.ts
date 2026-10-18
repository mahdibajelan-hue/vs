import { addDays, daysBetween } from '../../execution/lib/periods'
import type { ScheduleResult } from './schedule'
import { weightsOf } from './variance'
import type { SchActivity } from './types'

/** S-curves (planned = baseline, actual up to the data date, forecast after it) and the earned-value / earned-schedule figures. Weights: budget when every task has one, else original duration. */
export interface CurvePoint { date: string; planned: number; actual: number | null; forecast: number | null }
export interface EvmResult {
  points: CurvePoint[]
  plannedAtDD: number; actualAtDD: number
  /** money, only when every task has a budget */
  pv: number | null; ev: number | null; sv: number | null; bac: number | null
  /** earned schedule: the date at which the baseline had earned what is earned now, and the time-based SPI */
  earnedScheduleDate: string | null; spiT: number | null
  byBudget: boolean
}

const lin = (date: string, s: string, f: string): number => {
  if (date <= s) return date >= f ? 100 : 0
  if (date >= f) return 100
  return (daysBetween(s, date) / Math.max(1, daysBetween(s, f))) * 100
}

export function sCurve(o: { baseline: SchActivity[]; current: SchActivity[]; forecast: ScheduleResult; dataDate: string; points?: number }): EvmResult | null {
  const tasks = o.baseline.filter((a) => a.type === 'task' && a.plannedStart && a.plannedFinish)
  if (!tasks.length) return null
  const w = weightsOf(o.baseline), total = tasks.reduce((s, a) => s + (w.get(a.id) ?? 0), 0)
  if (total <= 0) return null
  const cur = new Map(o.current.map((a) => [a.uid, a]))
  const start = tasks.map((a) => a.plannedStart!).sort()[0]
  const baseFin = tasks.map((a) => a.plannedFinish!).sort().pop()!
  const fcFin = o.forecast.projectFinish && o.forecast.projectFinish > baseFin ? o.forecast.projectFinish : baseFin
  const end = o.dataDate > fcFin ? o.dataDate : fcFin
  const n = Math.max(12, o.points ?? 40), span = Math.max(1, daysBetween(start, end))
  const dates = new Set<string>([start, end, o.dataDate])
  for (let i = 1; i < n; i++) dates.add(addDays(start, Math.round((span * i) / n)))
  const sorted = [...dates].filter((d) => d >= start && d <= end).sort()

  const plannedAt = (d: string) => tasks.reduce((s, a) => s + (w.get(a.id) ?? 0) * lin(d, a.plannedStart!, a.plannedFinish!), 0) / total
  const actualPct = (c: SchActivity | undefined): number => (!c ? 0 : c.actualFinish ? 100 : c.pctComplete ?? (c.actualStart ? 1 : 0))
  const actualAt = (d: string) => tasks.reduce((s, a) => {
    const c = cur.get(a.uid); if (!c || !c.actualStart) return s
    const p = actualPct(c), fin = c.actualFinish
    const v = d >= o.dataDate ? p : fin && d >= fin ? 100 : d < c.actualStart ? 0 : (p * daysBetween(c.actualStart, d)) / Math.max(1, daysBetween(c.actualStart, fin ?? o.dataDate))
    return s + (w.get(a.id) ?? 0) * Math.min(100, v)
  }, 0) / total
  const forecastAt = (d: string) => tasks.reduce((s, a) => {
    const c = cur.get(a.uid), f = c ? o.forecast.byId.get(c.id) : undefined
    const p0 = actualPct(c)
    let v: number
    if (!f || f.status === 'complete' || p0 >= 100) v = 100
    else if (!f.finish) v = p0
    else if (f.status === 'in_progress' || (f.start && f.start <= o.dataDate)) v = d >= f.finish ? 100 : p0 + ((100 - p0) * Math.max(0, daysBetween(o.dataDate, d))) / Math.max(1, daysBetween(o.dataDate, f.finish))
    else v = f.start ? lin(d, f.start, f.finish) : 0
    return s + (w.get(a.id) ?? 0) * Math.min(100, v)
  }, 0) / total

  const points: CurvePoint[] = sorted.map((d) => ({ date: d, planned: plannedAt(d), actual: d <= o.dataDate ? actualAt(d) : null, forecast: d >= o.dataDate ? forecastAt(d) : null }))
  const plannedAtDD = plannedAt(o.dataDate), actualAtDD = actualAt(o.dataDate)
  // earned schedule: walk the planned curve to the date where it equals the actual %
  let esDate: string | null = null
  for (let i = 0; i < points.length; i++) {
    if (points[i].planned >= actualAtDD - 1e-9) {
      if (i === 0) { esDate = points[0].date; break }
      const p = points[i - 1], q = points[i], frac = q.planned > p.planned ? (actualAtDD - p.planned) / (q.planned - p.planned) : 0
      esDate = addDays(p.date, Math.round(frac * daysBetween(p.date, q.date))); break
    }
  }
  const at = daysBetween(start, o.dataDate)
  const byBudget = tasks.every((a) => a.budgetCost > 0)
  const bac = byBudget ? total : null
  return {
    points, plannedAtDD, actualAtDD, byBudget,
    pv: bac != null ? (bac * plannedAtDD) / 100 : null, ev: bac != null ? (bac * actualAtDD) / 100 : null, bac,
    sv: bac != null ? (bac * (actualAtDD - plannedAtDD)) / 100 : null,
    earnedScheduleDate: esDate, spiT: esDate && at > 0 ? daysBetween(start, esDate) / at : null,
  }
}
