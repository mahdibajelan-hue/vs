import type {
  EstFullInputs, EstProjectDraft, EstResults, EstSectionResult,
  OnshoreSpec, OffshoreSpec, CompressorSpec, StationUnitSpec, TelecomScadaSpec,
} from '../types'

/* ---------------------------------------------------------------------------
 * Cost engine.
 *
 * Onshore/offshore pipeline sections follow the category-percentage structure of the National
 * Iranian Oil Company's official cost-estimation guideline ("راهنمای برآورد هزینه طرح‌ها و
 * پروژه‌ها — فصل احداث خطوط لوله دریا و خشکی"): direct cost is built from a handful of
 * per-km rates the user can override, exactly like the guideline breaks total cost down by
 * category (Material / Construction / Engineering / Test & Commissioning for onshore; an
 * equivalent split with Offshore Construction and Mobilization/Demobilization for offshore).
 *
 * The compressor/pressure-boosting section uses the guideline's own quantitative formulas
 * (Chapter 4 of the same guideline series, "احداث تلمبه‌خانه‌های نفت و ایستگاه‌های تقویت فشار
 * گاز"): rotary-equipment price is read off the guideline's 2019 USD/kW cost curve by rated
 * power, then grossed up to a full station cost using the guideline's own rotary-equipment share
 * of total station cost (Table 4-8 shows this near 25-30% for large single-unit stations) — this
 * keeps the number sourced from the guideline's real cost curve rather than inventing one.
 *
 * Launcher/receiver/tie-in/block-valve stations and telecom & SCADA are OUTSIDE the scope of
 * both uploaded guideline chapters (which explicitly restrict themselves to pipeline segments
 * and to pump/compressor stations only) — those five sections use parametric per-unit cost
 * defaults instead, clearly labeled in the UI as engineering estimates rather than guideline
 * figures, and are fully editable.
 * ------------------------------------------------------------------------- */

export const DEFAULT_ONSHORE: OnshoreSpec = {
  lengthKm: 50,
  diameterIn: 56,
  wtMm: 20,
  density: 7850,
  steelUsdPerTon: 950,
  linework: 320000,
  crossing: 40000,
  test: 15000,
  row: 30000,
  hse: 8000,
  terrain: 1.35,
}

export const DEFAULT_OFFSHORE: OffshoreSpec = {
  lengthKm: 20,
  diameterIn: 30,
  wtMm: 22,
  density: 7850,
  steelUsdPerTon: 1350,
  layingUsdPerKm: 950000,
  mobDemobUsd: 8_000_000,
  shallowWaterSurchargePct: 0.08,
  generalServicesPct: 0.05,
}

export const DEFAULT_COMPRESSOR: CompressorSpec = {
  stationCount: 1,
  ratedPowerMwPerStation: 10,
  driverType: 'gasTurbine',
}

export const DEFAULT_LAUNCHER: StationUnitSpec = { count: 1, unitCostUsd: 220_000 }
export const DEFAULT_RECEIVER: StationUnitSpec = { count: 1, unitCostUsd: 200_000 }
export const DEFAULT_TIE_IN: StationUnitSpec = { count: 1, unitCostUsd: 120_000 }
export const DEFAULT_BLOCK_VALVE: StationUnitSpec = { count: 1, unitCostUsd: 90_000 }
export const DEFAULT_TELECOM: TelecomScadaSpec = { mode: 'perKm', perKmUsd: 8_000, lumpSumUsd: 900_000 }

export const DEFAULT_PHASE_WEIGHTS = [0.06, 0.16, 0.2, 0.24, 0.18, 0.11, 0.05]

export const PHASES = [
  { name: 'فصل ۱', desc: 'بسیج کارگاه، تملک اراضی، مهندسی پایه' },
  { name: 'فصل ۲', desc: 'تأمین لوله و تجهیزات، مهندسی تفصیلی' },
  { name: 'فصل ۳', desc: 'شروع عملیات خطی/نصب' },
  { name: 'فصل ۴', desc: 'ادامه عملیات خطی و تقاطع‌ها' },
  { name: 'فصل ۵', desc: 'تکمیل عملیات خطی و شیرآلات' },
  { name: 'فصل ۶', desc: 'تست هیدرواستاتیک، راه‌اندازی' },
  { name: 'فصل ۷', desc: 'تحویل موقت، مستندسازی و رفع نقص' },
]

export function pipeWeightKgPerM(diameterIn: number, wtMm: number, density: number) {
  return Math.PI * (diameterIn * 0.0254) * (wtMm / 1000) * density
}

