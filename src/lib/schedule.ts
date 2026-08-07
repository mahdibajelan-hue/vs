import type { ActivityKind, ActivitySchedule, Project } from '../types'
import type { SCurvePoint } from './progress'
import { isCountedLog } from './progress'

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}

export function addDaysIso(iso: string, days: number): string {
  const d = toDate(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Welding/NDT progress is measured in weld count (against the line's totalWelds); coating/
 * hydrotest progress is measured in length (against the line's plannedLength) — pipe gets coated
 * and hydrotested along its length, not per weld.
 */
const ACTIVITY_METRIC: Record<ActivityKind, 'welds' | 'length'> = {
  welding: 'welds',
  ndt: 'welds',
  coating: 'length',
  hydrotest: 'length',
}

/**
 * Every activity's "actual" progress is derived automatically from daily-log entries tagged with
 * that same activity (which is where field work is actually recorded) instead of being entered by
 * hand in the Schedule module — connecting cumulative daily performance to the plan.
 */
export function withComputedActuals(project: Project): ActivitySchedule[] {
  return project.schedules.map((s) => {
    const line = project.lines.find((l) => l.id === s.lineId)
    if (!line) return { ...s, actualStart: null, actualEnd: null, percentComplete: 0 }
    const activityLogs = project.logs.filter((l) => l.lineId === line.id && l.activity === s.activity && isCountedLog(l))
    if (activityLogs.length === 0) return { ...s, actualStart: null, actualEnd: null, percentComplete: 0 }
    const dates = activityLogs.map((l) => l.date)
    const first = dates.reduce((a, b) => (b < a ? b : a))
    const last = dates.reduce((a, b) => (b > a ? b : a))
    let percentComplete: number
    if (ACTIVITY_METRIC[s.activity] === 'welds') {
      const weldsDone = activityLogs.reduce((sum, l) => sum + (l.weldCount || 0), 0)
      percentComplete = line.totalWelds > 0 ? Math.min(100, Math.round((weldsDone / line.totalWelds) * 100)) : 0
    } else {
      const lengthDone = activityLogs.reduce((sum, l) => sum + (l.lengthDone || 0), 0)
      percentComplete = line.plannedLength > 0 ? Math.min(100, Math.round((lengthDone / line.plannedLength) * 100)) : 0
    }
    return { ...s, actualStart: first, actualEnd: percentComplete >= 100 ? last : null, percentComplete }
  })
}

export type ActivityStatus = 'not_configured' | 'not_started' | 'in_progress' | 'completed' | 'delayed'

export const ACTIVITY_STATUS_COLOR: Record<ActivityStatus, string> = {
  not_configured: '#475569',
  not_started: '#64748b',
  in_progress: '#f1c40f',
  completed: '#2ecc71',
  delayed: '#e74c3c',
}

export const ACTIVITY_STATUS_LABEL_FA: Record<ActivityStatus, string> = {
  not_configured: 'تنظیم نشده',
  not_started: 'شروع نشده',
  in_progress: 'در حال اجرا',
  completed: 'تکمیل شده',
  delayed: 'دارای تاخیر',
}

export function computeActivityStatus(a: ActivitySchedule, today = todayIso()): ActivityStatus {
  if (!a.plannedStart || !a.plannedEnd) return 'not_configured'
  if (a.percentComplete >= 100) return 'completed'
  if (today > a.plannedEnd) return 'delayed'
  if (a.percentComplete > 0 || (a.actualStart && today >= a.actualStart)) return 'in_progress'
  return 'not_started'
}

/** Days late. 0 if on time, ahead, or not yet due. */
export function computeActivityDelayDays(a: ActivitySchedule, today = todayIso()): number {
  if (!a.plannedEnd) return 0
  if (a.percentComplete >= 100) {
    const finishedOn = a.actualEnd ?? today
    return Math.max(0, daysBetween(a.plannedEnd, finishedOn))
  }
  if (today > a.plannedEnd) return daysBetween(a.plannedEnd, today)
  return 0
}

/** What % of the planned duration has elapsed as of today (0-100). */
export function plannedPercentToDate(a: ActivitySchedule, today = todayIso()): number {
  if (!a.plannedStart || !a.plannedEnd) return 0
  if (today <= a.plannedStart) return 0
  if (today >= a.plannedEnd) return 100
  const total = daysBetween(a.plannedStart, a.plannedEnd) || 1
  const elapsed = daysBetween(a.plannedStart, today)
  return Math.round((elapsed / total) * 100)
}

export interface ProjectScheduleSummary {
  plannedProjectEnd: string | null
  forecastEnd: string | null
  totalDelayDays: number
  overallPlannedPercent: number
  overallActualPercent: number
  achievementRatio: number | null
  configuredCount: number
}

/**
 * Total project delay = the worst current slippage among all activities
 * (the assumption being that a late activity pushes the whole schedule by
 * at least that much). Forecast completion = planned project end + that
 * delay. A simple, transparent heuristic — not a full CPM engine.
 */
export function computeProjectSchedule(project: Project, today = todayIso()): ProjectScheduleSummary {
  const valid = withComputedActuals(project).filter((a) => a.plannedStart && a.plannedEnd)
  if (valid.length === 0) {
    return {
      plannedProjectEnd: null,
      forecastEnd: null,
      totalDelayDays: 0,
      overallPlannedPercent: 0,
      overallActualPercent: 0,
      achievementRatio: null,
      configuredCount: 0,
    }
  }

  let plannedProjectEnd = valid[0].plannedEnd
  let maxDelayDays = 0
  let sumPlanned = 0
  let sumActual = 0

  for (const a of valid) {
    if (a.plannedEnd > plannedProjectEnd) plannedProjectEnd = a.plannedEnd

    const delay = computeActivityDelayDays(a, today)
    if (delay > maxDelayDays) maxDelayDays = delay

    sumPlanned += plannedPercentToDate(a, today)
    sumActual += a.percentComplete
  }

  const overallPlannedPercent = Math.round(sumPlanned / valid.length)
  const overallActualPercent = Math.round(sumActual / valid.length)
  const achievementRatio = overallPlannedPercent > 0 ? Math.round((overallActualPercent / overallPlannedPercent) * 100) : null
  const totalDelayDays = maxDelayDays
  const forecastEnd = totalDelayDays > 0 ? addDaysIso(plannedProjectEnd, totalDelayDays) : plannedProjectEnd

  return {
    plannedProjectEnd,
    forecastEnd,
    totalDelayDays,
    overallPlannedPercent,
    overallActualPercent,
    achievementRatio,
    configuredCount: valid.length,
  }
}

/** Interpolated actual completion (%) of one activity as of a given date — a heuristic, not recorded history. */
function activityActualPercentAt(a: ActivitySchedule, date: string, today: string): number {
  if (!a.actualStart) return 0
  if (date <= a.actualStart) return 0
  if (a.percentComplete >= 100 && a.actualEnd) {
    if (date >= a.actualEnd) return 100
    const total = daysBetween(a.actualStart, a.actualEnd) || 1
    return Math.round((daysBetween(a.actualStart, date) / total) * 100)
  }
  const referenceDate = today < date ? today : date
  if (referenceDate <= a.actualStart) return 0
  const elapsedToRef = daysBetween(a.actualStart, referenceDate)
  const elapsedToToday = daysBetween(a.actualStart, today) || 1
  return Math.round((Math.min(elapsedToRef, elapsedToToday) / elapsedToToday) * a.percentComplete)
}

/**
 * Time-based S-Curve from the activity schedule (welding/NDT/coating plans),
 * distinct from the length-based S-Curve on the Reports page. Planned % uses
 * `plannedPercentToDate`; actual % is interpolated from each activity's
 * actualStart/percentComplete since we only keep a live snapshot, not a full
 * history of daily actuals.
 */
export function computeScheduleSCurve(project: Project, today = todayIso()): SCurvePoint[] {
  const valid = withComputedActuals(project).filter((a) => a.plannedStart && a.plannedEnd)
  if (valid.length === 0) return []

  const dateSet = new Set<string>([today])
  for (const a of valid) {
    dateSet.add(a.plannedStart)
    dateSet.add(a.plannedEnd)
    if (a.actualStart) dateSet.add(a.actualStart)
    if (a.actualEnd) dateSet.add(a.actualEnd)
  }
  const sortedDates = [...dateSet].sort()

  return sortedDates.map((date) => {
    const plannedPercent = Math.round(
      valid.reduce((sum, a) => sum + plannedPercentToDate(a, date), 0) / valid.length,
    )
    const actualPercent = Math.round(
      valid.reduce((sum, a) => sum + activityActualPercentAt(a, date, today), 0) / valid.length,
    )
    return { date, plannedPercent, actualPercent }
  })
}
