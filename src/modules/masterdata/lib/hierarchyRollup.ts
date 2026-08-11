import { supabase } from '../../../lib/supabaseClient'
import type { MasterProject, Portfolio, Program } from '../types'

export type RastaSourceModule = 'risk' | 'issues' | 'pipepulse'

/**
 * Every module's own project table is linked to a master_projects row through the shared
 * rasta_project_mappings table — the single join point the whole Portfolio -> Program -> Project
 * hierarchy rests on (no module redefines or duplicates this structure; see supabase/schema.sql
 * around "rasta_project_mappings"). Returns masterProjectId -> sourceProjectId.
 */
export async function fetchModuleProjectMappings(sourceModule: RastaSourceModule): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('rasta_project_mappings')
    .select('master_project_id, source_project_id')
    .eq('source_module', sourceModule)
    .eq('status', 'confirmed')
  const map = new Map<string, string>()
  for (const row of (data ?? []) as { master_project_id: string; source_project_id: string }[]) {
    map.set(row.master_project_id, row.source_project_id)
  }
  return map
}

export interface HierarchyProjectSummary {
  masterProjectId: string
}

export interface HierarchyProgramRollup<TSummary, TTotals> {
  program: Program
  projects: TSummary[]
  totals: TTotals
}

export interface HierarchyPortfolioRollup<TSummary, TTotals> {
  portfolio: Portfolio
  programs: HierarchyProgramRollup<TSummary, TTotals>[]
  directProjects: TSummary[]
  totals: TTotals
}

/**
 * Generic Portfolio -> Program -> Project tree builder shared by every module's rollup (Risk,
 * Issues, PipePulse, Reporting) so the grouping logic — which programs belong to which portfolio,
 * which projects sit directly under a portfolio with no program — is written once. Each module
 * supplies its own per-project summary shape and its own `aggregate` function for rolling
 * per-project numbers up into program/portfolio totals, since each module's KPIs differ.
 */
export function buildHierarchyTree<TSummary extends HierarchyProjectSummary, TTotals>(
  portfolios: Portfolio[],
  programs: Program[],
  masterProjects: MasterProject[],
  summaries: TSummary[],
  aggregate: (list: TSummary[]) => TTotals,
): HierarchyPortfolioRollup<TSummary, TTotals>[] {
  const summaryByMasterId = new Map(summaries.map((s) => [s.masterProjectId, s]))

  return portfolios.map((portfolio) => {
    const portfolioPrograms = programs.filter((pg) => pg.portfolioId === portfolio.id)
    const programRollups: HierarchyProgramRollup<TSummary, TTotals>[] = portfolioPrograms.map((program) => {
      const programProjects = masterProjects.filter((mp) => mp.programId === program.id)
      const list = programProjects.map((mp) => summaryByMasterId.get(mp.id)).filter((s): s is TSummary => !!s)
      return { program, projects: list, totals: aggregate(list) }
    })
    const programIds = new Set(portfolioPrograms.map((pg) => pg.id))
    const directProjects = masterProjects
      .filter((mp) => mp.portfolioId === portfolio.id && (!mp.programId || !programIds.has(mp.programId)))
      .map((mp) => summaryByMasterId.get(mp.id))
      .filter((s): s is TSummary => !!s)
    const allProjects = [...programRollups.flatMap((pr) => pr.projects), ...directProjects]
    return { portfolio, programs: programRollups, directProjects, totals: aggregate(allProjects) }
  })
}