function calcOnshore(s: OnshoreSpec): EstSectionResult {
  const weight = pipeWeightKgPerM(s.diameterIn, s.wtMm, s.density)
  const pipeCostPerKm = weight * s.steelUsdPerTon
  const perKm =
    pipeCostPerKm + s.linework * s.terrain + s.crossing * s.terrain + s.test + s.row + s.hse
  return {
    key: 'onshore', label: 'خط لوله خشکی', chartLabel: 'خط لوله خشکی',
    totalUsd: perKm * s.lengthKm,
  }
}

function calcOffshore(s: OffshoreSpec): EstSectionResult {
  const weight = pipeWeightKgPerM(s.diameterIn, s.wtMm, s.density)
  const pipeCostPerKm = weight * s.steelUsdPerTon
  const laySubtotal = (pipeCostPerKm + s.layingUsdPerKm) * s.lengthKm
  const withShallowWater = laySubtotal * (1 + s.shallowWaterSurchargePct)
  const withGeneralServices = withShallowWater * (1 + s.generalServicesPct)
  return {
    key: 'offshore', label: 'خط لوله دریایی', chartLabel: 'خط لوله دریایی',
    totalUsd: withGeneralServices + s.mobDemobUsd,
  }
}

/** Guideline 2019 rotary-equipment cost curve (USD per kW), Table 4-11, linearly interpolated
 * between the tabulated power points. Below/above the tabulated range, the nearest edge value is
 * held flat rather than extrapolated, since the curve is only validated within 3.3–25 MW. */
const COMPRESSOR_USD_PER_KW: [number, number][] = [
  [3.3, 502.4], [4, 467.0], [4.9, 432.3], [5.7, 408.2], [6.6, 386.1],
  [7.7, 364.1], [8.4, 352.3], [10, 329.7], [12.1, 306.6], [14.3, 287.8],
  [16, 275.8], [17.4, 267.1], [18.8, 259.4], [23.3, 239.1], [25, 232.7],
]

function compressorUsdPerKw(mw: number) {
  const t = COMPRESSOR_USD_PER_KW
  if (mw <= t[0][0]) return t[0][1]
  if (mw >= t[t.length - 1][0]) return t[t.length - 1][1]
  for (let i = 0; i < t.length - 1; i++) {
    const [x0, y0] = t[i]
    const [x1, y1] = t[i + 1]
    if (mw >= x0 && mw <= x1) return y0 + ((y1 - y0) * (mw - x0)) / (x1 - x0)
  }
  return t[t.length - 1][1]
}

/** Rotary equipment (compressor + driver) share of total station EPC cost, per the guideline's
 * Table 4-8 breakdown for large single-unit stations. A gas-turbine driver runs a few points
 * higher than an electric motor (turbine package + auxiliaries cost more than a motor). */
const ROTARY_SHARE = { electric: 0.28, gasTurbine: 0.24 }

function calcCompressor(s: CompressorSpec): EstSectionResult {
  const kw = s.ratedPowerMwPerStation * 1000
  const rotaryUsdPerStation = kw * compressorUsdPerKw(s.ratedPowerMwPerStation)
  const totalPerStation = rotaryUsdPerStation / ROTARY_SHARE[s.driverType]
  return {
    key: 'compressor', label: 'ایستگاه تقویت فشار', chartLabel: 'تقویت فشار',
    totalUsd: totalPerStation * s.stationCount,
    note: `بر مبنای منحنی قیمت تجهیزات دوار راهنمای وزارت نفت (۲۰۱۹) و سهم تقریبی ${Math.round(ROTARY_SHARE[s.driverType] * 100)}٪ برای تجهیزات دوار از هزینه کل ایستگاه`,
  }
}

function calcUnitStation(key: 'launcher' | 'receiver' | 'tieIn' | 'blockValve', label: string, s: StationUnitSpec): EstSectionResult {
  return { key, label, chartLabel: label, totalUsd: s.count * s.unitCostUsd, note: 'برآورد مهندسی-پارامتریک (خارج از محدوده راهنمای رسمی)' }
}

function calcTelecom(s: TelecomScadaSpec, totalLengthKm: number): EstSectionResult {
  const total = s.mode === 'perKm' ? s.perKmUsd * Math.max(totalLengthKm, 1) : s.lumpSumUsd
  return {
    key: 'telecom', label: 'مخابرات و اسکادا', chartLabel: 'مخابرات و اسکادا',
    totalUsd: total, note: 'برآورد مهندسی-پارامتریک (خارج از محدوده راهنمای رسمی)',
  }
}

