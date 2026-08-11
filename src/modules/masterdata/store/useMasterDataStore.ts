import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { MasterProject, Organization, Portfolio, Program, ProjectPhase } from '../types'
import {
  masterProjectFromRow,
  masterProjectToRow,
  organizationFromRow,
  organizationToRow,
  portfolioFromRow,
  portfolioToRow,
  programFromRow,
  programToRow,
  projectPhaseFromRow,
  projectPhaseToRow,
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
}

export const useMasterDataStore = create<MasterDataState>()((set, get) => ({
  organizations: [],
  portfolios: [],
  programs: [],
  projects: [],
  phasesByProject: {},
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
    set({
      organizations: (orgs ?? []).map(organizationFromRow),
      portfolios: (pf ?? []).map(portfolioFromRow),
      programs: (pg ?? []).map(programFromRow),
      projects: (pj ?? []).map(masterProjectFromRow),
      users: (users ?? []).map((u) => ({ id: u.id, email: u.email, fullName: u.full_name })),
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
}))
