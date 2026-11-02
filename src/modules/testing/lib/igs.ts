/**
 * Hydrostatic test of a gas pipeline by IGS-C-PL-100(3), chapter 12 (۱۳۹۹) — the criteria and the formulas of the
 * procedure, so the minutes (appendix 5) are computed, not typed. Pure: units as on the forms — pressure psi (bar where the
 * procedure reads in bar), wall and diameter inch, elevation and length metre, volume m³.
 *
 *  Seam → method: HFW pipe is strength-tested by the CYCLIC method and air-tested by withdrawing water; DSAW (SAW) pipe by
 *  the YIELD method with a P/V plot.
 *  Barlow: P = x/100 · 2 · SMYS · t / D  (t = the thinnest wall of the section).
 *  Cyclic: TP at the low point = min(95 % SMYS, 1.5 DP), the high point ≥ 1.1 DP; 30 min at TP, down to half, ×3.
 *  Yield:  TP at the low point = 110 % SMYS, the high point ≥ 95 % SMYS; P/V from 50 % TP against the 0.2 % offset line;
 *          4 h hold (±1 bar adjusted by injecting / bleeding water, the volumes recorded).
 *  Leak pressure: cyclic — as the strength test; yield — 95 % SMYS low point, ≥ 80 % SMYS high point.
 *  Every other point: P(e) = P_low − k·(e − e_low), k = 1.42 psi per metre of water.
 *  Equivalent wall: 1/te = (1/Vt) Σ Vᵢ/tᵢ.
 *  Air (HFW):  ΔPth = M·14.22 / (V·(X + D/(E·te))), E = 2.11e6 kg/cm²;  ΔPa/ΔPth ≥ 90 % (D ≤ 14″) / 95 % (D ≥ 16″).
 *  Air (DSAW): air volume from the tangent of the P/V plot at the static head ≤ 0.2 % of V, and
 *              (ΔV/ΔP)actual ÷ V·(D(1−ν²)/(E·t) + 1/B) ≤ 1.1,  E = 2.07e6 bar, B at the mean temperature and 35 bar.
 *  Leak (D ≤ 30″): K = 14.22(μ−γ)/(X + D/(E·te)), ΔPth = K·F·(T₁−T₂), H = (ΔF/F)·|ΔPth| + 0.2·|K·F|,
 *              ΔP = (P₁−P₂) − ΔPth;  |ΔP| ≤ H accepted, > H extended 24 h, ≫ H rejected.
 *  Leak (D > 30″): ΔPth/ΔT = (δ − 2(1+ν)α) / (D(1−ν²)/(E·t) + 1/B), ΔT = T₁ − T₂;  ΔPa ≤ ΔPth and ΔPa ≤ 1.5 psi.
 *  Stabilization: ≤ 14″ one day, 16–28″ two, ≥ 30″ three.  Gauge plate: 95 % of the thickest pipe's ID, plate by diameter.
 *  Drying: outlet dew point within 3 °C of the ambient dew point.
 */
export const PSI_PER_BAR = 14.5038
/** psi per kg/cm² (the procedure's 14.22) */
export const PSI_PER_KGCM2 = 14.22
/** bar per kg/cm² */
const BAR_PER_KGCM2 = 0.980665

export type Seam = 'HFW' | 'SAW'
export const SEAM_FA: Record<Seam, string> = { HFW: 'درزجوش HFW — روش سیکلی', SAW: 'درزجوش DSAW (SAW) — روش تسلیمی' }

