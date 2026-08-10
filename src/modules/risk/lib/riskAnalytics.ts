import {
  RM_CATEGORIES,
  RM_PROJECT_PHASES,
  RM_RESPONSE_STRATEGY_LABEL_FA,
  type RmProjectPhase,
  type RmRisk,
  type RmRiskAction,
  type RmRiskAssessment,
  type RmRiskCategory,
  type RmRiskStatus,
  type RmTrend,
} from '../types'
import { currentState, isActionOverdue, isEscalationRequired, latestAssessment, riskLevel, todayIso, type RiskLevel } from './riskScore'

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

/** Current-level breakdown of active (non-closed) risks — feeds the dashboard's level donut. */
export function computeLevelDistribution(risks: RmRisk[], assessments: RmRiskAssessment[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  for (const r of risks) {
    if (r.status === 'closed') continue
    const state = currentState(r, assessments.filter((a) => a.riskId === r.id))
    counts[riskLevel(state.score)]++
  }
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

export interface RiskAttentionRecommendation {
  risk: RmRisk
  score: number
  level: RiskLevel
  recommendation: string
}

/**
 * Rule-based (non-AI) "Recommended Management Attention" text for every active Critical/High
 * risk — a fixed priority order (overdue actions > no control actions defined > escalation
 * pending > never formally reviewed > strategy-specific default) picks the single most urgent
 * next step so the list stays a short, actionable read rather than a dump of everything wrong.
 */
export function computeCriticalHighAttention(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], today = todayIso()): RiskAttentionRecommendation[] {
  return risks
    .filter((r) => r.status !== 'closed')
    .map((risk) => {
      const riskAssessments = assessments.filter((a) => a.riskId === risk.id)
      const riskActions = actions.filter((a) => a.riskId === risk.id)
      const state = currentState(risk, riskAssessments)
      const level = riskLevel(state.score)
      return { risk, score: state.score, level, riskAssessments, riskActions }
    })
    .filter((x) => x.level === 'critical' || x.level === 'high')
    .map(({ risk, score, level, riskAssessments, riskActions }) => ({
      risk,
      score,
      level,
      recommendation: recommendManagementAttention(risk, riskAssessments, riskActions, today),
    }))
    .sort((a, b) => b.score - a.score)
}

function recommendManagementAttention(risk: RmRisk, riskAssessments: RmRiskAssessment[], riskActions: RmRiskAction[], today: string): string {
  const overdue = riskActions.filter((a) => isActionOverdue(a, today))

  if (overdue.length > 0) {
    return `پیگیری فوری ${overdue.length} اقدام کنترلی عقب‌افتاده و تعیین مسئول یا سررسید جدید`
  }
  if (riskActions.length === 0) {
    return 'تعریف حداقل یک اقدام کنترلی مشخص با مسئول و سررسید — این ریسک هنوز اقدامی ندارد'
  }
  if (risk.escalationStatus === 'recommended') {
    return 'تکمیل و ثبت جزئیات ارجاع پیشنهادشده به مقام بالاتر بدون تاخیر'
  }
  if (risk.escalationStatus === 'none' && isEscalationRequired(risk, riskAssessments, riskActions, today)) {
    return risk.timeToImpactDays !== null && risk.timeToImpactDays <= 14
      ? `ارجاع فوری به مقام بالاتر — کمتر از ${risk.timeToImpactDays} روز تا وقوع پیامد`
      : 'ثبت رسمی ارجاع این ریسک به مقام بالاتر برای تصمیم‌گیری فوری'
  }
  if (riskAssessments.length === 0) {
    return 'برنامه‌ریزی برای بازبینی رسمی اولیه این ریسک در اسرع وقت'
  }
  return `تسریع اجرای استراتژی «${RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]}» تا رسیدن امتیاز به سطح قابل قبول`
}

export interface RiskMaturityBreakdown {
  reviewCoverage: number
  actionCoverage: number
  onTimeRate: number
  strategyDetailCoverage: number
  overall: number
}

/**
 * A composite 0-100 "process maturity" score for the project's risk management practice — how
 * consistently risks get reviewed, get control actions, stay on schedule, and have a concrete
 * (not just labeled) response plan. Not a data field; recomputed live from current risk data.
 */
export function computeRiskMaturityIndex(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[]): RiskMaturityBreakdown {
  const active = risks.filter((r) => r.status !== 'closed')
  const total = active.length
  if (total === 0) return { reviewCoverage: 0, actionCoverage: 0, onTimeRate: 100, strategyDetailCoverage: 0, overall: 0 }

  const reviewedCount = active.filter((r) => assessments.some((a) => a.riskId === r.id)).length
  const withActionCount = active.filter((r) => actions.some((a) => a.riskId === r.id)).length
  const withStrategyDetails = active.filter((r) => Object.values(r.strategyDetails).some((v) => v.trim() !== '')).length
  const openActions = actions.filter((a) => a.status !== 'completed')
  const overdueOpen = openActions.filter((a) => isActionOverdue(a)).length

  const reviewCoverage = Math.round((reviewedCount / total) * 100)
  const actionCoverage = Math.round((withActionCount / total) * 100)
  const strategyDetailCoverage = Math.round((withStrategyDetails / total) * 100)
  const onTimeRate = openActions.length > 0 ? Math.round(((openActions.length - overdueOpen) / openActions.length) * 100) : 100
  const overall = Math.round(reviewCoverage * 0.3 + actionCoverage * 0.25 + onTimeRate * 0.25 + strategyDetailCoverage * 0.2)

  return { reviewCoverage, actionCoverage, onTimeRate, strategyDetailCoverage, overall }
}

/** Average completion percentage across all control/response actions — "how much of the planned response is actually done". */
export function computeResponseCompletion(actions: RmRiskAction[]): number {
  if (actions.length === 0) return 0
  return Math.round(actions.reduce((sum, a) => sum + a.completionPercentage, 0) / actions.length)
}

export interface TimeToImpactBuckets {
  critical: TimeToImpactRisk[]
  high: TimeToImpactRisk[]
  watch: TimeToImpactRisk[]
}

/** Replaces the single "within 14 days" banner with three severity bands: 0-7 / 8-14 / 15-30 days. */
export function computeTimeToImpactBuckets(risks: RmRisk[]): TimeToImpactBuckets {
  const all = risks
    .filter((r) => r.status !== 'closed' && r.timeToImpactDays !== null && r.timeToImpactDays <= 30)
    .map((risk) => ({ risk, daysLeft: risk.timeToImpactDays as number }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
  return {
    critical: all.filter((x) => x.daysLeft <= 7),
    high: all.filter((x) => x.daysLeft > 7 && x.daysLeft <= 14),
    watch: all.filter((x) => x.daysLeft > 14 && x.daysLeft <= 30),
  }
}

/** Average days from identification to closure, across every closed risk — null if none are closed yet. */
export function computeAvgTimeToClose(risks: RmRisk[]): number | null {
  const closed = risks.filter((r) => r.status === 'closed')
  if (closed.length === 0) return null
  const totalDays = closed.reduce((sum, r) => sum + Math.round((Date.parse(r.updatedAt.slice(0, 10)) - Date.parse(r.identifiedDate)) / 86400000), 0)
  return Math.round(totalDays / closed.length)
}

export interface WeeklyIdentificationPoint {
  weekStart: string
  count: number
}

/** New risks identified per ISO week — surfaces whether risk identification is accelerating or slowing. */
export function computeWeeklyIdentificationRate(risks: RmRisk[]): WeeklyIdentificationPoint[] {
  const byWeek = new Map<string, number>()
  for (const r of risks) {
    const d = new Date(r.identifiedDate)
    const day = d.getUTCDay()
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1)
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([weekStart, count]) => ({ weekStart, count }))
}