export function computeEstimate(project: EstProjectDraft, inputs: EstFullInputs): EstResults {
  const sections: EstSectionResult[] = []
  const totalLengthKm = (project.hasOnshore ? inputs.specs.onshore.lengthKm : 0) + (project.hasOffshore ? inputs.specs.offshore.lengthKm : 0)

  if (project.hasOnshore) sections.push(calcOnshore(inputs.specs.onshore))
  if (project.hasOffshore) sections.push(calcOffshore(inputs.specs.offshore))
  if (project.hasCompressorStation) sections.push(calcCompressor(inputs.specs.compressor))
  if (project.launcherCount > 0) sections.push(calcUnitStation('launcher', 'ایستگاه لانچر', { ...inputs.specs.launcher, count: project.launcherCount }))
  if (project.receiverCount > 0) sections.push(calcUnitStation('receiver', 'ایستگاه رسیور', { ...inputs.specs.receiver, count: project.receiverCount }))
  if (project.tieInCount > 0) sections.push(calcUnitStation('tieIn', 'ایستگاه انشعاب', { ...inputs.specs.tieIn, count: project.tieInCount }))
  if (project.blockValveCount > 0) sections.push(calcUnitStation('blockValve', 'ایستگاه شیر بین‌راهی', { ...inputs.specs.blockValve, count: project.blockValveCount }))
  if (project.hasTelecomScada) sections.push(calcTelecom(inputs.specs.telecom, totalLengthKm))

  const direct = sections.reduce((sum, s) => sum + s.totalUsd, 0)
  const eng = direct * inputs.overhead.eng
  const pm = direct * inputs.overhead.pm
  const ins = direct * inputs.overhead.ins
  const indirect = eng + pm + ins
  const base = direct + indirect
  const contingency = base * inputs.overhead.contingency
  const escalation = base * inputs.overhead.escalation
  const grand = base + contingency + escalation

  return { sections, direct, eng, pm, ins, indirect, base, contingency, escalation, grand }
}

export function buildDefaultInputs(): EstFullInputs {
  return {
    overhead: { eng: 0.06, pm: 0.08, ins: 0.015, contingency: 0.15, escalation: 0.12, fxEurPerUsd: 0.92, fxRialPerUsd: 600000 },
    lifecycle: { consultantSelectionMonths: 3, basicDesignMonths: 5, epcContractorSelectionMonths: 4, commissioningMonths: 3 },
    specs: {
      onshore: { ...DEFAULT_ONSHORE },
      offshore: { ...DEFAULT_OFFSHORE },
      compressor: { ...DEFAULT_COMPRESSOR },
      launcher: { ...DEFAULT_LAUNCHER },
      receiver: { ...DEFAULT_RECEIVER },
      tieIn: { ...DEFAULT_TIE_IN },
      blockValve: { ...DEFAULT_BLOCK_VALVE },
      telecom: { ...DEFAULT_TELECOM },
    },
    risks: defaultRisks(),
    phaseWeights: [...DEFAULT_PHASE_WEIGHTS],
  }
}

export function defaultRisks(): EstFullInputs['risks'] {
  return [
    { id: 'r1', title: 'نوسان نرخ ارز طی دوره اجرا', category: 'fx', likelihood: 4, impact: 4, mitigation: 'تثبیت نرخ در قرارداد یا ذخیره نوسان ارزی کافی' },
    { id: 'r2', title: 'تأخیر در تملک اراضی و حق‌الارض', category: 'permit', likelihood: 3, impact: 3, mitigation: 'شروع زودهنگام فرآیند تملک، هماهنگی با مراجع محلی' },
    { id: 'r3', title: 'ریسک ژئوتکنیکی در تقاطع‌های HDD', category: 'geotechnical', likelihood: 3, impact: 4, mitigation: 'مطالعات ژئوتکنیک تکمیلی پیش از طراحی تفصیلی' },
    { id: 'r4', title: 'تأخیر تأمین تجهیزات دوار (کمپرسور/پمپ)', category: 'procurement', likelihood: 3, impact: 4, mitigation: 'سفارش زودهنگام (Long Lead Item) و پایش فروشنده' },
    { id: 'r5', title: 'افت عملکرد یا تأخیر پیمانکار EPC', category: 'contractor', likelihood: 2, impact: 4, mitigation: 'ارزیابی فنی-مالی دقیق پیمانکاران در مناقصه' },
    { id: 'r6', title: 'محدودیت فصلی/آب‌وهوایی در دسترسی به مسیر', category: 'weather', likelihood: 3, impact: 2, mitigation: 'زمان‌بندی عملیات با لحاظ فصول مناسب اجرا' },
  ]
}
