import type { RmControl, RmKri, RmPolicy, RmRisk, RmRiskAction, RmRiskAssessment } from '../types'
import { DEFAULT_POLICY, levelOf, zoneOf, type RiskZone } from './riskPolicy'
import { type RiskLevel, latestAssessment, todayIso } from './riskScore'

export const isActiveRisk = (r: Pick<RmRisk, 'status'>) => r.status !== 'closed'
export const isOpenAction = (a: Pick<RmRiskAction, 'status'>) => a.status !== 'completed' && a.status !== 'cancelled'

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
}
export function addDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000)
  return d.toISOString().slice(0, 10)
}

export type Trend = 'improving' | 'stable' | 'worsening'

export interface RiskState {
  riskId: string
  inherent: number
  current: number
  residual: number
  currentP: number
  currentI: number
  residualP: number
  residualI: number
  level: RiskLevel
  residualLevel: RiskLevel
  zone: RiskZone
  residualZone: RiskZone
  assessmentCount: number
  lastReviewDate: string | null
  reviewDue: string
  reviewDaysLeft: number
  reviewOverdue: boolean
  stale: boolean
  needsReviewRequest: boolean
  reductionPct: number | null
  trend: Trend
  hasOwner: boolean
  hasPlan: boolean
  planProgress: number | null
  openActions: number
  overdueActions: number
  blockedActions: number
  completedUnverified: number
  completedIneffective: number
  controlsTotal: number
  controlsEffective: number
  criticalControlProblems: number
  kriWorst: 'no_data' | 'normal' | 'warn' | 'critical'
  outsideTolerance: boolean
  attention: string[]
}

const KRI_RANK = { no_data: 0, normal: 1, warn: 2, critical: 3 } as const

/** Everything derived about ONE risk. Scores come only from assessments — completing an action never changes them. */
export function computeRiskState(risk: RmRisk, assessments: RmRiskAssessment[], actions: RmRiskAction[], controls: RmControl[], kris: RmKri[], policy: RmPolicy = DEFAULT_POLICY, today = todayIso()): RiskState {
  const own = assessments.filter((a) => a.riskId === risk.id)
  const last = latestAssessment(own)
  const sorted = [...own].sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
  const inherent = risk.initialScore
  const current = last ? last.currentScore : inherent
  const residual = last ? last.residualScore : inherent
  const level = levelOf(current, policy)
  const interval = risk.reviewIntervalDays ?? policy.reviewDays[level] ?? 60
  const reviewDue = risk.nextReviewDate ?? addDays(last?.reviewDate ?? risk.identifiedDate, interval)
  const reviewDaysLeft = dayDiff(today, reviewDue)
  const acts = actions.filter((a) => a.riskId === risk.id && a.status !== 'cancelled')
  const open = acts.filter(isOpenAction)
  const weighted = acts.length ? acts.reduce((s, a) => s + (a.status === 'completed' ? 100 : a.completionPercentage), 0) / acts.length : null
  const done = acts.filter((a) => a.status === 'completed')
  const ctl = controls.filter((c) => c.riskId === risk.id && c.status !== 'inactive')
  const myKris = kris.filter((k) => k.riskId === risk.id && k.active)
  const kriWorst = myKris.reduce<RiskState['kriWorst']>((w, k) => (KRI_RANK[k.state] > KRI_RANK[w] ? k.state : w), 'no_data')
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2].currentScore : inherent
  const trend: Trend = sorted.length === 0 ? 'stable' : current < prev ? 'improving' : current > prev ? 'worsening' : 'stable'
  const hasPlan = risk.responseStrategy === 'accept' ? true : acts.length > 0
  const overdue = open.filter((a) => !!a.dueDate && a.dueDate < today)
  const residualZone = zoneOf(residual, policy)
  const critCtl = ctl.filter((c) => c.isCritical && (c.status === 'expired' || (c.expiresOn && c.expiresOn < today) || c.effectiveness === 'ineffective' || (c.testIntervalDays && addDays(c.lastTestedAt ?? risk.identifiedDate, c.testIntervalDays) < today))).length
  const state: RiskState = {
    riskId: risk.id, inherent, current, residual, currentP: last ? last.currentProbability : risk.initialProbability, currentI: last ? last.currentImpact : risk.initialImpact, residualP: last ? last.residualProbability : risk.initialProbability, residualI: last ? last.residualImpact : risk.initialImpact, level, residualLevel: levelOf(residual, policy), zone: zoneOf(current, policy), residualZone,
    assessmentCount: own.length, lastReviewDate: last?.reviewDate ?? null, reviewDue, reviewDaysLeft, reviewOverdue: isActiveRisk(risk) && reviewDaysLeft < 0,
    stale: dayDiff(last?.reviewDate ?? risk.identifiedDate, today) > policy.staleAssessmentDays,
    needsReviewRequest: !!risk.reviewRequestedAt && (!last || last.createdAt < risk.reviewRequestedAt),
    reductionPct: inherent > 0 && last ? Math.round(((inherent - residual) / inherent) * 100) : null,
    trend, hasOwner: !!risk.ownerId, hasPlan, planProgress: weighted === null ? null : Math.round(weighted),
    openActions: open.length, overdueActions: overdue.length, blockedActions: open.filter((a) => a.status === 'blocked').length,
    completedUnverified: done.filter((a) => a.effectStatus === 'pending').length, completedIneffective: done.filter((a) => a.effectStatus === 'ineffective').length,
    controlsTotal: ctl.length, controlsEffective: ctl.filter((c) => c.effectiveness === 'effective').length, criticalControlProblems: critCtl,
    kriWorst, outsideTolerance: isActiveRisk(risk) && (residualZone === 'above_tolerance' || residualZone === 'escalate'), attention: [],
  }
  if (isActiveRisk(risk)) {
    if (!state.hasOwner) state.attention.push('بدون مالک')
    if (!state.hasPlan && (state.level === 'high' || state.level === 'critical')) state.attention.push('بدون برنامهٔ پاسخ')
    if (state.reviewOverdue) state.attention.push(`بازنگری ${-reviewDaysLeft} روز عقب‌افتاده`)
    if (state.stale) state.attention.push('ارزیابی قدیمی')
    if (state.overdueActions) state.attention.push(`${state.overdueActions} اقدام معوق`)
    if (state.blockedActions) state.attention.push(`${state.blockedActions} اقدام مسدود`)
    if (state.completedIneffective) state.attention.push('اقدام تکمیل‌شدهٔ بی‌اثر')
    if (state.kriWorst === 'critical' || state.kriWorst === 'warn') state.attention.push(state.kriWorst === 'critical' ? 'شاخص هشدار بحرانی' : 'شاخص هشدار')
    if (state.criticalControlProblems) state.attention.push('کنترل حیاتی نیازمند آزمون')
    if (state.outsideTolerance) state.attention.push('باقیمانده خارج از تحمل')
    if (state.needsReviewRequest) state.attention.push('درخواست بازنگری')
  }
  return state
}

