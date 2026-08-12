import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { fetchModuleProjectMappings } from '../../masterdata/lib/hierarchyRollup'
import { projectPhaseFromRow } from '../../masterdata/lib/data'
import type { MasterProject, Portfolio, Program, ProjectDependency, ProjectPhase, ScheduleStatus } from '../../masterdata/types'
import { rmActionFromRow, rmAssessmentFromRow, rmRiskFromRow, type RmRiskActionRow, type RmRiskAssessmentRow, type RmRiskRow } from '../../risk/lib/riskData'
import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../../risk/types'
import { currentState, riskLevel, todayIso, type RiskLevel } from '../../risk/lib/riskScore'
import { imIssueFromRow, type ImIssueRow } from '../../issues/lib/issueData'
import type { ImIssue } from '../../issues/types'
import { decisionFromRow, rastaActionFromRow, type DecisionRow, type RastaActionRow } from './reportingData'
import type { Decision, RastaAction } from '../types'

/**
 * Everything the Portfolio Executive Dashboard needs, fetched once for the whole portfolio (not
 * scoped to a single project) — every KPI/widget on that dashboard is inherently cross-project, so
 * unlike useScopedIntelligence this always pulls the full picture and lets the page itself narrow
 * by Portfolio/Program/Project client-side (same "fetch once, filter locally" shape every other
 * module's rollup page already uses via buildHierarchyTree).
 */
export interface PortfolioDashboardRaw {
  risksByMaster: Map<string, RmRisk[]>
  assessmentsByRisk: Map<string, RmRiskAssessment[]>
  actionsByRisk: Map<string, RmRiskAction[]>
  issuesByMaster: Map<string, ImIssue[]>
  decisionsByMaster: Map<string, Decision[]>
  actionsByMaster: Map<string, RastaAction[]>
  phasesByMaster: Map<string, ProjectPhase[]>
  /** distinct rasta_project_roles.id assigned per master project — Resource Capacity proxy numerator. */
  assignedRoleIdsByMaster: Map<string, Set<string>>
  totalDefinedRoles: number
}

const EMPTY_RAW: PortfolioDashboardRaw = {
  risksByMaster: new Map(),
  assessmentsByRisk: new Map(),
  actionsByRisk: new Map(),
  issuesByMaster: new Map(),
  decisionsByMaster: new Map(),
  actionsByMaster: new Map(),
  phasesByMaster: new Map(),
  assignedRoleIdsByMaster: new Map(),
  totalDefinedRoles: 0,
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return map
}

/** groupBy + per-row mapper in one step, so raw DB rows never leak past this file's fetch layer. */
function groupByMapped<TRow, T>(rows: TRow[], keyOf: (row: TRow) => string, mapRow: (row: TRow) => T): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    map.set(key, [...(map.get(key) ?? []), mapRow(row)])
  }
  return map
}

