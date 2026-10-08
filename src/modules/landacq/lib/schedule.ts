import type { Activity, LandSettings, Parcel } from '../types'
import { addDays, diffDays, maxIso, minIso } from './dates'
import { isReleased, isStarted, remainingDays } from './workflow'

/** Date on which the activity front reaches `km` (linear between its start and end). Clamped to the activity's own range. */
export function activityDateAt(a: Activity, km: number): string {
  const span = a.kmEnd - a.kmStart
  const frac = span <= 0 ? 0 : Math.max(0, Math.min(1, (km - a.kmStart) / span))
  return addDays(a.startDate, frac * diffDays(a.endDate, a.startDate))
}

export interface Impact {
  activity: Activity
  /** The front reaches the parcel's first km here … */
  from: string
  /** … and has cleared its last km here. */
  to: string
}

/** Activities whose km range overlaps the parcel, with the dates the front is on that parcel. */
export function impactsOf(p: Pick<Parcel, 'kmStart' | 'kmEnd'>, activities: Activity[]): Impact[] {
  return activities
    .filter((a) => a.kmStart < p.kmEnd && a.kmEnd > p.kmStart)
    .map((a) => ({ activity: a, from: activityDateAt(a, Math.max(a.kmStart, p.kmStart)), to: activityDateAt(a, Math.min(a.kmEnd, p.kmEnd)) }))
    .sort((x, y) => x.from.localeCompare(y.from) || x.activity.sequence - y.activity.sequence)
}

/** The first activity to need the land — the deadline for releasing it. */
export function needByDate(p: Pick<Parcel, 'kmStart' | 'kmEnd'>, activities: Activity[]): string | null {
  const i = impactsOf(p, activities)
  return i.length ? i.reduce((m, x) => minIso(m, x.from), i[0].from) : null
}

export type ActionState = 'ready' | 'unscheduled' | 'action_required' | 'delay_expected' | 'start_soon' | 'on_track'

export interface EarlyAction {
  state: ActionState
  needBy: string | null
  /** Days of work still needed (route / complexity / progress aware). */
  remaining: number
  /** needBy − (remaining + buffer): the last day acquisition can begin without hurting the schedule. */
  startBy: string | null
  projectedRelease: string
  /** Positive when the projected release lands after the first activity needs the land. */
  delayDays: number
  /** Days until the first activity arrives (negative: it already should have). */
  daysToNeedBy: number | null
  daysToStartBy: number | null
  impacts: Impact[]
}

export function earlyAction(p: Parcel, activities: Activity[], today: string, settings: Pick<LandSettings, 'bufferDays' | 'horizonDays'>): EarlyAction {
  const impacts = impactsOf(p, activities)
  const needBy = impacts.length ? impacts.reduce((m, x) => minIso(m, x.from), impacts[0].from) : null
  const remaining = remainingDays(p)
  const projectedRelease = addDays(today, remaining)
  if (isReleased(p)) return { state: 'ready', needBy, remaining: 0, startBy: null, projectedRelease: today, delayDays: 0, daysToNeedBy: needBy ? diffDays(needBy, today) : null, daysToStartBy: null, impacts }
  if (!needBy) return { state: 'unscheduled', needBy: null, remaining, startBy: null, projectedRelease, delayDays: 0, daysToNeedBy: null, daysToStartBy: null, impacts }

  const startBy = addDays(needBy, -(remaining + settings.bufferDays))
  const delayDays = Math.max(0, diffDays(projectedRelease, needBy))
  const daysToStartBy = diffDays(startBy, today)
  let state: ActionState
  if (daysToStartBy <= 0 && !isStarted(p)) state = 'action_required'
  else if (delayDays > 0) state = 'delay_expected'
  else if (daysToStartBy <= settings.horizonDays) state = 'start_soon'
  else state = 'on_track'
  return { state, needBy, remaining, startBy, projectedRelease, delayDays, daysToNeedBy: diffDays(needBy, today), daysToStartBy, impacts }
}

export const ACTION_RANK: Record<ActionState, number> = { action_required: 0, delay_expected: 1, start_soon: 2, on_track: 3, unscheduled: 4, ready: 5 }

/** A parcel constrains an activity when it will not be released by the day the activity's front arrives. */
export interface Constraint {
  parcelId: string
  activity: Activity
  needBy: string
  slackDays: number
}
export function constraintsOf(p: Parcel, activities: Activity[], today: string): Constraint[] {
  if (isReleased(p)) return []
  const release = addDays(today, remainingDays(p))
  return impactsOf(p, activities)
    .map((i) => ({ parcelId: p.id, activity: i.activity, needBy: i.from, slackDays: diffDays(i.from, release) }))
    .filter((c) => c.slackDays <= 0 || c.needBy <= addDays(today, 365))
}

export const latestIso = maxIso

/** Where an activity's front stands today (km), or null before it starts / after it ends. */
export function frontKm(a: Activity, today: string): number | null {
  if (today < a.startDate || today > a.endDate) return null
  const span = diffDays(a.endDate, a.startDate)
  const frac = span <= 0 ? 1 : diffDays(today, a.startDate) / span
  return a.kmStart + frac * (a.kmEnd - a.kmStart)
}
