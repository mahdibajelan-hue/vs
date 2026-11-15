import { isoToJalali } from '../../../lib/jalali'

/** keys of the periods a photo can be chosen for: its day, its week (Saturday to Friday, named by its Saturday) and its Jalali month */
export const dayKey = (iso: string) => iso.slice(0, 10)
export function weekKey(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const back = (d.getUTCDay() + 1) % 7 // Saturday = 0 … Friday = 6
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}
export function monthKey(iso: string): string { const j = isoToJalali(iso.slice(0, 10)); return j ? `${j.jy}-${String(j.jm).padStart(2, '0')}` : iso.slice(0, 7) }
export type Period = 'day' | 'week' | 'month'
export const PERIOD_FA: Record<Period, string> = { day: 'عکس روز', week: 'عکس هفته', month: 'عکس ماه' }
export const keyOf = (p: Period, iso: string) => (p === 'day' ? dayKey(iso) : p === 'week' ? weekKey(iso) : monthKey(iso))
