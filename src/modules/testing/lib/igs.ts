/**
 * Hydrostatic test of a gas pipeline by the yield method of IGS-C-PL-100(3) — the figures of the project's «مشخصات روش آزمایش
 * هیدرواستاتیک» and its section calculation sheet. Pure: units as on the forms — pressure psi, wall and diameter inch,
 * elevation and length metre, volume m³ (bar shown beside psi where useful).
 *
 *  Pressure at a hoop stress of x % SMYS (Barlow):          P = x/100 · 2 · SMYS · t / D            (t = the THINNEST wall)
 *  Strength test: the LOW point is brought to 110 % SMYS; every other point has  P(e) = P_low − k · (e − e_low),
 *    k = 1.42 psi per metre of water column; the HIGH point must still see ≥ 95 % SMYS, so a section may span at most
 *    Δh_allowed = (P₁₁₀ − P₉₅) / k of elevation, and at most 20 km.
 *  Leak test: the low point at 95 % SMYS (the high point not below 80 %), held 24 h after a stabilization period (≥ 3 days).
 *  Section volume Σ L·π·ID²/4 per wall thickness; equivalent wall t_eq = V / Σ(Vᵢ / tᵢ) (volume-weighted harmonic mean).
 *  Gauge plate: steel, 8 mm, Ø = 95 % of the inside diameter of the THICKEST pipe of the section.
 *  Air test: ΔV_theor = V · ΔP · ( D·(1−ν²) / (E·t) + 1/K ), accepted when ΔV_actual / ΔV_theor ≤ 1.1.
 *  Leak test verdict: the pressure change the temperature change explains,
 *    ΔP_theor = ΔT · (β − 2α) / ( D·(1−ν²)/(E·t) + 1/K ),  and the unexplained loss ΔP_actual = P₁ − P₂ must satisfy
 *    ΔP_actual ≤ ΔP_theor (as a loss)  AND  ΔP_actual ≤ 1.5 psi   for pipe above 30″.
 */
export const PSI_PER_BAR = 14.5038

export interface IgsParams {
  /** % SMYS at the low point in the strength test (yield method) */
  strengthPct: number
  /** % SMYS the high point must still reach in the strength test */
  minHighPct: number
  /** % SMYS at the low point in the leak test, and the least at the high point */
  leakPct: number
  leakMinPct: number
  /** psi per metre of water column */
  psiPerM: number
  maxSectionKm: number
  strengthHoldH: number
  stabilizationDays: number
  /** longest gap between two stabilization readings, hours */
  stabilizationGapH: number
  leakHoldH: number
  gaugePlatePct: number
  gaugePlateMm: number
  airRatioMax: number
  /** leak test: largest unexplained pressure loss, psi, for pipe larger than `leakBigDiaIn` */
  leakMaxPsi: number
  leakBigDiaIn: number
  eGpa: number
  poisson: number
  /** bulk modulus of the test water, bar (≈ 22 000 – 23 000, depends on temperature) */
  bulkBar: number
  /** linear thermal expansion of steel, 1/°C */
  steelAlpha: number
  /** strength test: largest P–V offset from the straight line, % of the section volume */
  pvOffsetPct: number
  /** stations and pre-test pipe: test pressure = factor × design pressure, held for hours */
  stationFactor: number
  stationHoldH: number
  /** drying: largest dew point of the air behind the last pig, °C (null = compare with the ambient only) */
  dewPointMaxC: number | null
}
export const DEFAULT_IGS: IgsParams = {
  strengthPct: 110, minHighPct: 95, leakPct: 95, leakMinPct: 80, psiPerM: 1.42, maxSectionKm: 20,
  strengthHoldH: 4, stabilizationDays: 3, stabilizationGapH: 24, leakHoldH: 24,
  gaugePlatePct: 95, gaugePlateMm: 8, airRatioMax: 1.1, leakMaxPsi: 1.5, leakBigDiaIn: 30,
  eGpa: 207, poisson: 0.3, bulkBar: 22300, steelAlpha: 1.16e-5, pvOffsetPct: 0.2,
  stationFactor: 1.5, stationHoldH: 4, dewPointMaxC: null,
}
export const igsOf = (x: Partial<IgsParams> | null | undefined): IgsParams => ({ ...DEFAULT_IGS, ...(x ?? {}) })

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
}
export function sectionPressures(odIn: number, smysPsi: number, thinIn: number, e: SectionElev, p: IgsParams = DEFAULT_IGS): SectionPressures {
  const pTop = psiAtPct(p.strengthPct, smysPsi, odIn, thinIn)
  const pMin = psiAtPct(p.minHighPct, smysPsi, odIn, thinIn)
  const leakLow = psiAtPct(p.leakPct, smysPsi, odIn, thinIn)
  const at = (pLow: number): PointPressures => {
    const f = (el: number) => pLow - (el - e.low) * p.psiPerM
    return { low: pLow, high: f(e.high), start: f(e.start), end: f(e.end), head: f(e.head) }
  }
  const strength = at(pTop)
  const dh = e.high - e.low
  return {
    pTop, pMin, allowedDh: (pTop - pMin) / p.psiPerM, dh, dhOk: strength.high >= pMin - 1e-9,
    strength, leak: at(leakLow), leakMin: psiAtPct(p.leakMinPct, smysPsi, odIn, thinIn),
    highPct: pctAtPsi(strength.high, smysPsi, odIn, thinIn),
  }
}
/** the pressure (psi) at an elevation, given the pressure at a reference elevation */
export const pressureAtElev = (pRef: number, eRef: number, e: number, p: IgsParams = DEFAULT_IGS) => pRef - (e - eRef) * p.psiPerM

