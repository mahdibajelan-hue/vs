import type {
  EstAssumptions, EstCashFlowPoint, EstFullInputs, EstLongLeadItem, EstProjectDraft, EstResults,
  EstSectionResult, EstSensitivityItem, OnshoreSpec, OffshoreSpec, CoatingSpec, CompressorSpec,
  StationUnitSpec, TelecomScadaSpec,
} from '../types'

/* ---------------------------------------------------------------------------
 * Cost engine.
 *
 * Onshore/offshore pipeline sections follow the category-percentage structure of the National
 * Iranian Oil Company's official cost-estimation guideline ("راهنمای برآورد هزینه طرح‌ها و
 * پروژه‌ها — فصل احداث خطوط لوله دریا و خشکی"): direct cost is built from a handful of
 * per-km rates, exactly like the guideline breaks total cost down by category (Material /
 * Construction / Engineering / Test & Commissioning for onshore; an equivalent split with
 * Offshore Construction and Mobilization/Demobilization for offshore). Every rate except land
 * acquisition is an org-wide admin-set assumption (est_assumptions) rather than a per-project
 * input — land acquisition varies by local price far more than any other line, so it stays a
 * direct, per-project Rial entry (see OnshoreSpec.rowCostRialPerKm).
 *
 * The compressor/pressure-boosting section uses the guideline's own quantitative formulas
 * (Chapter 4 of the same guideline series, "احداث تلمبه‌خانه‌های نفت و ایستگاه‌های تقویت فشار
 * گاز"): rotary-equipment price is read off the guideline's 2019 USD/kW cost curve by rated
 * power, then grossed up to a full station cost using the guideline's own rotary-equipment share
 * of total station cost (Table 4-8 shows this near 25-30% for large single-unit stations) — this
 * keeps the number sourced from the guideline's real cost curve rather than inventing one.
 *
 * Pipe coating, launcher/receiver/tie-in/block-valve stations, and telecom & SCADA are OUTSIDE
 * the scope of both uploaded guideline chapters (which explicitly restrict themselves to
 * pipeline segments and to pump/compressor stations only) — those sections use parametric
 * per-unit cost defaults instead, clearly labeled in the UI as engineering estimates rather than
 * guideline figures. All defaults below are the *fallback* seed values — once an admin sets
 * org-wide assumptions (est_assumptions), new calculations seed from those instead; see
 * buildDefaultInputs.
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
  hse: 8000,
  terrain: 1.35,
  rowCostRialPerKm: 18_000_000_000,
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

export const DEFAULT_COATING: CoatingSpec = { usdPerKm: 35_000 }

export const DEFAULT_COMPRESSOR: CompressorSpec = {
  stationCount: 1,
  ratedPowerMwPerStation: 10,
  driverType: 'gasTurbine',
}

export const DEFAULT_LAUNCHER: StationUnitSpec = { count: 1, unitCostUsd: 220_000 }
export const DEFAULT_RECEIVER: StationUnitSpec = { count: 1, unitCostUsd: 200_000 }
export const DEFAULT_TIE_IN: StationUnitSpec = { count: 1, unitCostUsd: 120_000 }
export const DEFAULT_BLOCK_VALVE: StationUnitSpec = { count: 1, unitCostUsd: 90_000 }
export const DEFAULT_STATIONS = { mode: 'auto' as const, manualLauncherCount: 1, manualReceiverCount: 1, manualBlockValveCount: 0 }
export const DEFAULT_TELECOM: TelecomScadaSpec = { mode: 'perKm', perKmUsd: 8_000, lumpSumUsd: 900_000 }

/** Typical durations for an EPC pipeline project's pre-construction lifecycle, in months —
 * consultant selection ~4, basic design ~8, EPC contractor selection ~6, execution ~20. */
export const DEFAULT_LIFECYCLE = {
  consultantSelectionMonths: 4,
  basicDesignMonths: 8,
  epcContractorSelectionMonths: 6,
  executionMonths: 20,
}

export const DEFAULT_OVERHEAD = {
  eng: 0.06, pm: 0.08, ins: 0.015, contingency: 0.15, escalation: 0.12,
  fxEurPerUsd: 0.92, fxRialPerUsd: 600000,
}

export function pipeWeightKgPerM(diameterIn: number, wtMm: number, density: number) {
  return Math.PI * (diameterIn * 0.0254) * (wtMm / 1000) * density
}

