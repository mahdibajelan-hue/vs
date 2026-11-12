import { addDays, jalaliParts, weekdayOf, workingDays } from '../periods'
import { clamp, sum } from './stats'

/**
 * پیش‌بینی کارکرد و تاریخ اتمام — future output of every activity, and the project's finish date, learned from the
 * daily work reports themselves: approved quantities, the crews on site, the weather and the ground.
 *
 * Crews, not loose resources. Every activity is done by one crew type (a work section of the report's resource table:
 * welding, stringing, trenching …). A crew is a set of machines and people; on each day the number of COMPLETE crews of
 * a type is counted from the report (min over its items of ⌊active units ÷ units per crew⌋), so a spare sideboom or one
 * extra welder adds nothing, and the sideboom of the stringing crew never counts for welding.
 *
 * The model, per activity (one activity at a time, so units never mix):
 *
 *     output(day) = p(w) · q · (N / N̄)^γ · f(w) · g(ground) · S
 *
 *   N      complete crews of the activity's crew type on the day; N̄ their history mean (a day without a crew of the
 *          type is a day the activity could not progress — it is left out rather than read as low productivity)
 *   γ      return to adding whole crews — Bayesian ridge in log space with prior 1 (an extra complete crew on its own
 *          front adds its full output) and prior SD 0.15; the penalty is the residual noise variance ÷ 0.15², so a
 *          history with a constant crew count stays on the prior instead of inventing a relationship
 *   f, g   multiplier of a weather class / ground state relative to a clear, dry day; estimated from the history and
 *          shrunk toward engineering priors in proportion to how many days back them (k₀ = 5 days)
 *   p(w)   share of crew days the activity produced anything, per weather class (a rained-off day is a zero)
 *   S      Duan's smearing factor (mean of exp(residual)) so the back-transform is unbiased
 *
 * Fitted by backfitting with recency weights (half-life 21 days), and compared by a rolling one-day-ahead backtest
 * with the plain recent average; the two are blended by inverse squared error.
 *
 * The future, day by day on the project calendar: each crew type has a capacity — the scenario's crews × the expected
 * weather of the Jalali month (climate preset blended with the project's own record). Within a crew type the capacity
 * is shared by its activities as it is today; when one finishes, its crews move on to the type's remaining work with
 * the same productivity in progress terms (value per crew-day), first to the started activities, then to the type's
 * not-yet-started ones in planned order. So with steady crews and weather the project's daily and monthly progress stays
 * steady instead of tailing off as activities close. Activities of a crew type with no output at all yet fall back to
 * their planned duration ÷ the project's performance index. P10/P90 come from the backtest error and the level error.
 */

export type WxClass = 'clear' | 'cloudy' | 'storm' | 'rain' | 'snow'
export const WX_CLASSES: WxClass[] = ['clear', 'cloudy', 'storm', 'rain', 'snow']
export const WX_FA: Record<WxClass, string> = { clear: 'صاف / نیمه‌ابری', cloudy: 'ابری', storm: 'باد و خاک', rain: 'بارانی', snow: 'برفی' }
/** report value → class; worst of the day wins */
export const WX_OF: Record<string, WxClass> = { sunny: 'clear', partly: 'clear', cloudy: 'cloudy', stormy: 'storm', rainy: 'rain', snowy: 'snow' }
const WX_RANK: Record<WxClass, number> = { clear: 0, cloudy: 1, storm: 2, rain: 3, snow: 4 }
export const worstWx = (a: WxClass | null, b: WxClass | null): WxClass | null => (!a ? b : !b ? a : WX_RANK[b] > WX_RANK[a] ? b : a)
/** output on such a day relative to a clear one (positive days), before the data speaks */
export const WX_PRIOR: Record<WxClass, number> = { clear: 1, cloudy: 0.95, storm: 0.75, rain: 0.65, snow: 0.45 }
/** chance the activity works at all on such a day, relative to its usual share */
const WX_P_PRIOR: Record<WxClass, number> = { clear: 1, cloudy: 1, storm: 0.85, rain: 0.6, snow: 0.4 }

export type GroundState = 'dry' | 'wet' | 'mud' | 'frozen' | 'snow'
export const GROUND_FA: Record<GroundState, string> = { dry: 'خشک', wet: 'خیس', mud: 'گل', frozen: 'یخ‌زده', snow: 'برف‌گیر' }
export const GROUND_PRIOR: Record<GroundState, number> = { dry: 1, wet: 0.9, mud: 0.65, frozen: 0.75, snow: 0.55 }
const GROUND_RANK: Record<GroundState, number> = { dry: 0, wet: 1, frozen: 2, mud: 3, snow: 4 }
export const worstGround = (a: GroundState | null, b: GroundState | null): GroundState | null => (!a ? b : !b ? a : GROUND_RANK[b] > GROUND_RANK[a] ? b : a)
const GROUND_BY_WX_PRIOR: Record<WxClass, number> = { clear: 1, cloudy: 0.98, storm: 0.97, rain: 0.85, snow: 0.7 }

