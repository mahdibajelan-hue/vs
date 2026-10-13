import type { Activity } from '../types'
import { addDays, daysBetween } from './periods'
import type { CurvePoint, ProgressRow } from './progress'

export interface Forecast {
  /** actual ÷ planned physical progress today (1 = on plan) */
  spi: number | null
  /** gain per day over the look-back window */
  ratePerDay: number | null
  /** date the project reaches 100% at the recent pace */
  forecastFinish: string | null
  /** planned finish = the latest planned end among the activities */
  plannedFinish: string | null
  /** forecast − planned, in days (positive = late) */
  slipDays: number | null
}

/** Planner's view: schedule performance index and the finish date implied by the last weeks' productivity. */
export function forecast(a: { curve: CurvePoint[]; actual: number; planned: number | null; activities: Pick<Activity, 'plannedEnd' | 'active' | 'approval'>[]; today: string; lookbackDays?: number }): Forecast {
  const look = a.lookbackDays ?? 28
  const spi = a.planned != null && a.planned > 0 ? a.actual / a.planned : null
  const ends = a.activities.filter((x) => x.active && x.approval === 'approved' && x.plannedEnd).map((x) => x.plannedEnd as string).sort()
  const plannedFinish = ends.length ? ends[ends.length - 1] : null
  const from = addDays(a.today, -look)
  const pts = a.curve.filter((p) => p.date <= from)
  const ref = pts.length ? pts[pts.length - 1] : a.curve[0]
  let rate: number | null = null
  if (ref) { const days = daysBetween(ref.date, a.today); if (days >= 7) rate = (a.actual - ref.actual) / days }
  let fin: string | null = null
  if (rate != null && rate > 0) fin = a.actual >= 1 ? a.today : addDays(a.today, Math.ceil((1 - a.actual) / rate))
  return { spi, ratePerDay: rate != null && rate > 0 ? rate : null, forecastFinish: fin, plannedFinish, slipDays: fin && plannedFinish ? daysBetween(plannedFinish, fin) : null }
}

export interface ChapterProgress { key: string; title: string; bookId: string | null; weight: number; pct: number; rows: number }
/** Weighted progress per chapter (inside its price book): Σ(progress × weight) ÷ Σ weight. */
export function chapterProgress(rows: ProgressRow[]): ChapterProgress[] {
  const m = new Map<string, ChapterProgress & { num: number }>()
  for (const r of rows) {
    const a = r.activity, key = `${a.bookId ?? ''}|${a.chapterNo || a.chapter || '—'}`
    const x = m.get(key) ?? { key, title: a.chapter || 'بدون فصل', bookId: a.bookId, weight: 0, pct: 0, rows: 0, num: 0 }
    x.weight += r.base.weight; x.num += r.base.weight * Math.min(1, r.pct); x.rows += 1; m.set(key, x)
  }
  return [...m.values()].map(({ num, ...x }) => ({ ...x, pct: x.weight > 0 ? num / x.weight : 0 })).sort((p, q) => q.weight - p.weight)
}
