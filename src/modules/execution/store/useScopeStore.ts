import { create } from 'zustand'
import { fitView, projectKind, writeScope, type ExScope, type ProjectKind, type ScopeView } from '../../../lib/projectProfile'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'

const KEY = 'farin.execution.scope'
const read = (): Record<string, ScopeView> => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } }

/** Which scope the execution module shows, per project (remembered in this browser). */
export const useScopeStore = create<{ byProject: Record<string, ScopeView>; setView: (projectId: string, v: ScopeView) => void }>((set) => ({
  byProject: read(),
  setView: (projectId, v) => set((s) => {
    const byProject = { ...s.byProject, [projectId]: v }
    try { localStorage.setItem(KEY, JSON.stringify(byProject)) } catch { /* private mode */ }
    return { byProject }
  }),
}))

export const kindOf = (projectId: string | null | undefined): ProjectKind => projectKind(useMasterDataStore.getState().projects.find((p) => p.id === projectId)?.projectType)
/** The project's profile and the view in force (a remembered view the profile no longer has falls back). */
export function useProjectScope(projectId: string | null | undefined): { kind: ProjectKind; view: ScopeView } {
  const type = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId)?.projectType)
  const saved = useScopeStore((s) => (projectId ? s.byProject[projectId] : undefined))
  const kind = projectKind(type)
  return { kind, view: fitView(saved, kind) }
}
/** The scope a row created now in this project is tagged with (see writeScope). */
export function currentWriteScope(projectId: string): ExScope | null {
  const kind = kindOf(projectId)
  return writeScope(kind, fitView(useScopeStore.getState().byProject[projectId], kind))
}
