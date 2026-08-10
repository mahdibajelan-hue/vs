import { supabase } from '../../../lib/supabaseClient'
import type { MasterProject, Portfolio, Program } from '../../masterdata/types'
import { rmActionFromRow, rmAssessmentFromRow, rmRiskFromRow, type RmRiskActionRow, type RmRiskAssessmentRow, type RmRiskRow } from './riskData'
import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../types'
import { computeExposureKpi, computeLevelDistribution, computeRiskMaturityIndex } from './riskAnalytics'

export interface RiskBundle {
  risks: RmRisk[]
  assessments: RmRiskAssessment[]
  actions: RmRiskAction[]
}

/**
 * Portfolio/Program/Project is the platform's single hierarchy, owned by Master Data — the Risk
 * module never redefines it. Each rm_projects row is linked to a master_projects row through the
 * shared rasta_project_mappings table (the same mechanism the Reporting module already uses).
 */
export async function fetchRiskProjectMappings(): Promise<Map<string, string>> {
  const { data } = await supabase.from('rasta_project_mappings').select('master_project_id, source_project_id').eq('source_module', 'risk').eq('status', 'confirmed')
  const map = new Map<string, string>()
  for (const row of (data ?? []) as { master_project_id: string; source_project_id: string }[]) {
    map.set(row.master_project_id, row.source_project_id)
  }
  return map
}

export async function fetchRiskBundlesForProjects(rmProjectIds: string[]): Promise<Map<string, RiskBundle>> {
  const byProject = new Map<string, RiskBundle>()
  for (const id of rmProjectIds) byProject.set(id, { risks: [], assessments: [], actions: [] })
  if (rmProjectIds.length === 0) return byProject

  const { data: riskRows } = await supabase.from('rm_risks').select('*').in('project_id', rmProjectIds)
  const risks = ((riskRows ?? []) as RmRiskRow[]).map(rmRiskFromRow)
  for (const r of risks) byProject.get(r.projectId)?.risks.push(r)

  const riskIds = risks.map((r) => r.id)
  if (riskIds.length === 0) return byProject
  const riskToProject = new Map(risks.map((r) => [r.id, r.projectId]))
  const [{ data: aRows }, { data: acRows }] = await Promise.all([
    supabase.from('rm_risk_assessments').select('*').in('risk_id', riskIds),
    supabase.from('rm_risk_actions').select('*').in('risk_id', riskIds),
  ])
  for (const row of (aRows ?? []) as RmRiskAssessmentRow[]) {
    const projectId = riskToProject.get(row.risk_id)
    if (projectId) byProject.get(projectId)?.assessments.push(rmAssessmentFromRow(row))
  }
  for (const row of (acRows ?? []) as RmRiskActionRow[]) {
    const projectId = riskToProject.get(row.risk_id)
    if (projectId) byProject.get(projectId)?.actions.push(rmActionFromRow(row))
  }
  return byProject
}

export interface ProjectRiskSummary {
  masterProjectId: string
  rmProjectId: string | null
  projectName: string
  totalRisks: number
  activeRisks: number
  criticalHighCount: number
  exposureCurrent: number
  exposureInitial: number
  maturity: number
}

const EMPTY_BUNDLE: RiskBundle = { risks: [], assessments: [], actions: [] }

export function summarizeProjectRisk(project: MasterProject, rmProjectId: string | null, bundle: RiskBundle = EMPTY_BUNDLE): ProjectRiskSummary {
  const active = bundle.risks.filter((r) => r.status !== 'closed')
  const levelDist = computeLevelDistribution(bundle.risks, bundle.assessments)
  const exposure = computeExposureKpi(bundle.risks, bundle.assessments)
  const maturity = computeRiskMaturityIndex(bundle.risks, bundle.assessments, bundle.actions)
  return {
    masterProjectId: project.id,
    rmProjectId,
    projectName: project.officialName || project.shortName || project.projectCode,
    totalRisks: bundle.risks.length,
    activeRisks: active.length,
    criticalHighCount: levelDist.critical + levelDist.high,
    exposureCurrent: exposure.current,
    exposureInitial: exposure.initial,
    maturity: maturity.overall,
  }
}

export interface RollupTotals {
  projectCount: number
  mappedProjectCount: number
  totalRisks: number
  activeRisks: number
  criticalHighCount: number
  exposureCurrent: number
  exposureInitial: number
  avgMaturity: number
}

export function rollupTotals(projects: ProjectRiskSummary[]): RollupTotals {
  const mapped = projects.filter((p) => p.rmProjectId !== null)
  const avgMaturity = mapped.length > 0 ? Math.round(mapped.reduce((sum, p) => sum + p.maturity, 0) / mapped.length) : 0
  return {
    projectCount: projects.length,
    mappedProjectCount: mapped.length,
    totalRisks: projects.reduce((sum, p) => sum + p.totalRisks, 0),
    activeRisks: projects.reduce((sum, p) => sum + p.activeRisks, 0),
    criticalHighCount: projects.reduce((sum, p) => sum + p.criticalHighCount, 0),
    exposureCurrent: projects.reduce((sum, p) => sum + p.exposureCurrent, 0),
    exposureInitial: projects.reduce((sum, p) => sum + p.exposureInitial, 0),
    avgMaturity,
  }
}

export interface ProgramRollup {
  program: Program
  projects: ProjectRiskSummary[]
  totals: RollupTotals
}

export interface PortfolioRollup {
  portfolio: Portfolio
  programs: ProgramRollup[]
  directProjects: ProjectRiskSummary[]
  totals: RollupTotals
}

/** Builds the Portfolio -> Program -> Project tree with rolled-up risk KPIs at every level. */
export function buildPortfolioTree(portfolios: Portfolio[], programs: Program[], projectSummaries: ProjectRiskSummary[], masterProjects: MasterProject[]): PortfolioRollup[] {
  const summaryByMasterId = new Map(projectSummaries.map((s) => [s.masterProjectId, s]))

  return portfolios.map((portfolio) => {
    const portfolioPrograms = programs.filter((pg) => pg.portfolioId === portfolio.id)
    const programRollups: ProgramRollup[] = portfolioPrograms.map((program) => {
      const programProjects = masterProjects.filter((mp) => mp.programId === program.id)
      const summaries = programProjects.map((mp) => summaryByMasterId.get(mp.id)).filter((s): s is ProjectRiskSummary => !!s)
      return { program, projects: summaries, totals: rollupTotals(summaries) }
    })
    const programIds = new Set(portfolioPrograms.map((pg) => pg.id))
    const directProjects = masterProjects
      .filter((mp) => mp.portfolioId === portfolio.id && (!mp.programId || !programIds.has(mp.programId)))
      .map((mp) => summaryByMasterId.get(mp.id))
      .filter((s): s is ProjectRiskSummary => !!s)
    const allProjects = [...programRollups.flatMap((pr) => pr.projects), ...directProjects]
    return { portfolio, programs: programRollups, directProjects, totals: rollupTotals(allProjects) }
  })
}
