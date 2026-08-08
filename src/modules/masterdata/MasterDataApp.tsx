import { useEffect, useState } from 'react'
import { Building2, Briefcase, FolderTree, FolderKanban, Loader2 } from 'lucide-react'
import { useMasterDataStore } from './store/useMasterDataStore'
import { OrganizationsPage } from './pages/OrganizationsPage'
import { PortfoliosPage } from './pages/PortfoliosPage'
import { ProgramsPage } from './pages/ProgramsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectIdentityPage } from './pages/ProjectIdentityPage'

type Tab = 'organizations' | 'portfolios' | 'programs' | 'projects'

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'organizations', label: 'سازمان‌ها', icon: Building2 },
  { id: 'portfolios', label: 'پورتفولیوها', icon: Briefcase },
  { id: 'programs', label: 'طرح‌ها', icon: FolderTree },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
]

/**
 * RASTA centralized Master Data: Organization → Portfolio → Program → Project → Phase.
 * Every module will eventually reference master_projects.id instead of maintaining its own
 * project identity (see supabase/schema.sql section 12) — this is the authoring surface for
 * that data. Reachable only from inside the admin-gated module (see AdminApp).
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
    <div className="flex h-full min-h-0">
      <nav className="w-48 shrink-0 border-l p-3 space-y-1" style={{ borderColor: 'var(--border-soft)' }}>
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
        ) : (
          <ProjectsPage onOpenProject={setOpenProjectId} />
        )}
      </div>
    </div>
  )
}
