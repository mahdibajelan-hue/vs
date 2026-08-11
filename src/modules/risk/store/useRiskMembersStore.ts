import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useAuthStore } from '../../../store/useAuthStore'
import type { RmUserRole } from '../types'

export interface RmProjectMember {
  userId: string
  email: string
  fullName: string
  role: RmUserRole
}

interface MemberRow {
  user_id: string
  role: RmUserRole
  profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null
}

interface RiskMembersState {
  projectId: string | null
  members: RmProjectMember[]
  loading: boolean

  fetchForProject: (projectId: string) => Promise<void>
  clear: () => void
  addMember: (email: string, role: RmUserRole) => Promise<{ ok: boolean; error?: string }>
  removeMember: (userId: string) => Promise<{ ok: boolean; error?: string }>
  changeRole: (userId: string, role: RmUserRole) => Promise<{ ok: boolean; error?: string }>
}

function profileOf(row: MemberRow): { email: string; fullName: string } {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return { email: p?.email ?? '', fullName: p?.full_name ?? '' }
}

export const useRiskMembersStore = create<RiskMembersState>()((set, get) => ({
  projectId: null,
  members: [],
  loading: false,

  fetchForProject: async (projectId) => {
    set({ loading: true })
    const { data, error } = await supabase.from('rm_project_members').select('user_id, role, profiles(email, full_name)').eq('project_id', projectId)
    if (error) {
      set({ loading: false })
      return
    }
    const members = ((data ?? []) as unknown as MemberRow[]).map((r) => ({ userId: r.user_id, role: r.role, ...profileOf(r) }))
    set({ projectId, members, loading: false })
  },

  clear: () => set({ projectId: null, members: [] }),

  addMember: async (email, role) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'ابتدا یک پروژه انتخاب کنید' }
    const trimmedEmail = email.trim().toLowerCase()
    if (get().members.some((m) => m.email.toLowerCase() === trimmedEmail)) {
      return { ok: false, error: 'این کاربر همین حالا عضو پروژه است' }
    }
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', trimmedEmail).maybeSingle()
    if (!existingProfile) {
      return { ok: false, error: 'کاربری با این ایمیل در سامانه یافت نشد — ابتدا باید یک‌بار وارد سامانه شده باشد' }
    }
    const { error } = await supabase.from('rm_project_members').insert({ project_id: projectId, user_id: existingProfile.id, role })
    if (error) return { ok: false, error: 'خطا در افزودن عضو — ' + error.message }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  removeMember: async (userId) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'پروژه‌ای انتخاب نشده' }
    const { error } = await supabase.from('rm_project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: friendlyErrorMessage(error) }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  changeRole: async (userId, role) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'پروژه‌ای انتخاب نشده' }
    const { error } = await supabase.from('rm_project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: friendlyErrorMessage(error) }
    await get().fetchForProject(projectId)
    return { ok: true }
  },
}))

/** Current user's role in the currently-loaded Risk Management project. */
export function useRiskCurrentRole(): RmUserRole | null {
  const members = useRiskMembersStore((s) => s.members)
  const userId = useAuthStore((s) => s.profile?.id)
  return members.find((m) => m.userId === userId)?.role ?? null
}