export interface IgsParams {
  /** the pipe's seam, which picks the strength and air-test method */
  seam: Seam
  /** yield method: % SMYS at the low point and the least at the high point */
  strengthPct: number
  minHighPct: number
  /** yield method: leak test % SMYS at the low point and the least at the high point */
  leakPct: number
  leakMinPct: number
  /** cyclic method: TP = min(cyclicSmysPct % SMYS, cyclicDpFactor × DP); the high point ≥ cyclicHighDpFactor × DP */
  cyclicSmysPct: number
  cyclicDpFactor: number
  cyclicHighDpFactor: number
  cyclicHoldMin: number
  cyclicCycles: number
  /** psi per metre of water column */
  psiPerM: number
  maxSectionKm: number
  strengthHoldH: number
  /** yield hold: the pressure is corrected when it drifts more than this, bar */
  holdAdjustBar: number
  /** stabilization days; null = by diameter (≤ 14″ 1, 16–28″ 2, ≥ 30″ 3) */
  stabilizationDays: number | null
  /** longest gap between two stabilization readings, hours */
  stabilizationGapH: number
  leakHoldH: number
  /** least pipe temperature recommended in the leak test, and the least water temperature for filling, °C */
  minPipeTempC: number
  minFillTempC: number
  gaugePlatePct: number
  /** gauge plate thickness, mm; null = by diameter (≤ 12″ 4 mm Al, 14–20″ 6 mm Al, 20–30″ 6 mm steel, > 30″ 8 mm steel) */
  gaugePlateMm: number | null
  /** HFW air test: least ΔPa/ΔPth, %, for D ≤ airSmallMaxIn and above it */
  airHfwMinSmall: number
  airHfwMinBig: number
  airSmallMaxIn: number
  /** DSAW air test: largest air volume, % of the line, and largest slope ratio */
  airMaxPct: number
  airRatioMax: number
  /** largest pressure of the P/V plot of the air test, bar */
  airPvMaxBar: number
  /** leak test, D > leakBigDiaIn: largest loss, psi */
  leakMaxPsi: number
  leakBigDiaIn: number
  /** leak test, D ≤ 30″: |ΔP| beyond this many H is «≫ H» (rejected) rather than extended */
  leakFailFactor: number
  /** steel: E in bar (2.07e6) for the DSAW / > 30″ formulas, E in kg/cm² (2.11e6) for the HFW / ≤ 30″ ones */
  eBar: number
  eKgCm2: number
  poisson: number
  /** bulk modulus of the water, bar; null = from Figure 2 at the test temperature */
  bulkBar: number | null
  /** linear thermal expansion of steel, 1/°C */
  steelAlpha: number
  /** yield test: the offset line, % of the section volume, and the slope change that stops the pressurising */
  pvOffsetPct: number
  slopeChangeMax: number
  /** stations and pre-test pipe: test pressure = factor × design pressure, held for hours */
  stationFactor: number
  stationHoldH: number
  /** drying: largest difference of the outlet dew point over the ambient dew point, °C */
  dewPointDiffC: number
}
export const DEFAULT_IGS: IgsParams = {
  seam: 'SAW', strengthPct: 110, minHighPct: 95, leakPct: 95, leakMinPct: 80,
  cyclicSmysPct: 95, cyclicDpFactor: 1.5, cyclicHighDpFactor: 1.1, cyclicHoldMin: 30, cyclicCycles: 3,
  psiPerM: 1.42, maxSectionKm: 20, strengthHoldH: 4, holdAdjustBar: 1,
  stabilizationDays: null, stabilizationGapH: 24, leakHoldH: 24, minPipeTempC: 5, minFillTempC: 2,
  gaugePlatePct: 95, gaugePlateMm: null,
  airHfwMinSmall: 90, airHfwMinBig: 95, airSmallMaxIn: 14, airMaxPct: 0.2, airRatioMax: 1.1, airPvMaxBar: 35,
  leakMaxPsi: 1.5, leakBigDiaIn: 30, leakFailFactor: 2,
  eBar: 2.07e6, eKgCm2: 2.11e6, poisson: 0.3, bulkBar: null, steelAlpha: 1.17e-5, pvOffsetPct: 0.2, slopeChangeMax: 2,
  stationFactor: 1.5, stationHoldH: 4, dewPointDiffC: 3,
}
/** the stored parameters over the defaults (older rows: eGpa → eBar, a fixed 8 mm plate and 3 days were the old defaults) */
export const igsOf = (x: Partial<IgsParams> & { eGpa?: number; dewPointMaxC?: unknown } | null | undefined): IgsParams => {
  const { eGpa, dewPointMaxC: _d, ...rest } = x ?? {}
  return { ...DEFAULT_IGS, ...(eGpa && rest.eBar == null ? { eBar: eGpa * 1e4 } : {}), ...rest }
}

/** SMYS in psi of an API 5L grade («X65» → 65 000) */
export function smysPsiOf(material: string): number | null {
  const m = /X\s?(42|46|52|56|60|65|70|80)\b/i.exec(material)
  if (m) return Number(m[1]) * 1000
  return /\bgr(?:ade)?\.?\s*B\b|\b5L\s*B\b/i.test(material) ? 35000 : null
}
/** pressure (psi) at x % SMYS */
export const psiAtPct = (pct: number, smysPsi: number, odIn: number, wtIn: number) => (pct / 100) * (2 * smysPsi * wtIn) / odIn
/** % SMYS at a pressure (psi) */
export const pctAtPsi = (psi: number, smysPsi: number, odIn: number, wtIn: number) => (psi * odIn) / (2 * smysPsi * wtIn) * 100

// ── by diameter ─────────────────────────────────────────────────────────────
export const stabilizationDaysOf = (odIn: number, p: IgsParams = DEFAULT_IGS) => p.stabilizationDays ?? (odIn <= 14 ? 1 : odIn < 30 ? 2 : 3)
export function gaugePlateOf(odIn: number, p: IgsParams = DEFAULT_IGS): { mm: number; material: 'آلومینیوم' | 'فولاد' } {
  const material = odIn <= 20 ? 'آلومینیوم' : 'فولاد'
  return { mm: p.gaugePlateMm ?? (odIn <= 12 ? 4 : odIn <= 30 ? 6 : 8), material }
}
/** least filling-pump rate, litre per minute */
export const pumpRateOf = (odIn: number) => (odIn < 30 ? 120 : odIn < 48 ? 160 : 200)
/** HFW air test: least ΔPa / ΔPth, % */
export const airHfwMinOf = (odIn: number, p: IgsParams = DEFAULT_IGS) => (odIn <= p.airSmallMaxIn ? p.airHfwMinSmall : p.airHfwMinBig)

// ── water (Figures 2 and 3 of the procedure, digitised) ─────────────────────
const FIG_T = [0, 10, 25, 40, 50]
const FIG2: [number, number[]][] = [[1, [19800, 21000, 22100, 22600, 22600]], [50, [20030, 21300, 22400, 22900, 22910]], [100, [20250, 21550, 22700, 23200, 23220]]]
const FIG3_1BAR = [-70, 88, 258, 388, 455]
function lerpT(t: number, ys: number[]) {
  const x = Math.min(FIG_T[FIG_T.length - 1], Math.max(FIG_T[0], t))
  let i = 0; while (i < FIG_T.length - 2 && x > FIG_T[i + 1]) i++
  return ys[i] + ((ys[i + 1] - ys[i]) * (x - FIG_T[i])) / (FIG_T[i + 1] - FIG_T[i])
}
/** bulk modulus of fresh water, bar, at a temperature (°C) and pressure (bar) — Figure 2, linear between and beyond its curves */
export function bulkModulusBar(tC: number, pBar: number) {
  const ys = FIG2.map(([pb, row]) => [pb, lerpT(tC, row)] as const)
  const [a, b] = pBar <= 50 ? [ys[0], ys[1]] : [ys[1], ys[2]]
  return a[1] + ((b[1] - a[1]) * (pBar - a[0])) / (b[0] - a[0])
}
/** volumetric thermal expansion of water, 1/°C (Figure 3 at 1 bar; the cubic fit 0–40 °C, the figure beyond) */
export const waterBeta = (tC: number) => (-64.268 + 17.0105 * tC - 0.20369 * tC * tC + 0.0016048 * tC ** 3) * 1e-6
export const waterDelta = (tC: number) => (tC <= 40 ? waterBeta(Math.max(0, tC)) : lerpT(tC, FIG3_1BAR) * 1e-6)
/** compressibility of water, per kg/cm² (the procedure's X) */
export const waterX = (tC: number, pBar: number) => BAR_PER_KGCM2 / bulkModulusBar(tC, pBar)
const bulkOf = (p: IgsParams, tC: number, pBar: number) => p.bulkBar ?? bulkModulusBar(tC, pBar)

