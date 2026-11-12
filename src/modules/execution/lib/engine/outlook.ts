import { addDays, jalaliParts, weekdayOf, workingDays } from '../periods'
import { clamp, sum } from './stats'

/**
 * پیش‌بینی کارکرد و تاریخ اتمام — future output of every activity, and the project's finish date, learned from the
 * daily work reports themselves: approved quantities, the manpower and machinery on site, the weather and the ground.
 *
 * The model, per activity (one activity at a time, so units never mix):
 *
 *     output(day) = p(w) · K · (L / L̄)^α · (E / Ē)^β · f(w) · g(ground) · S
 *
 *   L, E   active manpower and machinery on the day (summed over the day's work reports); L̄, Ē their history means
 *   α, β   elasticities of output to manpower / machinery — Bayesian ridge regression in log space with prior means
 *          0.6 / 0.3 (diminishing returns) and prior SD 0.3; the penalty is the residual noise variance ÷ 0.3², so a
 *          history with little variation in crew size stays near the prior instead of inventing a relationship
 *   f, g   multiplier of a weather class / ground state relative to a clear, dry day; estimated from the history and
 *          shrunk toward engineering priors in proportion to how many days back them (k₀ = 5 days)
 *   p(w)   share of days the activity produced anything, per weather class (a rained-off day is a zero, not a gap)
 *   S      Duan's smearing factor (mean of exp(residual)) so the back-transform is unbiased
 *
 * Fitted by backfitting with recency weights (half-life 21 days). It is compared, by a rolling one-day-ahead backtest
 * over the later part of the history, with the simple recent average; the two are blended by inverse squared error,
 * which is the best predictor the evidence supports (the blend leans on whichever predicted the past better).
 *
 * The future: every working day (project calendar) gets resources from the scenario (recent mean × user change) and
 * an expected weather factor for its Jalali month — the project's own weather record for that month blended with a
 * climate preset. Cumulative output then reaches each activity's remaining quantity on its expected finish; an
 * uncertainty band (P10/P90) comes from the backtest error, including the error of the level itself.
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
/** ground expected under each weather class, before the data speaks (multiplier) */
const GROUND_BY_WX_PRIOR: Record<WxClass, number> = { clear: 1, cloudy: 0.98, storm: 0.97, rain: 0.85, snow: 0.7 }

/** Climate presets: share of rainy and snowy working days in each Jalali month (فروردین … اسفند). */
export type ClimateKey = 'west_semi_arid' | 'cold_mountain' | 'hot_dry' | 'humid_north'
export const CLIMATE_FA: Record<ClimateKey, string> = { west_semi_arid: 'نیمه‌خشک غرب و زاگرس', cold_mountain: 'کوهستانی سرد (شمال‌غرب، البرز)', hot_dry: 'گرم و خشک (مرکز، جنوب، شرق)', humid_north: 'معتدل و مرطوب (سواحل خزر)' }
export const CLIMATE: Record<ClimateKey, { rain: number[]; snow: number[]; storm: number[] }> = {
  west_semi_arid: { rain: [0.22, 0.18, 0.06, 0.01, 0.01, 0.01, 0.04, 0.12, 0.2, 0.2, 0.22, 0.24], snow: [0, 0, 0, 0, 0, 0, 0, 0.01, 0.04, 0.08, 0.06, 0.02], storm: [0.05, 0.06, 0.08, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02, 0.03, 0.04] },
  cold_mountain: { rain: [0.25, 0.25, 0.1, 0.04, 0.03, 0.03, 0.06, 0.15, 0.15, 0.08, 0.1, 0.18], snow: [0.03, 0, 0, 0, 0, 0, 0, 0.03, 0.12, 0.25, 0.22, 0.1], storm: [0.04, 0.04, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.04] },
  hot_dry: { rain: [0.06, 0.04, 0.01, 0, 0, 0, 0.01, 0.03, 0.06, 0.07, 0.07, 0.07], snow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.01, 0], storm: [0.1, 0.12, 0.14, 0.15, 0.15, 0.12, 0.08, 0.05, 0.04, 0.04, 0.06, 0.08] },
  humid_north: { rain: [0.3, 0.25, 0.2, 0.15, 0.15, 0.25, 0.35, 0.4, 0.4, 0.35, 0.35, 0.35], snow: [0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.05, 0.02], storm: [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.03, 0.03, 0.03, 0.03, 0.02] },
}
const cloudyShare = (m: number) => (m >= 7 || m <= 1 ? 0.15 : 0.05)

