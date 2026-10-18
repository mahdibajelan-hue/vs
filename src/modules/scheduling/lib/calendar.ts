import { addDays, daysBetween, weekdayOf } from '../../execution/lib/periods'

/** Work week: 0 = Saturday … 6 = Friday (the convention of the execution settings). */
export interface CalendarDef { workDays: number[]; holidays: string[]; hoursPerDay: number }
export const DEFAULT_CALENDAR: CalendarDef = { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }

/**
 * Working-day index space of one calendar: index 0 is the first working day on/after the anchor date; dateOf(i) is the i-th working day.
 * All schedule arithmetic (durations, lags, floats) is done on these integers, so non-working days never count.
 */
export class WorkCalendar {
  private days: string[] = []
  private index = new Map<string, number>()
  private cursor: string
  private holidays: Set<string>
  private week: Set<number>
  readonly def: CalendarDef
  readonly anchor: string
  constructor(def: CalendarDef, anchor: string) {
    this.def = def.workDays.length ? def : { ...def, workDays: DEFAULT_CALENDAR.workDays }
    this.holidays = new Set(this.def.holidays)
    this.week = new Set(this.def.workDays)
    this.anchor = anchor
    this.cursor = anchor
  }
  isWork(iso: string): boolean { return this.week.has(weekdayOf(iso)) && !this.holidays.has(iso) }
  private extendTo(len: number, until?: string) {
    let guard = 0
    while ((this.days.length < len || (until != null && this.cursor <= until)) && guard++ < 200000) {
      if (this.isWork(this.cursor)) { this.index.set(this.cursor, this.days.length); this.days.push(this.cursor) }
      this.cursor = addDays(this.cursor, 1)
    }
  }
  /** i-th working day (i ≥ 0) */
  dateOf(i: number): string { const k = Math.max(0, Math.round(i)); this.extendTo(k + 1); return this.days[k] }
  /** index of the first working day on or after `iso` (dates before the anchor map to 0) */
  idxOnOrAfter(iso: string): number {
    if (iso <= this.anchor) { return 0 }
    this.extendTo(0, iso)
    const hit = this.index.get(iso); if (hit != null) return hit
    this.extendTo(this.days.length + 1)
    for (let g = 0; g < 400; g++) { const h = this.index.get(addDays(iso, g)); if (h != null) return h; this.extendTo(this.days.length + 1, addDays(iso, g + 1)) }
    return this.days.length
  }
  /** index of the last working day on or before `iso` (dates before the anchor map to 0) */
  idxOnOrBefore(iso: string): number {
    if (iso <= this.anchor) return 0
    const a = this.idxOnOrAfter(iso)
    return this.days[a] === iso ? a : Math.max(0, a - 1)
  }
  /** working days from a to b (b later = positive); both snapped to working days */
  workDaysBetween(a: string, b: string): number { return this.idxOnOrAfter(b) - this.idxOnOrAfter(a) }
}

/** calendar days from a to b */
export const calDays = daysBetween
