import { create } from 'zustand'

export type ModuleKey = 'pipepulse' | 'risk' | 'issues' | 'admin' | 'reporting' | 'executive' | 'finance' | 'material' | 'pipelinedigitaltwin' | 'competency' | 'estimator' | 'lifecycle'

interface ModuleState {
  /** null = show the hub (the 6-card launchpad, or Project Radar if `radarOpen`). Session-only
   * (not persisted) so every fresh visit starts at the hub. */
  activeModule: ModuleKey | null
  /** Whether the hub should open straight into Project Radar instead of the plain launchpad —
   * lifted up here (rather than local state in ProjectControlCenter) so it survives the remount
   * that happens whenever a module is entered/exited, letting "بازگشت به رادار" from inside any
   * module land back on Radar specifically, distinct from "بازگشت به ماژول‌ها" which always goes
   * to the plain launchpad. */
  radarOpen: boolean
  enterModule: (key: ModuleKey) => void
  /** "بازگشت به ماژول‌ها" — always the plain launchpad, never Radar. */
  exitToHub: () => void
  /** "بازگشت به رادار" — from inside any module, straight back to Project Radar. */
  backToRadar: () => void
  openRadar: () => void
  closeRadar: () => void
}

export const useModuleStore = create<ModuleState>()((set) => ({
  activeModule: null,
  radarOpen: false,
  enterModule: (key) => set({ activeModule: key }),
  exitToHub: () => set({ activeModule: null, radarOpen: false }),
  backToRadar: () => set({ activeModule: null, radarOpen: true }),
  openRadar: () => set({ radarOpen: true }),
  closeRadar: () => set({ radarOpen: false }),
}))
