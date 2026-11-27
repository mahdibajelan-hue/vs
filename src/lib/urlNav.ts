import { MODULE_KEYS, PROJECT_SCOPED_MODULES, useModuleStore, type ModuleKey, type Workspace } from '../store/useModuleStore'
import { useProjectContextStore } from '../store/useProjectContextStore'
import { authInUrl, installUrlState, locIsBare, openPlace, parseLoc, schedule, setModuleCheck, setNavModule, type Loc } from './urlState'

const isModule = (m: string): m is ModuleKey => (MODULE_KEYS as readonly string[]).includes(m)
const asWorkspace = (m: ModuleKey, w: string): Workspace => (PROJECT_SCOPED_MODULES.has(m) && (w === 'project' || w === 'portfolio') ? w : null)

/** put the module shell where the address says: the module, how it was opened, and the project a radar entry fixes */
function applyShell(x: Loc) {
  const st = useModuleStore.getState()
  if (!x.module) {
    setNavModule(null)
    if (!x.radar) useProjectContextStore.getState().clear() // the home page is organization-wide (as «بازگشت به ماژول‌ها»)
    if (st.activeModule !== null || st.radarOpen !== x.radar || st.workspace !== null) useModuleStore.setState({ activeModule: null, radarOpen: x.radar, workspace: null, entryTab: null })
    return
  }
  const m = x.module as ModuleKey, w = asWorkspace(m, x.w)
  if (w === 'project' && x.p && useProjectContextStore.getState().projectId !== x.p) useProjectContextStore.getState().setProject(x.p)
  setNavModule(m)
  if (st.activeModule !== m || st.workspace !== w) useModuleStore.setState({ activeModule: m, workspace: w, entryTab: null })
}

/** the place the address named when the page opened — kept for a sign-in that happens on the hub before it can open */
let pending: Loc | null = null
/**
 * After a sign-in: open the place a link named (true), or say there is none (false → the hub). Asked once; a refresh
 * of a signed-in user just drops it (the page is already there).
 */
export function takeLinkedPlace(open: boolean): boolean {
  const x = pending; pending = null
  if (!x || !open) return false
  openPlace(x)
  return true
}

/**
 * Wire the address bar to the app (see urlState.ts). On load an address that names a place opens it — a copied
 * link, a refresh — while a bare address keeps whatever the tab's session last showed.
 */
export function installUrlNav() {
  setModuleCheck(isModule)
  installUrlState({
    read: () => { const s = useModuleStore.getState(); return { module: s.activeModule, radar: s.radarOpen, w: s.workspace ?? '', ctxProject: useProjectContextStore.getState().projectId ?? '' } },
    apply: applyShell,
  })
  if (!authInUrl() && !locIsBare()) { pending = parseLoc(); applyShell(pending) }
  useModuleStore.subscribe(schedule)
  useProjectContextStore.subscribe(schedule)
  schedule()
}