// ── a section's pipe ────────────────────────────────────────────────────────
export interface WallPart { wtIn: number; lengthM: number }
export interface MixFigures {
  lengthM: number; volumeM3: number
  parts: (WallPart & { idMm: number; areaMm2: number; volumeM3: number })[]
  thinIn: number; thickIn: number; tEqIn: number
  /** gauge plate diameter, mm: % of the inside diameter of the thickest pipe */
  gaugePlateMm: number
}
export function mixFigures(odIn: number, parts: WallPart[], p: IgsParams = DEFAULT_IGS): MixFigures | null {
  const ok = parts.filter((x) => x.wtIn > 0 && x.lengthM > 0 && x.wtIn * 2 < odIn)
  if (!ok.length) return null
  const rows = ok.map((x) => {
    const idMm = (odIn - 2 * x.wtIn) * 25.4
    const areaMm2 = (Math.PI * idMm * idMm) / 4
    return { ...x, idMm, areaMm2, volumeM3: (x.lengthM * areaMm2) / 1e6 }
  })
  const volumeM3 = rows.reduce((s, r) => s + r.volumeM3, 0)
  const thinIn = Math.min(...rows.map((r) => r.wtIn)), thickIn = Math.max(...rows.map((r) => r.wtIn))
  return {
    lengthM: rows.reduce((s, r) => s + r.lengthM, 0), volumeM3, parts: rows, thinIn, thickIn,
    tEqIn: volumeM3 / rows.reduce((s, r) => s + r.volumeM3 / r.wtIn, 0),
    gaugePlateMm: ((odIn - 2 * thickIn) * 25.4 * p.gaugePlatePct) / 100,
  }
}

// ── pressures of a section ──────────────────────────────────────────────────
export interface TestLimits {
  /** strength: the low point's pressure and the least at the high point, psi and % SMYS */
  lowPsi: number; highMinPsi: number; lowPct: number; highMinPct: number
  /** leak: the same */
  leakLowPsi: number; leakMinPsi: number
  /** what set the cyclic TP: 95 % SMYS or 1.5 DP */
  governs: 'smys' | 'dp'
}
/** the strength and leak pressures of the method the seam calls for (dpPsi = design pressure, needed by the cyclic method) */
export function testLimits(odIn: number, smysPsi: number, thinIn: number, dpPsi: number | null, p: IgsParams = DEFAULT_IGS): TestLimits {
  if (p.seam === 'HFW' && dpPsi && dpPsi > 0) {
    const bySmys = psiAtPct(p.cyclicSmysPct, smysPsi, odIn, thinIn), byDp = p.cyclicDpFactor * dpPsi
    const lowPsi = Math.min(bySmys, byDp), highMinPsi = p.cyclicHighDpFactor * dpPsi
    return { lowPsi, highMinPsi, lowPct: pctAtPsi(lowPsi, smysPsi, odIn, thinIn), highMinPct: pctAtPsi(highMinPsi, smysPsi, odIn, thinIn), leakLowPsi: lowPsi, leakMinPsi: highMinPsi, governs: bySmys <= byDp ? 'smys' : 'dp' }
  }
  return {
    lowPsi: psiAtPct(p.strengthPct, smysPsi, odIn, thinIn), highMinPsi: psiAtPct(p.minHighPct, smysPsi, odIn, thinIn), lowPct: p.strengthPct, highMinPct: p.minHighPct,
    leakLowPsi: psiAtPct(p.leakPct, smysPsi, odIn, thinIn), leakMinPsi: psiAtPct(p.leakMinPct, smysPsi, odIn, thinIn), governs: 'smys',
  }
}
export interface SectionElev { low: number; high: number; start: number; end: number; /** the test head / cabin */ head: number }
export interface PointPressures { low: number; high: number; start: number; end: number; head: number }
export interface SectionPressures {
  /** pressure at the low point at the two limits, and the elevation span they allow */
  pTop: number; pMin: number; allowedDh: number; dh: number; dhOk: boolean
  strength: PointPressures
  leak: PointPressures
  leakMin: number
  /** % SMYS at the high point in the strength test */
  highPct: number
  limits: TestLimits
}
export function sectionPressures(odIn: number, smysPsi: number, thinIn: number, e: SectionElev, p: IgsParams = DEFAULT_IGS, dpPsi: number | null = null): SectionPressures {
  const lim = testLimits(odIn, smysPsi, thinIn, dpPsi, p)
  const at = (pLow: number): PointPressures => {
    const f = (el: number) => pLow - (el - e.low) * p.psiPerM
    return { low: pLow, high: f(e.high), start: f(e.start), end: f(e.end), head: f(e.head) }
  }
  const strength = at(lim.lowPsi)
  return {
    pTop: lim.lowPsi, pMin: lim.highMinPsi, allowedDh: (lim.lowPsi - lim.highMinPsi) / p.psiPerM, dh: e.high - e.low, dhOk: strength.high >= lim.highMinPsi - 1e-9,
    strength, leak: at(lim.leakLowPsi), leakMin: lim.leakMinPsi, highPct: pctAtPsi(strength.high, smysPsi, odIn, thinIn), limits: lim,
  }
}
/** the pressure (psi) at an elevation, given the pressure at a reference elevation */
export const pressureAtElev = (pRef: number, eRef: number, e: number, p: IgsParams = DEFAULT_IGS) => pRef - (e - eRef) * p.psiPerM

