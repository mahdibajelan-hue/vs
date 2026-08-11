import { useEffect, useState } from 'react'
import { Building2, Briefcase, FolderTree, FolderKanban, Loader2, ShieldCheck, Link2, ClipboardCheck, Database } from 'lucide-react'
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
  const loaded = useMasterDataStore((s) => s.loaded)
  const loading = useMasterDataStore((s) => s.loading)
  const fetchAll = useMasterDataStore((s) => s.fetchAll)

  useEffect(() => {
    if (!loaded) fetchAll()
  }, [loaded, fetchAll])

  if (openProjectId) {
    return <ProjectIdentityPage projectId={openProjectId} onBack={() => setOpenProjectId(null)} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-2.5 flex justify-end" style={{ borderColor: 'var(--border-soft)' }}>
        <ContextSwitcher />
      </div>

      <div className="flex flex-1 min-h-0">
        <nav className="w-52 shrink-0 border-l p-3 space-y-1 overflow-y-auto" style={{ borderColor: 'var(--border-soft)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
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