/** One reported working day: the day's work reports merged. `out` = approved output per activity. */
export interface DayObs { date: string; man: number | null; equip: number | null; wx: WxClass | null; ground: GroundState | null; out: Record<string, number> }

export interface OutlookActivity {
  id: string; title: string; unit: string; group: string
  /** weight inside its weighting basis */
  weight: number
  baseQty: number; doneQty: number
  plannedStart?: string | null
  plannedEnd: string | null
}
export interface OutlookScenario {
  /** % change of manpower / machinery from the recent average (0 = keep) */
  manPct: number; equipPct: number
  climate: ClimateKey
  /** project calendar: 0 = Saturday … 6 = Friday */
  workDays: number[]
}
export interface OutlookParams { maxHistory: number; maxOrigins: number; halfLifeDays: number; priorAlpha: number; priorBeta: number; /** prior SD of α and β: the ridge penalty is noise variance ÷ this squared */ priorSd: number; shrinkDays: number; recentDays: number; horizonDays: number; z: number }
export const DEFAULT_OUTLOOK_PARAMS: OutlookParams = { maxHistory: 180, maxOrigins: 30, halfLifeDays: 21, priorAlpha: 0.6, priorBeta: 0.3, priorSd: 0.3, shrinkDays: 5, recentDays: 14, horizonDays: 1500, z: 1.2816 }

export interface ActivityModel {
  days: number
  /** days with output > 0 */
  positiveDays: number
  alpha: number; beta: number
  /** share of the elasticity estimate that comes from the data (0 = all prior) */
  alphaData: number; betaData: number
  /** effective day factor per weather class relative to clear (participation × output × ground) and the days behind it */
  wx: Record<WxClass, { factor: number; days: number }>
  ground: Record<GroundState, { factor: number; days: number }>
  /** expected output on a clear, dry working day with the average crew */
  clearDayRate: number
  /** the history's average daily output (all reported days in the activity's span) */
  avgRate: number
  manMean: number; equipMean: number
  /** rolling one-day-ahead backtest: mean absolute error of the resource model and of the recent average, as % of mean output */
  backtest: { origins: number; modelErrPct: number | null; naiveErrPct: number | null; blendWeight: number } | null
  /** daily coefficient of variation used for the uncertainty band */
  cv: number
  confidence: 'high' | 'medium' | 'low'
}

export interface ActivityOutlook {
  activity: OutlookActivity
  remaining: number
  model: ActivityModel | null
  /** expected output in the next 7 and 28 calendar days under the scenario */
  next7: number; next28: number
  /** expected / optimistic (P10) / pessimistic (P90) finish */
  finish: string | null; finishP10: string | null; finishP90: string | null
  /** forecast − planned end in days (positive = late) */
  slipDays: number | null
  /** why there is no forecast */
  reason: '' | 'done' | 'no_history' | 'no_rate' | 'plan_based'
}

export interface OutlookPoint { date: string; expected: number; low: number; high: number }
export interface Outlook {
  activities: ActivityOutlook[]
  /** expected (P50), P10, P90 finish of the whole project = the last activity to finish; null when any remaining activity cannot be forecast */
  finish: string | null; finishP10: string | null; finishP90: string | null
  /** finish of the activities that can be forecast, when some cannot (a lower bound) */
  finishKnown: string | null
  unforecastable: number
  /** weekly forecast of overall physical progress (0–1), from today */
  curve: OutlookPoint[]
  /** recent average resources and the scenario's */
  resources: { man: number | null; equip: number | null; manScenario: number | null; equipScenario: number | null }
  /** expected weather factor of each Jalali month (1 = every day clear) — the calendar behind the forecast */
  monthFactor: number[]
  historyDays: number
  today: string
  /** observed ÷ planned daily rate of the started activities (weighted median) — what stretches the plan of the ones not started */
  performanceIndex: number | null
  /** activities whose finish comes from their planned duration × the performance index (no output of their own yet) */
  planBased: number
}

