/** Project Cost Estimator — data model.
 *
 * A project is defined once (name + which physical sections it has), then each present section
 * gets its own spec/options screen, and every "calculate" run is saved as an immutable history
 * row (est_estimates) rather than overwriting a single result — so a project can be re-priced
 * over time without losing earlier estimates.
 */

export type EstSectionKey =
  | 'onshore'
  | 'offshore'
  | 'coating'
  | 'compressor'
  | 'launcher'
  | 'receiver'
  | 'tieIn'
  | 'blockValve'
  | 'telecom'

export interface EstProject {
  id: string
  name: string
  hasOnshore: boolean
  hasOffshore: boolean
  hasCompressorStation: boolean
  tieInCount: number
  hasTelecomScada: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface EstProjectDraft {
  name: string
  hasOnshore: boolean
  hasOffshore: boolean
  hasCompressorStation: boolean
  tieInCount: number
  hasTelecomScada: boolean
}

export interface OnshoreSpec {
  lengthKm: number
  diameterIn: number
  wtMm: number
  density: number
  steelUsdPerTon: number
  linework: number
  crossing: number
  test: number
  hse: number
  terrain: number
  /** Land acquisition/ROW cost — entered by the user directly in Rial (not USD), since it varies
   * by local land price far more than any of the other per-km rates. */
  rowCostRialPerKm: number
}

export interface OffshoreSpec {
  lengthKm: number
  diameterIn: number
  wtMm: number
  density: number
  steelUsdPerTon: number
  layingUsdPerKm: number
  mobDemobUsd: number
  shallowWaterSurchargePct: number
  generalServicesPct: number
}

export interface CoatingSpec {
  usdPerKm: number
}

export interface CompressorSpec {
  stationCount: number
  ratedPowerMwPerStation: number
  driverType: 'electric' | 'gasTurbine'
}

export interface StationUnitSpec {
  count: number
  unitCostUsd: number
}

/** Launcher/receiver/block-valve station counts, either entered directly or derived from
 * pipeline length: a launcher+receiver pair every 100km (rebuilt at each 100km mark), and a
 * block-valve station every interior 25km that isn't already a launcher/receiver point. */
export interface StationsAutoSpec {
  mode: 'manual' | 'auto'
  manualLauncherCount: number
  manualReceiverCount: number
  manualBlockValveCount: number
}

export interface TelecomScadaSpec {
  mode: 'perKm' | 'lumpSum'
  perKmUsd: number
  lumpSumUsd: number
}

export interface EstSectionSpecs {
  onshore: OnshoreSpec
  offshore: OffshoreSpec
  coating: CoatingSpec
  compressor: CompressorSpec
  stations: StationsAutoSpec
  launcher: StationUnitSpec
  receiver: StationUnitSpec
  tieIn: StationUnitSpec
  blockValve: StationUnitSpec
  telecom: TelecomScadaSpec
}

export interface EstOverheadInputs {
  /** the day's euro rate on the official FX system (rial per euro), asked when an estimate starts;
   * fxRialPerUsd is derived from it and the euro/dollar parity */
  fxRialPerEur?: number
  /** yearly escalation applied to library costs to bring them to today's money (fraction) */
  benchEscalation?: number
  eng: number
  pm: number
  ins: number
  contingency: number
  escalation: number
  fxEurPerUsd: number
  fxRialPerUsd: number
}

export interface EstLifecycleInputs {
  consultantSelectionMonths: number
  basicDesignMonths: number
  epcContractorSelectionMonths: number
  executionMonths: number
}

export type RiskLikelihood = 1 | 2 | 3 | 4 | 5
export type RiskImpact = 1 | 2 | 3 | 4 | 5

export interface EstRisk {
  id: string
  title: string
  category: 'fx' | 'procurement' | 'geotechnical' | 'schedule' | 'hse' | 'contractor' | 'permit' | 'weather' | 'other'
  likelihood: RiskLikelihood
  impact: RiskImpact
  mitigation: string
}

/** A key procurement item whose lead time can drive the schedule more than construction itself —
 * ordering must start early enough (usually during design) that it's ready before execution needs
 * it. */
export interface EstLongLeadItem {
  id: string
  title: string
  leadTimeMonths: number
  notes: string
}

/** How mature the definition behind an estimate is — sets the accuracy range shown with it. */
export type EstMaturity = 'concept' | 'feasibility' | 'basic'

/** How the final number is reached: bottom-up from unit rates, from the library's average cost per
 * inch-km, scaled from the closest similar projects, or a weighted blend of the available ones. */
export type EstMethod = 'parametric' | 'historical' | 'analog' | 'blended'

export interface EstFullInputs {
  /** absent on estimates saved before the field existed — read as 'concept' */
  maturity?: EstMaturity
  /** absent on older estimates — read as 'parametric' */
  method?: EstMethod
  /** blend weights; methods without data are dropped and the rest re-normalised */
  weights?: { parametric: number; historical: number; analog: number }
  overhead: EstOverheadInputs
  lifecycle: EstLifecycleInputs
  specs: EstSectionSpecs
  risks: EstRisk[]
  longLeadItems: EstLongLeadItem[]
}

/** One line of a tornado/sensitivity chart: how much the grand total swings when this single
 * assumption moves ±SENSITIVITY_PCT from its base value, holding everything else fixed. */
export interface EstSensitivityItem {
  key: string
  label: string
  lowGrandUsd: number
  highGrandUsd: number
  swingUsd: number
}

/** Org-wide default assumptions — the baseline every new calculation seeds from. A singleton row, editable only by admins (see est_assumptions RLS). */
export interface EstAssumptions {
  overhead: EstOverheadInputs
  lifecycle: EstLifecycleInputs
  specs: EstSectionSpecs
}

export type EstLifecyclePhase = 'consultant' | 'design' | 'contractor' | 'execution'

export interface EstCashFlowPoint {
  month: number
  phase: EstLifecyclePhase
  monthlyUsd: number
  cumulativeUsd: number
}

export interface EstSectionResult {
  key: EstSectionKey
  label: string
  chartLabel: string
  totalUsd: number
  note?: string
}

export interface EstResults {
  sections: EstSectionResult[]
  direct: number
  eng: number
  pm: number
  ins: number
  indirect: number
  base: number
  contingency: number
  escalation: number
  grand: number
}

export interface EstEstimateRecord {
  id: string
  projectId: string
  label: string
  inputs: EstFullInputs
  results: EstResults
  fxEurPerUsd: number
  fxRialPerUsd: number
  grandTotalEur: number
  grandTotalRial: number
  createdBy: string | null
  createdAt: string
}

/** One recent project in the benchmark library — its estimated or final cost, normalised to euros. */
export interface EstBenchmark {
  id: string
  name: string
  location: string
  kind: 'estimate' | 'actual'
  setting: 'onshore' | 'offshore' | 'mixed'
  terrain: 'flat' | 'mixed' | 'mountain'
  lengthKm: number
  diameterIn: number
  hasCompressor: boolean
  /** Jalali year the cost refers to */
  costYear: number
  amount: number
  currency: 'EUR' | 'USD' | 'IRR'
  fxRialPerEur: number | null
  fxEurPerUsd: number | null
  costEur: number
  notes: string
  createdBy: string | null
  createdAt: string
}

export type EstBenchmarkDraft = Omit<EstBenchmark, 'id' | 'createdBy' | 'createdAt' | 'costEur'>