/** Climate presets: share of rainy, snowy and dust-storm working days in each Jalali month (فروردین … اسفند). */
export type ClimateKey = 'west_semi_arid' | 'cold_mountain' | 'hot_dry' | 'humid_north'
export const CLIMATE_FA: Record<ClimateKey, string> = { west_semi_arid: 'نیمه‌خشک غرب و زاگرس', cold_mountain: 'کوهستانی سرد (شمال‌غرب، البرز)', hot_dry: 'گرم و خشک (مرکز، جنوب، شرق)', humid_north: 'معتدل و مرطوب (سواحل خزر)' }
export const CLIMATE: Record<ClimateKey, { rain: number[]; snow: number[]; storm: number[] }> = {
  west_semi_arid: { rain: [0.22, 0.18, 0.06, 0.01, 0.01, 0.01, 0.04, 0.12, 0.2, 0.2, 0.22, 0.24], snow: [0, 0, 0, 0, 0, 0, 0, 0.01, 0.04, 0.08, 0.06, 0.02], storm: [0.05, 0.06, 0.08, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02, 0.03, 0.04] },
  cold_mountain: { rain: [0.25, 0.25, 0.1, 0.04, 0.03, 0.03, 0.06, 0.15, 0.15, 0.08, 0.1, 0.18], snow: [0.03, 0, 0, 0, 0, 0, 0, 0.03, 0.12, 0.25, 0.22, 0.1], storm: [0.04, 0.04, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.04] },
  hot_dry: { rain: [0.06, 0.04, 0.01, 0, 0, 0, 0.01, 0.03, 0.06, 0.07, 0.07, 0.07], snow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.01, 0], storm: [0.1, 0.12, 0.14, 0.15, 0.15, 0.12, 0.08, 0.05, 0.04, 0.04, 0.06, 0.08] },
  humid_north: { rain: [0.3, 0.25, 0.2, 0.15, 0.15, 0.25, 0.35, 0.4, 0.4, 0.35, 0.35, 0.35], snow: [0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.05, 0.02], storm: [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.03, 0.03, 0.03, 0.03, 0.02] },
}
export const isClimate = (v: unknown): v is ClimateKey => typeof v === 'string' && v in CLIMATE
const cloudyShare = (m: number) => (m >= 7 || m <= 1 ? 0.15 : 0.05)

/** One reported working day: the day's work reports merged. `out` = approved output per activity; `crews` = complete crews per crew type (null = the type's resources were not recorded that day). */
export interface DayObs { date: string; crews: Record<string, number | null>; wx: WxClass | null; ground: GroundState | null; out: Record<string, number> }

export interface OutlookActivity {
  id: string; title: string; unit: string; group: string
  /** weight inside its weighting basis */
  weight: number
  baseQty: number; doneQty: number
  plannedStart?: string | null
  plannedEnd: string | null
  /** crew type (work section) that does it; null = not assigned */
  crew: string | null
}
export interface OutlookScenario {
  /** complete crews of each type from now on; a type missing here keeps its recent average */
  crews: Record<string, number>
  climate: ClimateKey
  /** project calendar: 0 = Saturday … 6 = Friday */
  workDays: number[]
}
export interface OutlookParams { maxHistory: number; maxOrigins: number; halfLifeDays: number; priorGamma: number; priorSd: number; shrinkDays: number; recentDays: number; horizonDays: number; z: number; climatePriorDays: number }
export const DEFAULT_OUTLOOK_PARAMS: OutlookParams = { maxHistory: 180, maxOrigins: 30, halfLifeDays: 21, priorGamma: 1, priorSd: 0.15, shrinkDays: 5, recentDays: 14, horizonDays: 1500, z: 1.2816, climatePriorDays: 10 }

export interface ActivityModel {
  /** crew days in the history (days with at least one complete crew of its type, or all days when it has no crew type) */
  days: number
  positiveDays: number
  /** return to whole crews and the share of it that comes from the data (0 = all prior) */
  gamma: number; gammaData: number
  wx: Record<WxClass, { factor: number; days: number }>
  ground: Record<GroundState, { factor: number; days: number }>
  /** expected output on a clear, dry working day with the history's average crews */
  clearDayRate: number
  /** expected output of ONE complete crew on a clear, dry day (null without a crew type) */
  perCrewRate: number | null
  crewMean: number | null
  backtest: { origins: number; modelErrPct: number | null; naiveErrPct: number | null; blendWeight: number } | null
  cv: number
  confidence: 'high' | 'medium' | 'low'
}

export interface ActivityOutlook {
  activity: OutlookActivity
  remaining: number
  model: ActivityModel | null
  next7: number; next28: number
  finish: string | null; finishP10: string | null; finishP90: string | null
  slipDays: number | null
  /** '' = learned from its own output · queued = no output yet, its crew type takes it up after the type's current work · plan_based = planned duration ÷ performance index */
  reason: '' | 'done' | 'no_history' | 'no_rate' | 'plan_based' | 'queued' | 'beyond'
  /** first day it gets crew time (queued activities) */
  start: string | null
}

export interface CrewOutlook { crew: string; recent: number | null; scenario: number | null; activities: number; finish: string | null }
export interface OutlookPoint { date: string; expected: number; low: number; high: number }
export interface Outlook {
  activities: ActivityOutlook[]
  crews: CrewOutlook[]
  finish: string | null; finishP10: string | null; finishP90: string | null
  finishKnown: string | null
  unforecastable: number
  curve: OutlookPoint[]
  /** expected overall progress gain in each of the coming 6 Jalali months (0–1) — steady crews and weather give a steady figure */
  monthly: { key: string; jm: number; gain: number }[]
  monthFactor: number[]
  historyDays: number
  today: string
  performanceIndex: number | null
  planBased: number
  queued: number
}

