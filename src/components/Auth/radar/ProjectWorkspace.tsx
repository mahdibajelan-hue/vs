import { useEffect, useState, type ReactNode } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { useInboxWork } from '../../../modules/inbox/store/useInboxWork'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { RadarSidebar } from './RadarSidebar'
import { PROJECT_NAV, navModule, projectBadges, type ProjectNavItem } from './projectNav'
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
  const projectOf = useNotificationStore((s) => s.projectOf)
  const work = useInboxWork()
  const [desktop, setDesktop] = useState(wide)
  // desktop: the strip is always there; pinned keeps the full panel open (remembered). Below 1024px: a drawer.
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(KEY) === 'pinned' } catch { return false } })
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = (e: MediaQueryListEvent) => { setDesktop(e.matches); setDrawer(false) }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const pin = (v: boolean) => { setPinned(v); try { localStorage.setItem(KEY, v ? 'pinned' : 'rail') } catch { /* private mode */ } }

  if (!project) return <>{children}</>

  const activeId = PROJECT_NAV.flatMap((g) => g.items).find((i) => active && i.module === navModule(active))?.id ?? ''
  const onItem = (item: ProjectNavItem) => {
    if (!desktop) setDrawer(false)
    const store = useModuleStore.getState()
    if (item.id === 'overview') store.backToRadar()
    else if (item.module && item.module !== (active && navModule(active))) store.enterModule(item.module, 'project')
  }

  return (
    <div className={`pws-main ${desktop ? (pinned ? 'is-pinned' : 'is-rail') : ''}`}>
      {children}
      {!desktop && !drawer && (
        <button type="button" className="pws-tab" onClick={() => setDrawer(true)} title={`منوی پروژه — ${project.officialName}`} aria-label="باز کردن منوی پروژه">
          <PanelRightOpen size={15} aria-hidden />
          <span>منوی پروژه</span>
        </button>
      )}
      <RadarSidebar
        project={project}
        active={activeId}
        canSee={(k) => hasModuleAccess(access, k)}
        badgeFor={projectBadges(notifications, projectOf, projectId, work)}
        desktop={desktop}
        pinned={pinned}
        onPin={pin}
        mobileOpen={drawer}
        onMobileClose={() => setDrawer(false)}
        onItem={onItem}
        onSwitch={() => { useProjectContextStore.getState().clear(); useModuleStore.getState().backToRadar() }}
        onHome={() => useModuleStore.getState().exitToHub()}
      />
    </div>
  )
}
