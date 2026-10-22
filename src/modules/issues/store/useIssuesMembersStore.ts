import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImUserRole } from '../types'

/**
 * The module has NO user list of its own any more: people come from the central platform (User Management: profiles,
 * project scope and project-role assignments) through the `im_people` RPC. The `role` below is only the module-level
 * capability used by the UI (admin = platform admin or legacy project admin, pursuer = everyone else with project access);
 * issue-level roles (owner / follow-up / pursuer / approver) are fields of the issue itself.
 */
export interface ImProjectMember {
  userId: string
  email: string
  fullName: string
  role: ImUserRole
  position: string
  organization: string
  projectRoles: string[]
}

/** Stable reference for "no members yet" — a literal `?? []` in a selector would return a fresh
 * array every call and cause useSyncExternalStore to loop forever re-rendering. */
export const EMPTY_MEMBERS: ImProjectMember[] = []

interface PeopleRow { id: string; full_name: string; email: string; position_title: string; organization: string; project_roles: string[] | null; is_admin: boolean }

interface IssuesMembersState {
  membersByProject: Record<string, ImProjectMember[]>
  loading: Record<string, boolean>
  fetchForProject: (projectId: string) => Promise<void>
  /** several projects at once: one query for the legacy roles and one RPC (im_people_many) for the people directory */
  fetchMany: (projectIds: string[]) => Promise<void>
}

export const useIssuesMembersStore = create<IssuesMembersState>()((set, get) => ({
  membersByProject: {},
  loading: {},

  fetchMany: async (projectIds) => {
    const ids = projectIds.filter((id) => !get().loading[id])
    if (!ids.length) return
    set((s) => ({ loading: { ...s.loading, ...Object.fromEntries(ids.map((id) => [id, true])) } }))
    const [legacy, people] = await Promise.all([
      supabase.from('im_project_members').select('project_id, user_id, role').in('project_id', ids),
      supabase.rpc('im_people_many', { p_projects: ids }),
    ])
    const rolesBy = new Map<string, Map<string, ImUserRole>>()
    for (const r of (legacy.data ?? []) as { project_id: string; user_id: string; role: ImUserRole }[]) { const m = rolesBy.get(r.project_id) ?? new Map(); m.set(r.user_id, r.role); rolesBy.set(r.project_id, m) }
    const next: Record<string, ImProjectMember[]> = Object.fromEntries(ids.map((id) => [id, []]))
    for (const p of (people.data ?? []) as (PeopleRow & { project_id: string })[]) {
      next[p.project_id]?.push({ userId: p.id, email: p.email ?? '', fullName: p.full_name ?? '', position: p.position_title ?? '', organization: p.organization ?? '', projectRoles: p.project_roles ?? [], role: p.is_admin ? 'admin' : rolesBy.get(p.project_id)?.get(p.id) ?? 'pursuer' })
    }
    set((s) => ({ membersByProject: { ...s.membersByProject, ...next }, loading: { ...s.loading, ...Object.fromEntries(ids.map((id) => [id, false])) } }))
  },

  fetchForProject: async (projectId) => {
    set((s) => ({ loading: { ...s.loading, [projectId]: true } }))
    const [people, legacy] = await Promise.all([
      supabase.rpc('im_people', { p_project: projectId }),
      supabase.from('im_project_members').select('user_id, role').eq('project_id', projectId),
    ])
    const legacyRole = new Map(((legacy.data ?? []) as { user_id: string; role: ImUserRole }[]).map((r) => [r.user_id, r.role]))
    const members: ImProjectMember[] = ((people.data ?? []) as PeopleRow[]).map((p) => ({
      userId: p.id, email: p.email ?? '', fullName: p.full_name ?? '', position: p.position_title ?? '', organization: p.organization ?? '', projectRoles: p.project_roles ?? [],
      role: p.is_admin ? 'admin' : legacyRole.get(p.id) ?? 'pursuer',
    }))
    set((s) => ({ membersByProject: { ...s.membersByProject, [projectId]: members }, loading: { ...s.loading, [projectId]: false } }))
  },
}))

/** Current user's capability in a project: platform admins always manage; otherwise the directory role. */
export function useIssuesCurrentRole(projectId: string | null): ImUserRole | null {
  const members = useIssuesMembersStore((s) => (projectId ? (s.membersByProject[projectId] ?? EMPTY_MEMBERS) : EMPTY_MEMBERS))
  const userId = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin)
  if (isAdmin) return 'admin'
  return members.find((m) => m.userId === userId)?.role ?? null
}