// ── helpers ───────────────────────────────────────────────────────────────
const LN = Math.log
const recencyW = (date: string, today: string, half: number) => 0.5 ** (Math.max(0, (Date.parse(today) - Date.parse(date)) / 86400000) / half)
const shrink = (obs: number, prior: number, n: number, k: number) => (n * obs + k * prior) / (n + k)
const wmean = (v: number[], w: number[]) => { const s = sum(w); return s > 0 ? sum(v.map((x, i) => x * w[i])) / s : 0 }
const GROUNDS = Object.keys(GROUND_PRIOR) as GroundState[]

interface Fit {
  c: number; gamma: number; gammaData: number
  lnF: Record<WxClass, number>; lnG: Record<GroundState, number>
  pBase: number; pWx: Record<WxClass, number>
  S: number; crewMean: number | null
  nWx: Record<WxClass, number>; nG: Record<GroundState, number>
}
const crewOn = (d: DayObs, crew: string | null): number | null => (crew ? d.crews[crew] ?? null : null)

/** Fit the multiplicative model on the crew days of one activity. */
function fit(days: DayObs[], id: string, crew: string | null, today: string, P: OutlookParams): Fit | null {
  if (!days.length) return null
  const w = days.map((d) => recencyW(d.date, today, P.halfLifeDays))
  const y = days.map((d) => d.out[id] ?? 0)
  const N = days.map((d) => crewOn(d, crew))
  const known = N.map((n) => n != null && n > 0)
  const crewMean = crew && known.some(Boolean) ? wmean(N.map((n) => n ?? 0), w.map((x, i) => (known[i] ? x : 0))) : null
  const x1 = N.map((n, i) => (known[i] && crewMean ? LN((n as number) / crewMean) : 0))
  const wxOf = (d: DayObs): WxClass => d.wx ?? 'clear'
  const gOf = (d: DayObs): GroundState => d.ground ?? 'dry'

  const pos = y.map((v) => (v > 0 ? 1 : 0))
  const pBase = clamp(wmean(pos, w), 0.02, 1)
  const nWx = Object.fromEntries(WX_CLASSES.map((c) => [c, 0])) as Record<WxClass, number>
  const nG = Object.fromEntries(GROUNDS.map((g) => [g, 0])) as Record<GroundState, number>
  days.forEach((d) => { nWx[wxOf(d)]++; nG[gOf(d)]++ })
  const pWx = {} as Record<WxClass, number>
  for (const c of WX_CLASSES) {
    const idx = days.map((d, i) => (wxOf(d) === c ? i : -1)).filter((i) => i >= 0)
    const obs = idx.length ? wmean(idx.map((i) => pos[i]), idx.map((i) => w[i])) : 0
    pWx[c] = clamp(shrink(obs, Math.min(1, pBase * WX_P_PRIOR[c]), idx.length, P.shrinkDays), 0.01, 1)
  }
  const lnF = Object.fromEntries(WX_CLASSES.map((c) => [c, LN(WX_PRIOR[c])])) as Record<WxClass, number>
  const lnG = Object.fromEntries(GROUNDS.map((g) => [g, LN(GROUND_PRIOR[g])])) as Record<GroundState, number>
  const P_ = days.map((_, i) => i).filter((i) => y[i] > 0)
  if (!P_.length) return { c: -Infinity, gamma: P.priorGamma, gammaData: 0, lnF, lnG, pBase, pWx, S: 1, crewMean, nWx, nG }
  const r = y.map((v) => (v > 0 ? LN(v) : 0))
  let c = 0, gamma = P.priorGamma, gammaData = 0, noise = 0.1
  const res = (i: number, skipW: boolean, skipG: boolean) => r[i] - c - gamma * x1[i] - (skipW ? 0 : lnF[wxOf(days[i])]) - (skipG ? 0 : lnG[gOf(days[i])])
  for (let it = 0; it < 8; it++) {
    const t = P_.map((i) => r[i] - lnF[wxOf(days[i])] - lnG[gOf(days[i])])
    const ww = P_.map((i) => w[i])
    const m1 = wmean(P_.map((i) => x1[i]), ww), mt = wmean(t, ww)
    let s11 = 0, s1t = 0
    P_.forEach((i, k) => { const a = x1[i] - m1; s11 += ww[k] * a * a; s1t += ww[k] * a * (t[k] - mt) })
    const L = noise / P.priorSd ** 2
    gamma = crew ? clamp((s1t + L * P.priorGamma) / (s11 + L), 0.3, 1.2) : P.priorGamma
    gammaData = crew ? s11 / (s11 + L) : 0
    c = mt - gamma * m1
    const clearIdx = P_.filter((i) => wxOf(days[i]) === 'clear')
    const ref = clearIdx.length ? wmean(clearIdx.map((i) => res(i, true, false)), clearIdx.map((i) => w[i])) : 0
    for (const cl of WX_CLASSES) {
      if (cl === 'clear') { lnF[cl] = 0; continue }
      const idx = P_.filter((i) => wxOf(days[i]) === cl)
      const obs = idx.length && clearIdx.length ? wmean(idx.map((i) => res(i, true, false)), idx.map((i) => w[i])) - ref : LN(WX_PRIOR[cl])
      lnF[cl] = clamp(shrink(obs, LN(WX_PRIOR[cl]), idx.length, P.shrinkDays), LN(0.05), LN(1.3))
    }
    const dryIdx = P_.filter((i) => gOf(days[i]) === 'dry')
    const refG = dryIdx.length ? wmean(dryIdx.map((i) => res(i, false, true)), dryIdx.map((i) => w[i])) : 0
    for (const g of GROUNDS) {
      if (g === 'dry') { lnG[g] = 0; continue }
      const idx = P_.filter((i) => gOf(days[i]) === g)
      const obs = idx.length && dryIdx.length ? wmean(idx.map((i) => res(i, false, true)), idx.map((i) => w[i])) - refG : LN(GROUND_PRIOR[g])
      lnG[g] = clamp(shrink(obs, LN(GROUND_PRIOR[g]), idx.length, P.shrinkDays), LN(0.05), LN(1.3))
    }
    const ws = sum(P_.map((i) => w[i]))
    noise = P_.length > 2 && ws > 0 ? Math.max(0.002, (sum(P_.map((i) => w[i] * res(i, false, false) ** 2)) / ws) * (P_.length / (P_.length - 2))) : 0.1
  }
  const S = clamp(wmean(P_.map((i) => Math.exp(res(i, false, false))), P_.map((i) => w[i])), 0.5, 2)
  return { c, gamma, gammaData, lnF, lnG, pBase, pWx, S, crewMean, nWx, nG }
}

