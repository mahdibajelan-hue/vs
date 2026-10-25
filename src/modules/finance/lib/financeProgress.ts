import type { MasterProject } from '../../masterdata/types'
import { loadPickerProgress } from '../../../components/Auth/radar/pickerProgress'

/**
 * EVM-lite cross-check: is the money being paid out keeping pace with the work actually done?
 * Physical progress is the project's lifecycle progress — the same figure the radar, the lifecycle and the project
 * dashboard show (Stage-Gate master plan, EPC phase from the engineering / material / execution modules).
 */
export interface CostProgressCrossCheck {
  mapped: boolean
  physicalPercent: number | null
  plannedPercent: number | null
  financialPercent: number
  /** financialPercent - physicalPercent. Positive = paying ahead of physical progress (cost overrun risk). Negative = work ahead of payment (contractor cash-flow strain). */
  gapPct: number | null
}

export async function fetchCostProgressCrossCheck(masterProject: MasterProject, financialPercent: number): Promise<CostProgressCrossCheck> {
  const o = (await loadPickerProgress([masterProject.id])).get(masterProject.id)?.overall ?? null
  if (!o) return { mapped: true, physicalPercent: null, plannedPercent: null, financialPercent, gapPct: null }
  const r1 = (v: number) => Math.round(v * 10) / 10
  return { mapped: true, physicalPercent: r1(o.actual), plannedPercent: o.planned == null ? null : r1(o.planned), financialPercent, gapPct: r1(financialPercent - o.actual) }
}
