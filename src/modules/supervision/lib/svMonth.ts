import { JALALI_MONTHS, isoToJalali, jalaliMonthLength, jalaliToIso, jalaliWeekday, todayJalali } from '../../../lib/jalali'

export interface Ym { jy: number; jm: number }

/** Local "today" as yyyy-mm-dd (not UTC: a site in Iran records the day it is there). */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const thisMonth = (): Ym => { const t = todayJalali(); return { jy: t.jy, jm: t.jm } }
export const monthOf = (iso: string): Ym => { const j = isoToJalali(iso)!; return { jy: j.jy, jm: j.jm } }
export const monthLabel = (m: Ym) => `${JALALI_MONTHS[m.jm - 1]} ${m.jy}`
export const shiftYm = (m: Ym, d: number): Ym => { const k = m.jy * 12 + (m.jm - 1) + d; return { jy: Math.floor(k / 12), jm: (k % 12) + 1 } }
export const sameYm = (a: Ym, b: Ym) => a.jy === b.jy && a.jm === b.jm

export interface MonthDay { iso: string; jd: number; weekday: number }
/** All days of a Jalali month, with the weekday (0 = Saturday … 6 = Friday). */
export function monthDays(m: Ym): MonthDay[] {
  return Array.from({ length: jalaliMonthLength(m.jy, m.jm) }, (_, i) => ({ iso: jalaliToIso(m.jy, m.jm, i + 1), jd: i + 1, weekday: jalaliWeekday(m.jy, m.jm, i + 1) }))
}
/** Last day that should already be recorded: today inside the running month, the month's end for a past month, nothing for a future one. */
export function recordedUpTo(m: Ym): string {
  const days = monthDays(m), today = todayLocal()
  if (today < days[0].iso) return ''
  return today > days[days.length - 1].iso ? days[days.length - 1].iso : today
}
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const WD = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
export const weekdayFa = (iso: string) => { const j = isoToJalali(iso)!; return WD[jalaliWeekday(j.jy, j.jm, j.jd)] }
export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
export const faNum = (n: number, digits = 1) => fa(Number.isInteger(n) ? n.toLocaleString('en') : n.toLocaleString('en', { maximumFractionDigits: digits }))
/** "1405-07" — the key a month's sign-off is stored under. */
export const ymKey = (m: Ym) => `${m.jy}-${String(m.jm).padStart(2, '0')}`