function predict(f: Fit, n: number | null, wx: WxClass | null, ground: GroundState | null): number {
  if (!Number.isFinite(f.c)) return 0
  if (n === 0) return 0
  const w = wx ?? 'clear', g = ground ?? 'dry'
  const ln = n != null && n > 0 && f.crewMean ? LN(n / f.crewMean) : 0
  return f.pWx[w] * Math.exp(f.c + f.gamma * ln + f.lnF[w] + f.lnG[g]) * f.S
}
function wxDayFactor(f: Fit, cl: WxClass, groundGivenWx: Record<WxClass, number>): number {
  if (!Number.isFinite(f.c)) return WX_PRIOR[cl]
  return (f.pWx[cl] / f.pWx.clear) * Math.exp(f.lnF[cl]) * groundGivenWx[cl]
}

/** The activity's crew days: from its first output on; days without a complete crew of its type are left out. */
function spanOf(days: DayObs[], id: string, crew: string | null): DayObs[] {
  const first = days.findIndex((d) => (d.out[id] ?? 0) > 0)
  if (first < 0) return []
  return days.slice(first).filter((d) => { const n = crewOn(d, crew); return n == null || n > 0 || (d.out[id] ?? 0) > 0 })
}

export function activityModel(allDays: DayObs[], id: string, crew: string | null, today: string, params: Partial<OutlookParams> = {}): { model: ActivityModel; fit: Fit; groundGivenWx: Record<WxClass, number> } | null {
  const P = { ...DEFAULT_OUTLOOK_PARAMS, ...params }
  const days = spanOf(allDays, id, crew).slice(-P.maxHistory)
  const f = fit(days, id, crew, today, P)
  if (!f) return null
  const y = days.map((d) => d.out[id] ?? 0)
  const w = days.map((d) => recencyW(d.date, today, P.halfLifeDays))
  const recent = days.slice(-P.recentDays)
  const naiveRate = recent.length ? sum(recent.map((d) => d.out[id] ?? 0)) / recent.length : 0
  const avgRate = wmean(y, w)

  const groundGivenWx = {} as Record<WxClass, number>
  for (const cl of WX_CLASSES) {
    const idx = days.map((d, i) => ((d.wx ?? 'clear') === cl ? i : -1)).filter((i) => i >= 0)
    const obs = idx.length ? wmean(idx.map((i) => Math.exp(f.lnG[days[i].ground ?? 'dry'])), idx.map((i) => w[i])) : GROUND_BY_WX_PRIOR[cl]
    groundGivenWx[cl] = shrink(obs, GROUND_BY_WX_PRIOR[cl], idx.length, P.shrinkDays)
  }

  let bt: ActivityModel['backtest'] = null, cv = 0.35
  const n = days.length
  if (n >= 8) {
    const start = Math.max(5, Math.floor(n * 0.5), n - P.maxOrigins)
    const eM: number[] = [], eN: number[] = []
    for (let i = start; i < n; i++) {
      const train = days.slice(0, i), ff = fit(train, id, crew, days[i - 1].date, P)
      if (!ff) continue
      const ty = train.slice(-P.recentDays).map((d) => d.out[id] ?? 0)
      eM.push(predict(ff, crewOn(days[i], crew), days[i].wx, days[i].ground) - y[i])
      eN.push((ty.length ? sum(ty) / ty.length : 0) - y[i])
    }
    const mse = (e: number[]) => (e.length ? sum(e.map((x) => x * x)) / e.length : null)
    const mae = (e: number[]) => (e.length ? sum(e.map(Math.abs)) / e.length : null)
    const mM = mse(eM), mN = mse(eN), my = avgRate || 1
    if (mM != null && mN != null) {
      const iM = 1 / Math.max(mM, 1e-9), iN = 1 / Math.max(mN, 1e-9), wB = iM / (iM + iN)
      bt = { origins: eM.length, modelErrPct: (mae(eM)! / my) * 100, naiveErrPct: (mae(eN)! / my) * 100, blendWeight: wB }
      cv = clamp(Math.sqrt(mse(eM.map((x, k) => wB * x + (1 - wB) * eN[k]))!) / my, 0.05, 2)
    }
  } else if (y.length >= 2) {
    const m = sum(y) / y.length
    cv = m > 0 ? clamp(Math.sqrt(sum(y.map((v) => (v - m) ** 2)) / (y.length - 1)) / m, 0.15, 2) : 0.5
  }
  const wB = bt ? bt.blendWeight : 0.5
  // the level on a clear, dry day with the average crews: model and recent average blended (the average is first
  // brought to clear-day, average-crew terms with the fitted factors of the days it came from)
  const dayFactor = (d: DayObs) => { const k = crewOn(d, crew); return wxDayFactor(f, d.wx ?? 'clear', groundGivenWx) * (k && f.crewMean ? (k / f.crewMean) ** f.gamma : 1) }
  const histFactor = recent.length ? sum(recent.map(dayFactor)) / recent.length : 1
  const modelClear = predict(f, f.crewMean, 'clear', 'dry')
  const clearDayRate = Math.max(0, wB * modelClear + (1 - wB) * (naiveRate / (histFactor || 1)))

  const wx = Object.fromEntries(WX_CLASSES.map((cl) => [cl, { factor: wxDayFactor(f, cl, groundGivenWx), days: f.nWx[cl] }])) as ActivityModel['wx']
  const ground = Object.fromEntries(GROUNDS.map((g) => [g, { factor: Math.exp(f.lnG[g]), days: f.nG[g] }])) as ActivityModel['ground']
  const confidence: ActivityModel['confidence'] = n >= 30 && cv < 0.4 && bt ? 'high' : n >= 10 && cv < 0.8 ? 'medium' : 'low'
  return {
    model: {
      days: n, positiveDays: y.filter((v) => v > 0).length, gamma: f.gamma, gammaData: f.gammaData, wx, ground, clearDayRate,
      perCrewRate: f.crewMean ? clearDayRate / f.crewMean : null, crewMean: f.crewMean, backtest: bt, cv, confidence,
    },
    fit: f, groundGivenWx,
  }
}

