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
  launcherCount: number
  receiverCount: number
  tieInCount: number
  blockValveCount: number
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
  launcherCount: number
  receiverCount: number
  tieInCount: number
  blockValveCount: number
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
  row: number
  hse: number
  terrain: number
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

export interface CompressorSpec {
  stationCount: number
  ratedPowerMwPerStation: number
  driverType: 'electric' | 'gasTurbine'
}

export interface StationUnitSpec {
  count: number
  unitCostUsd: number
}

export interface TelecomScadaSpec {
  mode: 'perKm' | 'lumpSum'
  perKmUsd: number
  lumpSumUsd: number
}

export interface EstSectionSpecs {
  onshore: OnshoreSpec
  offshore: OffshoreSpec
  compressor: CompressorSpec
  launcher: StationUnitSpec
  receiver: StationUnitSpec
  tieIn: StationUnitSpec
  blockValve: StationUnitSpec
  telecom: TelecomScadaSpec
}

export interface EstOverheadInputs {
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

export interface EstFullInputs {
  overhead: EstOverheadInputs
  lifecycle: EstLifecycleInputs
  specs: EstSectionSpecs
  risks: EstRisk[]
}

/** Ministry-guideline-sourced default assumptions — the org-wide baseline every new calculation
 * seeds from. A singleton row, editable only by admins (see est_assumptions RLS). */
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
