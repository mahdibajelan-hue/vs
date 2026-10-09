import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../types'
import { addDays, dayDiff } from './riskState'
import { todayIso } from './riskScore'

/**
 * Effectiveness of completed mitigation actions. «Completed» is NOT «effective»:
 *   - the effect is verified separately (effectStatus + note), or
 *   - derived from the first assessment made AFTER completion compared with the last one before it.
 * Nothing here changes a score; it only tells people which completed work did not move the exposure.
 */
export type EffectVerdict = 'effective' | 'partial' | 'ineffective' | 'awaiting_assessment' | 'score_reduced' | 'no_reduction' | 'not_completed'

export interface ActionEffect {
  action: RmRiskAction
  before: number | null
  after: number | null
  delta: number | null
  verdict: EffectVerdict
  verified: boolean
  /** completed long ago but the risk was not reassessed since — expected effect cannot be confirmed. */
  overdueForReassessment: boolean
}

export const EFFECT_VERDICT_LABEL_FA: Record<EffectVerdict, string> = {
  effective: 'مؤثر (تأییدشده)', partial: 'اثر نسبی (تأییدشده)', ineffective: 'بی‌اثر (تأییدشده)', awaiting_assessment: 'منتظر ارزیابی مجدد',
  score_reduced: 'امتیاز پس از اقدام کاهش یافته', no_reduction: 'تکمیل شد، امتیاز کاهش نیافت', not_completed: 'تکمیل نشده',
}

export function analyzeActionEffects(risk: RmRisk, assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso(), graceDays = 14): ActionEffect[] {
  const own = assessments.filter((a) => a.riskId === risk.id).sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
  return actions.filter((a) => a.riskId === risk.id && a.status !== 'cancelled').map((action) => {
    if (action.status !== 'completed') return { action, before: null, after: null, delta: null, verdict: 'not_completed' as const, verified: false, overdueForReassessment: false }
    const doneDay = (action.completedAt ?? action.updatedAt ?? action.createdAt ?? '').slice(0, 10)
    const prior = [...own].reverse().find((a) => a.reviewDate <= doneDay)
    const next = own.find((a) => a.reviewDate > doneDay)
    const before = prior ? prior.currentScore : risk.initialScore
    const after = next ? next.currentScore : null
    const delta = after === null ? null : after - before
    const verified = action.effectStatus !== 'pending' && action.effectStatus !== 'not_applicable'
    let verdict: EffectVerdict
    if (verified) verdict = action.effectStatus as 'effective' | 'partial' | 'ineffective'
    else if (after === null) verdict = 'awaiting_assessment'
    else verdict = delta! < 0 ? 'score_reduced' : 'no_reduction'
    return { action, before, after, delta, verdict, verified, overdueForReassessment: after === null && !verified && dayDiff(doneDay, today) > graceDays }
  })
}

/** Completed actions that did not deliver: verified ineffective, or reassessed with no reduction and not verified effective. */
export const isDisappointing = (e: ActionEffect) => e.verdict === 'ineffective' || e.verdict === 'no_reduction'

export interface EffectivenessSummary { completed: number; verified: number; effective: number; partial: number; ineffective: number; awaiting: number; noReduction: number; effectivenessPct: number | null; verifiedShare: number | null }

export function summarizeEffects(effects: ActionEffect[]): EffectivenessSummary {
  const done = effects.filter((e) => e.verdict !== 'not_completed')
  const eff = done.filter((e) => e.verdict === 'effective').length
  const par = done.filter((e) => e.verdict === 'partial').length
  const ine = done.filter((e) => e.verdict === 'ineffective').length
  const verified = eff + par + ine
  return {
    completed: done.length, verified, effective: eff, partial: par, ineffective: ine,
    awaiting: done.filter((e) => e.verdict === 'awaiting_assessment').length, noReduction: done.filter((e) => e.verdict === 'no_reduction').length,
    effectivenessPct: verified ? Math.round(((eff + par * 0.5) / verified) * 100) : null, verifiedShare: done.length ? Math.round((verified / done.length) * 100) : null,
  }
}

/** Planned reassessment date after the last completed action (so the exposure is re-evaluated, not assumed). */
export function suggestedReassessmentDate(actions: RmRiskAction[], graceDays = 7): string | null {
  const done = actions.filter((a) => a.status === 'completed' && a.completedAt).map((a) => a.completedAt!.slice(0, 10)).sort()
  return done.length ? addDays(done[done.length - 1], graceDays) : null
}