/** Expected share of each weather class in a Jalali month: the project's own record for that month blended with the climate preset. */
export function monthWeather(days: DayObs[], climate: ClimateKey, priorDays = 10): Record<WxClass, number>[] {
  const pre = CLIMATE[climate]
  return Array.from({ length: 12 }, (_, m) => {
    const prior: Record<WxClass, number> = { rain: pre.rain[m], snow: pre.snow[m], storm: pre.storm[m], cloudy: cloudyShare(m), clear: 0 }
    prior.clear = Math.max(0, 1 - prior.rain - prior.snow - prior.storm - prior.cloudy)
    // the month's own record; with no climate prior and no record for the month, the project's whole record
    let own = days.filter((d) => d.wx && jalaliParts(d.date).jm === m + 1)
    if (!own.length && priorDays <= 0) own = days.filter((d) => d.wx)
    const out = {} as Record<WxClass, number>
    for (const c of WX_CLASSES) out[c] = own.length + priorDays > 0 ? (own.filter((d) => d.wx === c).length + priorDays * prior[c]) / (own.length + priorDays) : prior[c]
    return out
  })
}

/** Complete crews from the day's active units: min over the crew's items of ⌊active ÷ per crew⌋. Without a composition the section's whole complement is one crew when at least half of its usual units are there. */
export function completeCrews(active: Record<string, number>, composition: Record<string, number> | null, usualTotal: number | null): number | null {
  const items = composition ? Object.entries(composition).filter(([, v]) => v > 0) : []
  if (items.length) return Math.min(...items.map(([k, v]) => Math.floor((active[k] ?? 0) / v + 1e-9)))
  const tot = sum(Object.values(active))
  if (!tot) return null
  return usualTotal && tot < usualTotal * 0.5 ? 0 : 1
}

