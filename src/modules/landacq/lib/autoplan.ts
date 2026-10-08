import type { AcqRoute, LandSettings, Parcel, PlanParams, Stage, StageKey } from '../types'
import type { Analysis } from './kpis'
import { addDays, diffDays } from './dates'
import { ART9_ORDER, complexityFactor, daysFor, isStarted, orderOf, stageOf } from './workflow'

/** Days each step of this parcel's route is given: the typical durations, scaled by complexity or by a hand-set total. */
export function stepDays(p: Pick<Parcel, 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): Record<StageKey, number> {
  const base = daysFor(p.acquisitionRoute)
  const keys = orderOf(p)
  // Article 9: the hand-set duration is the time to take possession; the 3-month payment window is fixed by law
  const scaled = p.acquisitionRoute === 'art9' ? ART9_ORDER.slice(0, 3) : keys
  const sum = scaled.reduce((n, k) => n + base[k], 0)
  const f = p.estDurationDays && p.estDurationDays > 0 && sum > 0 ? p.estDurationDays / sum : complexityFactor(p.complexity)
  const out = { ...base } as Record<StageKey, number>
  for (const k of keys) out[k] = base[k] === 0 ? 0 : scaled.includes(k) ? Math.max(1, Math.round(base[k] * f)) : base[k]
  return out
}

/**
 * Plans the remaining steps of a parcel one after another from its start date. Finished steps keep their dates and move the cursor
 * to the day they really ended; the remaining ones follow at their typical durations. `notBefore` keeps new dates out of the past.
 */
export function planDates(p: Parcel, start: string, notBefore?: string): Map<StageKey, string> {
  const days = stepDays(p)
  const out = new Map<StageKey, string>()
  let cursor = start
  for (const key of orderOf(p)) {
    const s = stageOf(p, key)
    if (s && (s.status === 'done' || s.status === 'skipped')) {
      if (s.status === 'done' && s.actualDate) cursor = s.actualDate
      if (s.plannedDate) out.set(key, s.plannedDate)
      continue
    }
    if (notBefore && cursor < notBefore) cursor = notBefore
    cursor = addDays(cursor, days[key])
    out.set(key, cursor)
  }
  return out
}

/** The stages with generated planned dates applied (finished steps are never touched). */
export function applyPlan(p: Parcel, start: string, notBefore?: string): Stage[] {
  const dates = planDates(p, start, notBefore)
  return p.stages.map((s) => (s.status === 'done' || s.status === 'skipped' ? s : dates.has(s.key) ? { ...s, plannedDate: dates.get(s.key)! } : s))
}

/** The step whose planned date is the day the land is free: the last regular step, or possession under Article 9. */
export const releaseKey = (p: Pick<Parcel, 'acquisitionRoute'>): StageKey => (p.acquisitionRoute === 'art9' ? 'art9_possession' : 'ready_for_construction')

export const plannedFinishOf = (p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): string | null => {
  const s = stageOf(p, releaseKey(p))
  return s ? (s.status === 'done' ? s.actualDate ?? s.plannedDate : s.plannedDate) : null
}

/** The day acquisition starts: the planned start, or else the day the first finished step was done. */
export function startOf(p: Pick<Parcel, 'planStart' | 'stages' | 'acquisitionRoute'>): string | null {
  if (p.planStart) return p.planStart
  const dones = p.stages.filter((s) => s.status === 'done' && s.actualDate).map((s) => s.actualDate!).sort()
  return dones[0] ?? null
}

export interface PlanSummary {
  start: string | null
  finish: string | null
  /** Days from the first start to the last release. */
  span: number
  planned: number
  total: number
}
export function summarizePlan(parcels: Pick<Parcel, 'planStart' | 'stages' | 'acquisitionRoute'>[]): PlanSummary {
  const starts = parcels.map(startOf).filter((d): d is string => !!d).sort()
  const ends = parcels.map(plannedFinishOf).filter((d): d is string => !!d).sort()
  const start = starts[0] ?? null
  const finish = ends.at(-1) ?? null
  return { start, finish, span: start && finish ? diffDays(finish, start) : 0, planned: parcels.filter((p) => plannedFinishOf(p)).length, total: parcels.length }
}

export const lateStartOf = (needBy: string | null, remaining: number, settings: Pick<LandSettings, 'bufferDays'>): string | null => (needBy ? addDays(needBy, -(remaining + settings.bufferDays)) : null)

