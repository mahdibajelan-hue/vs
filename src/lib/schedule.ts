import type { ActivitySchedule, Project } from '../types'

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
  const valid = project.schedules.filter((a) => a.plannedStart && a.plannedEnd)
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