// ── air test (عدم وجود هوا) ─────────────────────────────────────────────────
/** the pipe-and-water compliance per bar: D·(1−ν²)/(E·t) + 1/K */
const compliancePerBar = (odIn: number, tIn: number, p: IgsParams) => (odIn * (1 - p.poisson ** 2)) / (p.eGpa * 1e4 * tIn) + 1 / p.bulkBar
export interface AirTest { theorM3: number; ratio: number | null; pass: boolean | null; dpBar: number }
export function airTest(x: { volumeM3: number; dpPsi: number; dvActualM3: number | null; odIn: number; tIn: number }, p: IgsParams = DEFAULT_IGS): AirTest {
  const dpBar = x.dpPsi / PSI_PER_BAR
  const theorM3 = x.volumeM3 * dpBar * compliancePerBar(x.odIn, x.tIn, p)
  const ratio = x.dvActualM3 != null && theorM3 > 0 ? x.dvActualM3 / theorM3 : null
  return { theorM3, ratio, pass: ratio == null ? null : ratio <= p.airRatioMax + 1e-9, dpBar }
}

// ── leak test (عدم نشتی) ────────────────────────────────────────────────────
/** volumetric thermal expansion of water, 1/°C (fit valid 0 – 40 °C) */
export const waterBeta = (tC: number) => (-64.268 + 17.0105 * tC - 0.20369 * tC * tC + 0.0016048 * tC ** 3) * 1e-6
export interface LeakTest {
  /** pressure change the temperature change explains, psi (positive = a rise) */
  theorChangePsi: number
  /** the loss the temperature explains (−theorChange) and the loss measured (P₁ − P₂), psi */
  theorLossPsi: number; actualLossPsi: number
  dT: number
  cond1: boolean; cond2: boolean | null
  pass: boolean
}
export function leakTest(x: { p1: number; p2: number; t1: number; t2: number; odIn: number; tIn: number }, p: IgsParams = DEFAULT_IGS): LeakTest {
  const dT = x.t2 - x.t1
  const tm = (x.t1 + x.t2) / 2
  const dpBar = (dT * (waterBeta(tm) - 2 * p.steelAlpha)) / compliancePerBar(x.odIn, x.tIn, p)
  const theorChangePsi = dpBar * PSI_PER_BAR
  const theorLossPsi = -theorChangePsi
  const actualLossPsi = x.p1 - x.p2
  const cond1 = actualLossPsi <= theorLossPsi + 1e-9
  const big = x.odIn > p.leakBigDiaIn
  const cond2 = big ? actualLossPsi <= p.leakMaxPsi + 1e-9 : null
  return { theorChangePsi, theorLossPsi, actualLossPsi, dT, cond1, cond2, pass: cond1 && (cond2 ?? true) }
}