export function outlook(a: { days: DayObs[]; activities: OutlookActivity[]; groupWeights?: Record<string, number>; today: string; scenario: OutlookScenario; params?: Partial<OutlookParams> }): Outlook {
  const P = { ...DEFAULT_OUTLOOK_PARAMS, ...a.params }
  const days = [...a.days].sort((x, y) => x.date.localeCompare(y.date))
  const mw = monthWeather(days, a.scenario.climate, P.climatePriorDays)
  const workDays = a.scenario.workDays.length ? a.scenario.workDays : [0, 1, 2, 3, 4, 5]
  const isWork = (d: string) => workDays.includes(weekdayOf(d))

  // crews: recent average of complete crews per type, and the scenario's
  const crewNames = [...new Set(a.activities.map((x) => x.crew).filter((x): x is string => !!x))]
  const recentCrews = (crew: string) => {
    const v = days.slice(-P.recentDays).map((d) => d.crews[crew]).filter((x): x is number => x != null)
    return v.length ? sum(v) / v.length : null
  }
  const crewRecent = new Map(crewNames.map((c) => [c, recentCrews(c)]))
  const crewScen = new Map(crewNames.map((c) => [c, a.scenario.crews[c] ?? crewRecent.get(c) ?? null]))

  // overall-progress value of one unit of each activity (same arithmetic as physical progress)
  const groups = new Map<string, number>()
  for (const x of a.activities) groups.set(x.group, (groups.get(x.group) ?? 0) + x.weight)
  const gw = (g: string) => a.groupWeights?.[g] ?? 1
  const tw = sum([...groups.keys()].map(gw))
  const valueOf = (x: OutlookActivity) => (x.baseQty > 0 && tw > 0 && (groups.get(x.group) ?? 0) > 0 ? (gw(x.group) / tw) * (x.weight / (groups.get(x.group) as number)) / x.baseQty : 0)

  type Run = { act: OutlookActivity; remaining: number; m: ReturnType<typeof activityModel>; daily: (d: string) => number; cv: number; value: number }
  const runs: Run[] = a.activities.map((act) => {
    const remaining = Math.max(0, act.baseQty - act.doneQty)
    const value = valueOf(act)
    const m = activityModel(days, act.id, act.crew, a.today, P)
    if (!m || m.model.clearDayRate <= 0) return { act, remaining, m, daily: () => 0, cv: m?.model.cv ?? 0.4, value }
    const f = m.fit, mdl = m.model
    const nS = act.crew ? crewScen.get(act.crew) ?? null : null
    const crewF = nS == null || !f.crewMean ? 1 : nS <= 0 ? 0 : (nS / f.crewMean) ** f.gamma
    const monthF = mw.map((share) => sum(WX_CLASSES.map((c) => share[c] * wxDayFactor(f, c, m.groundGivenWx))))
    const daily = (d: string) => (isWork(d) ? mdl.clearDayRate * crewF * monthF[jalaliParts(d).jm - 1] : 0)
    return { act, remaining, m, daily, cv: mdl.cv, value }
  })
  const rated = (r: Run) => !!r.m && r.m.model.clearDayRate > 0

  // pools: a crew type with at least one rated activity shares its capacity; activities without a crew type stand alone
  const pools = new Map<string, number[]>()
  runs.forEach((r, i) => { const k = r.act.crew ?? `#${r.act.id}`; const l = pools.get(k); if (l) l.push(i); else pools.set(k, [i]) })
  const pooled = new Set<number>()
  const queueOf = new Map<string, number[]>()
  for (const [k, idx] of pools) {
    if (!idx.some((i) => rated(runs[i]))) continue
    idx.forEach((i) => pooled.add(i))
    queueOf.set(k, idx.filter((i) => !rated(runs[i]) && runs[i].remaining > 0 && runs[i].value > 0)
      .sort((x, y) => (runs[x].act.plannedStart ?? '9999').localeCompare(runs[y].act.plannedStart ?? '9999') || runs[y].act.weight - runs[x].act.weight))
  }

  // performance index for the activities left over (no crew type with output): observed ÷ planned rate, weighted median
  const PI = (() => {
    const pts: { v: number; w: number }[] = []
    for (const r of runs) {
      if (!rated(r) || !r.act.plannedStart || !r.act.plannedEnd || r.act.baseQty <= 0) continue
      const wd = workingDays(r.act.plannedStart, r.act.plannedEnd, workDays).length
      const nd = workingDays(addDays(a.today, 1), addDays(a.today, 28), workDays).length
      if (wd <= 0 || nd <= 0) continue
      const obs = sum(Array.from({ length: 28 }, (_, k) => r.daily(addDays(a.today, k + 1)))) / nd
      pts.push({ v: obs / (r.act.baseQty / wd), w: Math.max(r.act.weight, 1e-6) })
    }
    if (!pts.length) return null
    pts.sort((x, y) => x.v - y.v)
    const half = sum(pts.map((x) => x.w)) / 2
    let acc = 0
    for (const x of pts) { acc += x.w; if (acc >= half) return clamp(x.v, 0.3, 2) }
    return clamp(pts[pts.length - 1].v, 0.3, 2)
  })()
  const afterWorkdays = (from: string, n: number) => { let d0 = from, c = 0; for (let g = 0; c < n && g < 5000; g++) { d0 = addDays(d0, 1); if (isWork(d0)) c++ } return d0 }
  const planned = runs.map((r, i) => {
    if (pooled.has(i) || r.remaining <= 0 || PI == null || !r.act.plannedStart || !r.act.plannedEnd || r.act.baseQty <= 0) return null
    const wd = workingDays(r.act.plannedStart, r.act.plannedEnd, workDays).length
    if (wd <= 0) return null
    const n = Math.max(1, Math.ceil((wd * (r.remaining / r.act.baseQty)) / PI))
    const start = r.act.plannedStart > a.today ? addDays(r.act.plannedStart, -1) : a.today
    return { start, n, finish: afterWorkdays(start, n), p10: afterWorkdays(start, Math.max(1, Math.round(n * 0.75))), p90: afterWorkdays(start, Math.ceil(n * 1.4)) }
  })
  const planEnd = planned.reduce((mx, x) => (x && x.p90 > mx ? x.p90 : mx), a.today)
  const planFrac = (i: number, d0: string, which: 'finish' | 'p10' | 'p90') => {
    const x = planned[i]!, b = runs[i].act.baseQty, s0 = runs[i].act.doneQty / b
    const span = Date.parse(x[which]) - Date.parse(x.start)
    const t = span > 0 ? clamp((Date.parse(d0) - Date.parse(x.start)) / span, 0, 1) : 1
    return Math.min(1, s0 + (1 - s0) * t)
  }

  // walk forward day by day: each pool's capacity (in progress value) is shared by its open activities
  const z = P.z
  type St = { mu: number; s1: number; s2: number; finish: string | null; p10: string | null; p90: string | null; n7: number; n28: number; start: string | null; cv: number; nh: number }
  const poolCv = new Map<string, { cv: number; nh: number }>()
  for (const [k, idx] of pools) {
    const rr = idx.filter((i) => rated(runs[i]))
    if (rr.length) poolCv.set(k, { cv: sum(rr.map((i) => runs[i].cv)) / rr.length, nh: Math.max(1, Math.min(...rr.map((i) => runs[i].m!.model.days))) })
  }
  const state: St[] = runs.map((r) => {
    const k = r.act.crew ?? `#${r.act.id}`, pc = poolCv.get(k)
    const done = r.remaining <= 0 ? a.today : null
    return { mu: 0, s1: 0, s2: 0, finish: done, p10: done, p90: done, n7: 0, n28: 0, start: null, cv: rated(r) ? r.cv : pc?.cv ?? 0.4, nh: rated(r) ? Math.max(1, r.m!.model.days) : pc?.nh ?? 1 }
  })
  const sdOf = (i: number) => Math.sqrt(state[i].s1 + (state[i].cv ** 2 / state[i].nh) * state[i].s2 ** 2)
  const fracOf = (i: number, add: number) => { const b = runs[i].act.baseQty; return b > 0 ? Math.min(1, (runs[i].act.doneQty + add) / b) : 0 }
  const tw2 = tw || 1
  const overallAt = (frac: (i: number) => number) => sum(runs.map((r, i) => (r.act.baseQty > 0 && (groups.get(r.act.group) ?? 0) > 0 ? (gw(r.act.group) / tw2) * (r.act.weight / (groups.get(r.act.group) as number)) * frac(i) : 0)))
  const point = (date: string): OutlookPoint => ({
    date,
    expected: overallAt((i) => (planned[i] ? planFrac(i, date, 'finish') : fracOf(i, state[i].mu))),
    low: overallAt((i) => (planned[i] ? planFrac(i, date, 'p90') : fracOf(i, Math.max(0, state[i].mu - z * sdOf(i))))),
    high: overallAt((i) => (planned[i] ? planFrac(i, date, 'p10') : fracOf(i, state[i].mu + z * sdOf(i)))),
  })
  const curve: OutlookPoint[] = [point(a.today)]
  const daily: { date: string; v: number }[] = []
  const open = (i: number) => state[i].mu < runs[i].remaining - 1e-9
  const anyOpen = () => [...pooled].some((i) => runs[i].remaining > 0 && runs[i].value > 0 && !state[i].p90) || d < planEnd
  const give = (i: number, qty: number, d0: string, step: number) => {
    const s = state[i]
    const q = Math.min(qty, Math.max(0, runs[i].remaining - s.mu)) // never beyond what is left
    if (q <= 0) return
    if (!s.start) s.start = d0
    s.mu += q; s.s1 += (s.cv * q) ** 2; s.s2 += q
    if (step <= 7) s.n7 += q
    if (step <= 28) s.n28 += q
  }
  let d = a.today
  let prevOverall = curve[0].expected
  for (let step = 1; step <= P.horizonDays && anyOpen(); step++) {
    d = addDays(a.today, step)
    for (const [k, idx] of pools) {
      if (!idx.some((i) => rated(runs[i]))) continue
      // capacity of the pool today, in progress value: every rated activity's expected output × its value
      const cap = sum(idx.filter((i) => rated(runs[i])).map((i) => runs[i].daily(d) * runs[i].value))
      if (cap <= 0) continue
      let left = cap
      // 1) the started activities still open, in proportion to their own share of the capacity
      const live = idx.filter((i) => rated(runs[i]) && runs[i].value > 0 && open(i))
      for (let pass = 0; pass < 4 && left > 1e-15; pass++) {
        const stillOpen = live.filter(open)
        const share = sum(stillOpen.map((i) => runs[i].daily(d) * runs[i].value))
        if (share <= 0) break
        let used = 0
        for (const i of stillOpen) {
          const want = (left * runs[i].daily(d) * runs[i].value) / share
          const can = (runs[i].remaining - state[i].mu) * runs[i].value
          const v = Math.min(want, can)
          give(i, v / runs[i].value, d, step); used += v
        }
        left -= used
      }
      // 2) what is left goes to the type's not-yet-started work, in planned order
      for (const i of queueOf.get(k) ?? []) {
        if (left <= 1e-15) break
        if (!open(i)) continue
        const can = (runs[i].remaining - state[i].mu) * runs[i].value
        const v = Math.min(left, can)
        give(i, v / runs[i].value, d, step); left -= v
      }
    }
    for (const i of pooled) {
      const r = runs[i], s = state[i]
      if (r.remaining <= 0 || s.p90 || !s.start) continue
      const sd = sdOf(i)
      if (!s.finish && s.mu >= r.remaining - 1e-9) s.finish = d
      if (!s.p10 && s.mu + z * sd >= r.remaining - 1e-9) s.p10 = d
      if (!s.p90 && s.mu - z * sd >= r.remaining - 1e-9) s.p90 = d
    }
    const cur = overallAt((i) => (planned[i] ? planFrac(i, d, 'finish') : fracOf(i, state[i].mu)))
    daily.push({ date: d, v: cur - prevOverall }); prevOverall = cur
    if (step % 7 === 0) curve.push(point(d))
  }
  if (curve[curve.length - 1].date !== d && d !== a.today) curve.push(point(d))
  const acts: ActivityOutlook[] = runs.map((r, i) => {
    const s = state[i], pl = planned[i]
    const reason: ActivityOutlook['reason'] = r.remaining <= 0 ? 'done' : pl ? 'plan_based' : pooled.has(i) && !rated(r) ? (s.start ? 'queued' : 'beyond') : !r.m ? 'no_history' : !rated(r) ? 'no_rate' : ''
    if (pl) { s.finish = pl.finish; s.p10 = pl.p10; s.p90 = pl.p90; s.start = pl.start }
    return {
      activity: r.act, remaining: r.remaining, model: rated(r) ? r.m!.model : null, next7: s.n7, next28: s.n28,
      finish: s.finish, finishP10: s.p10, finishP90: s.p90, start: s.start,
      slipDays: s.finish && r.act.plannedEnd ? Math.round((Date.parse(s.finish) - Date.parse(r.act.plannedEnd)) / 86400000) : null,
      reason,
    }
  })
  const openActs = acts.filter((x) => x.remaining > 0)
  const unforecastable = openActs.filter((x) => !x.finish).length
  const latest = (k: 'finish' | 'finishP10' | 'finishP90') => { const v = openActs.map((x) => x[k]).filter((x): x is string => !!x).sort(); return v.length ? v[v.length - 1] : (openActs.length ? null : a.today) }

  // progress gained per Jalali month over the next six months
  const monthly: Outlook['monthly'] = []
  for (const x of daily) {
    const j = jalaliParts(x.date), key = `${j.jy}-${j.jm}`
    const last = monthly[monthly.length - 1]
    if (last && last.key === key) last.gain += x.v
    else if (monthly.length < 7) monthly.push({ key, jm: j.jm, gain: x.v })
  }
  const crews: CrewOutlook[] = crewNames.map((c) => {
    const mine = acts.filter((x) => x.activity.crew === c)
    const f = mine.filter((x) => x.remaining > 0).map((x) => x.finish).filter((x): x is string => !!x).sort()
    return { crew: c, recent: crewRecent.get(c) ?? null, scenario: crewScen.get(c) ?? null, activities: mine.length, finish: f.length ? f[f.length - 1] : null }
  })
  return {
    activities: acts, crews,
    finish: unforecastable ? null : latest('finish'), finishP10: unforecastable ? null : latest('finishP10'),
    finishP90: unforecastable || openActs.some((x) => !x.finishP90) ? null : latest('finishP90'),
    finishKnown: latest('finish'), unforecastable, curve,
    // the first entry is the rest of the current month; the next six are whole months
    monthly: monthly.slice(1),
    monthFactor: mw.map((share) => sum(WX_CLASSES.map((c) => share[c] * WX_PRIOR[c] * GROUND_BY_WX_PRIOR[c] * WX_P_PRIOR[c]))),
    historyDays: days.length, today: a.today,
    performanceIndex: PI, planBased: acts.filter((x) => x.reason === 'plan_based').length, queued: acts.filter((x) => x.reason === 'queued').length,
  }
}