// ── helpers ───────────────────────────────────────────────────────────────
const LN = Math.log
const recencyW = (date: string, today: string, half: number) => 0.5 ** (Math.max(0, (Date.parse(today) - Date.parse(date)) / 86400000) / half)
const shrink = (obs: number, prior: number, n: number, k: number) => (n * obs + k * prior) / (n + k)
const wmean = (v: number[], w: number[]) => { const s = sum(w); return s > 0 ? sum(v.map((x, i) => x * w[i])) / s : 0 }

interface Fit {
  c: number; alpha: number; beta: number; alphaData: number; betaData: number
  lnF: Record<WxClass, number>; lnG: Record<GroundState, number>
  pBase: number; pWx: Record<WxClass, number>
  S: number; manMean: number; equipMean: number
  nWx: Record<WxClass, number>; nG: Record<GroundState, number>
}

/** Fit the multiplicative model on the days of one activity. */
function fit(days: DayObs[], id: string, today: string, P: OutlookParams): Fit | null {
  if (!days.length) return null
  const w = days.map((d) => recencyW(d.date, today, P.halfLifeDays))
  const y = days.map((d) => d.out[id] ?? 0)
  const man = days.map((d) => (d.man && d.man > 0 ? d.man : null)), eq = days.map((d) => (d.equip && d.equip > 0 ? d.equip : null))
  const manMean = wmean(man.map((x) => x ?? 0), w.map((x, i) => (man[i] ? x : 0))) || 1
  const equipMean = wmean(eq.map((x) => x ?? 0), w.map((x, i) => (eq[i] ? x : 0))) || 1
  const x1 = man.map((x) => (x ? LN(x / manMean) : 0)), x2 = eq.map((x) => (x ? LN(x / equipMean) : 0))
  const wxOf = (d: DayObs): WxClass => d.wx ?? 'clear'
  const gOf = (d: DayObs): GroundState => d.ground ?? 'dry'

  // participation: share of days with output, overall and per weather class (shrunk toward overall × prior ratio)
  const pos = y.map((v) => (v > 0 ? 1 : 0))
  const pBase = clamp(wmean(pos, w), 0.02, 1)
  const nWx = Object.fromEntries(WX_CLASSES.map((c) => [c, 0])) as Record<WxClass, number>
  const nG = { dry: 0, wet: 0, mud: 0, frozen: 0, snow: 0 } as Record<GroundState, number>
  days.forEach((d) => { nWx[wxOf(d)]++; nG[gOf(d)]++ })
  const pWx = {} as Record<WxClass, number>
  for (const c of WX_CLASSES) {
    const idx = days.map((d, i) => (wxOf(d) === c ? i : -1)).filter((i) => i >= 0)
    const obs = idx.length ? wmean(idx.map((i) => pos[i]), idx.map((i) => w[i])) : 0
    pWx[c] = clamp(shrink(obs, Math.min(1, pBase * WX_P_PRIOR[c]), idx.length, P.shrinkDays), 0.01, 1)
  }

  // output on positive days: backfitting of (c, α, β) and the class multipliers
  const P_ = days.map((_, i) => i).filter((i) => y[i] > 0)
  if (!P_.length) return { c: -Infinity, alpha: P.priorAlpha, beta: P.priorBeta, alphaData: 0, betaData: 0, lnF: zeroRec(WX_CLASSES), lnG: zeroRec(['dry', 'wet', 'mud', 'frozen', 'snow']), pBase, pWx, S: 1, manMean, equipMean, nWx, nG }
  const r = y.map((v) => (v > 0 ? LN(v) : 0))
  const lnF = Object.fromEntries(WX_CLASSES.map((c) => [c, LN(WX_PRIOR[c])])) as Record<WxClass, number>
  const lnG = Object.fromEntries((Object.keys(GROUND_PRIOR) as GroundState[]).map((g) => [g, LN(GROUND_PRIOR[g])])) as Record<GroundState, number>
  let c = 0, alpha = P.priorAlpha, beta = P.priorBeta, alphaData = 0, betaData = 0, noise = 0.1
  for (let it = 0; it < 8; it++) {
    // ridge regression with prior means on centred, weighted data
    const t = P_.map((i) => r[i] - lnF[wxOf(days[i])] - lnG[gOf(days[i])])
    const ww = P_.map((i) => w[i])
    const m1 = wmean(P_.map((i) => x1[i]), ww), m2 = wmean(P_.map((i) => x2[i]), ww), mt = wmean(t, ww)
    let s11 = 0, s12 = 0, s22 = 0, s1t = 0, s2t = 0
    P_.forEach((i, k) => { const a = x1[i] - m1, b = x2[i] - m2, e = t[k] - mt; s11 += ww[k] * a * a; s12 += ww[k] * a * b; s22 += ww[k] * b * b; s1t += ww[k] * a * e; s2t += ww[k] * b * e })
    const L = noise / P.priorSd ** 2, A11 = s11 + L, A22 = s22 + L, A12 = s12, b1 = s1t + L * P.priorAlpha, b2 = s2t + L * P.priorBeta
    const det = A11 * A22 - A12 * A12
    if (det > 1e-12) { alpha = clamp((b1 * A22 - b2 * A12) / det, 0, 1.2); beta = clamp((A11 * b2 - A12 * b1) / det, 0, 1.2) }
    alphaData = s11 / (s11 + L); betaData = s22 / (s22 + L)
    c = mt - alpha * m1 - beta * m2
    // class multipliers from residuals, clear / dry fixed at 1, shrunk toward the prior by the number of days
    const res = (i: number, skipW: boolean, skipG: boolean) => r[i] - c - alpha * x1[i] - beta * x2[i] - (skipW ? 0 : lnF[wxOf(days[i])]) - (skipG ? 0 : lnG[gOf(days[i])])
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
    for (const g of Object.keys(GROUND_PRIOR) as GroundState[]) {
      if (g === 'dry') { lnG[g] = 0; continue }
      const idx = P_.filter((i) => gOf(days[i]) === g)
      const obs = idx.length && dryIdx.length ? wmean(idx.map((i) => res(i, false, true)), idx.map((i) => w[i])) - refG : LN(GROUND_PRIOR[g])
      lnG[g] = clamp(shrink(obs, LN(GROUND_PRIOR[g]), idx.length, P.shrinkDays), LN(0.05), LN(1.3))
    }
    // residual variance (weighted, small-sample corrected) feeds the next round's penalty
    const ws = sum(P_.map((i) => w[i]))
    noise = P_.length > 3 && ws > 0 ? Math.max(0.002, (sum(P_.map((i) => w[i] * res(i, false, false) ** 2)) / ws) * (P_.length / (P_.length - 3))) : 0.1
  }
  const resid = P_.map((i) => r[i] - c - alpha * x1[i] - beta * x2[i] - lnF[wxOf(days[i])] - lnG[gOf(days[i])])
  const S = clamp(wmean(resid.map(Math.exp), P_.map((i) => w[i])), 0.5, 2)
  return { c, alpha, beta, alphaData, betaData, lnF, lnG, pBase, pWx, S, manMean, equipMean, nWx, nG }
}
function zeroRec<K extends string>(keys: K[]): Record<K, number> { return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number> }

