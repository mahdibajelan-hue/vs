import type { AcqRoute, Parcel, Stage, StageKey } from '../types'
import { diffDays } from './dates'

export const STAGE_ORDER: StageKey[] = [
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

/** Typical days per step for each of the three routes. The accelerated route compresses the middle (legal tools instead of negotiation); the dispute route stretches everything. */
export const STAGE_DAYS: Record<AcqRoute, Record<StageKey, number>> = {
  normal: { identification: 7, ownership_status: 21, owner_identification: 21, preliminary_assessment: 14, expert_referral: 30, valuation: 30, financial_settlement: 30, payment: 21, release: 14, ready_for_construction: 3 },
  accelerated: { identification: 5, ownership_status: 14, owner_identification: 10, preliminary_assessment: 7, expert_referral: 20, valuation: 15, financial_settlement: 15, payment: 10, release: 7, ready_for_construction: 2 },
  dispute: { identification: 10, ownership_status: 45, owner_identification: 40, preliminary_assessment: 25, expert_referral: 55, valuation: 55, financial_settlement: 60, payment: 40, release: 30, ready_for_construction: 5 },
}

export const makeStages = (): Stage[] => STAGE_ORDER.map((key) => ({ key, status: 'not_started', responsible: '', plannedDate: null, actualDate: null, note: '' }))

export const stageOf = (p: Pick<Parcel, 'stages'>, key: StageKey): Stage | undefined => p.stages.find((s) => s.key === key)
const isClosed = (s: Stage) => s.status === 'done' || s.status === 'skipped'

/** First step that is not finished; null once everything is done. */
export function currentStage(p: Pick<Parcel, 'stages'>): Stage | null {
  return STAGE_ORDER.map((k) => stageOf(p, k)).find((s): s is Stage => !!s && !isClosed(s)) ?? null
}

export function isReleased(p: Pick<Parcel, 'stages'>): boolean {
  const rel = stageOf(p, 'release')
  const ready = stageOf(p, 'ready_for_construction')
  return (!!rel && isClosed(rel) && !!ready && isClosed(ready)) || (!!rel && rel.status === 'done')
}

/** Anything beyond the first look has been done or is under way. */
export function isStarted(p: Pick<Parcel, 'stages'>): boolean {
  return p.stages.some((s) => s.status === 'in_progress' || s.status === 'done' || s.status === 'blocked')
}

/** 0..1 — finished steps over all steps (a step in progress counts half). */
export function stageProgress(p: Pick<Parcel, 'stages'>): number {
  if (p.stages.length === 0) return 0
  const done = p.stages.filter(isClosed).length
  const partial = p.stages.filter((s) => s.status === 'in_progress').length * 0.5
  return Math.min(1, (done + partial) / STAGE_ORDER.length)
}

/** Complexity 1..5 stretches the typical durations (0.9× … 1.3×). */
export const complexityFactor = (c: number): number => 0.8 + 0.1 * Math.max(1, Math.min(5, c))

/** Total typical days if nothing were done yet, for this parcel's route and complexity (or the screening override). */
export function totalExpectedDays(p: Pick<Parcel, 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (p.estDurationDays != null && p.estDurationDays > 0) return p.estDurationDays
  const base = STAGE_ORDER.reduce((n, k) => n + STAGE_DAYS[p.acquisitionRoute][k], 0)
  return Math.round(base * complexityFactor(p.complexity))
}

/** Days still needed to reach "ready for construction" from the current state. */
export function remainingDays(p: Pick<Parcel, 'stages' | 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (isReleased(p)) return 0
  const route = STAGE_DAYS[p.acquisitionRoute]
  const baseTotal = STAGE_ORDER.reduce((n, k) => n + route[k], 0)
  let baseLeft = 0
  for (const k of STAGE_ORDER) {
    const s = stageOf(p, k)
    if (!s) baseLeft += route[k]
    else if (s.status === 'done' || s.status === 'skipped') continue
    else baseLeft += route[k] * (s.status === 'in_progress' ? 0.5 : 1)
  }
  return Math.round(totalExpectedDays(p) * (baseLeft / baseTotal))
}

/** Days a step is late: finished late (actual − planned) or still open past its planned date. */
export function stageDelay(s: Stage, today: string): number {
  if (!s.plannedDate || s.status === 'skipped') return 0
  if (s.status === 'done') return s.actualDate ? Math.max(0, diffDays(s.actualDate, s.plannedDate)) : 0
  return Math.max(0, diffDays(today, s.plannedDate))
}
export const totalStageDelay = (p: Pick<Parcel, 'stages'>, today: string): number => p.stages.reduce((n, s) => n + stageDelay(s, today), 0)
export const overdueStages = (p: Pick<Parcel, 'stages'>, today: string): Stage[] => p.stages.filter((s) => !isClosed(s) && !!s.plannedDate && s.plannedDate < today)