// ── air test (عدم وجود هوا) ─────────────────────────────────────────────────
/** the pipe-and-water compliance per bar: D·(1−ν²)/(E·t) + 1/B */
const compliancePerBar = (odIn: number, tIn: number, p: IgsParams, bulk: number) => (odIn * (1 - p.poisson ** 2)) / (p.eBar * tIn) + 1 / bulk
/** HFW: water M withdrawn, the pressure drops from P₁ to P₂ */
export interface AirHfw { dpaPsi: number; dpthPsi: number; x: number; ratioPct: number; minPct: number; pass: boolean }
export function airTestHfw(x: { p1: number; p2: number; mM3: number; volumeM3: number; odIn: number; teIn: number; tC: number; pBar?: number; xOverride?: number | null }, p: IgsParams = DEFAULT_IGS): AirHfw {
  const X = x.xOverride ?? waterX(x.tC, x.pBar ?? x.p1 / PSI_PER_BAR)
  const dpthPsi = (x.mM3 * PSI_PER_KGCM2) / (x.volumeM3 * (X + x.odIn / (p.eKgCm2 * x.teIn)))
  const dpaPsi = x.p1 - x.p2
  const ratioPct = dpthPsi > 0 ? (dpaPsi / dpthPsi) * 100 : 0
  const minPct = airHfwMinOf(x.odIn, p)
  return { dpaPsi, dpthPsi, x: X, ratioPct, minPct, pass: ratioPct >= minPct - 1e-9 }
}
/** DSAW: the P/V plot (bar, m³ injected) from the static head; the straight part is fitted, extended back to the static head */
export interface AirSaw {
  slope: number; intercept: number; theorSlope: number; slopeRatio: number; airM3: number; airPct: number; bulkBar: number
  okAir: boolean; okSlope: boolean; pass: boolean; fitFrom: number; line: { p: number; v: number }[]
}
export function airTestSaw(points: { p: number; v: number }[], x: { volumeM3: number; odIn: number; teIn: number; tC: number; staticBar?: number }, p: IgsParams = DEFAULT_IGS): AirSaw | null {
  const pts = points.filter((q) => Number.isFinite(q.p) && Number.isFinite(q.v)).sort((a, b) => a.p - b.p)
  if (pts.length < 3 || x.volumeM3 <= 0) return null
  // the straight part: the upper points (at least three, at least half) — the start bends while the air is compressed
  const n = Math.max(3, Math.ceil(pts.length / 2)), fit = pts.slice(pts.length - n)
  const mp = fit.reduce((s, q) => s + q.p, 0) / n, mv = fit.reduce((s, q) => s + q.v, 0) / n
  const sxx = fit.reduce((s, q) => s + (q.p - mp) ** 2, 0)
  const slope = sxx > 0 ? fit.reduce((s, q) => s + (q.p - mp) * (q.v - mv), 0) / sxx : 0
  const intercept = mv - slope * mp
  const ps = x.staticBar ?? pts[0].p
  const airM3 = Math.max(0, intercept + slope * ps - pts[0].v)
  const bulkBar = bulkOf(p, x.tC, 35)
  const theorSlope = x.volumeM3 * compliancePerBar(x.odIn, x.teIn, p, bulkBar)
  const slopeRatio = theorSlope > 0 ? slope / theorSlope : 0
  const airPct = (airM3 / x.volumeM3) * 100
  const okAir = airPct <= p.airMaxPct + 1e-9, okSlope = slopeRatio <= p.airRatioMax + 1e-9
  return { slope, intercept, theorSlope, slopeRatio, airM3, airPct, bulkBar, okAir, okSlope, pass: okAir && okSlope, fitFrom: fit[0].p,
    line: [ps, pts[pts.length - 1].p].map((q) => ({ p: q, v: intercept + slope * q })) }
}
/** kept for the older single-step entry: ΔV_theor = V·ΔP·compliance; accepted when ΔV_actual / ΔV_theor ≤ 1.1 */
export interface AirTest { theorM3: number; ratio: number | null; pass: boolean | null; dpBar: number }
export function airTest(x: { volumeM3: number; dpPsi: number; dvActualM3: number | null; odIn: number; tIn: number; tC?: number }, p: IgsParams = DEFAULT_IGS): AirTest {
  const dpBar = x.dpPsi / PSI_PER_BAR
  const theorM3 = x.volumeM3 * dpBar * compliancePerBar(x.odIn, x.tIn, p, bulkOf(p, x.tC ?? 15, 35))
  const ratio = x.dvActualM3 != null && theorM3 > 0 ? x.dvActualM3 / theorM3 : null
  return { theorM3, ratio, pass: ratio == null ? null : ratio <= p.airRatioMax + 1e-9, dpBar }
}

