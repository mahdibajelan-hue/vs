import type { EstAssumptions, EstEstimateRecord, EstFullInputs, EstProject, EstResults, EstBenchmark } from '../types'

export interface EstProjectRow {
  id: string
  name: string
  has_onshore: boolean
  has_offshore: boolean
  has_compressor_station: boolean
  tie_in_count: number
  has_telecom_scada: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function estProjectFromRow(r: EstProjectRow): EstProject {
  return {
    id: r.id,
    name: r.name,
    hasOnshore: r.has_onshore,
    hasOffshore: r.has_offshore,
    hasCompressorStation: r.has_compressor_station,
    tieInCount: r.tie_in_count,
    hasTelecomScada: r.has_telecom_scada,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface EstEstimateRow {
  id: string
  project_id: string
  label: string
  inputs: EstFullInputs
  results: EstResults
  fx_rial_per_usd: number
  grand_total_eur: number
  grand_total_rial: number
  created_by: string | null
  created_at: string
}

export function estEstimateFromRow(r: EstEstimateRow): EstEstimateRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    label: r.label,
    inputs: r.inputs,
    results: r.results,
    fxEurPerUsd: r.inputs?.overhead?.fxEurPerUsd ?? 0,
    fxRialPerUsd: r.fx_rial_per_usd,
    grandTotalEur: r.grand_total_eur,
    grandTotalRial: r.grand_total_rial,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export interface EstAssumptionsRow {
  overhead: EstAssumptions['overhead']
  lifecycle: EstAssumptions['lifecycle']
  specs: EstAssumptions['specs']
}

export function estAssumptionsFromRow(r: EstAssumptionsRow): EstAssumptions {
  return { overhead: r.overhead, lifecycle: r.lifecycle, specs: r.specs }
}

export interface EstBenchmarkRow {
  id: string
  name: string
  location: string
  kind: 'estimate' | 'actual'
  setting: 'onshore' | 'offshore' | 'mixed'
  terrain: 'flat' | 'mixed' | 'mountain'
  length_km: number | string
  diameter_in: number | string
  has_compressor: boolean
  cost_year: number
  amount: number | string
  currency: 'EUR' | 'USD' | 'IRR'
  fx_rial_per_eur: number | string | null
  fx_eur_per_usd: number | string | null
  cost_eur: number | string
  notes: string
  created_by: string | null
  created_at: string
}

const n = (v: number | string | null) => (v == null ? null : Number(v))

export function estBenchmarkFromRow(r: EstBenchmarkRow): EstBenchmark {
  return {
    id: r.id, name: r.name, location: r.location, kind: r.kind, setting: r.setting, terrain: r.terrain,
    lengthKm: Number(r.length_km), diameterIn: Number(r.diameter_in), hasCompressor: r.has_compressor,
    costYear: r.cost_year, amount: Number(r.amount), currency: r.currency,
    fxRialPerEur: n(r.fx_rial_per_eur), fxEurPerUsd: n(r.fx_eur_per_usd), costEur: Number(r.cost_eur),
    notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
  }
}