/* ───────────────────────── crew types: suggestion of the activity → crew link ───────────────────────── */

const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, '').replace(/[ۀة]/g, 'ه')
const STOP = new Set(['و', 'به', 'از', 'در', 'با', 'تا', 'برای', 'های', 'ها', 'کلیه', 'انواع', 'شامل', 'نوع', 'اینچ', 'قطر', 'متر', 'هر', 'یا', 'که', 'فصل', 'عملیات', 'اضافه', 'بها', 'بهاء', 'ردیف', 'صورت', 'صورتی', 'بابت', 'کارهای', 'اجرای', 'تهیه', 'نصب', 'مطابق'])
const tokens = (s: string) => norm(s).split(/[^\p{L}]+/u).filter((t) => t.length >= 2 && !STOP.has(t))
/** two tokens match when one starts with the other (≥3 letters): جوش ~ جوشکاری, ریسه ~ ریسه‌کردن */
const tmatch = (a: string, b: string) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)))
/** Sections that hold site overheads, not production crews. */
export const isSupportSection = (s: string) => /ستاد|پشتیبان|مدیریت|دفتر|HSE|انبار/u.test(norm(s))

/**
 * Suggested crew type of each activity from the words of its title (and chapter) and the section names, weighted by how
 * rare a word is among the activity titles (a word in every title — «لوله» — says little). Null when nothing matches.
 */
