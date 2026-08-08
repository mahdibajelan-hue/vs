import { create } from 'zustand'

// 'reporting' is reserved for the future Intelligent Reporting module — not yet routable
// (its hub card stays status: 'soon' until RootApp gains a real branch for it).
export type ModuleKey = 'pipepulse' | 'risk' | 'issues' | 'admin' | 'reporting'

interface ModuleState {
  /** null = show the hub. Session-only (not persisted) so every fresh visit starts at the hub. */
  activeModule: ModuleKey | null
  enterModule: (key: ModuleKey) => void
  exitToHub: () => void
}

export const useModuleStore = create<ModuleState>()((set) => ({
  activeModule: null,
  enterModule: (key) => set({ activeModule: key }),
  exitToHub: () => set({ activeModule: null }),
}))