// ── leak test (عدم نشتی) ────────────────────────────────────────────────────
export type LeakVerdict = 'pass' | 'extend' | 'fail'
/** D > 30″ */
export interface LeakTest {
  /** the loss the temperature change explains, psi (positive = a fall), and the loss measured P₁ − P₂ */
  theorLossPsi: number; actualLossPsi: number
  /** psi per °C of cooling */
  ratePsiPerC: number
  delta: number; bulkBar: number
  dT: number
  cond1: boolean; cond2: boolean | null
  pass: boolean
  /** kept for the charts: the pressure change the temperature explains (positive = a rise) */
  theorChangePsi: number
}
export function leakTest(x: { p1: number; p2: number; t1: number; t2: number; odIn: number; tIn: number; deltaOverride?: number | null }, p: IgsParams = DEFAULT_IGS): LeakTest {
  const dT = x.t1 - x.t2
  const tm = (x.t1 + x.t2) / 2
  const delta = x.deltaOverride ?? waterDelta(tm)
  const bulkBar = bulkOf(p, tm, x.p1 / PSI_PER_BAR)
  const ratePsiPerC = ((delta - 2 * (1 + p.poisson) * p.steelAlpha) / compliancePerBar(x.odIn, x.tIn, p, bulkBar)) * PSI_PER_BAR
  const theorLossPsi = ratePsiPerC * dT
  const actualLossPsi = x.p1 - x.p2
  const cond1 = actualLossPsi <= theorLossPsi + 1e-9
  const cond2 = x.odIn > p.leakBigDiaIn ? actualLossPsi <= p.leakMaxPsi + 1e-9 : null
  return { theorLossPsi, actualLossPsi, ratePsiPerC, delta, bulkBar, dT, cond1, cond2, pass: cond1 && (cond2 ?? true), theorChangePsi: -theorLossPsi }
}
/** D ≤ 30″: the K–F–H method of the procedure (F and ΔF/F are read from its curve by diameter) */
export interface LeakSmall { K: number; muGamma: number; x: number; dpthPsi: number; H: number; dpaPsi: number; dpPsi: number; verdict: LeakVerdict }
export function leakTestSmall(x: { p1: number; p2: number; t1: number; t2: number; odIn: number; teIn: number; F: number; dFF: number; muGamma?: number | null; xOverride?: number | null }, p: IgsParams = DEFAULT_IGS): LeakSmall {
  const tm = (x.t1 + x.t2) / 2
  const muGamma = x.muGamma ?? waterDelta(tm) - 3 * p.steelAlpha
  const X = x.xOverride ?? waterX(tm, x.p1 / PSI_PER_BAR)
  const K = (PSI_PER_KGCM2 * muGamma) / (X + x.odIn / (p.eKgCm2 * x.teIn))
  const dpthPsi = K * x.F * (x.t1 - x.t2)
  const H = x.dFF * Math.abs(dpthPsi) + 0.2 * Math.abs(K * x.F)
  const dpaPsi = x.p1 - x.p2
  const dpPsi = dpaPsi - dpthPsi
  const a = Math.abs(dpPsi)
  return { K, muGamma, x: X, dpthPsi, H, dpaPsi, dpPsi, verdict: a <= H + 1e-9 ? 'pass' : a <= p.leakFailFactor * H ? 'extend' : 'fail' }
}

// ── strength test ───────────────────────────────────────────────────────────
export interface PvPoint { p: number; v: number }
export interface PvResult {
  slope: number; intercept: number; maxOffsetM3: number; maxOffsetPct: number; atP: number | null
  /** the 0.2 % offset line (parallel to the straight part, 0.002·V along the volume axis) and whether the plot crossed it */
  offsetM3: number; crossed: boolean
  /** the largest step slope over the straight part's slope, and where it was */
  slopeRatio: number; slopeAtP: number | null; slopeOk: boolean
  pass: boolean; line: { p: number; v: number }[]; offsetLine: { p: number; v: number }[]
}
/** fits the straight part (the first half of the points, at least three) and checks the rest against the offset line and
 *  the slope change */
export function pvOffset(points: PvPoint[], volumeM3: number, p: IgsParams = DEFAULT_IGS): PvResult | null {
  const pts = [...points].filter((x) => Number.isFinite(x.p) && Number.isFinite(x.v)).sort((a, b) => a.p - b.p)
  if (pts.length < 4 || volumeM3 <= 0) return null
  const n = Math.max(3, Math.floor(pts.length / 2)), fit = pts.slice(0, n)
  const mp = fit.reduce((s, x) => s + x.p, 0) / n, mv = fit.reduce((s, x) => s + x.v, 0) / n
  const sxx = fit.reduce((s, x) => s + (x.p - mp) ** 2, 0)
  const slope = sxx > 0 ? fit.reduce((s, x) => s + (x.p - mp) * (x.v - mv), 0) / sxx : 0
  const intercept = mv - slope * mp
  let maxOffsetM3 = 0, atP: number | null = null
  for (const x of pts) { const o = x.v - (intercept + slope * x.p); if (o > maxOffsetM3) { maxOffsetM3 = o; atP = x.p } }
  let slopeRatio = 0, slopeAtP: number | null = null
  for (let i = n; i < pts.length; i++) {
    const dp = pts[i].p - pts[i - 1].p
    if (dp <= 0 || slope <= 0) continue
    const r = (pts[i].v - pts[i - 1].v) / dp / slope
    if (r > slopeRatio) { slopeRatio = r; slopeAtP = pts[i].p }
  }
  const offsetM3 = (p.pvOffsetPct / 100) * volumeM3
  const crossed = maxOffsetM3 > offsetM3 + 1e-9
  const slopeOk = slopeRatio <= p.slopeChangeMax + 1e-9
  const ends = [pts[0], pts[pts.length - 1]]
  return {
    slope, intercept, maxOffsetM3, maxOffsetPct: (maxOffsetM3 / volumeM3) * 100, atP, offsetM3, crossed, slopeRatio, slopeAtP, slopeOk,
    pass: !crossed && slopeOk, line: ends.map((x) => ({ p: x.p, v: intercept + slope * x.p })), offsetLine: ends.map((x) => ({ p: x.p, v: intercept + offsetM3 + slope * x.p })),
  }
}
/** the yield hold: each reading's drift from the start, which ones needed water injected / bled (|drift| > 1 bar) and the
 *  volumes recorded */
