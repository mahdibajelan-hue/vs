import type { AcqRoute, Parcel, Stage, StageKey } from '../types'
import { diffDays } from './dates'

/** The 4 steps of the Article 9 route (immediate possession before the final transaction). */
export const ART9_ORDER: StageKey[] = ['art9_necessity', 'art9_minutes', 'art9_possession', 'art9_payment']

export const REGULAR_ORDER: StageKey[] = [
  'identification',
  'ownership_status',
  'owner_identification',
  'preliminary_assessment',
  'expert_referral',
  'valuation',
  'financial_settlement',
  'payment',
  'release',
  'ready_for_construction',
]

/** Every step key the module knows (a parcel always carries all of them; the route decides which are in play). */
export const ALL_STAGE_KEYS: StageKey[] = [...REGULAR_ORDER, ...ART9_ORDER]
/** Kept for the regular 10-step route. */
export const STAGE_ORDER = REGULAR_ORDER
/** The steps that apply to this parcel's route, in order. */
export const orderOf = (p: Pick<Parcel, 'acquisitionRoute'>): StageKey[] => (p.acquisitionRoute === 'art9' ? ART9_ORDER : REGULAR_ORDER)

/** Typical days per step for each of the three routes. The accelerated route compresses the middle (legal tools instead of negotiation); the dispute route stretches everything. */
const NO_ART9 = { art9_necessity: 0, art9_minutes: 0, art9_possession: 0, art9_payment: 0 }
export const STAGE_DAYS: Record<AcqRoute, Record<StageKey, number>> = {
  normal: { identification: 7, ownership_status: 21, owner_identification: 21, preliminary_assessment: 14, expert_referral: 30, valuation: 30, financial_settlement: 30, payment: 21, release: 14, ready_for_construction: 3, ...NO_ART9 },
  accelerated: { identification: 5, ownership_status: 14, owner_identification: 10, preliminary_assessment: 7, expert_referral: 20, valuation: 15, financial_settlement: 15, payment: 10, release: 7, ready_for_construction: 2, ...NO_ART9 },
  dispute: { identification: 10, ownership_status: 45, owner_identification: 40, preliminary_assessment: 25, expert_referral: 55, valuation: 55, financial_settlement: 60, payment: 40, release: 30, ready_for_construction: 5, ...NO_ART9 },
  // necessity + signature (5), minutes with the prosecutor's representative (3), possession (2); payment is the 3-month legal window
  art9: { identification: 0, ownership_status: 0, owner_identification: 0, preliminary_assessment: 0, expert_referral: 0, valuation: 0, financial_settlement: 0, payment: 0, release: 0, ready_for_construction: 0, art9_necessity: 5, art9_minutes: 3, art9_possession: 2, art9_payment: 90 },
}

export const makeStages = (): Stage[] => ALL_STAGE_KEYS.map((key) => ({ key, status: 'not_started', responsible: '', plannedDate: null, actualDate: null, note: '' }))

export const stageOf = (p: Pick<Parcel, 'stages'>, key: StageKey): Stage | undefined => p.stages.find((s) => s.key === key)
const isClosed = (s: Stage) => s.status === 'done' || s.status === 'skipped'

/** First step that is not finished; null once everything is done. */
export function currentStage(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): Stage | null {
  return orderOf(p).map((k) => stageOf(p, k)).find((s): s is Stage => !!s && !isClosed(s)) ?? null
}

export function isReleased(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): boolean {
  // Article 9: the land is free for construction as soon as possession is taken; payment follows within the 3-month legal window.
  if (p.acquisitionRoute === 'art9') {
    const pos = stageOf(p, 'art9_possession')
    return !!pos && pos.status === 'done'
  }
  const rel = stageOf(p, 'release')
  const ready = stageOf(p, 'ready_for_construction')
  return (!!rel && isClosed(rel) && !!ready && isClosed(ready)) || (!!rel && rel.status === 'done')
}

/** Anything beyond the first look has been done or is under way. */
export function isStarted(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): boolean {
  const keys = orderOf(p)
  return p.stages.filter((s) => keys.includes(s.key)).some((s) => s.status === 'in_progress' || s.status === 'done' || s.status === 'blocked')
}

/** 0..1 — finished steps over all steps (a step in progress counts half). */
export function stageProgress(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): number {
  const keys = orderOf(p)
  const mine = p.stages.filter((s) => keys.includes(s.key))
  if (mine.length === 0) return 0
  const done = mine.filter(isClosed).length
  const partial = mine.filter((s) => s.status === 'in_progress').length * 0.5
  return Math.min(1, (done + partial) / keys.length)
}

/** Complexity 1..5 stretches the typical durations (0.9× … 1.3×). */
export const complexityFactor = (c: number): number => 0.8 + 0.1 * Math.max(1, Math.min(5, c))

/** Total typical days if nothing were done yet, for this parcel's route and complexity (or the screening override). */
export function totalExpectedDays(p: Pick<Parcel, 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (p.estDurationDays != null && p.estDurationDays > 0) return p.estDurationDays
  const base = orderOf(p).reduce((n, k) => n + STAGE_DAYS[p.acquisitionRoute][k], 0)
  return Math.round(base * complexityFactor(p.complexity))
}

/** Days still needed to reach "ready for construction" from the current state. */
export function remainingDays(p: Pick<Parcel, 'stages' | 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (isReleased(p)) return 0
  const route = STAGE_DAYS[p.acquisitionRoute]
  // Article 9: "remaining" is only the time to take possession (necessity, minutes, possession), not the 3-month payment window.
  const keys = p.acquisitionRoute === 'art9' ? ART9_ORDER.slice(0, 3) : REGULAR_ORDER
  const baseTotal = keys.reduce((n, k) => n + route[k], 0)
  let baseLeft = 0
  for (const k of keys) {
    const s = stageOf(p, k)
    if (!s) baseLeft += route[k]
    else if (s.status === 'done' || s.status === 'skipped') continue
    else baseLeft += route[k] * (s.status === 'in_progress' ? 0.5 : 1)
  }
  const total = p.acquisitionRoute === 'art9' ? (p.estDurationDays && p.estDurationDays > 0 ? p.estDurationDays : Math.round(baseTotal * complexityFactor(p.complexity))) : totalExpectedDays(p)
  return Math.round(total * (baseLeft / baseTotal))
}

/** Days a step is late: finished late (actual − planned) or still open past its planned date. */
export function stageDelay(s: Stage, today: string): number {
  if (!s.plannedDate || s.status === 'skipped') return 0
  if (s.status === 'done') return s.actualDate ? Math.max(0, diffDays(s.actualDate, s.plannedDate)) : 0
  return Math.max(0, diffDays(today, s.plannedDate))
}
const mineOf = (p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): Stage[] => p.stages.filter((s) => orderOf(p).includes(s.key))
export const totalStageDelay = (p: Pick<Parcel, 'stages' | 'acquisitionRoute'>, today: string): number => mineOf(p).reduce((n, s) => n + stageDelay(s, today), 0)
export const overdueStages = (p: Pick<Parcel, 'stages' | 'acquisitionRoute'>, today: string): Stage[] => mineOf(p).filter((s) => !isClosed(s) && !!s.plannedDate && s.plannedDate < today)
