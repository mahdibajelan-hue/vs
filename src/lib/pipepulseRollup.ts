import { supabase } from './supabaseClient'
import { projectFromRow } from './supabaseData'
import { computeProjectSchedule } from './schedule'
import type { Project } from '../types'
import type { MasterProject, Portfolio, Program } from '../modules/masterdata/types'
import { buildHierarchyTree, fetchModuleProjectMappings } from '../modules/masterdata/lib/hierarchyRollup'

/**
 * Portfolio/Program/Project is the platform's single hierarchy, owned by Master Data — PipePulse
 * (the original root-level progress-tracking app, table `projects`) never redefines it. Each
 * project is linked to a master_projects row through the shared rasta_project_mappings table
 * (the same mechanism Risk and Issue Management use).
 */
export function fetchPipePulseProjectMappings(): Promise<Map<string, string>> {
  return fetchModuleProjectMappings('pipepulse')
}

/** Fetches full project detail (lines + daily logs, needed by computeProjectSchedule) for a set of PipePulse projects — the same 3-query shape `selectProject` already uses per project, just batched across every mapped project. */
export async function fetchPipePulseProjects(projectIds: string[]): Promise<Map<string, Project>> {
  const map = new Map<string, Project>()
  await Promise.all(
    projectIds.map(async (id) => {
      const [{ data: projectRow }, { data: lineRows }, { data: logRows }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('lines').select('*').eq('project_id', id).order('created_at'),
        supabase.from('daily_logs').select('*').eq('project_id', id).order('date', { ascending: false }),
      ])
      if (projectRow) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.set(id, projectFromRow(projectRow as any, (lineRows ?? []) as any, (logRows ?? []) as any))
      }
    }),
  )
  return map
}

export interface ProjectProgressSummary {
  masterProjectId: string
  pipepulseProjectId: string | null
  projectName: string
  plannedPercent: number
  actualPercent: number
  delayDays: number
  achievementRatio: number | null
  forecastEnd: string | null
  isDelayed: boolean
  configuredCount: number
}

/** Reuses computeProjectSchedule (the same time-based planned-vs-actual engine the per-project Schedule page already uses) rather than recomputing progress logic here. */
export function summarizeProjectProgress(masterProject: MasterProject, pipepulseProjectId: string | null, project: Project | null): ProjectProgressSummary {
  const projectName = masterProject.officialName || masterProject.shortName || masterProject.projectCode
  if (!project) {
    return {
      masterProjectId: masterProject.id,
      pipepulseProjectId,
      projectName,
      plannedPercent: 0,
      actualPercent: 0,
      delayDays: 0,
      achievementRatio: null,
      forecastEnd: null,
      isDelayed: false,
      configuredCount: 0,
    }
  }
  const schedule = computeProjectSchedule(project)
  return {
    masterProjectId: masterProject.id,
    pipepulseProjectId,
    projectName,
    plannedPercent: schedule.overallPlannedPercent,
    actualPercent: schedule.overallActualPercent,
    delayDays: schedule.totalDelayDays,
    achievementRatio: schedule.achievementRatio,
    forecastEnd: schedule.forecastEnd,
    isDelayed: schedule.totalDelayDays > 0,
    configuredCount: schedule.configuredCount,
  }
}

export interface ProgressRollupTotals {
  projectCount: number
  mappedProjectCount: number
  avgPlannedPercent: number
  avgActualPercent: number
  delayedProjectCount: number
  avgDelayDays: number
  avgAchievementRatio: number | null
}

export function progressRollupTotals(projects: ProjectProgressSummary[]): ProgressRollupTotals {
  const configured = projects.filter((p) => p.pipepulseProjectId !== null && p.configuredCount > 0)
  const avgPlannedPercent = configured.length ? Math.round(configured.reduce((sum, p) => sum + p.plannedPercent, 0) / configured.length) : 0
  const avgActualPercent = configured.length ? Math.round(configured.reduce((sum, p) => sum + p.actualPercent, 0) / configured.length) : 0
  const delayed = configured.filter((p) => p.isDelayed)
  const avgDelayDays = delayed.length ? Math.round(delayed.reduce((sum, p) => sum + p.delayDays, 0) / delayed.length) : 0
  const withRatio = configured.filter((p) => p.achievementRatio !== null)
  const avgAchievementRatio = withRatio.length ? Math.round(withRatio.reduce((sum, p) => sum + (p.achievementRatio ?? 0), 0) / withRatio.length) : null
  return {
    projectCount: projects.length,
    mappedProjectCount: projects.filter((p) => p.pipepulseProjectId !== null).length,
    avgPlannedPercent,
    avgActualPercent,
    delayedProjectCount: delayed.length,
    avgDelayDays,
    avgAchievementRatio,
  }
}

export type ProgramProgressRollup = ReturnType<typeof buildProgressPortfolioTree>[number]['programs'][number]
export type PortfolioProgressRollup = ReturnType<typeof buildProgressPortfolioTree>[number]

/** Builds the Portfolio -> Program -> Project tree with rolled-up schedule KPIs at every level. */
export function buildProgressPortfolioTree(portfolios: Portfolio[], programs: Program[], masterProjects: MasterProject[], summaries: ProjectProgressSummary[]) {
  return buildHierarchyTree(portfolios, programs, masterProjects, summaries, progressRollupTotals)
}
