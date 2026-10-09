import type { RmKri, RmKriReading, RmKriState } from '../types'
import { dayDiff } from './riskState'
import { todayIso } from './riskScore'

export function kriStateOf(value: number | null, k: Pick<RmKri, 'direction' | 'warnThreshold' | 'criticalThreshold'>): RmKriState {
  if (value === null || Number.isNaN(value)) return 'no_data'
  if (k.direction === 'higher_worse') return value >= k.criticalThreshold ? 'critical' : value >= k.warnThreshold ? 'warn' : 'normal'
  return value <= k.criticalThreshold ? 'critical' : value <= k.warnThreshold ? 'warn' : 'normal'
}

export function validateKri(k: Pick<RmKri, 'direction' | 'warnThreshold' | 'criticalThreshold' | 'name' | 'frequencyDays'>): string | null {
  if (!k.name.trim()) return 'نام شاخص را بنویسید'
  if (!Number.isFinite(k.warnThreshold) || !Number.isFinite(k.criticalThreshold)) return 'آستانه‌های هشدار و بحرانی را وارد کنید'
  if (k.direction === 'higher_worse' && k.warnThreshold > k.criticalThreshold) return 'برای شاخص «بزرگ‌تر = بدتر» آستانهٔ هشدار باید ≤ آستانهٔ بحرانی باشد'
  if (k.direction === 'lower_worse' && k.warnThreshold < k.criticalThreshold) return 'برای شاخص «کوچک‌تر = بدتر» آستانهٔ هشدار باید ≥ آستانهٔ بحرانی باشد'
  if (!(k.frequencyDays >= 1 && k.frequencyDays <= 365)) return 'تناوب پایش باید بین ۱ تا ۳۶۵ روز باشد'
  return null
}

/** Least-squares slope in units/day over the most recent `n` readings; null when fewer than 3 points or all on one day. */
export function kriSlope(readings: RmKriReading[], n = 6): number | null {
  const pts = [...readings].sort((a, b) => (a.readAt < b.readAt ? -1 : 1)).slice(-n).map((r) => ({ t: Date.parse(r.readAt) / 86400000, v: r.value }))
  if (pts.length < 3) return null
  const mt = pts.reduce((s, p) => s + p.t, 0) / pts.length
  const mv = pts.reduce((s, p) => s + p.v, 0) / pts.length
  const den = pts.reduce((s, p) => s + (p.t - mt) ** 2, 0)
  if (den === 0) return null
  return pts.reduce((s, p) => s + (p.t - mt) * (p.v - mv), 0) / den
}

/** Days until the projected value crosses a threshold, or null when it is not moving toward it. */
export function daysToThreshold(k: RmKri, readings: RmKriReading[], which: 'warn' | 'critical'): number | null {
  const slope = kriSlope(readings)
  if (slope === null || k.currentValue === null) return null
  const target = which === 'warn' ? k.warnThreshold : k.criticalThreshold
  const toward = k.direction === 'higher_worse' ? slope > 0 : slope < 0
  if (!toward) return null
  const gap = target - k.currentValue
  if (k.direction === 'higher_worse' ? gap <= 0 : gap >= 0) return 0
  return Math.max(0, Math.ceil(gap / slope))
}

export interface KriInsight { exposureRising: boolean; daysToWarn: number | null; daysToCritical: number | null; slope: number | null; readingOverdue: boolean; message: string }

/** Early warning: still «normal» but projected to cross within three monitoring cycles; or a reading is overdue. */
export function kriInsight(k: RmKri, readings: RmKriReading[], today = todayIso()): KriInsight {
  const slope = kriSlope(readings)
  const dw = k.state === 'normal' ? daysToThreshold(k, readings, 'warn') : null
  const dc = k.state === 'warn' ? daysToThreshold(k, readings, 'critical') : null
  const horizon = k.frequencyDays * 3
  const rising = (dw !== null && dw <= horizon) || (dc !== null && dc <= horizon)
  const overdue = k.active && (k.lastReadingAt ? dayDiff(k.lastReadingAt.slice(0, 10), today) > Math.ceil(k.frequencyDays * 1.5) : true)
  const message = k.state === 'critical' ? 'در محدودهٔ بحرانی' : k.state === 'warn' ? (dc !== null && dc <= horizon ? `تا حدود ${dc} روز دیگر بحرانی می‌شود` : 'در محدودهٔ هشدار') : rising ? `روند افزایشی؛ حدود ${dw} روز تا آستانهٔ هشدار` : overdue ? 'قرائت جدید لازم است' : ''
  return { exposureRising: rising, daysToWarn: dw, daysToCritical: dc, slope, readingOverdue: overdue, message }
}
