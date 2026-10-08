import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { DependencyType, MasterProject, Organization, PartyRole, Portfolio, Program, ProjectDependency, ProjectParty, ProjectPhase, TeamMember } from '../types'
import {
  masterProjectFromRow,
  masterProjectToRow,
  organizationFromRow,
  organizationToRow,
  portfolioFromRow,
  portfolioToRow,
  programFromRow,
  programToRow,
  projectDependencyFromRow,
  projectDependencyToRow,
  projectPhaseFromRow,
  projectPhaseToRow,
  projectPartyFromRow,
  teamMemberFromRow,
  teamMemberToRow,
} from '../lib/data'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

export interface UserOption {
  id: string
  email: string
  fullName: string
}

interface MasterDataState {
  organizations: Organization[]
  portfolios: Portfolio[]
  programs: Program[]
  projects: MasterProject[]
  phasesByProject: Record<string, ProjectPhase[]>
  /** Every dependency across every project — small reference data, fetched whole (like portfolios/programs) so the Portfolio Dashboard's dependency widget doesn't need a per-project fetch loop. */
  dependencies: ProjectDependency[]
  /** Which organization plays which role in which project (several per role allowed). */
  parties: ProjectParty[]
  /** Every project's human-resources structure. */
  team: TeamMember[]
  /** Every platform user, for owner/manager/sponsor pickers — reuses the shared `profiles` table. */
  users: UserOption[]
  loading: boolean
  loaded: boolean

  fetchAll: () => Promise<void>

  createOrganization: (data: Partial<Organization>) => Promise<void>
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<void>
  deleteOrganization: (id: string) => Promise<void>

  createPortfolio: (data: Partial<Portfolio>) => Promise<void>
  updatePortfolio: (id: string, data: Partial<Portfolio>) => Promise<void>
  deletePortfolio: (id: string) => Promise<void>

  createProgram: (data: Partial<Program>) => Promise<void>
  updateProgram: (id: string, data: Partial<Program>) => Promise<void>
  deleteProgram: (id: string) => Promise<void>

  createProject: (data: Partial<MasterProject>) => Promise<string | null>
  updateProject: (id: string, data: Partial<MasterProject>) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  fetchPhases: (projectId: string) => Promise<void>
  createPhase: (projectId: string, data: Partial<ProjectPhase>) => Promise<void>
  updatePhase: (id: string, projectId: string, data: Partial<ProjectPhase>) => Promise<void>
  deletePhase: (id: string, projectId: string) => Promise<void>

  addParty: (projectId: string, organizationId: string, role: PartyRole) => Promise<void>
  removeParty: (id: string) => Promise<void>
  addTeamMember: (projectId: string, data: Partial<TeamMember>) => Promise<void>
  updateTeamMember: (id: string, data: Partial<TeamMember>) => Promise<void>
  removeTeamMember: (id: string) => Promise<void>

  createDependency: (projectId: string, dependsOnProjectId: string, dependencyType?: DependencyType, notes?: string) => Promise<void>
  deleteDependency: (id: string) => Promise<void>
}

