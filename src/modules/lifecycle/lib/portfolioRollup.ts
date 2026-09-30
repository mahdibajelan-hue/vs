import type { MasterProject, Portfolio, Program } from '../../masterdata/types'
import { buildHierarchyTree, type HierarchyPortfolioRollup } from '../../masterdata/lib/hierarchyRollup'
import type { ChecklistItem, HealthScore, HealthStatus, LifecycleAction, Milestone, ProjectGate, ProjectLifecycle } from '../types'
import { analyseProject } from './useProjectAnalysis'
import type { ProjectLifecycleBundle } from '../store/useLifecycleStore'

/** Portfolio / Plan rollup.
 *
 * Reuses the shared `buildHierarchyTree` from the masterdata module rather than re-deriving which
 * programs sit under which portfolio — that grouping is written once for the whole platform, and
 * this module only supplies its own per-project summary and its own aggregate function.
 */

export interface ProjectSummary {
  masterProjectId: string
  project: MasterProject
  currentStageKey: string
  health: HealthStatus
  readiness: number
  milestonesTotal: number
  milestonesDelayed: number
  criticalMilestonesDelayed: number
  overdueActions: number
  criticalOverdueActions: number
  blockedGates: boolean
  attentionCount: number
  forecastVarianceDays: number | null
  topAttention: string | null
}

export interface RollupTotals {
  projects: number
  onTrack: number
  atRisk: number
  delayed: number
  blocked: number
  milestonesTotal: number
  milestonesDelayed: number
  criticalMilestonesDelayed: number
  overdueActions: number
  criticalOverdueActions: number
  averageReadiness: number
  notReadyForNextGate: number
  needingAttention: number
}

/** A project counts as "delayed" when its schedule dimension has actually gone red, not merely
 * when overall health is amber for some other reason — otherwise the portfolio's delay count
 * quietly absorbs cost and quality problems too. */
export function summariseProject(
  project: MasterProject,
  lifecycle: ProjectLifecycle | null,
  milestones: Milestone[],
  gates: ProjectGate[],
  checklist: ChecklistItem[],
  actions: LifecycleAction[],
  health: HealthScore[],
): ProjectSummary {
  const bundle: ProjectLifecycleBundle = {
    lifecycle,
    stages: [],
    gates,
    checklist,
    milestones,
    forecastHistory: [],
    activities: [],
    health,
    warnings: [],
    actions,
  }
  const a = analyseProject(bundle)

  return {
    masterProjectId: project.id,
    project,
    currentStageKey: lifecycle?.currentStageKey ?? '',
    health: a.overall.status,
    readiness: a.averageReadiness,
    milestonesTotal: a.milestoneKpis.total,
    milestonesDelayed: a.milestoneKpis.delayed,
    criticalMilestonesDelayed: a.milestoneKpis.criticalDelayed,
    overdueActions: a.overdueActions,
    criticalOverdueActions: a.criticalOverdueActions,
    blockedGates: a.blockedGateCount > 0,
    attentionCount: a.attention.length,
    forecastVarianceDays: a.forecastVarianceDays,
    topAttention: a.attention[0]?.problem ?? null,
  }
}

export function aggregate(list: ProjectSummary[]): RollupTotals {
  const readinessValues = list.filter((s) => s.readiness > 0).map((s) => s.readiness)
  return {
    projects: list.length,
    onTrack: list.filter((s) => s.health === 'green').length,
    atRisk: list.filter((s) => s.health === 'yellow').length,
    delayed: list.filter((s) => s.health === 'red').length,
    blocked: list.filter((s) => s.health === 'black').length,
    milestonesTotal: list.reduce((n, s) => n + s.milestonesTotal, 0),
    milestonesDelayed: list.reduce((n, s) => n + s.milestonesDelayed, 0),
    criticalMilestonesDelayed: list.reduce((n, s) => n + s.criticalMilestonesDelayed, 0),
    overdueActions: list.reduce((n, s) => n + s.overdueActions, 0),
    criticalOverdueActions: list.reduce((n, s) => n + s.criticalOverdueActions, 0),
    averageReadiness: readinessValues.length === 0 ? 0 : Math.round(readinessValues.reduce((a, b) => a + b, 0) / readinessValues.length),
    notReadyForNextGate: list.filter((s) => s.readiness < 100).length,
    needingAttention: list.filter((s) => s.attentionCount > 0).length,
  }
}

export type LifecycleRollup = HierarchyPortfolioRollup<ProjectSummary, RollupTotals>

export function buildLifecycleRollup(
  portfolios: Portfolio[],
  programs: Program[],
  projects: MasterProject[],
  summaries: ProjectSummary[],
): LifecycleRollup[] {
  return buildHierarchyTree(portfolios, programs, projects, summaries, aggregate)
}
