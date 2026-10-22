import type { SvAttendance, SvPerson, SvSettings, SvStatus, SvVehicle, SvVehicleDay, SvVehicleStatus } from '../types'

export const DEFAULT_SETTINGS: SvSettings = { dutyDays: 23, standardHours: 8, overtimeMin: 60, overtimeMax: 80, vehicleHours: 8 }

export const STATUS_FA: Record<SvStatus, string> = { present: 'حاضر', mission: 'مأموریت', rest: 'استراحت', absent: 'غایب' }
/** one-letter marks for the month grid */
export const STATUS_MARK: Record<SvStatus, string> = { present: 'ح', mission: 'م', rest: 'ا', absent: 'غ' }
export const STATUS_ORDER: SvStatus[] = ['present', 'mission', 'rest', 'absent']
export const VSTATUS_FA: Record<SvVehicleStatus, string> = { present: 'کارکرد', repair: 'تعمیر', absent: 'نبود' }
export const VSTATUS_MARK: Record<SvVehicleStatus, string> = { present: 'ک', repair: 'ت', absent: '—' }
export const VSTATUS_ORDER: SvVehicleStatus[] = ['present', 'repair', 'absent']
export const isWorking = (s: SvStatus) => s === 'present' || s === 'mission'

const r2 = (n: number) => Math.round(n * 100) / 100

/** "07:30" → minutes after midnight; null for an empty or malformed value. */
export function toMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
  if (!m) return null
  const h = +m[1], mi = +m[2]
  return h < 24 && mi < 60 ? h * 60 + mi : null
}

/** Hours between check-in and check-out; a check-out earlier than the check-in is taken as the next morning (night shift). */
export function hoursBetween(checkIn: string | null, checkOut: string | null): number | null {
  const a = toMinutes(checkIn), b = toMinutes(checkOut)
  if (a === null || b === null) return null
  return r2(((b - a + 1440) % 1440) / 60)
}

/** Hours worked and overtime from the clock times: overtime is whatever passes the standard day. */
export function splitHours(total: number, standardHours: number): { hours: number; overtime: number } {
  const t = Math.max(0, Math.min(24, total))
  return { hours: r2(t), overtime: r2(Math.max(0, t - standardHours)) }
}

/** The values a day takes when its status is set: a working day gets the standard hours and the person's meals. */
export function dayDefaults(p: Pick<SvPerson, 'mealBreakfast' | 'mealLunch' | 'mealDinner'>, status: SvStatus, s: SvSettings): Pick<SvAttendance, 'hours' | 'overtime' | 'breakfast' | 'lunch' | 'dinner'> {
  if (status === 'present') return { hours: s.standardHours, overtime: 0, breakfast: p.mealBreakfast, lunch: p.mealLunch, dinner: p.mealDinner }
  if (status === 'mission') return { hours: s.standardHours, overtime: 0, breakfast: false, lunch: false, dinner: false }
  return { hours: 0, overtime: 0, breakfast: false, lunch: false, dinner: false }
}

/** Days of the month the person (or car) is on the project: between start and end date, inclusive. */
export function activeDays(days: string[], start: string | null, end: string | null): string[] {
  return days.filter((d) => (!start || d >= start) && (!end || d <= end))
}

export interface PersonMonth {
  personId: string
  monthDays: number
  /** days on the project this month */
  onProject: number
  /** duty days asked for this month (23 out of 30, pro-rated for a part month) */
  required: number
  worked: number
  present: number
  mission: number
  rest: number
  absent: number
  /** days up to today with nothing recorded */
  unmarked: number
  shortfall: number
  /** rest days allowed this month (days on the project − duty days) */
  restAllowed: number
  restOver: number
  hours: number
  overtime: number
  overtimeCap: number
  overtimeLeft: number
  overtimeOver: number
  /** under the monthly overtime floor (informational) */
  belowFloor: boolean
  breakfast: number
  lunch: number
  dinner: number
}

/**
 * One person's month. `days` = the ISO days of the month; `upTo` = last day that should already be recorded
 * (today for the running month), so future days are not counted as missing.
 */