export interface HoldRow { at: string; psi: number; adjustM3: number | null }
export function holdDrift(rows: HoldRow[], p: IgsParams = DEFAULT_IGS) {
  const s = [...rows].filter((r) => Number.isFinite(r.psi)).sort((a, b) => a.at.localeCompare(b.at))
  if (!s.length) return { maxDriftPsi: 0, unadjusted: 0, injectedM3: 0, bledM3: 0, hours: 0 }
  const lim = p.holdAdjustBar * PSI_PER_BAR
  let ref = s[0].psi, maxDriftPsi = 0, unadjusted = 0, injectedM3 = 0, bledM3 = 0
  for (let i = 1; i < s.length; i++) {
    const r = s[i], drift = r.psi - ref
    maxDriftPsi = Math.max(maxDriftPsi, Math.abs(drift))
    if (r.adjustM3) { if (r.adjustM3 > 0) injectedM3 += r.adjustM3; else bledM3 -= r.adjustM3; ref = r.psi }
    // a drift beyond the limit is corrected on that reading or recorded on the next one
    else if (Math.abs(drift) > lim + 1e-9 && !s[i + 1]?.adjustM3) unadjusted++
  }
  return { maxDriftPsi, unadjusted, injectedM3, bledM3, hours: (Date.parse(s[s.length - 1].at) - Date.parse(s[0].at)) / 3600000 }
}

// ── holds ───────────────────────────────────────────────────────────────────
export interface TimedReading { at: string; psi: number; tempC: number | null }
/** a hold: duration, lowest pressure, longest gap between readings */
export function holdFigures(r: TimedReading[]) {
  const s = [...r].sort((a, b) => a.at.localeCompare(b.at))
  if (!s.length) return { hours: 0, minPsi: null as number | null, maxGapH: 0, first: null as TimedReading | null, last: null as TimedReading | null }
  let maxGapH = 0
  for (let i = 1; i < s.length; i++) maxGapH = Math.max(maxGapH, (Date.parse(s[i].at) - Date.parse(s[i - 1].at)) / 3600000)
  return { hours: (Date.parse(s[s.length - 1].at) - Date.parse(s[0].at)) / 3600000, minPsi: Math.min(...s.map((x) => x.psi)), maxGapH, first: s[0], last: s[s.length - 1] }
}

// ── test water (بند آب مصرفی) ──────────────────────────────────────────────
export const WATER_LIMITS: { k: string; label: string; unit: string; min?: number; max?: number }[] = [
  { k: 'ph', label: 'pH', unit: '', min: 7, max: 9.2 }, { k: 'tds', label: 'کل مواد جامد محلول (TDS)', unit: 'ppm', max: 1500 },
  { k: 'cl', label: 'کلراید (Cl⁻)', unit: 'ppm', max: 600 }, { k: 'so4', label: 'سولفات (SO₄²⁻)', unit: 'ppm', max: 400 },
  { k: 'th', label: 'سختی کل (CaCO₃)', unit: 'ppm', max: 500 }, { k: 'ph2', label: 'سختی دائم', unit: 'ppm', max: 450 },
]
export function waterCheck(v: Record<string, number | null>) {
  const rows = WATER_LIMITS.map((l) => { const x = v[l.k]; return { ...l, value: x ?? null, ok: x == null ? null : (l.min == null || x >= l.min) && (l.max == null || x <= l.max) } })
  return { rows, ok: rows.some((r) => r.ok === false) ? false : rows.every((r) => r.ok === true) ? true : null }
}

