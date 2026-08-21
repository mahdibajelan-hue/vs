import { useEffect, useState } from 'react'
import { Building2, Briefcase, FolderTree, FolderKanban, Loader2, ShieldCheck, Link2, ClipboardCheck, Database, Menu, X } from 'lucide-react'
import { useMasterDataStore } from './store/useMasterDataStore'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { PortfoliosPage } from './pages/PortfoliosPage'
import { ProgramsPage } from './pages/ProgramsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectIdentityPage } from './pages/ProjectIdentityPage'
import { RolesPermissionsPage } from './pages/RolesPermissionsPage'
import { ProjectMappingPage } from './pages/ProjectMappingPage'
import { DataIntegrityPage } from './pages/DataIntegrityPage'
import { DemoDataPage } from './pages/DemoDataPage'
import { ContextSwitcher } from './components/ContextSwitcher'

type Tab = 'organizations' | 'portfolios' | 'programs' | 'projects' | 'access' | 'mapping' | 'integrity' | 'demo'

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'organizations', label: 'سازمان‌ها', icon: Building2 },
  { id: 'portfolios', label: 'پورتفولیوها', icon: Briefcase },
  { id: 'programs', label: 'طرح‌ها', icon: FolderTree },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
  { id: 'access', label: 'نقش‌ها و دسترسی‌ها', icon: ShieldCheck },
  { id: 'mapping', label: 'نگاشت پروژه‌ها', icon: Link2 },
  { id: 'integrity', label: 'یکپارچگی داده', icon: ClipboardCheck },
  { id: 'demo', label: 'داده‌های نمایشی', icon: Database },
]

/**
 * RASTA centralized Master Data: Organization → Portfolio → Program → Project → Phase, plus
 * the Role/Permission/Scope access model and the Project Mapping layer that connects Risk/
 * Issue/PipePulse's own project registries to a master_projects row (see
 * supabase/schema.sql sections 12-13). Reachable only from inside the admin-gated module
 * (see AdminApp).
 */
export function MasterDataApp() {
  const [tab, setTab] = useState<Tab>('organizations')
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const loaded = useMasterDataStore((s) => s.loaded)
  const loading = useMasterDataStore((s) => s.loading)
  const fetchAll = useMasterDataStore((s) => s.fetchAll)

  useEffect(() => {
    if (!loaded) fetchAll()
  }, [loaded, fetchAll])

  if (openProjectId) {
    return <ProjectIdentityPage projectId={openProjectId} onBack={() => setOpenProjectId(null)} />
  }

  const currentTabLabel = TABS.find((t) => t.id === tab)?.label ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-2.5 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 lg:hidden"
        >
          <Menu size={14} /> {currentTabLabel}
        </button>
        <ContextSwitcher />
      </div>

      <div className="flex flex-1 min-h-0">
        {mobileNavOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileNavOpen(false)} />}
        <nav
          className={`fixed inset-y-0 right-0 z-40 flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-l bg-[var(--bg-panel-solid)] p-3 transition-transform duration-200 lg:static lg:z-auto lg:w-52 lg:translate-x-0 lg:bg-transparent ${
            mobileNavOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <div className="mb-1 flex items-center justify-between px-1 lg:hidden">
            <span className="text-xs font-bold text-secondary">داده‌های پایه</span>
            <button onClick={() => setMobileNavOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-white/5">
              <X size={16} />
            </button>
          </div>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id)
                setMobileNavOpen(false)
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                tab === id ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {loading && !loaded ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-brand-400" />
            </div>
          ) : tab === 'organizations' ? (
            <OrganizationsPage />
          ) : tab === 'portfolios' ? (
            <PortfoliosPage />
          ) : tab === 'programs' ? (
            <ProgramsPage />
          ) : tab === 'projects' ? (
            <ProjectsPage onOpenProject={setOpenProjectId} />
          ) : tab === 'access' ? (
            <RolesPermissionsPage />
          ) : tab === 'mapping' ? (
            <ProjectMappingPage />
          ) : tab === 'integrity' ? (
            <DataIntegrityPage />
          ) : (
            <DemoDataPage />
          )}
        </div>
      </div>
    </div>
  )
}