export function personMonth(p: SvPerson, rows: SvAttendance[], days: string[], s: SvSettings, upTo: string): PersonMonth {
  const on = activeDays(days, p.startDate, p.endDate)
  const mine = rows.filter((r) => r.personId === p.id && on.includes(r.day))
  const count = (st: SvStatus) => mine.filter((r) => r.status === st).length
  const present = count('present'), mission = count('mission'), rest = count('rest'), absent = count('absent')
  const worked = present + mission
  // 23 duty days in a full month; someone on the project for part of the month owes a share of it (23 per 30 days).
  const req = on.length === days.length ? Math.min(s.dutyDays, on.length) : Math.min(s.dutyDays, on.length, Math.round((s.dutyDays * on.length) / 30))
  const restAllowed = Math.max(0, on.length - req)
  const recorded = new Set(mine.map((r) => r.day))
  const unmarked = on.filter((d) => d <= upTo && !recorded.has(d)).length
  const hours = r2(mine.reduce((a, r) => a + (isWorking(r.status) ? r.hours : 0), 0))
  const overtime = r2(mine.reduce((a, r) => a + (isWorking(r.status) ? r.overtime : 0), 0))
  const cap = p.overtimeCap ?? s.overtimeMax
  return {
    personId: p.id, monthDays: days.length, onProject: on.length, required: req, worked, present, mission, rest, absent, unmarked,
    shortfall: Math.max(0, req - worked), restAllowed, restOver: Math.max(0, rest - restAllowed),
    hours, overtime, overtimeCap: cap, overtimeLeft: r2(Math.max(0, cap - overtime)), overtimeOver: r2(Math.max(0, overtime - cap)),
    belowFloor: overtime < s.overtimeMin,
    breakfast: mine.filter((r) => r.breakfast).length, lunch: mine.filter((r) => r.lunch).length, dinner: mine.filter((r) => r.dinner).length,
  }
}

export interface VehicleMonth { vehicleId: string; onProject: number; present: number; repair: number; absent: number; unmarked: number; hours: number; km: number }

export function vehicleMonth(v: SvVehicle, rows: SvVehicleDay[], days: string[], upTo: string): VehicleMonth {
  const on = activeDays(days, v.startDate, v.endDate)
  const mine = rows.filter((r) => r.vehicleId === v.id && on.includes(r.day))
  const recorded = new Set(mine.map((r) => r.day))
  return {
    vehicleId: v.id, onProject: on.length,
    present: mine.filter((r) => r.status === 'present').length, repair: mine.filter((r) => r.status === 'repair').length, absent: mine.filter((r) => r.status === 'absent').length,
    unmarked: on.filter((d) => d <= upTo && !recorded.has(d)).length,
    hours: r2(mine.reduce((a, r) => a + (r.status === 'present' ? r.hours : 0), 0)),
    km: r2(mine.reduce((a, r) => a + (r.status === 'present' ? r.km ?? 0 : 0), 0)),
  }
}

export interface MonthTotals { people: number; worked: number; required: number; shortfall: number; hours: number; overtime: number; overtimeLeft: number; breakfast: number; lunch: number; dinner: number; vehicleDays: number; vehicleHours: number; unmarked: number }

export function monthTotals(pm: PersonMonth[], vm: VehicleMonth[]): MonthTotals {
  const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((a, x) => a + f(x), 0))
  return {
    people: pm.length, worked: sum(pm, (x) => x.worked), required: sum(pm, (x) => x.required), shortfall: sum(pm, (x) => x.shortfall),
    hours: sum(pm, (x) => x.hours), overtime: sum(pm, (x) => x.overtime), overtimeLeft: sum(pm, (x) => x.overtimeLeft),
    breakfast: sum(pm, (x) => x.breakfast), lunch: sum(pm, (x) => x.lunch), dinner: sum(pm, (x) => x.dinner),
    vehicleDays: sum(vm, (x) => x.present), vehicleHours: sum(vm, (x) => x.hours), unmarked: sum(pm, (x) => x.unmarked) + sum(vm, (x) => x.unmarked),
  }
}

/** Next status when a cell in the month grid is tapped (empty → present → mission → rest → absent → empty). */
export function nextStatus(s: SvStatus | null): SvStatus | null {
  if (s === null) return 'present'
  const i = STATUS_ORDER.indexOf(s)
  return i === STATUS_ORDER.length - 1 ? null : STATUS_ORDER[i + 1]
}
export function nextVehicleStatus(s: SvVehicleStatus | null): SvVehicleStatus | null {
  if (s === null) return 'present'
  const i = VSTATUS_ORDER.indexOf(s)
  return i === VSTATUS_ORDER.length - 1 ? null : VSTATUS_ORDER[i + 1]
}
