import { isoToJalali, jalaliMonthLength, jalaliToIso, jalaliWeekday } from '../../../lib/jalali'
import type { TrackItem } from './imTracking'

export interface CalCell { iso: string; jd: number; inMonth: boolean; weekday: number }

/** Month grid for a Jalali month: Saturday-first, padded with the neighbouring months' days so every row has 7 cells. */
export function monthGrid(jy: number, jm: number): CalCell[] {
  const len = jalaliMonthLength(jy, jm)
  const lead = jalaliWeekday(jy, jm, 1)
  const cells: CalCell[] = []
  const prevY = jm === 1 ? jy - 1 : jy, prevM = jm === 1 ? 12 : jm - 1
  const prevLen = jalaliMonthLength(prevY, prevM)
  for (let k = lead; k > 0; k--) cells.push({ iso: jalaliToIso(prevY, prevM, prevLen - k + 1), jd: prevLen - k + 1, inMonth: false, weekday: (lead - k) % 7 })
  for (let d = 1; d <= len; d++) cells.push({ iso: jalaliToIso(jy, jm, d), jd: d, inMonth: true, weekday: jalaliWeekday(jy, jm, d) })
  const nextY = jm === 12 ? jy + 1 : jy, nextM = jm === 12 ? 1 : jm + 1
  let d = 1
  while (cells.length % 7 !== 0) { cells.push({ iso: jalaliToIso(nextY, nextM, d), jd: d, inMonth: false, weekday: cells.length % 7 }); d++ }
  return cells
}

export const shiftMonth = (jy: number, jm: number, delta: number): { jy: number; jm: number } => {
  const idx = jy * 12 + (jm - 1) + delta
  return { jy: Math.floor(idx / 12), jm: (idx % 12) + 1 }
}

export function monthOfIso(iso: string): { jy: number; jm: number } | null {
  const j = isoToJalali(iso)
  return j ? { jy: j.jy, jm: j.jm } : null
}

/** Items grouped by due date; undated items are left out (they cannot sit on a calendar). */
export function itemsByDate(items: TrackItem[]): Map<string, TrackItem[]> {
  const m = new Map<string, TrackItem[]>()
  for (const it of items) if (it.due) m.set(it.due, [...(m.get(it.due) ?? []), it])
  return m
}
