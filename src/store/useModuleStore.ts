import { create } from 'zustand'
import { useProjectContextStore } from './useProjectContextStore'

export type ModuleKey = 'pipepulse' | 'risk' | 'change' | 'issues' | 'admin' | 'reporting' | 'executive' | 'finance' | 'material' | 'execution' | 'engineering' | 'scheduling' | 'pipelinedigitaltwin' | 'competency' | 'estimator' | 'lifecycle' | 'missions' | 'landacq' | 'stagegate' | 'taskissue' | 'supervision'

/** Modules that belong to one project — reached through the radar (see radar/projectNav.ts for their menu). */
export const PROJECT_SCOPED_MODULES = new Set<ModuleKey>(['lifecycle', 'stagegate', 'scheduling', 'engineering', 'material', 'execution', 'finance', 'change', 'risk', 'taskissue', 'issues', 'landacq', 'pipepulse', 'pipelinedigitaltwin'])

/**
 * How a project module was opened: `project` = from the radar, inside the project's command room (sidebar, project fixed);
 * `portfolio` = from Portfolio Management's multi-project views (all projects); null = anywhere else.
 */
export type Workspace = 'project' | 'portfolio' | null

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
  /** Bumped by «صفحهٔ اول ماژول»: RootApp keys the active module on it, so it remounts at its first page. */
  moduleResetKey: number
  goModuleHome: () => void
  workspace: Workspace
  /** Opens a module. Without `workspace`, a jump between project modules stays in the current workspace (e.g. risk → issues inside a project). */
  enterModule: (key: ModuleKey, workspace?: Workspace, tab?: string) => void
  /** The tab the entered module should open on. Read (not consumed) at mount: a render thrown away by Suspense
   *  runs the initializer again, so it stays until the next enterModule / «صفحهٔ اول ماژول» replaces it. */
  entryTab: string | null
  takeEntryTab: () => string | null
  /** One-shot: Project Radar opens on the Risk & Issue Universe instead of its overview. */
  radarUniverse: boolean
  /** "بازگشت به ماژول‌ها" — always the plain launchpad, never Radar. */
  exitToHub: () => void
  /** "بازگشت به رادار" — from inside any module, straight back to Project Radar. */
  backToRadar: () => void
  openRadar: () => void
  closeRadar: () => void
}

export const useModuleStore = create<ModuleState>()((set, get) => ({
  activeModule: null,
  radarOpen: false,
  moduleResetKey: 0,
  workspace: null,
  entryTab: null,
  radarUniverse: false,
  goModuleHome: () => set((s) => ({ moduleResetKey: s.moduleResetKey + 1, entryTab: null })),
  enterModule: (key, workspace, tab) => set((s) => ({
    activeModule: key,
    // re-entering the same module (e.g. project → portfolio view) must remount it so it re-reads the context
    moduleResetKey: s.activeModule === key ? s.moduleResetKey + 1 : s.moduleResetKey,
    workspace: !PROJECT_SCOPED_MODULES.has(key) ? null : workspace !== undefined ? workspace : s.workspace,
    entryTab: tab ?? null,
  })),
  takeEntryTab: () => get().entryTab,
  // the home page is organization-wide: leaving to it lets go of the project the radar had fixed
  exitToHub: () => { useProjectContextStore.getState().clear(); set({ activeModule: null, radarOpen: false, workspace: null, entryTab: null }) },
  backToRadar: () => set({ activeModule: null, radarOpen: true, workspace: null, entryTab: null }),
  openRadar: () => set({ radarOpen: true }),
  closeRadar: () => set({ radarOpen: false }),
}))
