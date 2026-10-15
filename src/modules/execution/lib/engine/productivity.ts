import { addDays } from '../periods'
import { clamp, linreg, mean, median, quantile, stdev, sum } from './stats'

/** One crew's day on one activity — a row of ex_crew_logs joined to the report date. */
export interface CrewLog {
  date: string
  activityId: string
  crew: string
  /** resource name → units, e.g. { sideboom: 2, weld_machine: 4, welder: 8, fitter: 3 } */
  composition: Record<string, number>
  usefulHours: number
  idleHours: number
  outputQty: number
  /** the factor that limited the day, if recorded: inspection | material | front | permit | weather | … */
  limit?: string
  /** only logs of approved reports should be passed in; this flag lets the caller keep unapproved ones visible but excluded */
  approved?: boolean
}

export interface ProductivityParams {
  /** days of history used, counted back from `asOf` (default 28) */
  windowDays: number
  /** 'all' = plain mean · 'wma' = linearly increasing weights (recent days count more) · 'sma' = mean of the last `smaDays` observations */
  weighting: 'all' | 'wma' | 'sma'
  smaDays: number
  /** observations farther than this many robust sigmas (MAD) from the median are excluded */
  outlierSigma: number
  /** names of the composition keys that are people (for man-hour rates); others count as equipment */
  laborKeys: string[]
  /** logs with no useful hours but output are invalid when true */
  requireHours: boolean
}
export const DEFAULT_PRODUCTIVITY_PARAMS: ProductivityParams = {
  windowDays: 28, weighting: 'wma', smaDays: 7, outlierSigma: 3.5,
  laborKeys: ['welder', 'fitter', 'helper', 'worker', 'grinder', 'operator', 'foreman', 'جوشکار', 'فیتر', 'کمکی', 'کارگر', 'سنگ‌زن', 'اپراتور', 'سرپرست'],
  requireHours: true,
}

export type Issue = 'negative' | 'no_hours' | 'duplicate' | 'no_composition' | 'outlier' | 'unapproved'
export interface Validated { log: CrewLog; issues: Issue[]; valid: boolean }

