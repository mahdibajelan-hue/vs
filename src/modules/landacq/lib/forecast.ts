import type { Activity, LandSettings, Parcel } from '../types'
import { criticality } from './scoring'
import { earlyAction } from './schedule'
import { isReleased, totalStageDelay } from './workflow'
import { diffDays } from './dates'
import { faNum } from './fa'

export interface DelayDriver {
  label: string
  /** Rough share of the probability this driver adds (0..1). */
  weight: number
}
export interface DelayForecast {
  /** 0..100 */
  probability: number
  expectedDelayDays: number
  drivers: DelayDriver[]
  /** Which model produced it — the interface below lets a trained model replace this one. */
  model: string
}

export interface ForecastContext {
  activities: Activity[]
  today: string
  settings: Pick<LandSettings, 'bufferDays' | 'horizonDays'>
}
export interface DelayPredictor {
  id: string
  predict(parcel: Parcel, ctx: ForecastContext): DelayForecast
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/**
 * Baseline predictor (transparent heuristic). It uses exactly the inputs a learned model will use later —
 * ownership, land type, owner count, current step, elapsed delay, time left until the activity, history and
 * criticality — so swapping in a trained model only means providing another DelayPredictor.
 */
export const heuristicPredictor: DelayPredictor = {
  id: 'heuristic-v1',
  predict(p, ctx) {
    if (isReleased(p)) return { probability: 0, expectedDelayDays: 0, drivers: [], model: 'heuristic-v1' }
    const crit = criticality(p)
    const ea = earlyAction(p, ctx.activities, ctx.today, ctx.settings)
    const drivers: DelayDriver[] = []
    const stageDelay = totalStageDelay(p, ctx.today)

    let prob: number
    let expected = 0
    if (ea.needBy) {
      const available = Math.max(1, diffDays(ea.needBy, ctx.today))
      const ratio = ea.remaining / available
      prob = sigmoid(3.2 * (ratio - 0.85))
      expected = Math.max(0, ea.remaining - available)
      if (ratio > 0.85) drivers.push({ label: `زمان لازم (${faNum(ea.remaining)} روز) نزدیک یا بیش از زمان موجود (${faNum(available)} روز) است`, weight: Math.min(0.5, (ratio - 0.5) * 0.4) })
    } else {
      prob = 0.1 + crit.score / 250
    }
    if (crit.score >= 50) { prob += 0.2 * (crit.score / 100); drivers.push({ label: `امتیاز Criticality ${faNum(crit.score)}`, weight: 0.2 * (crit.score / 100) }) }
    if (stageDelay > 0) { const w = Math.min(0.2, stageDelay / 90 * 0.2); prob += w; drivers.push({ label: `${faNum(stageDelay)} روز تأخیر در مراحل تحصیل`, weight: w }) }
    if (p.flags.past_dispute) { prob += 0.08; drivers.push({ label: 'سابقهٔ اختلاف', weight: 0.08 }) }
    if (p.disputeProbability >= 50) { prob += 0.07; drivers.push({ label: `احتمال اختلاف ${faNum(p.disputeProbability)}٪`, weight: 0.07 }) }
    if (p.ownershipClass === 'unknown') drivers.push({ label: 'مالکیت نامشخص', weight: 0.05 })
    const probability = Math.round(Math.max(0, Math.min(1, prob)) * 100)
    return { probability, expectedDelayDays: Math.round(expected * (1 + p.disputeProbability / 200)), drivers: drivers.sort((a, b) => b.weight - a.weight).slice(0, 4), model: 'heuristic-v1' }
  },
}

export const DELAY_HIGHLIGHT_THRESHOLD = 60
