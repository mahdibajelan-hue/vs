import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import './masterdata.css'
import { useMasterDataStore } from './store/useMasterDataStore'
import { OverviewPage, type NavTarget } from './pages/OverviewPage'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { PortfoliosPage } from './pages/PortfoliosPage'
import { ProgramsPage } from './pages/ProgramsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { PartiesPage } from './pages/PartiesPage'
import { ProjectWorkspace } from './pages/ProjectWorkspace'
import { ProjectMappingPage } from './pages/ProjectMappingPage'
import { NAV_COLOR } from './lib/colors'
import { DataIntegrityPage } from './pages/DataIntegrityPage'
import { DemoDataPage } from './pages/DemoDataPage'

type Tab = 'overview' | NavTarget | 'mapping' | 'integrity' | 'demo'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'شروع' },
  { id: 'organizations', label: 'سازمان‌ها' },
  { id: 'portfolios', label: 'پورتفولیوها' },
  { id: 'programs', label: 'طرح‌ها' },
  { id: 'projects', label: 'پروژه‌ها' },
  { id: 'parties', label: 'ارکان پروژه‌ها' },
]
const TOOLS: { id: Tab; label: string }[] = [
  { id: 'mapping', label: 'نگاشت پروژه‌ها' },
  { id: 'integrity', label: 'یکپارچگی داده' },
  { id: 'demo', label: 'داده‌های نمایشی' },
]

/**
 * Master data of the platform: organizations, portfolios, programs and projects, how organizations take part in each project,
 * and each project's identity and human-resources structure. Roles and access are managed per user in the «کاربران» tab.
 */
export function MasterDataApp() {
  const [tab, setTab] = useState<Tab>('overview')
  const [openProject, setOpenProject] = useState<{ id: string } | null>(null)
  const loaded = useMasterDataStore((s) => s.loaded)
  const loading = useMasterDataStore((s) => s.loading)
  const fetchAll = useMasterDataStore((s) => s.fetchAll)
  const nav = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)

  useEffect(() => {
    if (!loaded) void fetchAll()
  }, [loaded, fetchAll])

  // the indicator glides to the selected item
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setInd({ x: el.offsetLeft + 12, w: el.offsetWidth - 24 })
  }, [tab, openProject, loaded])

  const open = (id: string) => setOpenProject({ id })
  const go = (t: Tab) => { setOpenProject(null); setTab(t) }

  return (
    <div className="md-root flex h-full min-h-0 flex-col" dir="rtl">
      <div ref={nav} className="md-nav shrink-0 px-3 sm:px-6" role="tablist" aria-label="داده‌های پایه">
        {TABS.map((t) => <button key={t.id} role="tab" className="md-nav-item" style={{ '--c': NAV_COLOR[t.id] } as React.CSSProperties} aria-selected={!openProject && tab === t.id || (openProject !== null && t.id === 'projects')} onClick={() => go(t.id)}>{t.label}</button>)}
        <span className="md-nav-sep" aria-hidden />
        {TOOLS.map((t) => <button key={t.id} role="tab" className="md-nav-item" style={{ '--c': NAV_COLOR[t.id] } as React.CSSProperties} aria-selected={!openProject && tab === t.id} onClick={() => go(t.id)}>{t.label}</button>)}
        {ind && <span className="md-nav-ind" aria-hidden style={{ transform: `translateX(${ind.x}px)`, width: ind.w, left: 0, '--ind': NAV_COLOR[openProject ? 'projects' : tab] } as React.CSSProperties} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        {loading && !loaded ? (
          <div className="flex h-64 items-center justify-center"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--md-accent)' }} aria-label="در حال بارگذاری" /></div>
        ) : openProject ? (
          <ProjectWorkspace key={openProject.id} projectId={openProject.id} onBack={() => setOpenProject(null)} />
        ) : (
          <div key={tab} className="md-in">
            {tab === 'overview' && <OverviewPage go={go} />}
            {tab === 'organizations' && <OrganizationsPage />}
            {tab === 'portfolios' && <PortfoliosPage />}
            {tab === 'programs' && <ProgramsPage />}
            {tab === 'projects' && <ProjectsPage onOpen={open} />}
            {tab === 'parties' && <PartiesPage onOpen={open} />}
            {tab === 'mapping' && <ProjectMappingPage />}
            {tab === 'integrity' && <DataIntegrityPage />}
            {tab === 'demo' && <DemoDataPage />}
          </div>
        )}
      </div>
    </div>
  )
}
