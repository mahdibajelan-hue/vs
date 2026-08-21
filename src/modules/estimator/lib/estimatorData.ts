import type { EstAssumptions, EstEstimateRecord, EstFullInputs, EstProject, EstResults } from '../types'

export interface EstProjectRow {
  id: string
  name: string
  has_onshore: boolean
  has_offshore: boolean
  has_compressor_station: boolean
  launcher_count: number
  receiver_count: number
  tie_in_count: number
  block_valve_count: number
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
    launcherCount: r.launcher_count,
    receiverCount: r.receiver_count,
    tieInCount: r.tie_in_count,
    blockValveCount: r.block_valve_count,
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
