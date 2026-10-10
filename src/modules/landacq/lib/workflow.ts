import type { AcqRoute, Parcel, Stage, StageKey, StationType } from '../types'
import { diffDays } from './dates'

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

/** Article 9: the land is free as soon as possession is taken (3 steps); the 13 regular steps then follow to pay the owners within the legal 3 months. Work on site does not wait for them. */
export const ART9_ORDER: StageKey[] = ['art9_necessity', 'art9_minutes', 'art9_possession', ...REGULAR_ORDER]
/** The steps before release under Article 9. */
export const ART9_PRE: StageKey[] = ART9_ORDER.slice(0, 3)

/** Share of each step in the overall progress of a regular/dispute parcel (percent, sums to 100). Approximate, taken from the project's step-weight table;
 *  the last steps (handover, payment, undertaking) carry a small weight of their own instead of 0. Progress is normalised by the weights of the steps that apply to the parcel (Article 9: 20 points before release + the 13 steps; stations: +5 for the title deed). */
export const STAGE_WEIGHT: Partial<Record<StageKey, number>> = {
  identification: 12, survey: 12, quantity_list: 6, case_file: 12, cadastre: 9, inquiries: 12, experts_intro: 6, expert_visit: 7, expert_report: 7, employer_approval: 4, docs_handover: 3, payment: 7, undertaking: 3,
  // stations only: the title deed is one more step on top of the 13 (progress is normalised by the weights of the steps that apply)
  title_deed: 5,
  // Article 9 pre-release steps, added to the 13
  art9_necessity: 5, art9_minutes: 5, art9_possession: 10,
}

/** Weights the project set in «تنظیمات»; anything not set keeps the default above. */
let weightOverrides: Partial<Record<StageKey, number>> = {}
export const setStageWeightOverrides = (o: Partial<Record<StageKey, number>> | null | undefined): void => {
  weightOverrides = o ?? {}
}
export const weightOf = (k: StageKey): number => weightOverrides[k] ?? STAGE_WEIGHT[k] ?? 0

/** Every step key the module knows (a parcel always carries all of them; the route decides which are in play). */
export const ALL_STAGE_KEYS: StageKey[] = [...REGULAR_ORDER, 'title_deed', 'art9_necessity', 'art9_minutes', 'art9_possession', 'art9_payment']
/** Kept for the regular 13-step route. */
export const STAGE_ORDER = REGULAR_ORDER
/** The steps that apply to this parcel's route, in order. */
export const orderOf = (p: { acquisitionRoute: AcqRoute; stationType?: StationType | '' }): StageKey[] => {
  const base = p.acquisitionRoute === 'art9' ? ART9_ORDER : REGULAR_ORDER
  return p.stationType ? [...base, 'title_deed'] : base // stations also need the title deed issued
}

/** Typical days per step for each of the three routes: regular acquisition, Article 9 immediate possession, and the dispute route (which stretches everything). */
const NO_ART9 = { art9_necessity: 0, art9_minutes: 0, art9_possession: 0, art9_payment: 0 }
export const STAGE_DAYS: Record<AcqRoute, Record<StageKey, number>> = {
  normal: { identification: 7, survey: 14, quantity_list: 10, case_file: 14, cadastre: 14, inquiries: 21, experts_intro: 7, expert_visit: 14, expert_report: 21, employer_approval: 7, docs_handover: 7, payment: 21, undertaking: 5, title_deed: 30, ...NO_ART9 },
  dispute: { identification: 10, survey: 25, quantity_list: 18, case_file: 25, cadastre: 25, inquiries: 40, experts_intro: 14, expert_visit: 25, expert_report: 40, employer_approval: 12, docs_handover: 12, payment: 40, undertaking: 10, title_deed: 45, ...NO_ART9 },
  // necessity + signature (5), minutes with the prosecutor's representative (3), possession (2); payment is the 3-month legal window
  // necessity + signature (5), minutes with the prosecutor's representative (3), possession (2); then the 13 steps compressed into the 3-month legal window for paying the owners (~82 days)
  art9: { identification: 3, survey: 7, quantity_list: 5, case_file: 7, cadastre: 7, inquiries: 10, experts_intro: 3, expert_visit: 7, expert_report: 10, employer_approval: 4, docs_handover: 4, payment: 12, undertaking: 3, title_deed: 20, art9_necessity: 5, art9_minutes: 3, art9_possession: 2, art9_payment: 0 },
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

/** 0..1 — weighted share of finished steps (a step in progress counts half). Weights come from STAGE_WEIGHT for every route. */
export function stageProgress(p: Pick<Parcel, 'stages' | 'acquisitionRoute'> & { stationType?: StationType | '' }): number {
  const keys = orderOf(p)
  const w = weightOf
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
  const keys = p.acquisitionRoute === 'art9' ? ART9_PRE : REGULAR_ORDER.slice(0, -1) // the undertaking follows the release
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