// ── the procedure, summarised and grouped (shown in the module's settings and printed with the minutes) ─────
export interface ProcStep { key: string; title: string; items: (p: IgsParams) => string[] }
const n = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
export const IGS_PROCEDURE: ProcStep[] = [
  { key: 'basis', title: 'مبنا، روش و قطعه‌بندی', items: (p) => [
    'دستورالعمل مرجع: IGS-C-PL-100(3)، فصل ۱۲ (دی‌ماه ۱۳۹۹). روش آزمون مقاومت با نوع درزجوش لوله تعیین می‌شود: HFW روش سیکلی و DSAW روش تسلیمی.',
    `روش جاری پروژه: ${SEAM_FA[p.seam]}.`,
    p.seam === 'HFW'
      ? `روش سیکلی: فشار پایین‌ترین نقطه (TP) برابر کمترِ ${n(p.cyclicSmysPct)}٪ SMYS لوله با کمترین ضخامت و ${n(p.cyclicDpFactor)} برابر فشار طراحی است؛ فشار بالاترین نقطه دست‌کم ${n(p.cyclicHighDpFactor)} برابر فشار طراحی.`
      : `روش تسلیمی: فشار پایین‌ترین نقطه ${n(p.strengthPct)}٪ SMYS و فشار بالاترین نقطه دست‌کم ${n(p.minHighPct)}٪ SMYS لوله با کمترین ضخامت.`,
    `اختلاف ارتفاع مجاز هر قطعه = (فشار نقطهٔ پایین − حداقل فشار نقطهٔ بالا) ÷ ${n(p.psiPerM)} psi بر متر ستون آب. طول هر قطعه حداکثر ${n(p.maxSectionKm)} کیلومتر.`,
    'هدرها با گواهی آزمون ۱٫۲۵ برابر فشار آزمون؛ آب‌بندی فلنج‌ها تا ۷ بار یا MAOP؛ فاصلهٔ ایمن افراد از هدرها ۲۰ متر.',
    'نیمرخ طولی قطعه (فرم ۵-۱) با کیلومتر، نقاط ارتفاعی، طول طبیعی و شمارهٔ سرجوش‌ها ضمیمهٔ آزمون است.',
  ] },
  { key: 'permit', title: 'مجوز شروع و آب مصرفی', items: (p) => [
    'صورتجلسهٔ مجوز شروع (یکپارچگی خط و تکمیل گردهٔ خاکی) پیش از شروع عملیات تکمیل می‌شود.',
    `کیفیت آب: pH بین ۷ و ۹٫۲، TDS ≤ ۱۵۰۰، کلراید ≤ ۶۰۰، سولفات ≤ ۴۰۰، سختی کل ≤ ۵۰۰ و سختی دائم ≤ ۴۵۰ ppm. آبگیری در دمای کمتر از ${n(p.minFillTempC)} درجه بدون ضدیخ مجاز نیست.`,
    'تجهیزات: ثبات و فشارسنج ۰ تا ۱٫۵ برابر فشار آزمون با دقت ۱٪؛ فشارسنج وزنه‌ای با دقت ۰٫۱ psi؛ ثبات دما ۰ تا ۶۰ درجه؛ دماسنج دیجیتال ۰٫۱ درجه با دیتالاگر؛ کنتور آب ۰٫۰۱ مترمکعب؛ همه با گواهی کالیبراسیون معتبر.',
    'حسگرهای دمای سطح لوله هر ۳ کیلومتر (دست‌کم ۳ نقطه) و ۱۰۰ متر دورتر از هدرها؛ ثبات‌ها ۵۰ متر از دو سر قطعه.',
  ] },
  { key: 'cleaning', title: 'تمیزکاری و صفحهٔ اندازه', items: (p) => [
    'پیگ تمیزکننده با برس سیمی و سرعت ۰٫۵ تا ۲٫۵ متر بر ثانیه به دفعات لازم؛ در صورت نیاز پیگ مغناطیسی.',
    `قطر صفحهٔ اندازه ${n(p.gaugePlatePct)}٪ قطر داخلی ضخیم‌ترین لولهٔ قطعه. ضخامت و جنس${p.gaugePlateMm != null ? ` (تنظیم پروژه: ${n(p.gaugePlateMm)} میلی‌متر)` : ''}: تا ۱۲″ آلومینیوم ۴ mm؛ ۱۴ تا ۲۰″ آلومینیوم ۶ mm؛ بیش از ۲۰ تا ۳۰″ فولاد ۶ mm؛ بیش از ۳۰″ فولاد ۸ mm.`,
    'دریافت سالم صفحه، سلامت لوله از نظر لهیدگی (Oval/Dent) را تأیید می‌کند (فرم ۵-۲).',
  ] },
  { key: 'filling', title: 'آبگیری', items: () => [
    'ابتدا ۱۰۰ متر آب، سپس پیگ با سرعت ۱۰ تا ۱۵ متر بر دقیقه و پس‌فشار دست‌کم ۲ بار از پایین‌ترین سر قطعه.',
    'حداقل دبی پمپ: کمتر از ۳۰″ — ۱۲۰، ۳۰ تا ۴۸″ — ۱۶۰ و ۴۸″ و بیشتر — ۲۰۰ لیتر بر دقیقه. دما و حجم آب ورودی ثبت می‌شود.',
  ] },
  { key: 'air', title: 'آزمایش عدم وجود هوا', items: (p) => p.seam === 'HFW' ? [
    'HFW: حجم معینی آب (M) از خط برداشته و افت فشار واقعی ΔPa = P₁ − P₂ با فشارسنج وزنه‌ای اندازه‌گیری می‌شود.',
    `ΔPth = M × ۱۴٫۲۲ ÷ (V × (X + D ÷ (E × te)))، E = ${n(p.eKgCm2 / 1e6)}×۱۰⁶ kg/cm²، X ضریب فشردگی آب در دمای خط.`,
    `شرط قبولی: ΔPa ÷ ΔPth دست‌کم ${n(p.airHfwMinSmall)}٪ برای قطر تا ${n(p.airSmallMaxIn)}″ و ${n(p.airHfwMinBig)}٪ برای قطرهای بزرگ‌تر (فرم ۵-۵).`,
  ] : [
    `DSAW: افزایش حجم آب در برابر فشار هر ۱ بار تا ${n(p.airPvMaxBar)} بار یا نصف MAOP (هر کدام کمتر) ثبت و نمودار P/V رسم می‌شود.`,
    `مماس بر بخش خطی تا فشار ستون آب (Static Head) امتداد می‌یابد؛ حجم هوا ÷ حجم خط ≤ ${n(p.airMaxPct)}٪.`,
    `شیب نظری ΔV/ΔP = V[D(1−ν²)/(E·t) + 1/B]، E = ${n(p.eBar / 1e6)}×۱۰⁶ bar، B مدول بالک آب در دمای متوسط و ۳۵ بار؛ شیب واقعی ÷ شیب نظری ≤ ${n(p.airRatioMax)}.`,
  ] },
  { key: 'strength', title: 'آزمایش مقاومت', items: (p) => p.seam === 'HFW' ? [
    `روش سیکلی: پس از رسیدن به TP، ${n(p.cyclicHoldMin)} دقیقه نگهداری، کاهش فشار به نصف و افزایش مجدد؛ مجموعاً ${n(p.cyclicCycles)} سیکل.`,
    'در صورت نبود اشکال در طول سیکل‌ها، آزمون مقاومت قبول است (فرم ۵-۴).',
  ] : [
    'از ۵۰٪ TP، تغییرات فشار در برابر حجم آب تزریقی تا فشار آزمون در جدول ثبت و نمودار P–V رسم می‌شود (فرم ۵-۴).',
    `خط ${n(p.pvOffsetPct)}٪ Offset: موازی بخش خطی، به فاصلهٔ ${n(p.pvOffsetPct / 100, 4)} × حجم خط روی محور حجم، تا حدود ۸۰٪ SMYS.`,
    `اگر شیب نمودار بیش از ${n(p.slopeChangeMax)} برابر تغییر کند یا نمودار خط Offset را قطع کند، افزایش فشار متوقف می‌شود.`,
    `نگهداری ${n(p.strengthHoldH)} ساعت؛ افت بیش از ${n(p.holdAdjustBar)} بار با تزریق آب و افزایش بیش از آن با تخلیه جبران و حجم آب ثبت می‌شود.`,
  ] },
  { key: 'stabilization', title: 'دورهٔ یکنواختی', items: (p) => [
    'نگهداری خط در «فشار آزمون نشتی» تا یکنواخت شدن فشار و دما.',
    p.stabilizationDays != null ? `مدت تنظیم‌شدهٔ پروژه: ${n(p.stabilizationDays)} روز.` : 'مدت: تا ۱۴″ یک روز، ۱۶ تا ۲۸″ دو روز، ۳۰″ و بالاتر سه روز؛ اگر یکنواختی دما زودتر نشان داده شود، رعایت این زمان‌ها الزامی نیست.',
    `ثبت پیوستهٔ فشار و دما با ثبات و قرائت دست‌کم هر ${n(p.stabilizationGapH)} ساعت.`,
  ] },
  { key: 'leak', title: 'آزمایش نشتی', items: (p) => [
    p.seam === 'HFW' ? 'فشار آزمون نشتی در روش سیکلی برابر فشار آزمون مقاومت است.' : `فشار آزمون نشتی: پایین‌ترین نقطه ${n(p.leakPct)}٪ و بالاترین نقطه دست‌کم ${n(p.leakMinPct)}٪ SMYS.`,
    `مدت ${n(p.leakHoldH)} ساعت؛ فشار هر ساعت با فشارسنج وزنه‌ای، دمای سطح لوله (یا زمین برای ۳۰″ و کمتر) هر ۳ ساعت و دمای محیط هر ساعت (فرم ۵-۳). دمای خط بهتر است از ${n(p.minPipeTempC)} درجه کمتر نباشد.`,
    `تا ${n(p.leakBigDiaIn)}″: K = ۱۴٫۲۲(μ−γ) ÷ (X + D/(E·te))، ΔPth = K·F·(T₁−T₂)، H = (ΔF/F)·ΔPth + ۰٫۲·K·F، ΔP = (P₁−P₂) − ΔPth؛ ΔP ≤ H قبول، ΔP > H تمدید و ΔP ≫ H (بیش از ${n(p.leakFailFactor)} برابر H) مردود (فرم ۵-۶).`,
    `بیش از ${n(p.leakBigDiaIn)}″: ΔPth/ΔT = (δ − ۲(۱+ν)α) ÷ (D(۱−ν²)/(E·t) + ۱/B)، α = ${n(p.steelAlpha * 1e5, 3)}×۱۰⁻⁵؛ قبولی: ΔPa ≤ ΔPth و ΔPa ≤ ${n(p.leakMaxPsi)} psi.`,
    'در صورت برقرار نبودن شرایط یا تغییرات ناهماهنگ فشار و دما، آزمون ۲۴ ساعت دیگر تمدید می‌شود.',
  ] },
  { key: 'drying', title: 'تخلیه و خشک‌کردن', items: (p) => [
    'تخلیه با چند پیگ با کاپ سالم که با هوای گرم رانده می‌شوند؛ آب تخلیه‌شده نباید خسارتی ایجاد کند.',
    `اختلاف نقطهٔ شبنم هوای خروجی با نقطهٔ شبنم هوای محیط حداکثر ${n(p.dewPointDiffC)} درجه؛ در غیر این صورت ادامهٔ خشک‌کردن (از جمله با متانول).`,
    'دو سر قطعه بلافاصله مسدود می‌شود؛ برای توقف طولانی، پر کردن با نیتروژن با فشار ۱ kg/cm² (فرم ۵-۷).',
  ] },
  { key: 'stations', title: 'ایستگاه‌ها، Tie-in و تقاطع‌ها', items: (p) => [
    `فشار آزمون ${n(p.stationFactor)} برابر فشار طراحی به مدت ${n(p.stationHoldH)} ساعت؛ هیچ نشتی پذیرفته نیست.`,
    'آزمون چشمی با سرجوش‌های روباز و بدون عایق، دو فشارسنج کالیبره و شیرهای نیمه‌باز؛ نقشهٔ ازبیلت با شمارهٔ سرجوش‌ها و گزارش رادیوگرافی.',
    'تخلیه و خشک‌کردن با Air Flushing. لوله‌های عبور از تقاطع پس از اتصال، همراه قطعه دوباره آزمون می‌شوند.',
  ] },
]

/** everything the minutes need for one line section: its pipe mix (the twin's wall when none was entered), its point
 *  elevations and the strength / leak pressures at each point */
export interface SectionIgsInput {
  odIn: number; smysPsi: number; defaultWallIn: number; lengthM: number; wallMix: WallPart[] | null
  elev: SectionElev
  /** design pressure, psi (the cyclic method) */
  dpPsi?: number | null
}
export function sectionIgs(x: SectionIgsInput, p: IgsParams = DEFAULT_IGS) {
  const mix = mixFigures(x.odIn, x.wallMix?.length ? x.wallMix : [{ wtIn: x.defaultWallIn, lengthM: x.lengthM }], p)
  if (!mix) return null
  const pr = sectionPressures(x.odIn, x.smysPsi, mix.thinIn, x.elev, p, x.dpPsi ?? null)
  return { mix, pr, fromTwin: !x.wallMix?.length, plate: gaugePlateOf(x.odIn, p), stabDays: stabilizationDaysOf(x.odIn, p) }
}
