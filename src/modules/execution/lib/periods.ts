import { JALALI_MONTHS, jalaliMonthLength, jalaliToIso, toJalali } from '../../../lib/jalali'

export interface Period { kind: 'day' | 'week' | 'month'; key: string; label: string; from: string; to: string }
const MS = 86400000
export const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
export const toIso = (d: Date): string => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => toIso(new Date(toDate(iso).getTime() + n * MS))
export const daysBetween = (a: string, b: string): number => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS)
/** 0 = Saturday … 6 = Friday */
export const weekdayOf = (iso: string): number => (toDate(iso).getUTCDay() + 1) % 7
export const faNum = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])

export function jalaliParts(iso: string): { jy: number; jm: number; jd: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return toJalali(y, m, d)
}
export const jalaliText = (iso: string): string => { const j = jalaliParts(iso); return faNum(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`) }

/** The week (by the project's week-start day) that contains the date. */
export function weekOf(iso: string, weekStart = 0): Period {
  const back = (weekdayOf(iso) - weekStart + 7) % 7
  const from = addDays(iso, -back), to = addDays(from, 6)
  return { kind: 'week', key: `W${from}`, from, to, label: `هفته ${jalaliText(from)} تا ${jalaliText(to)}` }
}
/** The Jalali month that contains the date. */
export function monthOf(iso: string): Period {
  const { jy, jm } = jalaliParts(iso)
  const from = jalaliToIso(jy, jm, 1), to = jalaliToIso(jy, jm, jalaliMonthLength(jy, jm))
  return { kind: 'month', key: `M${jy}-${String(jm).padStart(2, '0')}`, from, to, label: `${JALALI_MONTHS[jm - 1]} ${faNum(jy)}` }
}
export const dayOf = (iso: string): Period => ({ kind: 'day', key: `D${iso}`, from: iso, to: iso, label: jalaliText(iso) })
export const periodOf = (kind: Period['kind'], iso: string, weekStart = 0): Period => (kind === 'week' ? weekOf(iso, weekStart) : kind === 'month' ? monthOf(iso) : dayOf(iso))

/** Every period of the kind that touches [from, to]. */
export function periodsBetween(kind: 'week' | 'month', from: string, to: string, weekStart = 0): Period[] {
  const out: Period[] = []
  let cur = periodOf(kind, from, weekStart)
  for (let guard = 0; cur.from <= to && guard < 600; guard++) { out.push(cur); cur = periodOf(kind, addDays(cur.to, 1), weekStart) }
  return out
}
export function workingDays(from: string, to: string, workDays: number[]): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (workDays.includes(weekdayOf(d))) out.push(d)
  return out
}
