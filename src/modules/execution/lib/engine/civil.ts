import { addDays, jalaliParts, weekdayOf } from '../periods'
import { clamp, linreg, sum } from './stats'

/**
 * کارکرد ماشین‌آلات سیویل — earthmoving crews (route making, trench excavation, backfill) are governed by their
 * machines, so their productivity is measured per MACHINE-HOUR: approved output ÷ Σ(active machines × hours worked).
 *
 * For each civil activity:
 *   history   the project's own record from the first output: Σ output ÷ Σ machine-hours (a ratio of sums, so a
 *             short day does not weigh like a long one)
 *   recent    the same over the last 14 reported days
 *   estimate  recency-weighted ratio of sums (half-life 21 days) — the rate the next weeks are most likely to see;
 *             its 80% band from the spread of the daily rates (weighted, effective sample size)
 *   trend     change of the daily rate per week (least squares), with its fit
 * The finish then follows from the remaining quantity ÷ (estimate × machines × hours a day × working days), and the
 * machines needed to finish by the planned end from the same rate.
 */

export interface CivilDay {
  date: string
  /** machine name → { active units, hours worked per unit } of the activity's section that day */
  machines: Record<string, { active: number; hours: number }>
  /** approved output of each activity that day */
  out: Record<string, number>
}
export interface CivilActivity { id: string; title: string; unit: string; remaining: number; plannedEnd: string | null }

export interface MachineUse { name: string; avgActive: number; avgHours: number; machineHours: number; share: number }
export interface CivilRate {
  /** output per machine-hour */
  history: number | null
  recent: number | null
  estimate: number | null
  low: number | null
  high: number | null
  /** change of the daily rate per week and the R² of that fit */
  trendPerWeek: number | null
  trendR2: number | null
  days: number
  machineHours: number
  output: number
}
export interface CivilMonth { key: string; jy: number; jm: number; rate: number | null; output: number; machineHours: number }
export interface CivilForecast {
  activity: CivilActivity
  rate: CivilRate
  machines: MachineUse[]
  /** fleet the forecast assumes: recent average active machines and hours a day */
  fleet: { machines: number; hoursPerDay: number }
  /** expected output a working day, finish date and its band */
  perDay: number | null
  workDaysLeft: number | null
  finish: string | null
  finishEarly: string | null
  finishLate: string | null
  /** machines needed (same mix) to finish by the planned end at the estimated rate */
  machinesNeeded: number | null
  months: CivilMonth[]
  /** recent vs history, % (positive = faster lately) */
  recentVsHistoryPct: number | null
}

const DAY = 86400000
const recencyW = (date: string, today: string, half: number) => 0.5 ** (Math.max(0, (Date.parse(today) - Date.parse(date)) / DAY) / half)
const machineHoursOf = (d: CivilDay) => sum(Object.values(d.machines).map((x) => x.active * x.hours))

/** Days of one activity: from its first output on, the days its machines were on site. */
function spanOf(days: CivilDay[], id: string): CivilDay[] {
  const first = days.findIndex((d) => (d.out[id] ?? 0) > 0)
  return first < 0 ? [] : days.slice(first).filter((d) => machineHoursOf(d) > 0)
}

export function civilRate(days: CivilDay[], id: string, today: string, halfLife = 21, recentDays = 14): CivilRate {
  const span = spanOf(days, id)
  const out = span.map((d) => d.out[id] ?? 0), mh = span.map(machineHoursOf)
  const ratio = (o: number[], h: number[]) => { const H = sum(h); return H > 0 ? sum(o) / H : null }
  const history = ratio(out, mh)
  const recent = ratio(out.slice(-recentDays), mh.slice(-recentDays))
  const w = span.map((d) => recencyW(d.date, today, halfLife))
  const W = sum(w.map((x, i) => x * mh[i]))
  const estimate = W > 0 ? sum(w.map((x, i) => x * out[i])) / W : null
  let low: number | null = null, high: number | null = null
  if (estimate != null && span.length >= 3) {
    // weighted spread of the daily rates around the estimate; effective n from the weights
    const rates = out.map((o, i) => o / mh[i]), ww = w.map((x, i) => x * mh[i])
    const sw = sum(ww), v = sum(ww.map((x, i) => x * (rates[i] - estimate) ** 2)) / sw
    const nEff = sw ** 2 / sum(ww.map((x) => x * x))
    const se = Math.sqrt(v / Math.max(1, nEff - 1))
    low = Math.max(0, estimate - 1.2816 * se); high = estimate + 1.2816 * se
  }
  const reg = span.length >= 6 ? linreg(span.map((d) => (Date.parse(d.date) - Date.parse(span[0].date)) / DAY), out.map((o, i) => o / mh[i])) : null
  return { history, recent, estimate, low, high, trendPerWeek: reg ? reg.b * 7 : null, trendR2: reg ? reg.r2 : null, days: span.length, machineHours: sum(mh), output: sum(out) }
}

