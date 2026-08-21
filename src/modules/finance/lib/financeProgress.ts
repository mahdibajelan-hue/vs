import { fetchPipePulseProjectMappings, fetchPipePulseProjects, summarizeProjectProgress } from '../../../lib/pipepulseRollup'
import type { MasterProject } from '../../masterdata/types'

/**
 * EVM-lite cross-check: is the money being paid out keeping pace with the work actually done?
 * Physical progress comes from PipePulse (the same time-based actual % its own Schedule page
 * shows), resolved through the shared rasta_project_mappings table — the same mapping mechanism
 * Risk/Issues/Reporting already use to read PipePulse data from another module.
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
  const mappings = await fetchPipePulseProjectMappings()
  const pipepulseProjectId = mappings.get(masterProject.id) ?? null
  if (!pipepulseProjectId) {
    return { mapped: false, physicalPercent: null, plannedPercent: null, financialPercent, gapPct: null }
  }
  const projects = await fetchPipePulseProjects([pipepulseProjectId])
  const project = projects.get(pipepulseProjectId) ?? null
  const summary = summarizeProjectProgress(masterProject, pipepulseProjectId, project)
  if (summary.configuredCount === 0) {
    return { mapped: true, physicalPercent: null, plannedPercent: null, financialPercent, gapPct: null }
  }
  const gapPct = Math.round((financialPercent - summary.actualPercent) * 10) / 10
  return { mapped: true, physicalPercent: summary.actualPercent, plannedPercent: summary.plannedPercent, financialPercent, gapPct }
}