export const useMasterDataStore = create<MasterDataState>()((set, get) => ({
  organizations: [],
  portfolios: [],
  programs: [],
  projects: [],
  phasesByProject: {},
  dependencies: [],
  parties: [],
  team: [],
  users: [],
  loading: false,
  loaded: false,

  fetchAll: async () => {
    set({ loading: true })
    const [{ data: orgs, error: e1 }, { data: pf, error: e2 }, { data: pg, error: e3 }, { data: pj, error: e4 }, { data: users, error: e5 }] =
      await Promise.all([
        supabase.from('organizations').select('*').order('name'),
        supabase.from('portfolios').select('*').order('name'),
        supabase.from('programs').select('*').order('name'),
        supabase.from('master_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, email, full_name').order('email'),
      ])
    if (reportError('بارگذاری داده‌های پایه', e1 ?? e2 ?? e3 ?? e4 ?? e5)) {
      set({ loading: false })
      return
    }
    // Fetched separately and never allowed to block the rest of master data: this table is new
    // (Portfolio Dashboard's dependency widget) and a deployment that hasn't run that migration
    // yet must not lose Organizations/Portfolios/Programs/Projects just because this one query
    // 404s — it simply comes back empty until the migration is applied.
    const { data: deps, error: e6 } = await supabase.from('master_project_dependencies').select('*')
    if (e6) console.warn('[masterdata] master_project_dependencies unavailable (migration not yet applied?):', e6.message)
    // new in this release: fetched on their own so a database that has not run the migration still loads everything else
    const [{ data: parties, error: e7 }, { data: team, error: e8 }] = await Promise.all([supabase.from('master_project_parties').select('*'), supabase.from('master_project_team').select('*').order('sort')])
    if (e7 || e8) console.warn('[masterdata] parties/team unavailable (migration not yet applied?):', (e7 ?? e8)?.message)
    set({
      parties: e7 ? [] : (parties ?? []).map(projectPartyFromRow),
      team: e8 ? [] : (team ?? []).map(teamMemberFromRow),
      organizations: (orgs ?? []).map(organizationFromRow),
      portfolios: (pf ?? []).map(portfolioFromRow),
      programs: (pg ?? []).map(programFromRow),
      projects: (pj ?? []).map(masterProjectFromRow),
      users: (users ?? []).map((u) => ({ id: u.id, email: u.email, fullName: u.full_name })),
      dependencies: e6 ? [] : (deps ?? []).map(projectDependencyFromRow),
      loading: false,
      loaded: true,
    })
  },

  createOrganization: async (data) => {
    const { error } = await supabase.from('organizations').insert(organizationToRow(data))
    if (reportError('ایجاد سازمان', error)) return
    await get().fetchAll()
  },
  updateOrganization: async (id, data) => {
    const { error } = await supabase.from('organizations').update(organizationToRow(data)).eq('id', id)
    if (reportError('ویرایش سازمان', error)) return
    await get().fetchAll()
  },
  deleteOrganization: async (id) => {
    const { error } = await supabase.from('organizations').delete().eq('id', id)
    if (reportError('حذف سازمان', error)) return
    set((s) => ({ organizations: s.organizations.filter((o) => o.id !== id) }))
  },

  createPortfolio: async (data) => {
    const { error } = await supabase.from('portfolios').insert(portfolioToRow(data))
    if (reportError('ایجاد پورتفولیو', error)) return
    await get().fetchAll()
  },
  updatePortfolio: async (id, data) => {
    const { error } = await supabase.from('portfolios').update(portfolioToRow(data)).eq('id', id)
    if (reportError('ویرایش پورتفولیو', error)) return
    await get().fetchAll()
  },
  deletePortfolio: async (id) => {
    const { error } = await supabase.from('portfolios').delete().eq('id', id)
    if (reportError('حذف پورتفولیو', error)) return
    set((s) => ({ portfolios: s.portfolios.filter((p) => p.id !== id) }))
  },

  createProgram: async (data) => {
    const { error } = await supabase.from('programs').insert(programToRow(data))
    if (reportError('ایجاد طرح', error)) return
    await get().fetchAll()
  },
  updateProgram: async (id, data) => {
    const { error } = await supabase.from('programs').update(programToRow(data)).eq('id', id)
    if (reportError('ویرایش طرح', error)) return
    await get().fetchAll()
  },
  deleteProgram: async (id) => {
    const { error } = await supabase.from('programs').delete().eq('id', id)
    if (reportError('حذف طرح', error)) return
    set((s) => ({ programs: s.programs.filter((p) => p.id !== id) }))
  },

  createProject: async (data) => {
    const { data: row, error } = await supabase.from('master_projects').insert(masterProjectToRow(data)).select('id').single()
    if (reportError('ایجاد پروژه', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updateProject: async (id, data) => {
    const { error } = await supabase.from('master_projects').update(masterProjectToRow(data)).eq('id', id)
    if (reportError('ویرایش پروژه', error)) return
    await get().fetchAll()
  },
  deleteProject: async (id) => {
    const { error } = await supabase.from('master_projects').delete().eq('id', id)
    if (reportError('حذف پروژه', error)) return
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  },

  fetchPhases: async (projectId) => {
    const { data, error } = await supabase.from('project_phases').select('*').eq('project_id', projectId).order('sequence')
    if (reportError('بارگذاری فازهای پروژه', error)) return
    set((s) => ({ phasesByProject: { ...s.phasesByProject, [projectId]: (data ?? []).map(projectPhaseFromRow) } }))
  },
  createPhase: async (projectId, data) => {
    const { error } = await supabase.from('project_phases').insert(projectPhaseToRow(projectId, data))
    if (reportError('ایجاد فاز', error)) return
    await get().fetchPhases(projectId)
  },
  updatePhase: async (id, projectId, data) => {
    const { error } = await supabase.from('project_phases').update(projectPhaseToRow(projectId, data)).eq('id', id)
    if (reportError('ویرایش فاز', error)) return
    await get().fetchPhases(projectId)
  },
  deletePhase: async (id, projectId) => {
    const { error } = await supabase.from('project_phases').delete().eq('id', id)
    if (reportError('حذف فاز', error)) return
    set((s) => ({ phasesByProject: { ...s.phasesByProject, [projectId]: (s.phasesByProject[projectId] ?? []).filter((p) => p.id !== id) } }))
  },

  addParty: async (projectId, organizationId, role) => {
    if (get().parties.some((x) => x.projectId === projectId && x.organizationId === organizationId && x.role === role)) return
    const { error } = await supabase.from('master_project_parties').insert({ project_id: projectId, organization_id: organizationId, role })
    if (reportError('ثبت رکن پروژه', error)) return
    await get().fetchAll()
    await syncLegacyParties(projectId, get)
  },
  removeParty: async (id) => {
    const projectId = get().parties.find((x) => x.id === id)?.projectId
    const { error } = await supabase.from('master_project_parties').delete().eq('id', id)
    if (reportError('حذف رکن پروژه', error)) return
    await get().fetchAll()
    if (projectId) await syncLegacyParties(projectId, get)
  },
  addTeamMember: async (projectId, data) => {
    const { error } = await supabase.from('master_project_team').insert(teamMemberToRow(projectId, data))
    if (reportError('افزودن عضو تیم', error)) return
    await get().fetchAll()
    await syncLegacyManagers(projectId, get)
  },
  updateTeamMember: async (id, data) => {
    const projectId = get().team.find((x) => x.id === id)?.projectId
    const { error } = await supabase.from('master_project_team').update(teamMemberToRow(projectId ?? '', data)).eq('id', id)
    if (reportError('ویرایش عضو تیم', error)) return
    await get().fetchAll()
    if (projectId) await syncLegacyManagers(projectId, get)
  },
  removeTeamMember: async (id) => {
    const projectId = get().team.find((x) => x.id === id)?.projectId
    const { error } = await supabase.from('master_project_team').delete().eq('id', id)
    if (reportError('حذف عضو تیم', error)) return
    await get().fetchAll()
    if (projectId) await syncLegacyManagers(projectId, get)
  },

  createDependency: async (projectId, dependsOnProjectId, dependencyType, notes) => {
    const { error } = await supabase
      .from('master_project_dependencies')
      .insert(projectDependencyToRow({ projectId, dependsOnProjectId, dependencyType, notes }))
    if (reportError('ثبت وابستگی پروژه', error)) return
    await get().fetchAll()
  },
  deleteDependency: async (id) => {
    const { error } = await supabase.from('master_project_dependencies').delete().eq('id', id)
    if (reportError('حذف وابستگی پروژه', error)) return
    set((s) => ({ dependencies: s.dependencies.filter((d) => d.id !== id) }))
  },
}))

type Get = () => MasterDataState

/**
 * The rest of the platform (finance, reporting …) still reads one employer / contractor / consultant per project from the
 * project row. Keep those columns equal to the first organization of the matching role so nothing else has to change.
 */
async function syncLegacyParties(projectId: string, get: Get): Promise<void> {
  const mine = get().parties.filter((x) => x.projectId === projectId)
  const first = (r: PartyRole) => mine.find((x) => x.role === r)?.organizationId ?? null
  const patch = { employerOrgId: first('employer'), contractorOrgId: first('contractor'), consultantOrgId: first('supervision_consultant') ?? first('design_consultant'), partnerOrgId: first('partner') }
  const p = get().projects.find((x) => x.id === projectId)
  if (!p || (p.employerOrgId === patch.employerOrgId && p.contractorOrgId === patch.contractorOrgId && p.consultantOrgId === patch.consultantOrgId && p.partnerOrgId === patch.partnerOrgId)) return
  const { error } = await supabase.from('master_projects').update(masterProjectToRow(patch)).eq('id', projectId)
  if (!reportError('همگام‌سازی ارکان با پروژه', error)) await get().fetchAll()
}

/** Same for the people: project manager and project executive (مجری طرح) of the structure are mirrored onto the project row. */
async function syncLegacyManagers(projectId: string, get: Get): Promise<void> {
  const mine = get().team.filter((x) => x.projectId === projectId && x.userId)
  const of = (k: string) => mine.find((x) => x.positionKey === k)?.userId ?? null
  const patch = { projectManagerId: of('project_manager'), projectDirectorId: of('executive') }
  const p = get().projects.find((x) => x.id === projectId)
  if (!p) return
  const changed: Partial<MasterProject> = {}
  if (patch.projectManagerId && patch.projectManagerId !== p.projectManagerId) changed.projectManagerId = patch.projectManagerId
  if (patch.projectDirectorId && patch.projectDirectorId !== p.projectDirectorId) changed.projectDirectorId = patch.projectDirectorId
  if (Object.keys(changed).length === 0) return
  const { error } = await supabase.from('master_projects').update(masterProjectToRow(changed)).eq('id', projectId)
  if (!reportError('همگام‌سازی مدیران با پروژه', error)) await get().fetchAll()
}