async function fetchPortfolioDashboardRaw(masterProjectIds: string[]): Promise<PortfolioDashboardRaw> {
  if (masterProjectIds.length === 0) return EMPTY_RAW

  const [riskMap, issueMap] = await Promise.all([fetchModuleProjectMappings('risk'), fetchModuleProjectMappings('issues')])
  const riskSourceToMaster = new Map([...riskMap.entries()].map(([masterId, sourceId]) => [sourceId, masterId]))
  const issueSourceToMaster = new Map([...issueMap.entries()].map(([masterId, sourceId]) => [sourceId, masterId]))
  const riskSourceIds = [...riskMap.values()]
  const issueSourceIds = [...issueMap.values()]

  const [
    { data: riskRows },
    { data: decisionRows },
    { data: actionRows },
    { data: phaseRows },
    { data: roleAssignmentRows },
    { data: roleRows },
    { data: issueRows },
  ] = await Promise.all([
    riskSourceIds.length > 0 ? supabase.from('rm_risks').select('*').in('project_id', riskSourceIds) : Promise.resolve({ data: [] }),
    supabase.from('rasta_decisions').select('*').in('master_project_id', masterProjectIds),
    supabase.from('rasta_actions').select('*').in('master_project_id', masterProjectIds),
    supabase.from('project_phases').select('*').in('project_id', masterProjectIds),
    supabase.from('rasta_project_role_assignments').select('project_id, project_role_id').in('project_id', masterProjectIds),
    supabase.from('rasta_project_roles').select('id'),
    issueSourceIds.length > 0 ? supabase.from('im_issues').select('*').in('project_id', issueSourceIds) : Promise.resolve({ data: [] }),
  ])

  const risks = ((riskRows ?? []) as RmRiskRow[]).map(rmRiskFromRow)
  const riskIds = risks.map((r) => r.id)
  const [{ data: assessmentRows }, { data: actionRowsForRisks }] =
    riskIds.length > 0
      ? await Promise.all([
          supabase.from('rm_risk_assessments').select('*').in('risk_id', riskIds),
          supabase.from('rm_risk_actions').select('*').in('risk_id', riskIds),
        ])
      : [{ data: [] }, { data: [] }]

  const risksByMaster = groupBy(risks, (r) => riskSourceToMaster.get(r.projectId) ?? '')
  const issuesByMaster = groupByMapped((issueRows ?? []) as ImIssueRow[], (r) => issueSourceToMaster.get(r.project_id) ?? '', imIssueFromRow)
  const decisionsByMaster = groupByMapped((decisionRows ?? []) as DecisionRow[], (r) => r.master_project_id, decisionFromRow)
  const actionsByMaster = groupByMapped((actionRows ?? []) as RastaActionRow[], (r) => r.master_project_id, rastaActionFromRow)
  const phasesByMaster = groupByMapped((phaseRows ?? []) as Parameters<typeof projectPhaseFromRow>[0][], (r) => r.project_id, projectPhaseFromRow)
  const assessmentsByRisk = groupByMapped((assessmentRows ?? []) as RmRiskAssessmentRow[], (r) => r.risk_id, rmAssessmentFromRow)
  const actionsByRisk = groupByMapped((actionRowsForRisks ?? []) as RmRiskActionRow[], (r) => r.risk_id, rmActionFromRow)

  const assignedRoleIdsByMaster = new Map<string, Set<string>>()
  for (const row of (roleAssignmentRows ?? []) as { project_id: string; project_role_id: string }[]) {
    const set = assignedRoleIdsByMaster.get(row.project_id) ?? new Set<string>()
    set.add(row.project_role_id)
    assignedRoleIdsByMaster.set(row.project_id, set)
  }

  return {
    risksByMaster,
    assessmentsByRisk,
    actionsByRisk,
    issuesByMaster,
    decisionsByMaster,
    actionsByMaster,
    phasesByMaster,
    assignedRoleIdsByMaster,
    totalDefinedRoles: (roleRows ?? []).length,
  }
}

