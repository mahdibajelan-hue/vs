import type {
  HealthDimension, HealthScore, HealthStatus, LifecycleAction, Milestone, ProjectLifecycle,
} from '../types'
import { HEALTH_DIMENSIONS, isActionOverdue } from '../types'
import { computeMilestoneKpis, computeScheduleVariance } from './milestones'
import type { Activity } from '../types'

/** Health engine — turns raw project data into the ten dimension scores plus an overall verdict.
 *
 * Two deliberate choices:
 *  1. **Overall is the worst dimension, not the average.** A project that is green on eight
 *     dimensions and black on procurement is not "mostly fine" — averaging is exactly how a
 *     failing project keeps reporting amber. The worst status wins, and the dimension that caused
 *     it is named.
 *  2. Every score carries an `explanation` string. A colour with no reason attached cannot be
 *     acted on, and the whole module exists to be acted on.
 */

export function statusFromScore(score: number): HealthStatus {
  if (score >= 80) return 'green'
  if (score >= 60) return 'yellow'
  return 'red'
}

const STATUS_RANK: Record<HealthStatus, number> = { green: 0, yellow: 1, red: 2, black: 3 }

export interface HealthInput {
  activities: Activity[]
  milestones: Milestone[]
  actions: LifecycleAction[]
  openCriticalRisks: number
  openCriticalIssues: number
  blockedGateCount: number
  /** Scores an operator entered by hand for dimensions the platform cannot derive yet
   * (quality, HSE, cost, contract, cash flow currently come from other modules or manual entry). */
  stored: HealthScore[]
}

export interface DerivedHealth {
  dimension: HealthDimension
  score: number
  status: HealthStatus
  explanation: string
  /** True when the value came from a stored/manual row rather than being derived here. */
  isManual: boolean
}

/** Schedule health from critical-path slip and delayed milestones. */
function scheduleHealth(input: HealthInput): DerivedHealth {
  const sv = computeScheduleVariance(input.activities)
  const ms = computeMilestoneKpis(input.milestones)

  if (input.activities.length === 0 && input.milestones.length === 0) {
    return { dimension: 'schedule', score: 100, status: 'green', explanation: 'برنامه‌ای ثبت نشده است', isManual: false }
  }

  // Each day of critical-path slip costs a point (capped), each delayed critical milestone costs 8.
  const slipPenalty = Math.min(50, sv.criticalPathSlipDays)
  const milestonePenalty = Math.min(40, ms.criticalDelayed * 8 + ms.delayed * 3)
  const score = Math.max(0, 100 - slipPenalty - milestonePenalty)

  const reasons: string[] = []
  if (sv.criticalPathSlipDays > 0) reasons.push(`${sv.criticalPathSlipDays} روز تأخیر در مسیر بحرانی`)
  if (ms.criticalDelayed > 0) reasons.push(`${ms.criticalDelayed} Milestone بحرانی تأخیرکرده`)
  if (ms.delayed > 0) reasons.push(`${ms.delayed} Milestone تأخیرکرده`)

  return {
    dimension: 'schedule',
    score,
    status: statusFromScore(score),
    explanation: reasons.length ? reasons.join(' — ') : 'مطابق برنامه',
    isManual: false,
  }
}

/** Risk health from the count of unmitigated critical risks. */
function riskHealth(input: HealthInput): DerivedHealth {
  const score = Math.max(0, 100 - input.openCriticalRisks * 20)
  return {
    dimension: 'risk',
    score,
    status: statusFromScore(score),
    explanation: input.openCriticalRisks > 0
      ? `${input.openCriticalRisks} ریسک بحرانی باز`
      : 'ریسک بحرانی باز وجود ندارد',
    isManual: false,
  }
}