export function suggestCrews(acts: { id: string; title: string; chapter?: string; parentId?: string | null }[], sections: string[]): Record<string, string | null> {
  const prod = sections.filter((s) => !isSupportSection(s))
  const titles = acts.map((x) => new Set(tokens(x.title)))
  const chapters = acts.map((x) => new Set(tokens(x.chapter ?? '')))
  const df = new Map<string, number>()
  for (const d of titles) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1)
  // a word in a large share of the titles («لوله» in a pipeline book) tells nothing about who does the work
  const common = (t: string) => acts.length >= 8 && (df.get(t) ?? 0) / acts.length > 0.3
  const idf = (t: string) => Math.log(1 + acts.length / (1 + (df.get(t) ?? 0)))
  const secTok = prod.map((s) => tokens(s))
  const out: Record<string, string | null> = {}
  acts.forEach((x, k) => {
    let best: string | null = null, bestScore = 0
    prod.forEach((s, j) => {
      let sc = 0
      for (const t of titles[k]) if (!common(t) && secTok[j].some((u) => tmatch(t, u))) sc += idf(t)
      // the chapter names the kind of work for every row in it («فصل اول - عملیات ریسه»)
      for (const t of chapters[k]) if (!common(t) && secTok[j].some((u) => tmatch(t, u))) sc += 0.6 * idf(t)
      if (sc > bestScore + 1e-9) { bestScore = sc; best = s }
    })
    out[x.id] = bestScore > 0 ? best : null
  })
  // a surcharge row (اضافه‌بها) is done by the crew of the row it is added to
  for (const x of acts) if (x.parentId && x.parentId in out && out[x.parentId]) out[x.id] = out[x.parentId]
  return out
}