/** Expected output of one day under the fitted model. */
function predict(f: Fit, man: number | null, equip: number | null, wx: WxClass | null, ground: GroundState | null): number {
  if (!Number.isFinite(f.c)) return 0
  const w = wx ?? 'clear', g = ground ?? 'dry'
  const lm = man && man > 0 ? LN(man / f.manMean) : 0, le = equip && equip > 0 ? LN(equip / f.equipMean) : 0
  return f.pWx[w] * Math.exp(f.c + f.alpha * lm + f.beta * le + f.lnF[w] + f.lnG[g]) * f.S
}
/** day factor of a weather class relative to clear, with the ground it usually brings */
function wxDayFactor(f: Fit, cl: WxClass, groundGivenWx: Record<WxClass, number>): number {
  if (!Number.isFinite(f.c)) return WX_PRIOR[cl]
  return (f.pWx[cl] / f.pWx.clear) * Math.exp(f.lnF[cl]) * groundGivenWx[cl]
}

/** The activity's days: from its first output to the last reported day (days before it started are not zeros). */
function spanOf(days: DayObs[], id: string): DayObs[] {
  const first = days.findIndex((d) => (d.out[id] ?? 0) > 0)
  return first < 0 ? [] : days.slice(first)
}

export function activityModel(allDays: DayObs[], id: string, today: string, params: Partial<OutlookParams> = {}): { model: ActivityModel; fit: Fit; naiveRate: number; groundGivenWx: Record<WxClass, number> } | null {
  const P = { ...DEFAULT_OUTLOOK_PARAMS, ...params }
  const days = spanOf(allDays, id).slice(-P.maxHistory)
  const f = fit(days, id, today, P)
  if (!f) return null
  const y = days.map((d) => d.out[id] ?? 0)
  const w = days.map((d) => recencyW(d.date, today, P.halfLifeDays))
  const recent = days.slice(-P.recentDays), ry = recent.map((d) => d.out[id] ?? 0)
  const naiveRate = ry.length ? sum(ry) / ry.length : 0
  const avgRate = wmean(y, w)

  // ground that each weather class brings in this history (multiplier), shrunk toward the prior
  const groundGivenWx = {} as Record<WxClass, number>
  for (const cl of WX_CLASSES) {
    const idx = days.map((d, i) => ((d.wx ?? 'clear') === cl ? i : -1)).filter((i) => i >= 0)
    const obs = idx.length ? wmean(idx.map((i) => Math.exp(f.lnG[days[i].ground ?? 'dry'])), idx.map((i) => w[i])) : GROUND_BY_WX_PRIOR[cl]
    groundGivenWx[cl] = shrink(obs, GROUND_BY_WX_PRIOR[cl], idx.length, P.shrinkDays)
  }

  // rolling one-day-ahead backtest over the later part of the history
  let bt: ActivityModel['backtest'] = null, cv = 0.35
  const n = days.length
  if (n >= 8) {
    const start = Math.max(5, Math.floor(n * 0.5), n - P.maxOrigins)
    const eM: number[] = [], eN: number[] = [], eB: number[] = []
    for (let i = start; i < n; i++) {
      const train = days.slice(0, i), ff = fit(train, id, days[i - 1].date, P)
      if (!ff) continue
      const ty = train.slice(-P.recentDays).map((d) => d.out[id] ?? 0)
      const pn = ty.length ? sum(ty) / ty.length : 0
      const pm = predict(ff, days[i].man, days[i].equip, days[i].wx, days[i].ground)
      eM.push(pm - y[i]); eN.push(pn - y[i])
    }
    const mse = (e: number[]) => (e.length ? sum(e.map((x) => x * x)) / e.length : null)
    const mae = (e: number[]) => (e.length ? sum(e.map(Math.abs)) / e.length : null)
    const mM = mse(eM), mN = mse(eN), my = avgRate || 1
    if (mM != null && mN != null) {
      const wB = mM + mN > 0 ? (1 / Math.max(mM, 1e-9)) / (1 / Math.max(mM, 1e-9) + 1 / Math.max(mN, 1e-9)) : 0.5
      for (let k = 0; k < eM.length; k++) eB.push(wB * eM[k] + (1 - wB) * eN[k])
      bt = { origins: eM.length, modelErrPct: (mae(eM)! / my) * 100, naiveErrPct: (mae(eN)! / my) * 100, blendWeight: wB }
      cv = clamp(Math.sqrt(mse(eB)!) / my, 0.05, 2)
    }
  } else if (y.length >= 2) {
    const m = sum(y) / y.length
    cv = m > 0 ? clamp(Math.sqrt(sum(y.map((v) => (v - m) ** 2)) / (y.length - 1)) / m, 0.15, 2) : 0.5
  }
  const wB = bt ? bt.blendWeight : 0.5

  // the level on a clear, dry day with the average crew: model and recent average blended
  const histFactor = wmean(days.map((d) => wxDayFactor(f, d.wx ?? 'clear', groundGivenWx) * (d.man && f.manMean ? (d.man / f.manMean) ** f.alpha : 1) * (d.equip && f.equipMean ? (d.equip / f.equipMean) ** f.beta : 1)), recent.length ? days.map((d) => (recent.includes(d) ? 1 : 0)) : w) || 1
  const modelClear = predict(f, f.manMean, f.equipMean, 'clear', 'dry')
  const clearDayRate = Math.max(0, wB * modelClear + (1 - wB) * (naiveRate / histFactor))

  const wx = Object.fromEntries(WX_CLASSES.map((cl) => [cl, { factor: wxDayFactor(f, cl, groundGivenWx), days: f.nWx[cl] }])) as ActivityModel['wx']
  const ground = Object.fromEntries((Object.keys(GROUND_PRIOR) as GroundState[]).map((g) => [g, { factor: Math.exp(f.lnG[g]), days: f.nG[g] }])) as ActivityModel['ground']
  const pos = y.filter((v) => v > 0).length
  const confidence: ActivityModel['confidence'] = n >= 30 && cv < 0.4 && bt ? 'high' : n >= 10 && cv < 0.8 ? 'medium' : 'low'
  return {
    model: { days: n, positiveDays: pos, alpha: f.alpha, beta: f.beta, alphaData: f.alphaData, betaData: f.betaData, wx, ground, clearDayRate, avgRate, manMean: f.manMean, equipMean: f.equipMean, backtest: bt, cv, confidence },
    fit: f, naiveRate, groundGivenWx,
  }
}

