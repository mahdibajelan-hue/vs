import { useMemo } from 'react'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'

export interface UserOpt { userId: string; name: string }

/** userId → display name across every project the viewer can see (members are loaded by IssuesApp). */
export function useUserDirectory(): { name: (id: string | null | undefined) => string; all: UserOpt[]; forProject: (projectId: string) => UserOpt[] } {
  const byProject = useIssuesMembersStore((s) => s.membersByProject)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const list of Object.values(byProject)) for (const m of list) map.set(m.userId, m.fullName || m.email)
    return {
      name: (id) => (id ? map.get(id) ?? 'کاربر' : '—'),
      all: [...map.entries()].map(([userId, name]) => ({ userId, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa')),
      forProject: (projectId) => (byProject[projectId] ?? []).map((m) => ({ userId: m.userId, name: m.fullName || m.email })),
    }
  }, [byProject])
}
