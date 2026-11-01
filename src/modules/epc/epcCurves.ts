import type { EpcProgress } from './epcProgress'

/**
 * EPC S-curves and their forecasts — pure functions over the one shared progress source (epcProgressOf at any date):
 * engineering (E), procurement (P), construction (C) and the weighted EPC total, planned and actual, as the radar, the
 * project dashboard, the health centre and the reports show them.
 *
 * Forecast (P, C and the total's parts other than E): Earned Schedule. ES = the date on which the PLAN reached the
 * progress actually achieved today. SPI(t) = time earned ÷ time spent since the discipline's planned start (the standard,
 * cumulative index; the last eight weeks' pace is reported beside it). The rest of the plan is then run at that pace:
 *   forecast(d) = plan( ES + (d − today) × SPI(t) ),  forecast finish = today + (planned finish − ES) ÷ SPI(t).
 * Engineering keeps the engineering module's own forecast (document submission rate and approval turnaround), so both
 * modules show one engineering finish. The total is the E/P/C forecasts combined with the same weights as the progress.
 */
export type DiscKey = 'eng' | 'proc' | 'cons' | 'total'
export interface CurvePt { date: string; planned: number | null; actual: number | null }
export type Curves = Record<DiscKey, CurvePt[] | null>
export interface Forecast {
  /** progress (0–100) at any date from today on */
  at: (date: string) => number
  points: { date: string; value: number }[]
  endDate: string; plannedEnd: string | null; slipDays: number | null
  /** time-based schedule performance used; null for a forecast that does not use it (engineering's own) */
  spi: number | null; esDate: string | null
  basis: string[]
  /** true when there was no measured pace and the plan's pace was assumed */
  assumed: boolean
}

const DAY = 86400000
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const add = (d: string, n: number) => iso(ms(d) + Math.round(n) * DAY)
const days = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })

/** the dates a curve is drawn on: about every two weeks (never more than ~60 points), plus the window ends and today */
export function curveTicks(from: string, to: string, today: string): string[] {
  const span = Math.max(1, days(from, to)), step = Math.max(7, Math.ceil(span / 60 / 7) * 7)
  const out = new Set<string>([from, to, today])
  for (let t = from; t <= to; t = add(t, step)) out.add(t)
  return [...out].filter((d) => d >= from && d <= to).sort()
}

/** E, P, C and total curves from the shared source; actual stops at today. null per discipline without data. */
export function epcCurves(at: (date: string) => EpcProgress, window: { start: string; finish: string } | null, today: string): Curves | null {
  if (!window) return null
  const from = window.start < today ? window.start : today
  const to = window.finish > today ? window.finish : today
  const pts = curveTicks(from, to, today).map((d) => ({ d, p: at(d) }))
  const pick = (k: 'eng' | 'proc' | 'cons') => (pts.some((x) => x.p[k]) ? pts.map(({ d, p }) => ({ date: d, planned: p[k]?.planned ?? null, actual: d <= today ? p[k]?.actual ?? 0 : null })) : null)
  const total = pts.some((x) => x.p.overall) ? pts.map(({ d, p }) => ({ date: d, planned: p.overall?.planned ?? null, actual: d <= today ? p.overall?.actual ?? 0 : null })) : null
  return { eng: pick('eng'), proc: pick('proc'), cons: pick('cons'), total }
}

/** linear interpolation of a series at a date (clamped to its ends) */
function interp(xs: { date: string; v: number }[], d: string): number {
  if (!xs.length) return 0
  if (d <= xs[0].date) return xs[0].v
  const last = xs[xs.length - 1]; if (d >= last.date) return last.v
  const i = xs.findIndex((x) => x.date > d), a = xs[i - 1], b = xs[i]
  return a.v + (b.v - a.v) * (days(a.date, d) / Math.max(1, days(a.date, b.date)))
}

