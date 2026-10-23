import type { SvAttendance, SvGuestMeal, SvPerson, SvSettings, SvStatus, SvVehicle, SvVehicleDay, SvVehicleStatus } from '../types'

export const DEFAULT_SETTINGS: SvSettings = { dutyDays: 23, standardHours: 8, overtimeMin: 60, overtimeMax: 80, vehicleHours: 8, entryGraceDays: 2 }

export const STATUS_FA: Record<SvStatus, string> = { present: 'حاضر', mission: 'مأموریت', rest: 'استراحت', sick: 'استعلاجی', absent: 'غایب' }
/** one-letter marks for the month grid */
export const STATUS_MARK: Record<SvStatus, string> = { present: 'ح', mission: 'م', rest: 'ا', sick: 'ع', absent: 'غ' }
export const STATUS_ORDER: SvStatus[] = ['present', 'mission', 'rest', 'sick', 'absent']
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

/** Hours and overtime of a day from its times: everything past the duty day (8 h) is overtime. No times = the duty day. */
export function dayHours(checkIn: string | null, checkOut: string | null, s: SvSettings): { hours: number; overtime: number } {
  const h = hoursBetween(checkIn, checkOut)
  return h === null || h === 0 ? { hours: s.standardHours, overtime: 0 } : splitHours(h, s.standardHours)
}

/** Meals of a day: a supervisor who is present takes all three meals, however long the day; any other status none. */
export function mealsOf(_p: unknown, status: SvStatus): { breakfast: boolean; lunch: boolean; dinner: boolean } {
  const on = status === 'present'
  return { breakfast: on, lunch: on, dinner: on }
}

/** The values a day takes when its status is set: a present day takes the person's shift (or the standard 8 hours) and meals; mission counts the duty day. */
export function dayDefaults(p: Pick<SvPerson, 'mealBreakfast' | 'mealLunch' | 'mealDinner' | 'shiftStart' | 'shiftEnd'>, status: SvStatus, s: SvSettings): Pick<SvAttendance, 'checkIn' | 'checkOut' | 'hours' | 'overtime' | 'breakfast' | 'lunch' | 'dinner'> {
  if (status === 'present') return { checkIn: p.shiftStart, checkOut: p.shiftEnd, ...dayHours(p.shiftStart, p.shiftEnd, s), ...mealsOf(p, status) }
  if (status === 'mission') return { checkIn: null, checkOut: null, hours: s.standardHours, overtime: 0, ...mealsOf(p, status) }
  return { checkIn: null, checkOut: null, hours: 0, overtime: 0, ...mealsOf(p, status) }
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
  sick: number
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
  const present = count('present'), mission = count('mission'), rest = count('rest'), sick = count('sick'), absent = count('absent')
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
    personId: p.id, monthDays: days.length, onProject: on.length, required: req, worked, present, mission, rest, sick, absent, unmarked,
    // medical leave is excused: it does not count as worked, but it is not a shortfall either
    shortfall: Math.max(0, req - worked - sick), restAllowed, restOver: Math.max(0, rest - restAllowed),
    hours, overtime, overtimeCap: cap, overtimeLeft: r2(Math.max(0, cap - overtime)), overtimeOver: r2(Math.max(0, overtime - cap)),
    belowFloor: overtime < s.overtimeMin,
    // meals follow attendance: every present day is breakfast, lunch and dinner
    breakfast: present, lunch: present, dinner: present,
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

export interface GuestTotals { entries: number; guests: number; breakfast: number; lunch: number; dinner: number }
export function guestTotals(rows: SvGuestMeal[]): GuestTotals {
  return {
    entries: rows.length, guests: new Set(rows.map((r) => r.guestName.trim())).size,
    breakfast: rows.reduce((a, r) => a + r.breakfast, 0), lunch: rows.reduce((a, r) => a + r.lunch, 0), dinner: rows.reduce((a, r) => a + r.dinner, 0),
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
