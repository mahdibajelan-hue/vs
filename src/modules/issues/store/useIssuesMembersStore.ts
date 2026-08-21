import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImUserRole } from '../types'

export interface ImProjectMember {
  userId: string
  email: string
  fullName: string
  role: ImUserRole
}

/** Stable reference for "no members yet" — a literal `?? []` in a selector would return a fresh
 * array every call and cause useSyncExternalStore to loop forever re-rendering. */
export const EMPTY_MEMBERS: ImProjectMember[] = []

interface MemberRow {
  user_id: string
  role: ImUserRole
  profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null
}

interface IssuesMembersState {
  membersByProject: Record<string, ImProjectMember[]>
  loading: Record<string, boolean>

  fetchForProject: (projectId: string) => Promise<void>
  addMember: (projectId: string, email: string, role: ImUserRole) => Promise<{ ok: boolean; error?: string }>
  removeMember: (projectId: string, userId: string) => Promise<{ ok: boolean; error?: string }>
  changeRole: (projectId: string, userId: string, role: ImUserRole) => Promise<{ ok: boolean; error?: string }>
}

function profileOf(row: MemberRow): { email: string; fullName: string } {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return { email: p?.email ?? '', fullName: p?.full_name ?? '' }
}

export const useIssuesMembersStore = create<IssuesMembersState>()((set, get) => ({
  membersByProject: {},
  loading: {},

  fetchForProject: async (projectId) => {
    set((s) => ({ loading: { ...s.loading, [projectId]: true } }))
    const { data, error } = await supabase.from('im_project_members').select('user_id, role, profiles(email, full_name)').eq('project_id', projectId)
    if (error) {
      set((s) => ({ loading: { ...s.loading, [projectId]: false } }))
      return
    }
    const members = ((data ?? []) as unknown as MemberRow[]).map((r) => ({ userId: r.user_id, role: r.role, ...profileOf(r) }))
    set((s) => ({ membersByProject: { ...s.membersByProject, [projectId]: members }, loading: { ...s.loading, [projectId]: false } }))
  },

  addMember: async (projectId, email, role) => {
    const trimmedEmail = email.trim().toLowerCase()
    if ((get().membersByProject[projectId] ?? []).some((m) => m.email.toLowerCase() === trimmedEmail)) {
      return { ok: false, error: 'این کاربر همین حالا عضو پروژه است' }
    }
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', trimmedEmail).maybeSingle()
    if (!existingProfile) {
      return { ok: false, error: 'کاربری با این ایمیل در سامانه یافت نشد — ابتدا باید یک‌بار وارد سامانه شده باشد' }
    }
    const { error } = await supabase.from('im_project_members').insert({ project_id: projectId, user_id: existingProfile.id, role })
    if (error) return { ok: false, error: 'خطا در افزودن عضو — ' + friendlyErrorMessage(error) }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  removeMember: async (projectId, userId) => {
    const { error } = await supabase.from('im_project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: friendlyErrorMessage(error) }
    await get().fetchForProject(projectId)
    return { ok: true }
  },

  changeRole: async (projectId, userId, role) => {
    const { error } = await supabase.from('im_project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId)
    if (error) return { ok: false, error: friendlyErrorMessage(error) }
    await get().fetchForProject(projectId)
    return { ok: true }
  },
}))

/** Current user's role in a given Issue Management project. */
export function useIssuesCurrentRole(projectId: string | null): ImUserRole | null {
  const members = useIssuesMembersStore((s) => (projectId ? (s.membersByProject[projectId] ?? EMPTY_MEMBERS) : EMPTY_MEMBERS))
  const userId = useAuthStore((s) => s.profile?.id)
  return members.find((m) => m.userId === userId)?.role ?? null
}
