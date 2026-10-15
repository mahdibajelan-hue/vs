import { addDays, workingDays } from '../periods'
import type { ProductivityResult } from './productivity'
import { clamp, normCdf } from './stats'

export interface ActivityForecast {
  activityId: string
  /** expected output per working day / per 7-day week at the current rate */
  perDay: number | null
  perWeek: number | null
  /** working days needed and finish date: expected, optimistic (rate +1σ), pessimistic (rate −1σ) */
  finish: string | null
  finishOptimistic: string | null
  finishPessimistic: string | null
  /** probability of finishing by the planned end (normal approximation of the sum of daily outputs) */
  onTimeProb: number | null
  lateRisk: 'low' | 'medium' | 'high' | 'unknown'
  /** units/day needed from today to finish on the planned end, and the ratio to the current rate (>1 = need to speed up) */
  requiredPerDay: number | null
  requiredRatio: number | null
  /** the input facts and caveats, shown beside every number */
  assumptions: string[]
  basis: { from: string | null; to: string | null; days: number; asOf: string; confidence: ProductivityResult['quality']['confidence'] }
  /** true when a blocker or missing history makes the figures unusable as a prediction */
  unreliable: boolean
}

function dateAfterWorkdays(today: string, n: number, wd: number[]): string {
  let d = today, c = 0
  for (let g = 0; c < n && g < 5000; g++) { d = addDays(d, 1); const w = ((new Date(`${d}T00:00:00Z`).getUTCDay()) + 1) % 7; if (wd.includes(w)) c++ }
  return d
}

export function forecastActivity(a: { activityId: string; remainingQty: number; plannedEnd: string | null; prod: ProductivityResult; today: string; workDays: number[]; blockers?: string[]; rateOverride?: number | null }): ActivityForecast {
  const r = a.prod.rates, rate = a.rateOverride ?? r.perCrewDay
  const assumptions: string[] = [
    `نرخ بر پایهٔ ${r.days} روز دادهٔ معتبر (${r.from ?? '—'} تا ${r.to ?? '—'}) با وزن‌دهی «${a.prod.params.weighting}» محاسبه شد.`,
    'فرض: ترکیب منابع، شرایط جبهه و محدودیت‌های اخیر ادامه می‌یابد.',
  ]
  if (a.blockers?.length) assumptions.push(`پیش‌نیازهای آماده‌نشده: ${a.blockers.join('، ')} — تا رفع آن‌ها پیش‌بینی معتبر نیست.`)
  if (a.prod.quality.confidence === 'low' || a.prod.quality.confidence === 'none') assumptions.push('کیفیت یا حجم داده برای پیش‌بینی قابل‌اتکا کم است؛ بازهٔ عدم‌قطعیت را جدی بگیرید.')
  const basis = { from: r.from, to: r.to, days: r.days, asOf: a.today, confidence: a.prod.quality.confidence }
  const unreliable = !rate || rate <= 0 || !!a.blockers?.length || a.prod.quality.confidence === 'none'
  const none: ActivityForecast = { activityId: a.activityId, perDay: rate ?? null, perWeek: rate != null ? rate * a.workDays.length : null, finish: null, finishOptimistic: null, finishPessimistic: null, onTimeProb: null, lateRisk: 'unknown', requiredPerDay: null, requiredRatio: null, assumptions, basis, unreliable: true }
  if (a.remainingQty <= 0) return { ...none, finish: a.today, finishOptimistic: a.today, finishPessimistic: a.today, onTimeProb: 1, lateRisk: 'low', requiredPerDay: 0, requiredRatio: 0, unreliable: false }
  if (!rate || rate <= 0) return none
  const sd = r.sd
  const days = (x: number) => Math.ceil(a.remainingQty / x)
  const f = dateAfterWorkdays(a.today, days(rate), a.workDays)
  const opt = sd != null ? dateAfterWorkdays(a.today, days(rate + sd), a.workDays) : null
  const pes = sd != null && rate - sd > 0 ? dateAfterWorkdays(a.today, days(rate - sd), a.workDays) : null
  let prob: number | null = null, req: number | null = null, ratio: number | null = null
  if (a.plannedEnd) {
    const wd = workingDays(addDays(a.today, 1), a.plannedEnd, a.workDays).length
    if (wd > 0) {
      req = a.remainingQty / wd; ratio = req / rate
      if (sd != null) prob = clamp(1 - normCdf((a.remainingQty - rate * wd) / Math.max(sd * Math.sqrt(wd), 1e-9)), 0, 1)
      else prob = ratio <= 1 ? 1 : 0
    } else { req = null; prob = 0 }
  }
  const lateRisk: ActivityForecast['lateRisk'] = prob == null ? 'unknown' : prob >= 0.8 ? 'low' : prob >= 0.4 ? 'medium' : 'high'
  return { activityId: a.activityId, perDay: rate, perWeek: rate * a.workDays.length, finish: f, finishOptimistic: opt, finishPessimistic: pes, onTimeProb: prob, lateRisk, requiredPerDay: req, requiredRatio: ratio, assumptions, basis, unreliable }
}
