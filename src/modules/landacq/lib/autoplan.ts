import type { LandSettings, Parcel, Stage, StageKey } from '../types'
import { addDays, diffDays } from './dates'
import { ART9_ORDER, STAGE_DAYS, complexityFactor, orderOf, stageOf } from './workflow'

/** Days each step of this parcel's route is given: the typical durations, scaled by complexity or by a hand-set total. */
export function stepDays(p: Pick<Parcel, 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): Record<StageKey, number> {
  const base = STAGE_DAYS[p.acquisitionRoute]
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

export type PlanMode = 'jit' | 'asap'
/** Start date of each parcel when the whole plan is generated from one project start date. */
export function startForMode(mode: PlanMode, projectStart: string, startBy: string | null): string {
  if (mode === 'asap' || !startBy) return projectStart
  return startBy > projectStart ? startBy : projectStart
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
