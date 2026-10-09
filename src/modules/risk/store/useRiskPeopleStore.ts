import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'

/** People come from the central platform (profiles + project scope + role assignments) through rm_people — the module keeps no user list of its own. */
export interface RmPerson { userId: string; name: string; email: string; position: string; organization: string; projectRoles: string[]; rmRole: string | null; isAdmin: boolean }

interface Row { id: string; full_name: string; email: string; position_title: string; organization: string; project_roles: string[] | null; rm_role: string | null; is_admin: boolean }
const map = (r: Row): RmPerson => ({ userId: r.id, name: r.full_name || r.email, email: r.email ?? '', position: r.position_title ?? '', organization: r.organization ?? '', projectRoles: r.project_roles ?? [], rmRole: r.rm_role, isAdmin: !!r.is_admin })

interface State {
  all: RmPerson[]
  byProject: Record<string, RmPerson[]>
  loadedAll: boolean
  fetchAll: () => Promise<void>
  fetchProject: (projectId: string) => Promise<void>
}

export const useRiskPeopleStore = create<State>()((set, get) => ({
  all: [], byProject: {}, loadedAll: false,
  fetchAll: async () => {
    if (get().loadedAll) return
    const { data } = await supabase.rpc('rm_people', { p_project: null })
    set({ all: ((data ?? []) as Row[]).map(map), loadedAll: true })
  },
  fetchProject: async (projectId) => {
    if (projectId in get().byProject) return
    const { data } = await supabase.rpc('rm_people', { p_project: projectId })
    set((s) => ({ byProject: { ...s.byProject, [projectId]: ((data ?? []) as Row[]).map(map) } }))
  },
}))
