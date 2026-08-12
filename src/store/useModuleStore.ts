import { create } from 'zustand'

export type ModuleKey = 'pipepulse' | 'risk' | 'issues' | 'admin' | 'reporting' | 'executive' | 'finance' | 'material'

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