export function usePortfolioDashboardRaw(masterProjectIds: string[]) {
  const [data, setData] = useState<PortfolioDashboardRaw | null>(null)
  const [loading, setLoading] = useState(false)
  const key = [...masterProjectIds].sort().join(',')

  useEffect(() => {
    if (masterProjectIds.length === 0) {
      setData(EMPTY_RAW)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchPortfolioDashboardRaw(masterProjectIds).then((raw) => {
      if (cancelled) return
      setData(raw)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, loading }
}

// ---------------------------------------------------------------------------
// Per-project derived summary — every widget/KPI on the dashboard is built by
// aggregating these, never by re-deriving numbers a different way per widget.
// ---------------------------------------------------------------------------

export type HealthTier = 'healthy' | 'watch' | 'critical'
export type ScheduleBucket = 'on_time' | 'late_30' | 'late_30_90' | 'late_over_90' | 'unknown'
export type StrategicImportance = 'high' | 'medium' | 'low'

export interface ProjectDashboardSummary {
  masterProjectId: string
  project: MasterProject
  portfolioId: string | null
  programId: string | null

  highestActiveRiskLevel: RiskLevel | null
  openCriticalIssueCount: number
  openHighIssueCount: number
  pendingDecisionCount: number
  overduePendingDecisionCount: number

  bac: number | null
  eac: number | null
  costExposure: number | null

  daysLate: number | null
  scheduleBucket: ScheduleBucket

  strategicallyAligned: boolean | null
  rebaselined: boolean

  assignedRoleCount: number
  roleCoverageRatio: number | null

  overduePhaseCount: number
  totalPhaseCount: number

  healthScore: number
  health: HealthTier
}

const SCHEDULE_STATUS_SCORE: Record<ScheduleStatus, number> = { on_track: 100, ahead: 100, at_risk: 55, delayed: 15, unknown: 50 }

function riskComponentScore(level: RiskLevel | null): number {
  if (level === 'critical') return 5
  if (level === 'high') return 40
  if (level === 'medium') return 75
  return 100
}

function issueComponentScore(criticalCount: number, highCount: number): number {
  const weighted = criticalCount * 2 + highCount
  if (weighted === 0) return 100
  if (weighted <= 2) return 65
  return 25
}

function decisionComponentScore(overdueCount: number): number {
  if (overdueCount === 0) return 100
  if (overdueCount === 1) return 60
  return 20
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
}

function scheduleBucketOf(daysLate: number | null): ScheduleBucket {
  if (daysLate === null) return 'unknown'
  if (daysLate <= 0) return 'on_time'
  if (daysLate <= 30) return 'late_30'
  if (daysLate <= 90) return 'late_30_90'
  return 'late_over_90'
}

export function buildProjectSummaries(masterProjects: MasterProject[], portfolios: Portfolio[], programs: Program[], raw: PortfolioDashboardRaw, today = todayIso()): ProjectDashboardSummary[] {
  return masterProjects.map((project) => {
    const risks = raw.risksByMaster.get(project.id) ?? []
    const activeRisks = risks.filter((r) => r.status !== 'closed')
    const activeLevels = activeRisks.map((r) => {
      const assessments = raw.assessmentsByRisk.get(r.id) ?? []
      return riskLevel(currentState(r, assessments).score)
    })
    const highestActiveRiskLevel = activeLevels.includes('critical')
      ? 'critical'
      : activeLevels.includes('high')
        ? 'high'
        : activeLevels.includes('medium')
          ? 'medium'
          : activeLevels.length > 0
            ? 'low'
            : null

    const issues = raw.issuesByMaster.get(project.id) ?? []
    const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'in_progress' || i.status === 'pending_approval')
    const openCriticalIssueCount = openIssues.filter((i) => i.priority === 'critical').length
    const openHighIssueCount = openIssues.filter((i) => i.priority === 'high').length

    const decisions = raw.decisionsByMaster.get(project.id) ?? []
    const pendingDecisions = decisions.filter((d) => d.status === 'pending' || d.status === 'in_review')
    const overduePendingDecisionCount = pendingDecisions.filter((d) => d.requiredBy && d.requiredBy < today).length

    const bac = project.contractValue
    const eac = project.forecastCostAtCompletion
    const costExposure = bac != null && eac != null ? bac - eac : null

    const forecastDate = project.forecastFinishDate ?? project.revisedCompletionDate
    const planDate = project.plannedFinishDate ?? project.contractualCompletionDate
    const daysLate = forecastDate && planDate ? daysBetween(forecastDate, planDate) : null

    const program = project.programId ? programs.find((p) => p.id === project.programId) : null
    const portfolio = project.portfolioId ? portfolios.find((p) => p.id === project.portfolioId) : null
    const objectivesText = program ? program.strategicObjectives : portfolio ? portfolio.strategicObjectives : null
    const strategicallyAligned = objectivesText == null ? null : objectivesText.trim() !== ''

    const rebaselined =
      (!!project.revisedCompletionDate && !!project.contractualCompletionDate && project.revisedCompletionDate !== project.contractualCompletionDate) ||
      (!!project.baselineVersion && project.baselineVersion !== 'Baseline 0')

    const assignedRoleCount = raw.assignedRoleIdsByMaster.get(project.id)?.size ?? 0
    const roleCoverageRatio = raw.totalDefinedRoles > 0 ? assignedRoleCount / raw.totalDefinedRoles : null

    const phases = raw.phasesByMaster.get(project.id) ?? []
    const overduePhaseCount = phases.filter((p) => p.status !== 'completed' && p.plannedFinish && p.plannedFinish < today).length

    const scheduleComponent = SCHEDULE_STATUS_SCORE[project.scheduleStatus]
    const riskComponent = riskComponentScore(highestActiveRiskLevel)
    const issueComponent = issueComponentScore(openCriticalIssueCount, openHighIssueCount)
    const decisionComponent = decisionComponentScore(overduePendingDecisionCount)
    const healthScore = Math.round(scheduleComponent * 0.3 + riskComponent * 0.3 + issueComponent * 0.2 + decisionComponent * 0.2)
    const health: HealthTier = healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'watch' : 'critical'

    return {
      masterProjectId: project.id,
      project,
      portfolioId: project.portfolioId,
      programId: project.programId,
      highestActiveRiskLevel,
      openCriticalIssueCount,
      openHighIssueCount,
      pendingDecisionCount: pendingDecisions.length,
      overduePendingDecisionCount,
      bac,
      eac,
      costExposure,
      daysLate,
      scheduleBucket: scheduleBucketOf(daysLate),
      strategicallyAligned,
      rebaselined,
      assignedRoleCount,
      roleCoverageRatio,
      overduePhaseCount,
      totalPhaseCount: phases.length,
      healthScore,
      health,
    }
  })
}

/** Ranks summaries into thirds by BAC — an honest, stated proxy for "strategic importance" (no dedicated field exists anywhere in the schema). */
export function strategicImportanceOf(summary: ProjectDashboardSummary, all: ProjectDashboardSummary[]): StrategicImportance {
  const withBac = all.filter((s) => s.bac != null).sort((a, b) => (a.bac as number) - (b.bac as number))
  if (summary.bac == null || withBac.length === 0) return 'medium'
  const rank = withBac.findIndex((s) => s.masterProjectId === summary.masterProjectId)
  const percentile = rank / Math.max(1, withBac.length - 1)
  if (percentile >= 0.66) return 'high'
  if (percentile >= 0.33) return 'medium'
  return 'low'
}

export interface PortfolioTotals {
  projectCount: number
  healthy: number
  watch: number
  critical: number
  avgHealthScore: number
  alignedCount: number
  alignedKnownCount: number
  bacSum: number
  eacSum: number
  eacCoverageCount: number
  costExposureSum: number
  scheduleBuckets: Record<ScheduleBucket, number>
  criticalProjectCount: number
  highRiskProjectCount: number
  overdueMilestoneCount: number
  openCriticalIssueCount: number
  pendingDecisionCount: number
  overduePendingDecisionCount: number
  changeExposureCount: number
  avgRoleCoverage: number | null
}

export function aggregatePortfolioTotals(summaries: ProjectDashboardSummary[]): PortfolioTotals {
  const totals: PortfolioTotals = {
    projectCount: summaries.length,
    healthy: 0,
    watch: 0,
    critical: 0,
    avgHealthScore: 0,
    alignedCount: 0,
    alignedKnownCount: 0,
    bacSum: 0,
    eacSum: 0,
    eacCoverageCount: 0,
    costExposureSum: 0,
    scheduleBuckets: { on_time: 0, late_30: 0, late_30_90: 0, late_over_90: 0, unknown: 0 },
    criticalProjectCount: 0,
    highRiskProjectCount: 0,
    overdueMilestoneCount: 0,
    openCriticalIssueCount: 0,
    pendingDecisionCount: 0,
    overduePendingDecisionCount: 0,
    changeExposureCount: 0,
    avgRoleCoverage: null,
  }
  let healthScoreSum = 0
  let roleCoverageSum = 0
  let roleCoverageKnown = 0

  for (const s of summaries) {
    totals[s.health]++
    healthScoreSum += s.healthScore
    if (s.health === 'critical') totals.criticalProjectCount++
    if (s.highestActiveRiskLevel === 'high' || s.highestActiveRiskLevel === 'critical') totals.highRiskProjectCount++
    if (s.strategicallyAligned != null) {
      totals.alignedKnownCount++
      if (s.strategicallyAligned) totals.alignedCount++
    }
    if (s.bac != null) totals.bacSum += s.bac
    if (s.eac != null) {
      totals.eacSum += s.eac
      totals.eacCoverageCount++
    }
    if (s.costExposure != null) totals.costExposureSum += s.costExposure
    totals.scheduleBuckets[s.scheduleBucket]++
    totals.overdueMilestoneCount += s.overduePhaseCount
    totals.openCriticalIssueCount += s.openCriticalIssueCount
    totals.pendingDecisionCount += s.pendingDecisionCount
    totals.overduePendingDecisionCount += s.overduePendingDecisionCount
    if (s.rebaselined) totals.changeExposureCount++
    if (s.roleCoverageRatio != null) {
      roleCoverageSum += s.roleCoverageRatio
      roleCoverageKnown++
    }
  }

  totals.avgHealthScore = summaries.length > 0 ? Math.round(healthScoreSum / summaries.length) : 0
  totals.avgRoleCoverage = roleCoverageKnown > 0 ? roleCoverageSum / roleCoverageKnown : null
  return totals
}

export interface DependencyImpact {
  dependency: ProjectDependency
  fromProject: MasterProject
  onProject: MasterProject
  onProjectHealth: HealthTier
  onProjectDaysLate: number | null
  atRisk: boolean
}

/** Flags a dependency as "at risk" when the project being depended on is itself delayed or unhealthy — the real cascading-delay signal the widget exists to surface. */
export function computeDependencyImpacts(dependencies: ProjectDependency[], summaries: ProjectDashboardSummary[]): DependencyImpact[] {
  const byId = new Map(summaries.map((s) => [s.masterProjectId, s]))
  const result: DependencyImpact[] = []
  for (const dep of dependencies) {
    const from = byId.get(dep.projectId)
    const on = byId.get(dep.dependsOnProjectId)
    if (!from || !on) continue
    result.push({
      dependency: dep,
      fromProject: from.project,
      onProject: on.project,
      onProjectHealth: on.health,
      onProjectDaysLate: on.daysLate,
      atRisk: on.health !== 'healthy' || (on.daysLate != null && on.daysLate > 0),
    })
  }
  return result
}
