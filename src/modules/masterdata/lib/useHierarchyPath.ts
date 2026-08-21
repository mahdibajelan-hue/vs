import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useMasterDataStore } from '../store/useMasterDataStore'
import type { RastaSourceModule } from './hierarchyRollup'

export interface HierarchyPath {
  portfolioName: string | null
  programName: string | null
  projectName: string
}

/**
 * Resolves a module's own project id (rm_projects/im_projects/projects) up through
 * rasta_project_mappings -> master_projects -> programs -> portfolios, so any module can show
 * "شما اینجا هستید: پورتفولیو > طرح > پروژه" without redefining the hierarchy itself (spec §9:
 * navigation must always make the current management level obvious). Returns null while
 * resolving, once no confirmed mapping exists, or once the project isn't in Master Data.
 */
export function useHierarchyPath(sourceModule: RastaSourceModule, sourceProjectId: string | null): HierarchyPath | null {
  const loaded = useMasterDataStore((s) => s.loaded)
  const loading = useMasterDataStore((s) => s.loading)
  const fetchAll = useMasterDataStore((s) => s.fetchAll)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const [masterProjectId, setMasterProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded && !loading) fetchAll()
  }, [loaded, loading, fetchAll])

  useEffect(() => {
    let cancelled = false
    if (!sourceProjectId) {
      setMasterProjectId(null)
      return
    }
    supabase
      .from('rasta_project_mappings')
      .select('master_project_id')
      .eq('source_module', sourceModule)
      .eq('source_project_id', sourceProjectId)
      .eq('status', 'confirmed')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMasterProjectId((data as { master_project_id: string } | null)?.master_project_id ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [sourceModule, sourceProjectId])

  if (!masterProjectId) return null
  const project = masterProjects.find((p) => p.id === masterProjectId)
  if (!project) return null
  const program = project.programId ? (programs.find((pg) => pg.id === project.programId) ?? null) : null
  const portfolioId = project.portfolioId ?? program?.portfolioId ?? null
  const portfolio = portfolioId ? (portfolios.find((pf) => pf.id === portfolioId) ?? null) : null

  return {
    portfolioName: portfolio?.name ?? null,
    programName: program?.name ?? null,
    projectName: project.officialName || project.shortName || project.projectCode,
  }
}