export function validateLogs(logs: CrewLog[], p: ProductivityParams): Validated[] {
  const seen = new Map<string, number>()
  const res: Validated[] = logs.map((log) => {
    const issues: Issue[] = []
    if (log.outputQty < 0 || log.usefulHours < 0 || log.idleHours < 0) issues.push('negative')
    if (p.requireHours && log.outputQty > 0 && log.usefulHours <= 0) issues.push('no_hours')
    if (!Object.values(log.composition).some((v) => v > 0)) issues.push('no_composition')
    if (log.approved === false) issues.push('unapproved')
    const k = `${log.date}|${log.activityId}|${log.crew}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
    return { log, issues, valid: false }
  })
  for (const r of res) if ((seen.get(`${r.log.date}|${r.log.activityId}|${r.log.crew}`) ?? 0) > 1) r.issues.push('duplicate')
  // outliers on daily output per useful hour, robust (median / MAD) and only among otherwise-clean rows
  const clean = res.filter((r) => !r.issues.length && r.log.usefulHours > 0)
  const rates = clean.map((r) => r.log.outputQty / r.log.usefulHours)
  const med = median(rates)
  if (med != null && clean.length >= 5) {
    const mad = median(rates.map((x) => Math.abs(x - med))) ?? 0
    const scale = 1.4826 * mad
    if (scale > 0) clean.forEach((r, i) => { if (Math.abs(rates[i] - med) / scale > p.outlierSigma) r.issues.push('outlier') })
  }
  for (const r of res) r.valid = r.issues.length === 0
  return res
}

export interface RateStats {
  /** units of output per crew-day (a day on which the crew logged output or useful hours) */
  perCrewDay: number | null
  perUsefulHour: number | null
  /** output per man-hour: output ÷ (people × useful hours) */
  perManHour: number | null
  perEquipHour: number | null
  /** daily output standard deviation, coefficient of variation */
  sd: number | null
  cv: number | null
  p10: number | null
  p90: number | null
  /** change of the daily output per week from a linear fit of the daily series (null with <6 days) */
  trendPerWeek: number | null
  trendR2: number | null
  /** utilisation: useful ÷ (useful + idle) hours */
  utilisation: number | null
  days: number
  from: string | null
  to: string | null
}
export interface Quality { total: number; used: number; excluded: Record<Issue, number>; score: number; confidence: 'high' | 'medium' | 'low' | 'none' }
export interface ProductivityResult { rates: RateStats; quality: Quality; params: ProductivityParams; asOf: string; usedLogs: CrewLog[] }

function weightedMean(values: number[], weights: number[]): number | null {
  const w = sum(weights)
  return w > 0 ? sum(values.map((v, i) => v * weights[i])) / w : null
}

/** Productivity of one activity (optionally one crew) from its crew logs — unit-consistent: a rate is only ever computed inside one activity. */
export function productivity(allLogs: CrewLog[], asOf: string, params: Partial<ProductivityParams> = {}): ProductivityResult {
  const p = { ...DEFAULT_PRODUCTIVITY_PARAMS, ...params }
  const from = addDays(asOf, -p.windowDays + 1)
  const inWindow = allLogs.filter((l) => l.date >= from && l.date <= asOf)
  const val = validateLogs(inWindow, p)
  const excluded: Record<Issue, number> = { negative: 0, no_hours: 0, duplicate: 0, no_composition: 0, outlier: 0, unapproved: 0 }
  for (const v of val) for (const i of v.issues) excluded[i]++
  const used = val.filter((v) => !v.issues.length).map((v) => v.log).sort((a, b) => a.date.localeCompare(b.date))
  // one value per day (several crews on a day are summed per crew-day basis below)
  const days = [...new Set(used.map((l) => l.date))].sort()
  const dailyOut = days.map((d) => sum(used.filter((l) => l.date === d).map((l) => l.outputQty)))
  const dailyCrews = days.map((d) => used.filter((l) => l.date === d).length)
  const perCrewDayDaily = dailyOut.map((o, i) => o / Math.max(1, dailyCrews[i]))
  let perCrewDay: number | null = null
  if (perCrewDayDaily.length) {
    if (p.weighting === 'all') perCrewDay = mean(perCrewDayDaily)
    else if (p.weighting === 'sma') perCrewDay = mean(perCrewDayDaily.slice(-p.smaDays))
    else perCrewDay = weightedMean(perCrewDayDaily, perCrewDayDaily.map((_, i) => i + 1))
  }
  const hours = sum(used.map((l) => l.usefulHours)), idle = sum(used.map((l) => l.idleHours)), out = sum(used.map((l) => l.outputQty))
  const people = (l: CrewLog) => sum(Object.entries(l.composition).filter(([k]) => p.laborKeys.includes(k)).map(([, v]) => v))
  const equip = (l: CrewLog) => sum(Object.entries(l.composition).filter(([k]) => !p.laborKeys.includes(k)).map(([, v]) => v))
  const manH = sum(used.map((l) => people(l) * l.usefulHours)), eqH = sum(used.map((l) => equip(l) * l.usefulHours))
  const sd = stdev(perCrewDayDaily)
  const reg = perCrewDayDaily.length >= 6 ? linreg(perCrewDayDaily.map((_, i) => i), perCrewDayDaily) : null
  const rates: RateStats = {
    perCrewDay, perUsefulHour: hours > 0 ? out / hours : null, perManHour: manH > 0 ? out / manH : null, perEquipHour: eqH > 0 ? out / eqH : null,
    sd, cv: sd != null && perCrewDay ? sd / perCrewDay : null, p10: quantile(perCrewDayDaily, 0.1), p90: quantile(perCrewDayDaily, 0.9),
    trendPerWeek: reg ? reg.b * 7 : null, trendR2: reg ? reg.r2 : null,
    utilisation: hours + idle > 0 ? hours / (hours + idle) : null, days: days.length, from: days[0] ?? null, to: days[days.length - 1] ?? null,
  }
  const total = inWindow.length, usedN = used.length
  const score = total ? usedN / total : 0
  const confidence: Quality['confidence'] = usedN === 0 ? 'none' : days.length >= 14 && score >= 0.8 && (rates.cv ?? 1) < 0.35 ? 'high' : days.length >= 7 && score >= 0.6 ? 'medium' : 'low'
  return { rates, quality: { total, used: usedN, excluded, score, confidence }, params: p, asOf, usedLogs: used }
}

/* ───────────────────────────── capacity versus resources ───────────────────────────── */

export interface Constraint { key: string; label: string; /** maximum output per day imposed by this constraint */ maxPerDay: number }
export interface CapacityModel {
  /** observed relationship output ∝ units^elasticity for the key resource, if the history supports it */
  elasticity: number
  basis: 'observed' | 'assumed'
  r2: number | null
  distinctSizes: number
  note: string
}

/** Elasticity of daily output to the number of units of one resource (log–log fit across days with different crew sizes). With fewer than 3 distinct sizes or a poor fit, `assumedElasticity` is used and the result is labelled as an assumption. */
export function resourceElasticity(logs: CrewLog[], resource: string, assumedElasticity = 0.6, minR2 = 0.3): CapacityModel {
  const pts = logs.filter((l) => (l.composition[resource] ?? 0) > 0 && l.outputQty > 0 && l.usefulHours > 0).map((l) => ({ n: l.composition[resource], y: l.outputQty / l.usefulHours }))
  const sizes = new Set(pts.map((x) => x.n))
  if (sizes.size >= 3 && pts.length >= 8) {
    const f = linreg(pts.map((x) => Math.log(x.n)), pts.map((x) => Math.log(x.y)))
    if (f && f.r2 >= minR2) return { elasticity: clamp(f.b, 0, 1), basis: 'observed', r2: f.r2, distinctSizes: sizes.size, note: 'از رابطهٔ لگاریتمی خروجی و تعداد منبع در سوابق همین فعالیت برآورد شد.' }
  }
  return { elasticity: assumedElasticity, basis: 'assumed', r2: null, distinctSizes: sizes.size, note: 'داده‌ٔ تاریخی برای برآورد اثر افزایش این منبع کافی نیست؛ ضریب فرضی تنظیمات به‌کار رفت و نتیجه فقط یک سناریوی فرضی است.' }
}

export interface CapacityInput {
  /** current daily output of the crew (units/day) — normally rates.perCrewDay */
  baseRate: number
  /** current composition and the composition to evaluate */
  baseComposition: Record<string, number>
  newComposition: Record<string, number>
  /** elasticity per resource key (resources without an entry use `defaultElasticity`) */
  elasticity: Record<string, number>
  defaultElasticity?: number
  constraints?: Constraint[]
}
export interface CapacityOutput { rate: number; uncapped: number; limitedBy: Constraint | null; changed: { key: string; from: number; to: number }[] }

/** Output of a changed composition: each changed resource scales the rate by (new/old)^elasticity; the result is then capped by every external constraint (front, inspection, material …). Elasticities below 1 already encode diminishing returns, so adding one resource while the others stay fixed yields a sub-proportional gain. */
export function capacity(i: CapacityInput): CapacityOutput {
  const keys = new Set([...Object.keys(i.baseComposition), ...Object.keys(i.newComposition)])
  const changed: CapacityOutput['changed'] = []
  let factor = 1
    for (const k of keys) {
    const from = i.baseComposition[k] ?? 0, to = i.newComposition[k] ?? from
    if (from > 0 && to !== from) { changed.push({ key: k, from, to }); factor *= (to / from) ** (i.elasticity[k] ?? i.defaultElasticity ?? 0.6) }
  }
  const uncapped = i.baseRate * factor
  let rate = uncapped, limitedBy: Constraint | null = null
  for (const c of i.constraints ?? []) if (c.maxPerDay < rate) { rate = c.maxPerDay; limitedBy = c }
  return { rate, uncapped, limitedBy, changed }
}