/** Expected share of each weather class in a Jalali month: the project's own record for that month blended with the climate preset (10 days of prior). */
export function monthWeather(days: DayObs[], climate: ClimateKey): Record<WxClass, number>[] {
  const pre = CLIMATE[climate]
  return Array.from({ length: 12 }, (_, m) => {
    const prior: Record<WxClass, number> = { rain: pre.rain[m], snow: pre.snow[m], storm: pre.storm[m], cloudy: cloudyShare(m), clear: 0 }
    prior.clear = Math.max(0, 1 - prior.rain - prior.snow - prior.storm - prior.cloudy)
    const own = days.filter((d) => d.wx && jalaliParts(d.date).jm === m + 1)
    const out = {} as Record<WxClass, number>
    for (const c of WX_CLASSES) out[c] = (own.filter((d) => d.wx === c).length + 10 * prior[c]) / (own.length + 10)
    return out
  })
}

export function outlook(a: { days: DayObs[]; activities: OutlookActivity[]; groupWeights?: Record<string, number>; today: string; scenario: OutlookScenario; params?: Partial<OutlookParams> }): Outlook {
  const P = { ...DEFAULT_OUTLOOK_PARAMS, ...a.params }
  const days = [...a.days].sort((x, y) => x.date.localeCompare(y.date))
  const recent = days.slice(-P.recentDays)
  const avgOf = (k: 'man' | 'equip') => { const v = recent.map((d) => d[k]).filter((x): x is number => x != null && x > 0); return v.length ? sum(v) / v.length : null }
  const man = avgOf('man'), equip = avgOf('equip')
  const manS = man != null ? man * (1 + a.scenario.manPct / 100) : null, equipS = equip != null ? equip * (1 + a.scenario.equipPct / 100) : null
  const mw = monthWeather(days, a.scenario.climate)
  const workDays = a.scenario.workDays.length ? a.scenario.workDays : [0, 1, 2, 3, 4, 5]

  // per activity: its model and the expected daily output on any future date
  type Run = { act: OutlookActivity; remaining: number; m: ReturnType<typeof activityModel>; daily: (d: string) => number; cv: number }
  const runs: Run[] = a.activities.map((act) => {
    const remaining = Math.max(0, act.baseQty - act.doneQty)
    const m = activityModel(days, act.id, a.today, P)
    if (!m) return { act, remaining, m, daily: () => 0, cv: 1 }
    const f = m.fit, mdl = m.model
    const resF = (manS && f.manMean ? (manS / f.manMean) ** f.alpha : 1) * (equipS && f.equipMean ? (equipS / f.equipMean) ** f.beta : 1)
    const monthF = mw.map((share) => sum(WX_CLASSES.map((c) => share[c] * wxDayFactor(f, c, m.groundGivenWx))))
    const daily = (d: string) => (workDays.includes(weekdayOf(d)) ? mdl.clearDayRate * resF * monthF[jalaliParts(d).jm - 1] : 0)
    return { act, remaining, m, daily, cv: mdl.cv }
  })

  // Not started yet (no output in the reports): its planned duration, stretched or shortened by how the started
  // activities actually run against their own plans (performance index: observed ÷ planned daily rate, weighted
  // median), and by the scenario's resources with the prior elasticities. Clearly a plan-based estimate.
  const PI = (() => {
    const pts: { v: number; w: number }[] = []
    for (const r of runs) {
      if (!r.m || r.m.model.clearDayRate <= 0 || !r.act.plannedStart || !r.act.plannedEnd || r.act.baseQty <= 0) continue
      const wd = workingDays(r.act.plannedStart, r.act.plannedEnd, workDays).length
      if (wd <= 0) continue
      const obs = sum(Array.from({ length: 28 }, (_, k) => r.daily(addDays(a.today, k + 1)))) / Math.max(1, workingDays(addDays(a.today, 1), addDays(a.today, 28), workDays).length)
      pts.push({ v: obs / (r.act.baseQty / wd), w: Math.max(r.act.weight, 1e-6) })
    }
    if (!pts.length) return null
    pts.sort((x, y) => x.v - y.v)
    const half = sum(pts.map((x) => x.w)) / 2
    let acc = 0
    for (const x of pts) { acc += x.w; if (acc >= half) return clamp(x.v, 0.3, 2) }
    return clamp(pts[pts.length - 1].v, 0.3, 2)
  })()
  const resPrior = (man && manS ? (manS / man) ** P.priorAlpha : 1) * (equip && equipS ? (equipS / equip) ** P.priorBeta : 1)
  const afterWorkdays = (from: string, n: number) => { let d0 = from, c = 0; for (let g = 0; c < n && g < 5000; g++) { d0 = addDays(d0, 1); if (workDays.includes(weekdayOf(d0))) c++ } return d0 }
  const planned = runs.map((r) => {
    if (r.remaining <= 0 || (r.m && r.m.model.clearDayRate > 0) || PI == null || !r.act.plannedStart || !r.act.plannedEnd || r.act.baseQty <= 0) return null
    const wd = workingDays(r.act.plannedStart, r.act.plannedEnd, workDays).length
    if (wd <= 0) return null
    const n = Math.max(1, Math.ceil((wd * (r.remaining / r.act.baseQty)) / (PI * resPrior)))
    const start = r.act.plannedStart > a.today ? addDays(r.act.plannedStart, -1) : a.today
    return { start, n, finish: afterWorkdays(start, n), p10: afterWorkdays(start, Math.max(1, Math.round(n * 0.75))), p90: afterWorkdays(start, Math.ceil(n * 1.4)) }
  })
  const planEnd = planned.reduce((mx, x) => (x && x.p90 > mx ? x.p90 : mx), a.today)
  const planFrac = (i: number, d0: string, which: 'finish' | 'p10' | 'p90') => {
    const x = planned[i]!, b = runs[i].act.baseQty, s0 = runs[i].act.doneQty / b
    const end = x[which], span = Date.parse(end) - Date.parse(x.start)
    const t = span > 0 ? clamp((Date.parse(d0) - Date.parse(x.start)) / span, 0, 1) : 1
    return Math.min(1, s0 + (1 - s0) * t)
  }

  // walk forward day by day: expected cumulative and its band per activity
  const z = P.z
  const state = runs.map((r) => ({ mu: 0, s1: 0, s2: 0, finish: r.remaining <= 0 ? a.today : null as string | null, p10: r.remaining <= 0 ? a.today : null as string | null, p90: r.remaining <= 0 ? a.today : null as string | null, n7: 0, n28: 0 }))
  const nHist = (r: Run) => Math.max(1, r.m?.model.days ?? 1)
  const forecastable = (r: Run) => r.remaining > 0 && !!r.m && r.m.model.clearDayRate > 0
  const groups = new Map<string, { w: number; acts: number[] }>()
  runs.forEach((r, i) => { const g = groups.get(r.act.group) ?? { w: 0, acts: [] }; g.w += r.act.weight; g.acts.push(i); groups.set(r.act.group, g) })
  const gw = (g: string) => a.groupWeights?.[g] ?? 1
  const tw = sum([...groups.keys()].map(gw))
  const overallAt = (frac: (i: number) => number) => (tw > 0 ? sum([...groups].map(([g, x]) => (x.w > 0 ? gw(g) * sum(x.acts.map((i) => runs[i].act.weight * frac(i))) / x.w : 0))) / tw : 0)
  const fracWith = (i: number, add: number) => { const b = runs[i].act.baseQty; return b > 0 ? Math.min(1, (runs[i].act.doneQty + add) / b) : 0 }
  const curve: OutlookPoint[] = [{ date: a.today, expected: overallAt((i) => fracWith(i, 0)), low: overallAt((i) => fracWith(i, 0)), high: overallAt((i) => fracWith(i, 0)) }]
  const anyOpen = () => runs.some((r, i) => forecastable(r) && !state[i].p90) || d < planEnd
  let d = a.today
  for (let step = 1; step <= P.horizonDays && anyOpen(); step++) {
    d = addDays(a.today, step)
    runs.forEach((r, i) => {
      if (!forecastable(r)) return
      const s = state[i], e = r.daily(d)
      s.mu += e; s.s1 += (r.cv * e) ** 2; s.s2 += e
      if (step <= 7) s.n7 += e
      if (step <= 28) s.n28 += e
      const sd = Math.sqrt(s.s1 + (r.cv ** 2 / nHist(r)) * s.s2 ** 2)
      if (!s.finish && s.mu >= r.remaining) s.finish = d
      if (!s.p10 && s.mu + z * sd >= r.remaining) s.p10 = d
      if (!s.p90 && s.mu - z * sd >= r.remaining) s.p90 = d
    })
    if (step % 7 === 0) {
      const sdOf = (i: number) => Math.sqrt(state[i].s1 + (runs[i].cv ** 2 / nHist(runs[i])) * state[i].s2 ** 2)
      const dd = d
      curve.push({ date: d, expected: overallAt((i) => (planned[i] ? planFrac(i, dd, 'finish') : fracWith(i, state[i].mu))), low: overallAt((i) => (planned[i] ? planFrac(i, dd, 'p90') : fracWith(i, Math.max(0, state[i].mu - z * sdOf(i))))), high: overallAt((i) => (planned[i] ? planFrac(i, dd, 'p10') : fracWith(i, state[i].mu + z * sdOf(i)))) })
    }
  }
  if (curve[curve.length - 1].date !== d && d !== a.today) { const v = overallAt((i) => (planned[i] ? planFrac(i, d, 'finish') : fracWith(i, state[i].mu))); curve.push({ date: d, expected: v, low: v, high: v }) }
  // the next 7 / 28 days are also wanted for activities the loop above stopped early for
  runs.forEach((r, i) => {
    if (!forecastable(r)) return
    let n7 = 0, n28 = 0
    for (let k = 1; k <= 28; k++) { const e = r.daily(addDays(a.today, k)); if (k <= 7) n7 += e; n28 += e }
    state[i].n7 = Math.min(n7, r.remaining); state[i].n28 = Math.min(n28, r.remaining)
  })

  const acts: ActivityOutlook[] = runs.map((r, i) => {
    const s = state[i]
    const pl = planned[i]
    const reason: ActivityOutlook['reason'] = r.remaining <= 0 ? 'done' : pl ? 'plan_based' : !r.m ? 'no_history' : r.m.model.clearDayRate <= 0 ? 'no_rate' : ''
    if (pl) { s.finish = pl.finish; s.p10 = pl.p10; s.p90 = pl.p90 }
    return {
      activity: r.act, remaining: r.remaining, model: pl ? null : r.m?.model ?? null, next7: s.n7, next28: s.n28,
      finish: s.finish, finishP10: s.p10, finishP90: s.p90,
      slipDays: s.finish && r.act.plannedEnd ? Math.round((Date.parse(s.finish) - Date.parse(r.act.plannedEnd)) / 86400000) : null,
      reason,
    }
  })
  const open = acts.filter((x) => x.remaining > 0)
  const unforecastable = open.filter((x) => !x.finish).length
  const latest = (k: 'finish' | 'finishP10' | 'finishP90') => { const v = open.map((x) => x[k]).filter((x): x is string => !!x).sort(); return v.length ? v[v.length - 1] : (open.length ? null : a.today) }
  return {
    activities: acts,
    finish: unforecastable ? null : latest('finish'), finishP10: unforecastable ? null : latest('finishP10'), finishP90: unforecastable || open.some((x) => !x.finishP90) ? null : latest('finishP90'),
    finishKnown: latest('finish'), unforecastable, curve,
    resources: { man, equip, manScenario: manS, equipScenario: equipS },
    monthFactor: mw.map((share) => sum(WX_CLASSES.map((c) => share[c] * WX_PRIOR[c] * GROUND_BY_WX_PRIOR[c] * WX_P_PRIOR[c]))),
    historyDays: days.length, today: a.today,
    performanceIndex: PI, planBased: acts.filter((x) => x.reason === 'plan_based').length,
  }
}
