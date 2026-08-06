import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from './useAuthStore'
import type { UserRole } from '../types'

export interface ProjectMember {
  userId: string
  email: string
  fullName: string
  role: UserRole
}

export interface ProjectInvite {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

interface MemberRow {
  user_id: string
  role: UserRole
  profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null
}

interface MembersState {
  projectId: string | null
  members: ProjectMember[]
  invites: ProjectInvite[]
  loading: boolean

  fetchForProject: (projectId: string) => Promise<void>
  clear: () => void
  invite: (email: string, role: UserRole) => Promise<{ ok: boolean; error?: string }>
  cancelInvite: (inviteId: string) => Promise<void>
  removeMember: (userId: string) => Promise<{ ok: boolean; error?: string }>
  changeRole: (userId: string, role: UserRole) => Promise<{ ok: boolean; error?: string }>
}

function profileOf(row: MemberRow): { email: string; fullName: string } {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return { email: p?.email ?? '', fullName: p?.full_name ?? '' }
}

export const useMembersStore = create<MembersState>()((set, get) => ({
  projectId: null,
  members: [],
  invites: [],
  loading: false,

  fetchForProject: async (projectId) => {
    set({ loading: true })
    const [{ data: memberRows, error: mErr }, { data: inviteRows, error: iErr }] = await Promise.all([
      supabase.from('project_members').select('user_id, role, profiles(email, full_name)').eq('project_id', projectId),
      supabase.from('project_invites').select('id, email, role, created_at').eq('project_id', projectId).is('accepted_at', null),
    ])
    if (mErr || iErr) {
      set({ loading: false })
      return
    }
    const members = ((memberRows ?? []) as unknown as MemberRow[]).map((r) => ({ userId: r.user_id, role: r.role, ...profileOf(r) }))
    const invites = (inviteRows ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role as UserRole, createdAt: r.created_at }))
    set({ projectId, members, invites, loading: false })
  },

  clear: () => set({ projectId: null, members: [], invites: [] }),

  invite: async (email, role) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'ابتدا یک پروژه انتخاب کنید' }
    const trimmedEmail = email.trim().toLowerCase()
    if (get().members.some((m) => m.email.toLowerCase() === trimmedEmail)) {
      return { ok: false, error: 'این کاربر همین حالا عضو پروژه است' }
    }
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', trimmedEmail).maybeSingle()
    const invitedBy = useAuthStore.getState().profile?.id ?? null
    if (existingProfile) {
      const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: existingProfile.id, role })
      if (error) return { ok: false, error: 'خطا در افزودن عضو — ' + error.message }
    } else {
      const { error } = await supabase
        .from('project_invites')
        .upsert({ project_id: projectId, email: trimmedEmail, role, invited_by: invitedBy }, { onConflict: 'project_id,email' })
      if (error) return { ok: false, error: 'خطا در ارسال دعوت — ' + error.message }
    }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  cancelInvite: async (inviteId) => {
    await supabase.from('project_invites').delete().eq('id', inviteId)
    const projectId = get().projectId
    if (projectId) await get().fetchForProject(projectId)
  },

  removeMember: async (userId) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'پروژه‌ای انتخاب نشده' }
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: 'فقط کارفرما می‌تواند عضو حذف کند' }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  changeRole: async (userId, role) => {
    const projectId = get().projectId
    if (!projectId) return { ok: false, error: 'پروژه‌ای انتخاب نشده' }
    const { error } = await supabase.from('project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: 'فقط کارفرما می‌تواند نقش را تغییر دهد' }
    await get().fetchForProject(projectId)
    return { ok: true }
  },
}))

/** Current user's role in the currently-loaded project — replaces the old global-account role. */
export function useCurrentRole(): UserRole | null {
  const members = useMembersStore((s) => s.members)
  const userId = useAuthStore((s) => s.profile?.id)
  return members.find((m) => m.userId === userId)?.role ?? null
}