function afterWorkdays(from: string, n: number, wd: number[]): string {
  let d = from, c = 0
  for (let g = 0; c < n && g < 10000; g++) { d = addDays(d, 1); if (wd.includes(weekdayOf(d))) c++ }
  return d
}
const workdaysBetween = (from: string, to: string, wd: number[]) => { let c = 0; for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (wd.includes(weekdayOf(d))) c++; return c }

export function civilForecast(a: { days: CivilDay[]; activity: CivilActivity; today: string; workDays: number[]; recentDays?: number; fleetOverride?: { machines?: number; hoursPerDay?: number } }): CivilForecast {
  const recentDays = a.recentDays ?? 14
  const days = [...a.days].sort((x, y) => x.date.localeCompare(y.date))
  const rate = civilRate(days, a.activity.id, a.today, 21, recentDays)
  const span = spanOf(days, a.activity.id)
  // machines of the section over the activity's span
  const names = [...new Set(span.flatMap((d) => Object.keys(d.machines)))]
  const totalMH = sum(span.map(machineHoursOf)) || 1
  const machines: MachineUse[] = names.map((n) => {
    const on = span.map((d) => d.machines[n]).filter((x): x is { active: number; hours: number } => !!x)
    const mh = sum(on.map((x) => x.active * x.hours))
    return { name: n, avgActive: on.length ? sum(on.map((x) => x.active)) / span.length : 0, avgHours: on.length ? sum(on.map((x) => x.hours * x.active)) / Math.max(1e-9, sum(on.map((x) => x.active))) : 0, machineHours: mh, share: mh / totalMH }
  }).sort((x, y) => y.machineHours - x.machineHours)
  const rec = span.slice(-recentDays)
  const recMach = rec.length ? sum(rec.map((d) => sum(Object.values(d.machines).map((x) => x.active)))) / rec.length : 0
  const recHours = rec.length ? sum(rec.map(machineHoursOf)) / Math.max(1e-9, sum(rec.map((d) => sum(Object.values(d.machines).map((x) => x.active))))) : 0
  const fleet = { machines: a.fleetOverride?.machines ?? recMach, hoursPerDay: a.fleetOverride?.hoursPerDay ?? recHours }
  const perDay = rate.estimate != null ? rate.estimate * fleet.machines * fleet.hoursPerDay : null
  const left = (r: number | null) => (r && r > 0 && fleet.machines > 0 && fleet.hoursPerDay > 0 ? Math.ceil(a.activity.remaining / (r * fleet.machines * fleet.hoursPerDay)) : null)
  const n = a.activity.remaining <= 0 ? 0 : left(rate.estimate)
  const nE = a.activity.remaining <= 0 ? 0 : left(rate.high), nL = a.activity.remaining <= 0 ? 0 : left(rate.low)
  const wd = a.workDays.length ? a.workDays : [0, 1, 2, 3, 4, 5]
  let machinesNeeded: number | null = null
  if (a.activity.plannedEnd && rate.estimate && rate.estimate > 0 && fleet.hoursPerDay > 0 && a.activity.remaining > 0) {
    const w = workdaysBetween(a.today, a.activity.plannedEnd, wd)
    machinesNeeded = w > 0 ? Math.ceil(a.activity.remaining / (rate.estimate * fleet.hoursPerDay * w)) : null
  }
  // the project's own record month by month
  const mm = new Map<string, CivilMonth>()
  for (const d of span) {
    const j = jalaliParts(d.date), key = `${j.jy}-${String(j.jm).padStart(2, '0')}`
    const x = mm.get(key) ?? { key, jy: j.jy, jm: j.jm, rate: null, output: 0, machineHours: 0 }
    x.output += d.out[a.activity.id] ?? 0; x.machineHours += machineHoursOf(d); mm.set(key, x)
  }
  const months = [...mm.values()].sort((x, y) => x.key.localeCompare(y.key)).map((x) => ({ ...x, rate: x.machineHours > 0 ? x.output / x.machineHours : null }))
  return {
    activity: a.activity, rate, machines, fleet, perDay,
    workDaysLeft: n, finish: n == null ? null : n === 0 ? a.today : afterWorkdays(a.today, n, wd),
    finishEarly: nE == null ? null : nE === 0 ? a.today : afterWorkdays(a.today, nE, wd),
    finishLate: nL == null ? null : nL === 0 ? a.today : afterWorkdays(a.today, nL, wd),
    machinesNeeded, months,
    recentVsHistoryPct: rate.recent != null && rate.history ? clamp(((rate.recent - rate.history) / rate.history) * 100, -999, 999) : null,
  }
}

/** Work sections whose crews are earthmoving machines (route making, trenching, backfill, grading). */
export const isCivilSection = (s: string) => /حفار|کانال|خاک|مسیر|بکفیل|تسطیح|راه|گرده|سرند|بولدوزر|گریدر|لودر|کمپرسی/u.test(s.replace(/ي/g, 'ی').replace(/ك/g, 'ک'))
