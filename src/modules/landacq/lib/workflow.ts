import type { AcqRoute, Parcel, Stage, StageKey } from '../types'
import { diffDays } from './dates'

/** The 4 steps of the Article 9 route (immediate possession before the final transaction). */
export const ART9_ORDER: StageKey[] = ['art9_necessity', 'art9_minutes', 'art9_possession', 'art9_payment']

export const REGULAR_ORDER: StageKey[] = [
  'identification',
  'survey',
  'quantity_list',
  'case_file',
  'cadastre',
  'inquiries',
  'experts_intro',
  'expert_visit',
  'expert_report',
  'employer_approval',
  'docs_handover',
  'payment',
  'undertaking',
]

/** Share of each step in the overall progress of a regular/dispute parcel (percent, sums to 100). Approximate, taken from the project's step-weight table;
 *  the last steps (handover, payment, undertaking) carry a small weight of their own instead of 0. Article 9 steps are weighted equally. */
export const STAGE_WEIGHT: Partial<Record<StageKey, number>> = {
  identification: 12, survey: 12, quantity_list: 6, case_file: 12, cadastre: 9, inquiries: 12, experts_intro: 6, expert_visit: 7, expert_report: 7, employer_approval: 4, docs_handover: 3, payment: 7, undertaking: 3,
}

/** Every step key the module knows (a parcel always carries all of them; the route decides which are in play). */
export const ALL_STAGE_KEYS: StageKey[] = [...REGULAR_ORDER, ...ART9_ORDER]
/** Kept for the regular 13-step route. */
export const STAGE_ORDER = REGULAR_ORDER
/** The steps that apply to this parcel's route, in order. */
export const orderOf = (p: Pick<Parcel, 'acquisitionRoute'>): StageKey[] => (p.acquisitionRoute === 'art9' ? ART9_ORDER : REGULAR_ORDER)

/** Typical days per step for each of the three routes: regular acquisition, Article 9 immediate possession, and the dispute route (which stretches everything). */
const NO_ART9 = { art9_necessity: 0, art9_minutes: 0, art9_possession: 0, art9_payment: 0 }
export const STAGE_DAYS: Record<AcqRoute, Record<StageKey, number>> = {
  normal: { identification: 7, survey: 14, quantity_list: 10, case_file: 14, cadastre: 14, inquiries: 21, experts_intro: 7, expert_visit: 14, expert_report: 21, employer_approval: 7, docs_handover: 7, payment: 21, undertaking: 5, ...NO_ART9 },
  dispute: { identification: 10, survey: 25, quantity_list: 18, case_file: 25, cadastre: 25, inquiries: 40, experts_intro: 14, expert_visit: 25, expert_report: 40, employer_approval: 12, docs_handover: 12, payment: 40, undertaking: 10, ...NO_ART9 },
  // necessity + signature (5), minutes with the prosecutor's representative (3), possession (2); payment is the 3-month legal window
  art9: { identification: 0, survey: 0, quantity_list: 0, case_file: 0, cadastre: 0, inquiries: 0, experts_intro: 0, expert_visit: 0, expert_report: 0, employer_approval: 0, docs_handover: 0, payment: 0, undertaking: 0, art9_necessity: 5, art9_minutes: 3, art9_possession: 2, art9_payment: 90 },
}

/** Durations the project has set in «تنظیمات» (days per step, per route); anything not set uses the typical values above. */
export type StepDayOverrides = Partial<Record<AcqRoute, Partial<Record<StageKey, number>>>>
let overrides: StepDayOverrides = {}
export const setStepDayOverrides = (o: StepDayOverrides | null | undefined): void => {
  overrides = o ?? {}
}
/** Days per step for a route: the project's own settings over the typical values. */
export const daysFor = (route: AcqRoute): Record<StageKey, number> => ({ ...STAGE_DAYS[route], ...(overrides[route] ?? {}) })

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
  // regular / dispute: the land is free for construction once the owners are paid (the undertaking follows)
  const pay = stageOf(p, 'payment')
  return !!pay && pay.status === 'done'
}

/** Anything beyond the first look has been done or is under way. */
export function isStarted(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): boolean {
  const keys = orderOf(p)
  return p.stages.filter((s) => keys.includes(s.key)).some((s) => s.status === 'in_progress' || s.status === 'done' || s.status === 'blocked')
}

/** 0..1 — weighted share of finished steps (a step in progress counts half). Regular/dispute routes use STAGE_WEIGHT; Article 9 weights steps equally. */
export function stageProgress(p: Pick<Parcel, 'stages' | 'acquisitionRoute'>): number {
  const keys = orderOf(p)
  const w = (k: StageKey) => (p.acquisitionRoute === 'art9' ? 1 : STAGE_WEIGHT[k] ?? 0)
  const total = keys.reduce((n, k) => n + w(k), 0)
  if (total === 0) return 0
  let got = 0
  for (const k of keys) {
    const s = stageOf(p, k)
    if (!s) continue
    got += w(k) * (isClosed(s) ? 1 : s.status === 'in_progress' ? 0.5 : 0)
  }
  return Math.min(1, got / total)
}

/** Complexity 1..5 stretches the typical durations (0.9× … 1.3×). */
export const complexityFactor = (c: number): number => 0.8 + 0.1 * Math.max(1, Math.min(5, c))

/** Total typical days if nothing were done yet, for this parcel's route and complexity (or the screening override). */
export function totalExpectedDays(p: Pick<Parcel, 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (p.estDurationDays != null && p.estDurationDays > 0) return p.estDurationDays
  const base = orderOf(p).reduce((n, k) => n + daysFor(p.acquisitionRoute)[k], 0)
  return Math.round(base * complexityFactor(p.complexity))
}

/** Days still needed to reach "ready for construction" from the current state. */
export function remainingDays(p: Pick<Parcel, 'stages' | 'acquisitionRoute' | 'complexity' | 'estDurationDays'>): number {
  if (isReleased(p)) return 0
  const route = daysFor(p.acquisitionRoute)
  // Article 9: "remaining" is only the time to take possession (necessity, minutes, possession), not the 3-month payment window.
  const keys = p.acquisitionRoute === 'art9' ? ART9_ORDER.slice(0, 3) : REGULAR_ORDER.slice(0, -1) // the undertaking follows the release
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