/** Earned Schedule forecast of one curve (percent 0–100). */
export function esForecast(curve: CurvePt[], today: string, o: { windowDays?: number; name?: string } = {}): Forecast | { reason: string } {
  const W = o.windowDays ?? 56
  const plan = curve.filter((c) => c.planned != null).map((c) => ({ date: c.date, v: c.planned as number }))
  const act = curve.filter((c) => c.actual != null && c.date <= today).map((c) => ({ date: c.date, v: c.actual as number }))
  if (plan.length < 2) return { reason: 'برنامهٔ زمانی (تاریخ‌های برنامه‌ای) برای این بخش ثبت نشده است.' }
  const maxP = Math.max(...plan.map((p) => p.v))
  const plannedEnd = plan.find((p) => p.v >= maxP - 0.05)?.date ?? plan[plan.length - 1].date
  // the plan's start: the last point before it starts rising (a discipline's plan is flat at 0 until its work begins)
  const rise = plan.findIndex((p) => p.v > 0.05)
  const plannedStart = (rise > 0 ? plan[rise - 1] : plan[0]).date
  const planAt = (d: string) => (d >= plannedEnd ? maxP : interp(plan, d))
  const actualAt = (d: string) => (act.length && d >= act[0].date ? interp(act, d) : 0)
  // the date the plan reached v
  const esOf = (v: number): string => {
    if (v <= 0.05 || v <= plan[0].v) return plannedStart
    if (v >= maxP) return plannedEnd
    const i = plan.findIndex((p) => p.v >= v), a = plan[i - 1], b = plan[i]
    return add(a.date, days(a.date, b.date) * ((v - a.v) / Math.max(1e-9, b.v - a.v)))
  }
  const now = actualAt(today)
  const basis: string[] = []
  const done = (): Forecast => ({ at: () => now, points: [{ date: today, value: now }], endDate: today, plannedEnd, slipDays: days(plannedEnd, today), spi: null, esDate: null, basis: ['این بخش تکمیل شده است.'], assumed: false })
  if (now >= maxP - 0.05 && maxP >= 99.5) return done()
  const es = esOf(now)
  let spi: number, assumed = false
  // the recent pace, shown for information: it swings with how and when progress was recorded, so it does not drive the forecast
  const past = add(today, -W)
  const from = past > plannedStart ? past : plannedStart
  const recent = today > from && now >= 0.5 ? days(esOf(actualAt(from)), es) / Math.max(1, days(from, today)) : null
  if (today <= plannedStart && now < 0.05) {
    spi = 1; assumed = true
    basis.push(`زمان شروع برنامه‌ای این بخش (${plannedStart}) هنوز نرسیده است؛ اجرای آن طبق برنامه فرض شد.`)
  } else if (now >= 0.05 && today > plannedStart) {
    // the standard Earned Schedule index: schedule earned since the plan's start ÷ time spent since then
    spi = days(plannedStart, es) / Math.max(1, days(plannedStart, today))
    basis.push(`شاخص عملکرد زمانی (SPI زمانی) از شروع برنامه‌ای (${plannedStart}) تا امروز: ${fa(spi, 2)} — در ${fa(days(plannedStart, today))} روز، به اندازهٔ ${fa(days(plannedStart, es))} روزِ برنامه کار انجام شده است.`)
    if (recent != null && days(from, today) >= 14) basis.push(`(برای مقایسه: سرعت ${fa(days(from, today) / 7)} هفتهٔ اخیر ${fa(recent, 2)} بوده است.)`)
  } else if (today > plannedStart) {
    spi = 0; basis.push(`از شروع برنامه‌ای (${plannedStart}) تا امروز پیشرفتی ثبت نشده است.`)
  } else {
    spi = 1; assumed = true
    basis.push('پیشرفت واقعی برای اندازه‌گیری سرعت کار ثبت نشده است؛ فرض شد کار از امروز با سرعت برنامه پیش برود (خوش‌بینانه).')
  }
  if (!assumed && spi < 0.1) {
    basis.push(`سرعت اندازه‌گیری‌شده (${fa(spi, 2)}) بسیار پایین است؛ برای پیش‌بینی، حداقل ۰٫۱ به کار رفت.`)
    spi = 0.1
  }
  spi = Math.min(spi, 2.5)
  const endDate = add(today, days(es, plannedEnd) / spi)
  const at = (d: string) => (d <= today ? now : Math.max(now, planAt(add(es, days(today, d) * spi))))
  const points: { date: string; value: number }[] = []
  const step = Math.max(7, Math.ceil(days(today, endDate) / 60 / 7) * 7)
  for (let t = today; t < endDate; t = add(t, step)) points.push({ date: t, value: at(t) })
  points.push({ date: endDate, value: at(endDate) })
  basis.push(`تاریخی که برنامه به پیشرفت امروز (${fa(now, 1)}٪) رسیده بود (ES): ${es}. پایان پیش‌بینی = امروز + (پایان برنامه − ES) ÷ SPI زمانی.`)
  return { at, points, endDate, plannedEnd, slipDays: days(plannedEnd, endDate), spi, esDate: es, basis, assumed }
}

/** a forecast given as points (engineering's own), as the same shape */
export function forecastFromPoints(points: { date: string; value: number }[], endDate: string, plannedEnd: string | null, basis: string[]): Forecast {
  const xs = points.map((p) => ({ date: p.date, v: p.value }))
  return { at: (d) => interp(xs, d), points, endDate, plannedEnd, slipDays: plannedEnd ? days(plannedEnd, endDate) : null, spi: null, esDate: null, basis, assumed: false }
}

/** the EPC total's forecast: the disciplines' forecasts weighted like the progress itself */
export function combineForecasts(parts: { f: Forecast; w: number; label: string }[], today: string, plannedEnd: string | null): Forecast | { reason: string } {
  const list = parts.filter((p) => p.w > 0)
  const W = list.reduce((s, p) => s + p.w, 0)
  if (!list.length || W <= 0) return { reason: 'هیچ بخشی پیش‌بینی ندارد.' }
  const at = (d: string) => list.reduce((s, p) => s + p.w * p.f.at(d), 0) / W
  const endDate = list.map((p) => p.f.endDate).sort().slice(-1)[0]
  const points: { date: string; value: number }[] = []
  const step = Math.max(7, Math.ceil(days(today, endDate) / 60 / 7) * 7)
  for (let t = today; t < endDate; t = add(t, step)) points.push({ date: t, value: at(t) })
  points.push({ date: endDate, value: at(endDate) })
  const late = [...list].sort((a, b) => a.f.endDate.localeCompare(b.f.endDate)).slice(-1)[0]
  return {
    at, points, endDate, plannedEnd, slipDays: plannedEnd ? days(plannedEnd, endDate) : null, spi: null, esDate: null, assumed: list.some((p) => p.f.assumed),
    basis: [`ترکیب وزنی پیش‌بینی ${list.map((p) => p.label).join('، ')} با همان وزن‌های پیشرفت؛ پایان کل با دیرترین بخش (${late.label}) تعیین می‌شود.`],
  }
}