function calcOnshore(s: OnshoreSpec, rialPerUsd: number): EstSectionResult {
  const weight = pipeWeightKgPerM(s.diameterIn, s.wtMm, s.density)
  const pipeCostPerKm = weight * s.steelUsdPerTon
  const rowUsdPerKm = rialPerUsd > 0 ? s.rowCostRialPerKm / rialPerUsd : 0
  const perKm = pipeCostPerKm + s.linework * s.terrain + s.crossing * s.terrain + s.test + s.hse + rowUsdPerKm
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

function calcCoating(s: CoatingSpec, totalLengthKm: number): EstSectionResult {
  return {
    key: 'coating', label: 'پوشش خطوط لوله', chartLabel: 'پوشش لوله',
    totalUsd: s.usdPerKm * totalLengthKm, note: 'برآورد مهندسی-پارامتریک (خارج از محدوده راهنمای رسمی)',
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

/** Launcher/receiver stations are rebuilt every 100km of pipeline (one launcher opening each
 * 100km segment, one receiver closing it); block-valve stations sit at every interior 25km mark
 * that isn't already a launcher/receiver point. A 100km project: 1 launcher (km 0), block valves
 * at km 25/50/75 (3), 1 receiver (km 100). Used only in "auto" station-count mode. */
export function computeAutoStationCounts(totalLengthKm: number) {
  if (totalLengthKm <= 0) return { launcher: 0, receiver: 0, blockValve: 0 }
  const segments = Math.ceil(totalLengthKm / 100)
  let blockValve = 0
  let remaining = totalLengthKm
  for (let i = 0; i < segments; i++) {
    const segLen = Math.min(100, remaining)
    blockValve += Math.max(0, Math.ceil(segLen / 25) - 1)
    remaining -= segLen
  }
  return { launcher: segments, receiver: segments, blockValve }
}

export function computeEstimate(project: EstProjectDraft, inputs: EstFullInputs): EstResults {
  const sections: EstSectionResult[] = []
  const totalLengthKm = (project.hasOnshore ? inputs.specs.onshore.lengthKm : 0) + (project.hasOffshore ? inputs.specs.offshore.lengthKm : 0)
  const hasPipeline = project.hasOnshore || project.hasOffshore

  if (project.hasOnshore) sections.push(calcOnshore(inputs.specs.onshore, inputs.overhead.fxRialPerUsd))
  if (project.hasOffshore) sections.push(calcOffshore(inputs.specs.offshore))
  if (hasPipeline) sections.push(calcCoating(inputs.specs.coating, totalLengthKm))
  if (project.hasCompressorStation) sections.push(calcCompressor(inputs.specs.compressor))

  if (hasPipeline) {
    const st = inputs.specs.stations
    const auto = st.mode === 'auto' ? computeAutoStationCounts(totalLengthKm) : null
    const launcherCount = auto ? auto.launcher : st.manualLauncherCount
    const receiverCount = auto ? auto.receiver : st.manualReceiverCount
    const blockValveCount = auto ? auto.blockValve : st.manualBlockValveCount
    if (launcherCount > 0) sections.push(calcUnitStation('launcher', 'ایستگاه فرستنده توپک', { ...inputs.specs.launcher, count: launcherCount }))
    if (receiverCount > 0) sections.push(calcUnitStation('receiver', 'ایستگاه گیرنده توپک', { ...inputs.specs.receiver, count: receiverCount }))
    if (blockValveCount > 0) sections.push(calcUnitStation('blockValve', 'ایستگاه شیر بین‌راهی', { ...inputs.specs.blockValve, count: blockValveCount }))
  }
  if (project.tieInCount > 0) sections.push(calcUnitStation('tieIn', 'ایستگاه انشعاب', { ...inputs.specs.tieIn, count: project.tieInCount }))
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

/** Smooth ramp-up/ramp-down weight for month `i` of `n` (0-indexed) — a cosine-based S-curve,
 * the standard shape of EPC execution spend (slow mobilization, fast mid-project burn, slow
 * closeout). Weights across the n months sum to 1. */
function sCurveWeights(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [1]
  const raw = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n
    return 1 - Math.cos(t * Math.PI)
  })
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / sum)
}

/** Cash flow across the FULL project lifecycle, not just execution: consultant selection and
 * EPC contractor selection are procurement/administrative steps with no capital outflow; the
 * engineering fee (results.eng) is spent evenly across the basic-design months; everything else
 * (direct cost + PM + insurance + contingency + escalation) is spent during execution, following
 * an S-curve ramp rather than a flat line — the standard EPC cash-flow shape. */
export function buildCashFlowTimeline(inputs: EstFullInputs, results: EstResults): EstCashFlowPoint[] {
  const { consultantSelectionMonths, basicDesignMonths, epcContractorSelectionMonths, executionMonths } = inputs.lifecycle
  const points: EstCashFlowPoint[] = []
  let cumulative = 0
  let month = 0

  for (let i = 0; i < consultantSelectionMonths; i++) {
    month++
    points.push({ month, phase: 'consultant', monthlyUsd: 0, cumulativeUsd: cumulative })
  }

  const designWeights = sCurveWeights(basicDesignMonths)
  for (let i = 0; i < basicDesignMonths; i++) {
    month++
    const amt = results.eng * designWeights[i]
    cumulative += amt
    points.push({ month, phase: 'design', monthlyUsd: amt, cumulativeUsd: cumulative })
  }

  for (let i = 0; i < epcContractorSelectionMonths; i++) {
    month++
    points.push({ month, phase: 'contractor', monthlyUsd: 0, cumulativeUsd: cumulative })
  }

  const executionSpend = Math.max(0, results.grand - results.eng)
  const execWeights = sCurveWeights(executionMonths)
  for (let i = 0; i < executionMonths; i++) {
    month++
    const amt = executionSpend * execWeights[i]
    cumulative += amt
    points.push({ month, phase: 'execution', monthlyUsd: amt, cumulativeUsd: cumulative })
  }

  return points
}

export const LIFECYCLE_PHASE_LABEL: Record<string, string> = {
  consultant: 'انتخاب مشاور طراح',
  design: 'طراحی پایه',
  contractor: 'انتخاب پیمانکار EPC',
  execution: 'اجرا و راه‌اندازی',
}

export function buildDefaultInputs(assumptions?: EstAssumptions | null, project?: EstProjectDraft): EstFullInputs {
  if (assumptions) {
    return {
      overhead: { ...assumptions.overhead },
      lifecycle: { ...assumptions.lifecycle },
      specs: {
        onshore: { ...assumptions.specs.onshore },
        offshore: { ...assumptions.specs.offshore },
        coating: { ...assumptions.specs.coating },
        compressor: { ...assumptions.specs.compressor },
        stations: { ...DEFAULT_STATIONS },
        launcher: { ...assumptions.specs.launcher },
        receiver: { ...assumptions.specs.receiver },
        tieIn: { ...assumptions.specs.tieIn },
        blockValve: { ...assumptions.specs.blockValve },
        telecom: { ...assumptions.specs.telecom },
      },
      risks: defaultRisks(),
      longLeadItems: defaultLongLeadItems(project),
    }
  }
  return {
    overhead: { ...DEFAULT_OVERHEAD },
    lifecycle: { ...DEFAULT_LIFECYCLE },
    specs: {
      onshore: { ...DEFAULT_ONSHORE },
      offshore: { ...DEFAULT_OFFSHORE },
      coating: { ...DEFAULT_COATING },
      compressor: { ...DEFAULT_COMPRESSOR },
      stations: { ...DEFAULT_STATIONS },
      launcher: { ...DEFAULT_LAUNCHER },
      receiver: { ...DEFAULT_RECEIVER },
      tieIn: { ...DEFAULT_TIE_IN },
      blockValve: { ...DEFAULT_BLOCK_VALVE },
      telecom: { ...DEFAULT_TELECOM },
    },
    risks: defaultRisks(),
    longLeadItems: defaultLongLeadItems(project),
  }
}

export function buildDefaultAssumptions(): EstAssumptions {
  return {
    overhead: { ...DEFAULT_OVERHEAD },
    lifecycle: { ...DEFAULT_LIFECYCLE },
    specs: {
      onshore: { ...DEFAULT_ONSHORE },
      offshore: { ...DEFAULT_OFFSHORE },
      coating: { ...DEFAULT_COATING },
      compressor: { ...DEFAULT_COMPRESSOR },
      stations: { ...DEFAULT_STATIONS },
      launcher: { ...DEFAULT_LAUNCHER },
      receiver: { ...DEFAULT_RECEIVER },
      tieIn: { ...DEFAULT_TIE_IN },
      blockValve: { ...DEFAULT_BLOCK_VALVE },
      telecom: { ...DEFAULT_TELECOM },
    },
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

/** Seed long-lead items only for the sections the project actually has — an offshore-only
 * project has no reason to see a compressor lead time it will never order. Lead times are typical
 * industry ranges, editable per project like everything else parametric in this module. */
export function defaultLongLeadItems(project?: EstProjectDraft): EstLongLeadItem[] {
  const items: EstLongLeadItem[] = []
  if (project?.hasOnshore || project?.hasOffshore) {
    items.push({ id: 'l1', title: 'لوله فولادی و پوشش ضدخوردگی', leadTimeMonths: 7, notes: 'سفارش نورد و پوشش‌دهی لوله در حجم بالا؛ زودتر از سایر اقلام باید نهایی شود.' })
  }
  if (project?.hasCompressorStation) {
    items.push({ id: 'l2', title: 'کمپرسور و درایو (توربین گازی/الکتروموتور)', leadTimeMonths: 16, notes: 'معمولاً طولانی‌ترین قلم تدارکاتی پروژه؛ سفارش باید هم‌زمان با شروع طراحی پایه آغاز شود.' })
  }
  if ((project?.hasOnshore || project?.hasOffshore) || project?.tieInCount) {
    items.push({ id: 'l3', title: 'شیرآلات با کلاس فشار بالا', leadTimeMonths: 9, notes: 'شیرهای بین‌راهی، انشعاب و ایستگاه‌های فرستنده/گیرنده توپک.' })
  }
  if (project?.hasTelecomScada) {
    items.push({ id: 'l4', title: 'تجهیزات مخابرات و اسکادا', leadTimeMonths: 6, notes: 'شامل تجهیزات فیبر نوری، RTU و مرکز کنترل.' })
  }
  if (project?.hasOffshore) {
    items.push({ id: 'l5', title: 'رزرو شناور خط‌گذار (Lay Barge)', leadTimeMonths: 11, notes: 'رزرو شناورهای تخصصی خط‌گذاری دریایی معمولاً باید ماه‌ها پیش از شروع اجرا انجام شود.' })
  }
  return items
}

/** ±15% swing applied to each driver, one at a time, to build a tornado/sensitivity chart — the
 * standard "one-at-a-time" sensitivity method for an early-stage estimate. */
export const SENSITIVITY_PCT = 0.15

function withMutation(inputs: EstFullInputs, mutate: (draft: EstFullInputs) => void): EstFullInputs {
  const draft: EstFullInputs = JSON.parse(JSON.stringify(inputs))
  mutate(draft)
  return draft
}

export function computeSensitivity(project: EstProjectDraft, inputs: EstFullInputs): EstSensitivityItem[] {
  const items: EstSensitivityItem[] = []

  function addDriver(key: string, label: string, condition: boolean, mutate: (draft: EstFullInputs, factor: number) => void) {
    if (!condition) return
    const lowInputs = withMutation(inputs, (d) => mutate(d, 1 - SENSITIVITY_PCT))
    const highInputs = withMutation(inputs, (d) => mutate(d, 1 + SENSITIVITY_PCT))
    const lowGrand = computeEstimate(project, lowInputs).grand
    const highGrand = computeEstimate(project, highInputs).grand
    items.push({
      key, label,
      lowGrandUsd: Math.min(lowGrand, highGrand),
      highGrandUsd: Math.max(lowGrand, highGrand),
      swingUsd: Math.abs(highGrand - lowGrand),
    })
  }

  addDriver('onshoreSteel', 'قیمت فولاد خط خشکی', !!project.hasOnshore, (d, f) => { d.specs.onshore.steelUsdPerTon *= f })
  addDriver('offshoreSteel', 'قیمت فولاد خط دریایی', !!project.hasOffshore, (d, f) => { d.specs.offshore.steelUsdPerTon *= f })
  addDriver('terrain', 'ضریب توپوگرافی', !!project.hasOnshore, (d, f) => { d.specs.onshore.terrain *= f })
  addDriver('row', 'هزینه تملک اراضی', !!project.hasOnshore, (d, f) => { d.specs.onshore.rowCostRialPerKm *= f })
  addDriver('coating', 'نرخ پوشش لوله', !!(project.hasOnshore || project.hasOffshore), (d, f) => { d.specs.coating.usdPerKm *= f })
  addDriver('fx', 'نرخ ارز (ریال/دلار)', true, (d, f) => { d.overhead.fxRialPerUsd *= f })
  addDriver('contingency', 'پیش‌بینی‌نشده', true, (d, f) => { d.overhead.contingency *= f })

  return items.sort((a, b) => b.swingUsd - a.swingUsd)
}