/** Procurement health leans on procurement-stage milestones plus overdue procurement actions. */
function procurementHealth(input: HealthInput): DerivedHealth {
  const procMilestones = input.milestones.filter((m) => m.stageKey === 'procurement')
  const kpis = computeMilestoneKpis(procMilestones)
  const overdueProcActions = input.actions.filter(
    (a) => isActionOverdue(a) && (a.priority === 'critical' || a.priority === 'high'),
  ).length

  if (procMilestones.length === 0 && overdueProcActions === 0) {
    return { dimension: 'procurement', score: 100, status: 'green', explanation: 'موردی ثبت نشده است', isManual: false }
  }

  const score = Math.max(0, 100 - kpis.criticalDelayed * 15 - kpis.delayed * 6 - overdueProcActions * 5)
  const reasons: string[] = []
  if (kpis.criticalDelayed > 0) reasons.push(`${kpis.criticalDelayed} قلم بحرانی تدارکاتی تأخیرکرده`)
  if (overdueProcActions > 0) reasons.push(`${overdueProcActions} اقدام مهم دارای تأخیر`)

  return {
    dimension: 'procurement',
    score,
    status: statusFromScore(score),
    explanation: reasons.length ? reasons.join(' — ') : 'مطابق برنامه',
    isManual: false,
  }
}

function stageMilestoneHealth(input: HealthInput, dimension: HealthDimension, stageKey: string): DerivedHealth {
  const list = input.milestones.filter((m) => m.stageKey === stageKey)
  if (list.length === 0) {
    return { dimension, score: 100, status: 'green', explanation: 'موردی ثبت نشده است', isManual: false }
  }
  const kpis = computeMilestoneKpis(list)
  const score = Math.max(0, 100 - kpis.criticalDelayed * 15 - kpis.delayed * 6 - kpis.atRisk * 3)
  const reasons: string[] = []
  if (kpis.delayed > 0) reasons.push(`${kpis.delayed} Milestone تأخیرکرده`)
  if (kpis.atRisk > 0) reasons.push(`${kpis.atRisk} Milestone در معرض تأخیر`)
  return {
    dimension,
    score,
    status: statusFromScore(score),
    explanation: reasons.length ? reasons.join(' — ') : 'مطابق برنامه',
    isManual: false,
  }
}

/** Dimensions this engine can derive today. Everything else falls through to a stored/manual
 * score, so the UI can show honestly which numbers are computed and which were typed in. */
const DERIVED: Partial<Record<HealthDimension, (i: HealthInput) => DerivedHealth>> = {
  schedule: scheduleHealth,
  risk: riskHealth,
  procurement: procurementHealth,
  engineering: (i) => stageMilestoneHealth(i, 'engineering', 'engineering'),
  construction: (i) => stageMilestoneHealth(i, 'construction', 'execution'),
}

export function computeHealth(input: HealthInput): DerivedHealth[] {
  return HEALTH_DIMENSIONS.map((dimension) => {
    const derive = DERIVED[dimension]
    if (derive) return derive(input)

    const stored = input.stored.find((s) => s.dimension === dimension)
    if (stored) {
      return {
        dimension,
        score: stored.score,
        status: stored.status,
        explanation: stored.explanation || 'ثبت دستی',
        isManual: true,
      }
    }
    return { dimension, score: 100, status: 'green' as HealthStatus, explanation: 'ارزیابی نشده', isManual: true }
  })
}

export interface OverallHealth {
  status: HealthStatus
  score: number
  /** Which dimension set the overall status — the answer to "why is this project red?". */
  drivenBy: HealthDimension | null
  isOverridden: boolean
  overrideReason: string
}

export function computeOverallHealth(
  dimensions: DerivedHealth[],
  lifecycle: ProjectLifecycle | null,
  blockedGateCount = 0,
): OverallHealth {
  if (lifecycle?.healthOverride) {
    return {
      status: lifecycle.healthOverride,
      score: 0,
      drivenBy: null,
      isOverridden: true,
      overrideReason: lifecycle.healthOverrideReason,
    }
  }

  if (blockedGateCount > 0) {
    return { status: 'black', score: 0, drivenBy: null, isOverridden: false, overrideReason: '' }
  }

  if (dimensions.length === 0) {
    return { status: 'green', score: 100, drivenBy: null, isOverridden: false, overrideReason: '' }
  }

  const worst = dimensions.reduce((acc, d) => (STATUS_RANK[d.status] > STATUS_RANK[acc.status] ? d : acc))
  const avg = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)

  return {
    status: worst.status,
    score: avg,
    drivenBy: worst.status === 'green' ? null : worst.dimension,
    isOverridden: false,
    overrideReason: '',
  }
}

/** Status → the module's single status palette. Colour is used ONLY for status, per the UI spec. */
export const HEALTH_COLOR: Record<HealthStatus, string> = {
  green: '#0ca30c',
  yellow: '#fab219',
  red: '#d03b3b',
  black: '#1f2937',
}
