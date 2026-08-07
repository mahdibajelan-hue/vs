import {
  RM_CATEGORIES,
  RM_PROJECT_PHASES,
  type RmProjectPhase,
  type RmRisk,
  type RmRiskAction,
  type RmRiskAssessment,
  type RmRiskCategory,
  type RmRiskStatus,
  type RmTrend,
} from '../types'
import { currentState, isActionOverdue, latestAssessment, riskLevel, todayIso, type RiskLevel } from './riskScore'

export interface ExposureKpi {
  initial: number
  current: number
  improvementPercent: number
}

/** Sum of initial vs current score across all risks — the spec's "150 -> 90, 40% improvement" KPI. */
export function computeExposureKpi(risks: RmRisk[], assessments: RmRiskAssessment[]): ExposureKpi {
  const initial = risks.reduce((sum, r) => sum + r.initialScore, 0)
  const current = risks.reduce((sum, r) => sum + currentState(r, assessments.filter((a) => a.riskId === r.id)).score, 0)
  const improvementPercent = initial > 0 ? Math.round(((initial - current) / initial) * 100) : 0
  return { initial, current, improvementPercent }
}

/** A risk's score as it stood on a given date — its latest review up to that date, or its initial score if not yet reviewed (null if not yet identified). */
function scoreAsOf(risk: RmRisk, riskAssessments: RmRiskAssessment[], date: string): number | null {
  if (risk.identifiedDate > date) return null
  const applicable = riskAssessments.filter((a) => a.reviewDate <= date)
  if (applicable.length === 0) return risk.initialScore
  return applicable.sort((a, b) => (a.reviewDate < b.reviewDate ? 1 : -1))[0].currentScore
}

export interface ExposurePoint {
  date: string
  totalExposure: number
  criticalCount: number
}

/**
 * Total exposure (sum of scores) and critical-risk count at every date something changed
 * (a risk identified, or a review recorded) — the same "score as of date" technique the schedule
 * S-curve elsewhere in the app uses, since risk assessments aren't recorded on a shared cadence.
 */
export function computeExposureTimeline(risks: RmRisk[], assessments: RmRiskAssessment[]): ExposurePoint[] {
  if (risks.length === 0) return []
  const dateSet = new Set<string>([todayIso()])
  for (const r of risks) dateSet.add(r.identifiedDate)
  for (const a of assessments) dateSet.add(a.reviewDate)
  const dates = [...dateSet].sort()

  return dates.map((date) => {
    let totalExposure = 0
    let criticalCount = 0
    for (const r of risks) {
      const riskAssessments = assessments.filter((a) => a.riskId === r.id)
      const score = scoreAsOf(r, riskAssessments, date)
      if (score === null) continue
      totalExposure += score
      if (riskLevel(score) === 'critical') criticalCount++
    }
    return { date, totalExposure, criticalCount }
  })
}

export function computeStatusCounts(risks: RmRisk[]): Record<RmRiskStatus, number> {
  const counts: Record<RmRiskStatus, number> = { open: 0, monitoring: 0, escalated: 0, closed: 0 }
  for (const r of risks) counts[r.status]++
  return counts
}

export function computeCategoryDistribution(risks: RmRisk[]): { category: RmRiskCategory; count: number }[] {
  const map = new Map<RmRiskCategory, number>()
  for (const r of risks) map.set(r.category, (map.get(r.category) ?? 0) + 1)
  return RM_CATEGORIES.map((category) => ({ category, count: map.get(category) ?? 0 })).filter((x) => x.count > 0)
}

export function computePhaseDistribution(risks: RmRisk[]): { phase: RmProjectPhase | 'unspecified'; count: number }[] {
  const map = new Map<string, number>()
  for (const r of risks) {
    const key = r.projectPhase ?? 'unspecified'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...RM_PROJECT_PHASES, 'unspecified' as const].map((phase) => ({ phase, count: map.get(phase) ?? 0 })).filter((x) => x.count > 0)
}

export interface TopRiskRow {
  risk: RmRisk
  score: number
  level: RiskLevel
  trend: RmTrend | null
  nextActionDueDate: string | null
}

export function computeTopRisks(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], limit = 10): TopRiskRow[] {
  return risks
    .filter((r) => r.status !== 'closed')
    .map((risk) => {
      const riskAssessments = assessments.filter((a) => a.riskId === risk.id)
      const riskActions = actions.filter((a) => a.riskId === risk.id)
      const state = currentState(risk, riskAssessments)
      const trend = latestAssessment(riskAssessments)?.trend ?? null
      const nextAction = riskActions
        .filter((a) => a.status !== 'completed' && a.dueDate)
        .sort((a, b) => ((a.dueDate as string) < (b.dueDate as string) ? -1 : 1))[0]
      return { risk, score: state.score, level: riskLevel(state.score), trend, nextActionDueDate: nextAction?.dueDate ?? null }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export interface TimeToImpactRisk {
  risk: RmRisk
  daysLeft: number
}

/** Fast-track project widget: risks whose consequence lands within the next 14 days. */
export function computeTimeToImpactRisks(risks: RmRisk[], withinDays = 14): TimeToImpactRisk[] {
  return risks
    .filter((r) => r.status !== 'closed' && r.timeToImpactDays !== null && r.timeToImpactDays <= withinDays)
    .map((risk) => ({ risk, daysLeft: risk.timeToImpactDays as number }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

export interface ManagementAttentionRisk {
  risk: RmRisk
  score: number
  reasons: string[]
}

/**
 * The consolidated "management attention required" list for the Executive Risk Report — every
 * active risk tripping the escalation rule, with which specific reason(s) triggered it.
 */
export function computeManagementAttentionRisks(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso()): ManagementAttentionRisk[] {
  return risks
    .filter((r) => r.status !== 'closed')
    .map((risk) => {
      const riskAssessments = assessments.filter((a) => a.riskId === risk.id)
      const riskActions = actions.filter((a) => a.riskId === risk.id)
      const state = currentState(risk, riskAssessments)
      const reasons: string[] = []
      if (state.score >= 16) reasons.push('امتیاز بحرانی')
      if (riskActions.some((a) => isActionOverdue(a, today))) reasons.push('اقدام عقب‌افتاده')
      if (risk.timeToImpactDays !== null && risk.timeToImpactDays <= 14) reasons.push('زمان تا وقوع کمتر از ۱۴ روز')
      return { risk, score: state.score, reasons }
    })
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
}