// ------------------------------------------------------------------------------------------------ capacity planner
export interface PlanCandidate {
  id: string
  route: AcqRoute
  complexity: number
  needBy: string | null
  crit: number
  kmStart: number
}
/** The parcels whose acquisition has not begun: the ones the planner lays out (started parcels follow their own actuals). */
export function candidatesOf(rows: Analysis[]): PlanCandidate[] {
  return rows.filter((a) => !a.released && !isStarted(a.parcel)).map((a) => ({ id: a.parcel.id, route: a.parcel.acquisitionRoute, complexity: a.parcel.complexity, needBy: a.early.needBy, crit: a.crit.score, kmStart: a.parcel.kmStart }))
}

export interface SchedulePlan {
  starts: Map<string, string>
  /** Days allotted to each parcel (written to the parcel as its duration). */
  days: Map<string, number>
  count: number
  avgDays: number
  art9Days: number
  /** Files started per month (given, derived from the target total, or the smallest rate that meets every need date). */
  perMonth: number
  /** Smallest rate at which no parcel misses the day the contractor needs it (null: not even starting everything at once is enough). */
  neededPerMonth: number | null
  finish: string | null
  totalDays: number
  misses: number
  /** Where `perMonth` came from. */
  basis: 'given' | 'target' | 'needed' | 'all'
}

const sumDays = (route: AcqRoute, keys: StageKey[]) => keys.reduce((n, k) => n + daysFor(route)[k], 0)
const REGULAR = orderOf({ acquisitionRoute: 'normal' })

/**
 * Lays the acquisition of the not-yet-started parcels out in time from a few variables: the start date, the average time per parcel,
 * the time to prepare Article 9, how many files can be handled a month (or the target total duration, from which the rate follows).
 * Files are taken in order (by the day the contractor needs the land, or along the route) at that rate; each then runs for its duration.
 */
export function buildSchedule(params: PlanParams, cands: PlanCandidate[]): SchedulePlan {
  const normalAvg = cands.filter((c) => c.route !== 'art9').reduce((n, c) => n + sumDays(c.route, REGULAR) * complexityFactor(c.complexity), 0) / Math.max(1, cands.filter((c) => c.route !== 'art9').length) || sumDays('normal', REGULAR)
  const art9Typ = sumDays('art9', ART9_ORDER.slice(0, 3))
  const avgDays = params.avgDays && params.avgDays > 0 ? params.avgDays : Math.round(normalAvg)
  const art9Days = params.art9Days && params.art9Days > 0 ? params.art9Days : art9Typ
  const ratio = sumDays('dispute', REGULAR) / Math.max(1, sumDays('normal', REGULAR))
  const dur = (c: PlanCandidate) => (c.route === 'art9' ? art9Days : Math.round(avgDays * (c.route === 'dispute' ? ratio : 1)))
  const order = [...cands].sort((a, b) => (params.order === 'km' ? a.kmStart - b.kmStart : (a.needBy ?? '9999').localeCompare(b.needBy ?? '9999') || b.crit - a.crit))
  const N = order.length
  const run = (perMonth: number) => {
    const starts = new Map<string, string>()
    let misses = 0
    let finish: string | null = null
    order.forEach((c, k) => {
      const s = addDays(params.start, Math.floor((k * 30) / Math.max(0.01, perMonth)))
      const e = addDays(s, dur(c))
      starts.set(c.id, s)
      if (c.needBy && e > c.needBy) misses++
      if (!finish || e > finish) finish = e
    })
    return { starts, misses, finish }
  }
  let needed: number | null = null
  for (let r = 1; r <= Math.max(1, N); r++) if (run(r).misses === 0) { needed = r; break }
  // the rate that makes the last file finish exactly at the target total duration
  const longest = Math.max(0, ...order.map(dur))
  const target = params.totalMonths && params.totalMonths > 0 ? params.totalMonths * 30 : null
  let perMonth: number, basis: SchedulePlan['basis']
  if (params.perMonth && params.perMonth > 0) { perMonth = params.perMonth; basis = 'given' }
  else if (target) { perMonth = Math.max(0.1, Math.max(1, N - 1) / (Math.max(1, target - longest) / 30)); basis = 'target' }
  else if (needed != null) { perMonth = needed; basis = 'needed' }
  else { perMonth = Math.max(1, N); basis = 'all' }
  const res = run(perMonth)
  const days = new Map(order.map((c) => [c.id, dur(c)] as const))
  return { starts: res.starts, days, count: N, avgDays, art9Days, perMonth, neededPerMonth: needed, finish: res.finish, totalDays: res.finish ? diffDays(res.finish, params.start) : 0, misses: res.misses, basis }
}