export function computeStates(risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], controls: RmControl[], kris: RmKri[], policyFor: (projectId: string) => RmPolicy, today = todayIso()): Map<string, RiskState> {
  const aBy = new Map<string, RmRiskAssessment[]>(); for (const a of assessments) aBy.set(a.riskId, [...(aBy.get(a.riskId) ?? []), a])
  const acBy = new Map<string, RmRiskAction[]>(); for (const a of actions) acBy.set(a.riskId, [...(acBy.get(a.riskId) ?? []), a])
  const cBy = new Map<string, RmControl[]>(); for (const c of controls) cBy.set(c.riskId, [...(cBy.get(c.riskId) ?? []), c])
  const kBy = new Map<string, RmKri[]>(); for (const k of kris) if (k.riskId) kBy.set(k.riskId, [...(kBy.get(k.riskId) ?? []), k])
  const out = new Map<string, RiskState>()
  for (const r of risks) out.set(r.id, computeRiskState(r, aBy.get(r.id) ?? [], acBy.get(r.id) ?? [], cBy.get(r.id) ?? [], kBy.get(r.id) ?? [], policyFor(r.projectId), today))
  return out
}

/** Exposure of a risk on a past date (latest assessment up to that date; before the first one, the inherent score). null if not yet identified. */
export function scoreAt(risk: RmRisk, assessments: RmRiskAssessment[], date: string): { current: number; residual: number } | null {
  if (risk.identifiedDate > date) return null
  if (risk.closedAt && risk.closedAt.slice(0, 10) <= date) return null
  const upTo = assessments.filter((a) => a.riskId === risk.id && a.reviewDate <= date)
  const l = latestAssessment(upTo)
  return l ? { current: l.currentScore, residual: l.residualScore } : { current: risk.initialScore, residual: risk.initialScore }
}
