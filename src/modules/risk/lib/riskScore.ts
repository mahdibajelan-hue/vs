import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../types'

export type RmLifecycleStage = 'identified' | 'monitoring' | 'escalating' | 'closed'

export const RM_LIFECYCLE_STAGE_LABEL_FA: Record<RmLifecycleStage, string> = {
  identified: 'شناسایی‌شده — در انتظار اولین بازبینی',
  monitoring: 'تحت پایش — بازبینی‌شده',
  escalating: 'در فرآیند ارجاع به مقام بالاتر',
  closed: 'بسته‌شده',
}

export const RM_LIFECYCLE_STAGE_COLOR: Record<RmLifecycleStage, string> = {
  identified: '#94a3b8',
  monitoring: '#3b82f6',
  escalating: '#f97316',
  closed: '#2ecc71',
}

/**
 * Computed, non-persisted lifecycle badge — distinct from `status` (spec #2/#42): status is a
 * manually-set field, this reflects the risk's actual review/escalation progress at a glance.
 */
export function lifecycleStage(risk: RmRisk, assessments: RmRiskAssessment[]): RmLifecycleStage {
  if (risk.status === 'closed') return 'closed'
  if (risk.escalationStatus === 'escalated' || risk.escalationStatus === 'decided') return 'escalating'
  if (assessments.length > 0) return 'monitoring'
  return 'identified'
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export const RISK_LEVEL_LABEL_FA: Record<RiskLevel, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  critical: 'بحرانی',
}

export const RISK_LEVEL_COLOR: Record<RiskLevel, string> = {
  low: '#2ecc71',
  medium: '#f1c40f',
  high: '#f97316',
  critical: '#e74c3c',
}

export function riskScore(probability: number, impact: number): number {
  return probability * impact
}

/** 1-5 Low, 6-10 Medium, 11-15 High, 16-25 Critical. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 16) return 'critical'
  if (score >= 11) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isActionOverdue(action: RmRiskAction, today = todayIso()): boolean {
  return action.status !== 'completed' && !!action.dueDate && action.dueDate < today
}

/** The latest review (by review_date, tie-broken by created_at) — the risk's current officially-reviewed state. */
export function latestAssessment(assessments: RmRiskAssessment[]): RmRiskAssessment | null {
  if (assessments.length === 0) return null
  return [...assessments].sort((a, b) => {
    if (a.reviewDate !== b.reviewDate) return a.reviewDate < b.reviewDate ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : -1
  })[0]
}

/** Current probability/impact/score for display — the latest assessment if reviewed at least once, else the initial values. */
export function currentState(risk: RmRisk, assessments: RmRiskAssessment[]): { probability: number; impact: number; score: number } {
  const latest = latestAssessment(assessments)
  if (latest) return { probability: latest.currentProbability, impact: latest.currentImpact, score: latest.currentScore }
  return { probability: risk.initialProbability, impact: risk.initialImpact, score: risk.initialScore }
}

/**
 * Management-attention trigger: score >= 16 (Critical), OR any open action is overdue, OR the
 * risk's consequence is expected within 14 days — the fast-track project heuristic from the spec.
 */
export function isEscalationRequired(risk: RmRisk, assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso()): boolean {
  const { score } = currentState(risk, assessments)
  if (score >= 16) return true
  if (actions.some((a) => isActionOverdue(a, today))) return true
  if (risk.timeToImpactDays !== null && risk.timeToImpactDays <= 14) return true
  return false
}

/**
 * Immutable review numbering (#1, #2, ...) derived from each review's persisted review_date +
 * created_at position in chronological order — never from the current UI array's index, so
 * a review's number can't shift just because the display is sorted newest-first or a new review
 * gets added later. "Initial Assessment" (the risk's own frozen initial values) is implicitly
 * position 0, before #1.
 */
export function assignReviewNumbers(assessments: RmRiskAssessment[]): Map<string, number> {
  const chronological = [...assessments].sort((a, b) =>
    a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
  )
  const map = new Map<string, number>()
  chronological.forEach((a, i) => map.set(a.id, i + 1))
  return map
}
