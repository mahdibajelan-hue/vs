import { useEffect, useState, type ReactNode } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { RadarSidebar } from './RadarSidebar'
import { PROJECT_NAV, navModule, type ProjectNavItem } from './projectNav'
import './radarShell.css'

const KEY = 'farin.workspace.sidebar'
const wide = () => typeof window !== 'undefined' && window.innerWidth >= 1024

/**
 * اتاق فرمان پروژه — a project module opened from the radar keeps the radar's sidebar beside it, with the project fixed.
 * The module itself already scopes to `useProjectContextStore`; its own project picker is hidden here (see .pws-main in radarShell.css).
 */
export function ProjectWorkspace({ children }: { children: ReactNode }) {
  const active = useModuleStore((s) => s.activeModule)
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const access = useModuleAccessStore((s) => s.accessibleModules)
  const notifications = useNotificationStore((s) => s.items)
  const [desktop, setDesktop] = useState(wide)
  const [open, setOpen] = useState(() => {
    if (!wide()) return false
    try { return localStorage.getItem(KEY) !== 'closed' } catch { return true }
  })

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = (e: MediaQueryListEvent) => { setDesktop(e.matches); if (!e.matches) setOpen(false) }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const setOpenSaved = (v: boolean) => { setOpen(v); if (desktop) try { localStorage.setItem(KEY, v ? 'open' : 'closed') } catch { /* private mode */ } }

  if (!project) return <>{children}</>

  const activeId = PROJECT_NAV.flatMap((g) => g.items).find((i) => active && i.module === navModule(active))?.id ?? ''
  const onItem = (item: ProjectNavItem) => {
    if (!desktop) setOpen(false)
    const store = useModuleStore.getState()
    if (item.id === 'overview') store.backToRadar()
    else if (item.id === 'universe') { useModuleStore.setState({ radarUniverse: true }); store.backToRadar() }
    else if (item.module && item.module !== (active && navModule(active))) store.enterModule(item.module, 'project')
  }

  return (
    <div className={`pws-main ${open && desktop ? 'is-pushed' : ''}`}>
      {children}
      {!open && (
        <button type="button" className="pws-tab" onClick={() => setOpenSaved(true)} title={`منوی پروژه — ${project.officialName}`} aria-label="باز کردن منوی پروژه">
          <PanelRightOpen size={15} aria-hidden />
          <span>منوی پروژه</span>
        </button>
      )}
      <RadarSidebar
        project={project}
        active={activeId}
        canSee={(k) => hasModuleAccess(access, k)}
        badgeFor={(k) => notifications.filter((n) => navModule(n.module) === k).length}
        open={open}
        overlay={!desktop}
        onItem={onItem}
        onSwitch={() => { useProjectContextStore.getState().clear(); useModuleStore.getState().backToRadar() }}
        onHome={() => useModuleStore.getState().exitToHub()}
        onClose={() => setOpenSaved(false)}
      />
    </div>
  )
}
