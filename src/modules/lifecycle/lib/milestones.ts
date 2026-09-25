import type { Activity, Milestone, MilestoneForecastPoint, MilestoneStatus } from '../types'

/** Milestone & variance engine — the PLAN → ACTUAL → VARIANCE half of the module's core chain.
 *
 * Everything here is derived from the baseline/forecast/actual triad rather than stored, so a
 * milestone can never display a variance that disagrees with its own dates. */

const MS_PER_DAY = 86_400_000

export function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.round((to - from) / MS_PER_DAY)
}

/**
 * Variance in days, positive = late. Prefers the actual date once it exists (that is the settled
 * truth), otherwise measures the current forecast against baseline.
 */
export function milestoneVariance(ms: Milestone): number | null {
  if (!ms.baselineDate) return null
  const comparison = ms.actualDate ?? ms.forecastDate
  return daysBetween(ms.baselineDate, comparison)
}

/** How many days until the milestone is due — negative once the date has passed. */
export function daysUntilDue(ms: Milestone, today = new Date().toISOString().slice(0, 10)): number | null {
  const due = ms.forecastDate ?? ms.baselineDate
  return daysBetween(today, due)
}

/**
 * Status a milestone *should* carry given its dates. A manually-set `blocked` is preserved:
 * blocked means something outside the schedule is stopping it, which no date arithmetic can see.
 */
export function deriveMilestoneStatus(
  ms: Milestone,
  today = new Date().toISOString().slice(0, 10),
): MilestoneStatus {
  if (ms.actualDate) return 'achieved'
  if (ms.status === 'blocked') return 'blocked'

  const variance = milestoneVariance(ms)
  const due = ms.forecastDate ?? ms.baselineDate

  // Past its date with nothing recorded — delayed regardless of what the forecast claims.
  if (due && due < today) return 'delayed'
  if (variance !== null && variance > 0) return 'at_risk'
  return 'on_track'
}

export interface MilestoneKpis {
  total: number
  achieved: number
  onTrack: number
  atRisk: number
  delayed: number
  blocked: number
  /** Of the achieved milestones, how many landed on or before baseline. */
  onTimeAchievementPct: number
  criticalTotal: number
  criticalDelayed: number
  criticalAchieved: number
  criticalAchievementPct: number
  worstVarianceDays: number
}

export function computeMilestoneKpis(
  milestones: Milestone[],
  today = new Date().toISOString().slice(0, 10),
): MilestoneKpis {
  const withStatus = milestones.map((m) => ({ ms: m, status: deriveMilestoneStatus(m, today) }))

  const achieved = withStatus.filter((x) => x.status === 'achieved')
  const onTimeAchieved = achieved.filter((x) => {
    const v = milestoneVariance(x.ms)
    return v !== null && v <= 0
  })

  const critical = withStatus.filter((x) => x.ms.isCritical)
  const criticalAchieved = critical.filter((x) => x.status === 'achieved')

  const variances = milestones
    .map(milestoneVariance)
    .filter((v): v is number => v !== null)

  return {
    total: milestones.length,
    achieved: achieved.length,
    onTrack: withStatus.filter((x) => x.status === 'on_track').length,
    atRisk: withStatus.filter((x) => x.status === 'at_risk').length,
    delayed: withStatus.filter((x) => x.status === 'delayed').length,
    blocked: withStatus.filter((x) => x.status === 'blocked').length,
    onTimeAchievementPct: achieved.length === 0 ? 0 : Math.round((onTimeAchieved.length / achieved.length) * 100),
    criticalTotal: critical.length,
    criticalDelayed: critical.filter((x) => x.status === 'delayed').length,
    criticalAchieved: criticalAchieved.length,
    criticalAchievementPct: critical.length === 0 ? 0 : Math.round((criticalAchieved.length / critical.length) * 100),
    worstVarianceDays: variances.length === 0 ? 0 : Math.max(...variances),
  }
}

/* ------------------------------------------------------------------------ drift */

export interface DriftAnalysis {
  milestoneId: string
  /** Oldest → newest variance readings. */
  series: number[]
  currentVariance: number
  /** Change between the first and last reading; positive = the milestone kept slipping. */
  totalDriftDays: number
  /** Slip added by the most recent update alone. */
  lastStepDays: number
  /** True when variance grew across at least two consecutive updates — one slip is an event, a
   * repeated slip is a trend, and only a trend deserves a warning. */
  isWorsening: boolean
}

export function analyseDrift(
  milestoneId: string,
  history: MilestoneForecastPoint[],
): DriftAnalysis | null {
  const ordered = [...history]
    .filter((h) => h.milestoneId === milestoneId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))

  if (ordered.length === 0) return null

  const series = ordered.map((h) => h.varianceDays)
  const currentVariance = series[series.length - 1]
  const totalDriftDays = currentVariance - series[0]
  const lastStepDays = series.length > 1 ? currentVariance - series[series.length - 2] : 0

  let risingSteps = 0
  for (let i = 1; i < series.length; i++) {
    if (series[i] > series[i - 1]) risingSteps++
    else risingSteps = 0
    if (risingSteps >= 2) break
  }

  return {
    milestoneId,
    series,
    currentVariance,
    totalDriftDays,
    lastStepDays,
    isWorsening: risingSteps >= 2,
  }
}

/* -------------------------------------------------------------------- activities */

export interface ScheduleVariance {
  /** Weighted mean progress across activities. */
  overallProgress: number
  /** Worst forecast-vs-baseline finish slip, in days. */
  worstSlipDays: number
  criticalPathSlipDays: number
  activitiesLate: number
  activitiesTotal: number
}

export function computeScheduleVariance(activities: Activity[]): ScheduleVariance {
  if (activities.length === 0) {
    return { overallProgress: 0, worstSlipDays: 0, criticalPathSlipDays: 0, activitiesLate: 0, activitiesTotal: 0 }
  }

  const slips = activities.map((a) => ({
    activity: a,
    slip: daysBetween(a.baselineFinish, a.actualFinish ?? a.forecastFinish) ?? 0,
  }))

  const criticalSlips = slips.filter((s) => s.activity.isCritical).map((s) => s.slip)

  return {
    overallProgress: Math.round(activities.reduce((s, a) => s + a.progress, 0) / activities.length),
    worstSlipDays: Math.max(0, ...slips.map((s) => s.slip)),
    criticalPathSlipDays: criticalSlips.length === 0 ? 0 : Math.max(0, ...criticalSlips),
    activitiesLate: slips.filter((s) => s.slip > 0).length,
    activitiesTotal: activities.length,
  }
}

/** Forecast completion for the whole project = the latest forecast finish across activities,
 * falling back to milestones when no master plan has been entered yet. */
export function forecastCompletion(activities: Activity[], milestones: Milestone[]): string | null {
  const dates = [
    ...activities.map((a) => a.actualFinish ?? a.forecastFinish ?? a.baselineFinish),
    ...milestones.map((m) => m.actualDate ?? m.forecastDate ?? m.baselineDate),
  ].filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.sort()[dates.length - 1]
}

export function baselineCompletion(activities: Activity[], milestones: Milestone[]): string | null {
  const dates = [
    ...activities.map((a) => a.baselineFinish),
    ...milestones.map((m) => m.baselineDate),
  ].filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.sort()[dates.length - 1]
}
