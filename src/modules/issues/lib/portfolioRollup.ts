import type { MasterProject, Portfolio, Program } from '../../masterdata/types'
import { buildHierarchyTree, fetchModuleProjectMappings } from '../../masterdata/lib/hierarchyRollup'
import type { ImIssue } from '../types'
import { isIssueOpen, isIssueOverdue, isoDiffDays } from './issueRing'

/**
 * Portfolio/Program/Project is the platform's single hierarchy, owned by Master Data — Issue
 * Management never redefines it. Each im_projects row is linked to a master_projects row through
 * the shared rasta_project_mappings table (the same mechanism Risk, PipePulse and Reporting use).
 */
export function fetchIssueProjectMappings(): Promise<Map<string, string>> {
  return fetchModuleProjectMappings('issues')
}

export interface ProjectIssueSummary {
  masterProjectId: string
  imProjectId: string | null
  projectName: string
  totalIssues: number
  openIssues: number
  criticalCount: number
  overdueCount: number
  avgResolutionDays: number
  onTimeRate: number
}

export function summarizeProjectIssues(project: MasterProject, imProjectId: string | null, issues: ImIssue[] = []): ProjectIssueSummary {
  const open = issues.filter(isIssueOpen)
  const overdue = issues.filter((i) => isIssueOverdue(i))
  const critical = open.filter((i) => i.priority === 'critical')
  const closed = issues.filter((i) => i.status === 'approved' && i.closedAt)
  const onTime = closed.filter((i) => i.closedAt! <= i.deadlineDate)
  const avgResolutionDays = closed.length ? Math.round(closed.reduce((sum, i) => sum + isoDiffDays(i.createdAt.slice(0, 10), i.closedAt!), 0) / closed.length) : 0
  const onTimeRate = closed.length ? Math.round((onTime.length / closed.length) * 100) : 0
  return {
    masterProjectId: project.id,
    imProjectId,
    projectName: project.officialName || project.shortName || project.projectCode,
    totalIssues: issues.length,
    openIssues: open.length,
    criticalCount: critical.length,
    overdueCount: overdue.length,
    avgResolutionDays,
    onTimeRate,
  }
}

export interface IssueRollupTotals {
  projectCount: number
  mappedProjectCount: number
  totalIssues: number
  openIssues: number
  criticalCount: number
  overdueCount: number
  avgResolutionDays: number
  avgOnTimeRate: number
}

export function issueRollupTotals(projects: ProjectIssueSummary[]): IssueRollupTotals {
  const mapped = projects.filter((p) => p.imProjectId !== null)
  const withResolutionData = mapped.filter((p) => p.totalIssues > 0)
  const avgResolutionDays = withResolutionData.length ? Math.round(withResolutionData.reduce((sum, p) => sum + p.avgResolutionDays, 0) / withResolutionData.length) : 0
  const avgOnTimeRate = withResolutionData.length ? Math.round(withResolutionData.reduce((sum, p) => sum + p.onTimeRate, 0) / withResolutionData.length) : 0
  return {
    projectCount: projects.length,
    mappedProjectCount: mapped.length,
    totalIssues: projects.reduce((sum, p) => sum + p.totalIssues, 0),
    openIssues: projects.reduce((sum, p) => sum + p.openIssues, 0),
    criticalCount: projects.reduce((sum, p) => sum + p.criticalCount, 0),
    overdueCount: projects.reduce((sum, p) => sum + p.overdueCount, 0),
    avgResolutionDays,
    avgOnTimeRate,
  }
}

export type ProgramIssueRollup = ReturnType<typeof buildIssuePortfolioTree>[number]['programs'][number]
export type PortfolioIssueRollup = ReturnType<typeof buildIssuePortfolioTree>[number]

/** Builds the Portfolio -> Program -> Project tree with rolled-up issue KPIs at every level. */
export function buildIssuePortfolioTree(portfolios: Portfolio[], programs: Program[], masterProjects: MasterProject[], projectSummaries: ProjectIssueSummary[]) {
  return buildHierarchyTree(portfolios, programs, masterProjects, projectSummaries, issueRollupTotals)
}