// ── strength test: pressure–volume linearity ────────────────────────────────
export interface PvPoint { p: number; v: number }
export interface PvResult { slope: number; intercept: number; maxOffsetM3: number; maxOffsetPct: number; atP: number | null; pass: boolean; line: { p: number; v: number }[] }
/** fits the straight part (the first half of the points, at least three) and measures how far the rest bends away from it */
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
  const maxOffsetPct = (maxOffsetM3 / volumeM3) * 100
  return { slope, intercept, maxOffsetM3, maxOffsetPct, atP, pass: maxOffsetPct <= p.pvOffsetPct + 1e-9, line: [pts[0], pts[pts.length - 1]].map((x) => ({ p: x.p, v: intercept + slope * x.p })) }
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

// ── the procedure, summarised and grouped (shown in the module's settings and printed with the minutes) ─────
export interface ProcStep { key: string; title: string; items: (p: IgsParams) => string[] }
const n = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
export const IGS_PROCEDURE: ProcStep[] = [
  { key: 'basis', title: 'مبنا و قطعه‌بندی', items: (p) => [
    'دستورالعمل مرجع: IGS-C-PL-100(3) — روش تسلیمی (Yield).',
    `فشار آزمون مقاومت در پایین‌ترین نقطهٔ قطعه برابر ${n(p.strengthPct)}٪ SMYS لوله با کمترین ضخامت است؛ فشار بالاترین نقطه نباید از ${n(p.minHighPct)}٪ SMYS کمتر شود.`,
    `اختلاف ارتفاع مجاز هر قطعه = (فشار ${n(p.strengthPct)}٪ − فشار ${n(p.minHighPct)}٪ SMYS) ÷ ${n(p.psiPerM)} psi بر متر ستون آب. حداکثر طول هر قطعه ${n(p.maxSectionKm)} کیلومتر است.`,
    'جدول مشخصات قطعه (ضخامت‌ها، طول‌ها، حجم، ارتفاع نقاط پایین، بالا، ابتدا، انتها و کابین) ضمیمهٔ آزمون است (فرم ۱).',
  ] },
  { key: 'permit', title: 'مجوز شروع آزمون', items: () => [
    'صورتجلسهٔ مجوز شروع (یکپارچگی خط و تکمیل گردهٔ خاکی) پیش از شروع عملیات تکمیل و به نمایندهٔ کارفرما ارائه می‌شود (فرم ۲).',
    'از زمان شروع آزمون، مسئولیت هر عملیات اجرایی که آزمون مجدد لازم کند با پیمانکار است.',
  ] },
  { key: 'cleaning', title: 'تمیزکاری و صفحهٔ اندازه', items: (p) => [
    'پس از اتمام احداث، خط با ارسال پیگ تمیزکننده با هوای کمپرسور به دفعات لازم تمیز می‌شود.',
    `صفحهٔ اندازه از جنس فولاد، به ضخامت ${n(p.gaugePlateMm)} میلی‌متر و قطر ${n(p.gaugePlatePct)}٪ قطر داخلی ضخیم‌ترین لولهٔ قطعه ارسال می‌شود. دریافت سالم صفحه، شرط قبولی است.`,
  ] },
  { key: 'filling', title: 'آبگیری', items: () => [
    'منبع آب مصرفی مشخص و در زمان آبگیری دمای آب و حجم آب ورودی اندازه‌گیری و ثبت می‌شود.',
  ] },
  { key: 'air', title: 'آزمایش عدم وجود هوا', items: (p) => [
    'فشار خط به اندازهٔ ΔP افزایش داده و حجم آب تزریق‌شده (ΔV واقعی) با کنتور دقیق اندازه‌گیری می‌شود.',
    'ΔV محاسبه‌ای = V × ΔP × (D(1−ν²)/(E·t) + 1/K) — V حجم قطعه، t ضخامت معادل، E مدول الاستیسیتهٔ فولاد، K مدول حجمی آب.',
    `شرط قبولی: ΔV واقعی ÷ ΔV محاسبه‌ای ≤ ${n(p.airRatioMax)}.`,
  ] },
  { key: 'strength', title: 'آزمایش مقاومت', items: (p) => [
    `رساندن فشار به ${n(p.strengthPct)}٪ SMYS لوله با کمترین ضخامت در پایین‌ترین نقطه، با ثبت جدول تغییرات فشار، حجم آب و زمان.`,
    `بررسی انحراف (Offset) با رسم نمودار فشار–حجم؛ انحراف از خط راست نباید از ${n(p.pvOffsetPct)}٪ حجم قطعه بیشتر شود.`,
    `نگهداری فشار به مدت ${n(p.strengthHoldH)} ساعت.`,
  ] },
  { key: 'stabilization', title: 'دورهٔ یکنواختی', items: (p) => [
    'نگهداری فشار در «فشار آزمون نشتی».',
    `حداقل ${n(p.stabilizationDays)} روز (با نظر نمایندهٔ کارفرما قابل تغییر)، با ثبت پیوستهٔ فشار و دما با دستگاه‌های ثبات.`,
    `اندازه‌گیری فشار و دمای خط دست‌کم هر ${n(p.stabilizationGapH)} ساعت و ثبت در جدول یکنواختی.`,
  ] },
  { key: 'leak', title: 'آزمایش نشتی', items: (p) => [
    `فشار آزمون ${n(p.leakPct)}٪ SMYS در پایین‌ترین نقطه؛ حداقل فشار ${n(p.leakMinPct)}٪ SMYS. در قطعه‌های با اختلاف ارتفاع کمتر از حد مجاز، کاهش فشار آزمون با نظر نمایندهٔ کارفرما است.`,
    `مدت ${n(p.leakHoldH)} ساعت؛ دمای خط از دمای سطح لوله اندازه‌گیری می‌شود.`,
    'ΔP محاسبه‌ای (اثر تغییر دما) = ΔT × (β − 2α) ÷ (D(1−ν²)/(E·t) + 1/K)؛ β ضریب انبساط حجمی آب در دمای خط و α ضریب انبساط طولی فولاد.',
    `شرط قبولی برای لولهٔ بزرگ‌تر از ${n(p.leakBigDiaIn)}″: افت واقعی ≤ افت محاسبه‌ای و افت واقعی ≤ ${n(p.leakMaxPsi)} psi.`,
  ] },
  { key: 'drying', title: 'تخلیه و خشک‌کردن', items: (p) => [
    'هیچ آبی در جلوی آخرین پیگ تخلیه دیده نشود.',
    'هوای خروجی پشت پیگ بدون رطوبت بیش از حد مجاز و بدون گرد و زنگ باشد.',
    `دمای نقطهٔ شبنم داخل لوله اندازه‌گیری و با محیط مقایسه شود${p.dewPointMaxC != null ? `؛ حداکثر ${n(p.dewPointMaxC)} °C` : ''}.`,
    'بلافاصله پس از تأیید، دو سر قطعه مسدود یا به قطعه‌های دیگر متصل می‌شود.',
  ] },
  { key: 'stations', title: 'ایستگاه‌ها و لوله‌های Pre-test', items: (p) => [
    `فشار آزمون ${n(p.stationFactor)} برابر فشار طراحی، به مدت ${n(p.stationHoldH)} ساعت.`,
    'ارائهٔ نقشهٔ ایستگاه با شمارهٔ سرجوش‌ها همراه با گزارش رادیوگرافی.',
    'آزمون چشمی با سرجوش‌های رو‌باز، قابل رؤیت و بدون عایق؛ شیرها نیمه‌باز؛ نصب دو فشارسنج عقربه‌ای.',
    'تخلیهٔ کامل و خشک‌کردن به روش Air Flushing.',
  ] },
]

/** everything the minutes need for one line section: its pipe mix (the twin's wall when none was entered), its point
 *  elevations and the strength / leak pressures at each point */
export interface SectionIgsInput {
  odIn: number; smysPsi: number; defaultWallIn: number; lengthM: number; wallMix: WallPart[] | null
  elev: SectionElev
}
export function sectionIgs(x: SectionIgsInput, p: IgsParams = DEFAULT_IGS) {
  const mix = mixFigures(x.odIn, x.wallMix?.length ? x.wallMix : [{ wtIn: x.defaultWallIn, lengthM: x.lengthM }], p)
  if (!mix) return null
  const pr = sectionPressures(x.odIn, x.smysPsi, mix.thinIn, x.elev, p)
  return { mix, pr, fromTwin: !x.wallMix?.length }
}
