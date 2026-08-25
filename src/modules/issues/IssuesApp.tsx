import { useEffect, useState } from 'react'
import { AlertCircle, BarChart3, FolderKanban, Info, LayoutDashboard, Loader2, Network, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { fetchModuleProjectMappings } from '../masterdata/lib/hierarchyRollup'
import { useIssuesStore } from './store/useIssuesStore'
import { useIssuesMembersStore } from './store/useIssuesMembersStore'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { IssuesPage } from './pages/IssuesPage'
import { ReportPage } from './pages/ReportPage'
import { PortfolioRollupPage } from './pages/PortfolioRollupPage'
import { AboutPage } from './pages/AboutPage'
import { NewIssueModal } from './components/NewIssueModal'
import { IssueDetailModal } from './components/IssueDetailModal'
import './issues.css'

type Tab = 'dashboard' | 'projects' | 'issues' | 'report' | 'portfolio' | 'about'

// Per-project member management (پیگیری/تایید roles) lives inside هر پروژه (ProjectsPage ->
// MembersModal) — a standalone cross-project "کاربران" tab here duplicated that and is gone;
// cross-module user/access administration is the dedicated «مدیریت کاربران» hub module.
const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban },
  { id: 'issues', label: 'مشکلات', icon: AlertCircle },
  { id: 'report', label: 'گزارش تاخیر', icon: BarChart3 },
  { id: 'portfolio', label: 'تحلیل سه‌سطحی', icon: Network },
  { id: 'about', label: 'درباره ما', icon: Info },
]

export function IssuesApp({ onExitToHub }: { onExitToHub: () => void }) {
  const currentUser = useAuthStore((s) => s.currentUser())
  const loading = useIssuesStore((s) => s.loading)
  const projects = useIssuesStore((s) => s.projects)
  const fetchAll = useIssuesStore((s) => s.fetchAll)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const fetchMembersForProject = useIssuesMembersStore((s) => s.fetchForProject)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [newIssueProjectId, setNewIssueProjectId] = useState<string | null | 'pick'>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrived here from Project Radar with a project already in context: open straight into that
  // project's issue list instead of the dashboard.
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  useEffect(() => {
    if (!contextProjectId) return
    fetchModuleProjectMappings('issues').then((map) => {
      const resolved = map.get(contextProjectId)
      if (resolved) {
        setProjectFilter(resolved)
        setTab('projects')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const p of projects) {
      if (!(p.id in membersByProject)) fetchMembersForProject(p.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  const openNewIssue = (projectId?: string) => setNewIssueProjectId(projectId ?? 'pick')

  return (
    <div className="im-root">
      <div className="im-mobile-topbar">
        <ModuleHeaderActions onExitToHub={onExitToHub} />
        <div className="im-brand-name" style={{ fontSize: 14 }}>
          رصد
        </div>
      </div>

      <div className="im-shell">
        <aside className="im-sidebar">
          <div className="im-brand">
            <div className="im-brand-mark">ر</div>
            <div>
              <div className="im-brand-name">رصد</div>
              <div className="im-brand-sub">پیگیری مشکلات پروژه</div>
            </div>
          </div>
          <nav className="im-grid" style={{ gap: 2 }}>
            {NAV.map((n) => (
              <button key={n.id} className={`im-nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
                <n.icon size={18} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="im-sidebar-footer">
            <div className="im-me-card">
              <div className="im-avatar">{(currentUser?.fullName || currentUser?.email || '?')[0]}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="im-me-name">{currentUser?.fullName || currentUser?.email}</div>
              </div>
            </div>
            <div className="mt-2">
              <ModuleHeaderActions onExitToHub={onExitToHub} />
            </div>
          </div>
        </aside>

        <main className="im-shell-main">
          <StorageErrorBanner />
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--im-amber)' }} />
            </div>
          ) : tab === 'dashboard' ? (
            <DashboardPage onSelectIssue={setSelectedIssueId} />
          ) : tab === 'projects' ? (
            <ProjectsPage
              activeProjectId={projectFilter}
              onOpenProject={setProjectFilter}
              onBack={() => setProjectFilter(null)}
              onSelectIssue={setSelectedIssueId}
              onNewIssue={openNewIssue}
            />
          ) : tab === 'issues' ? (
            <IssuesPage onSelectIssue={setSelectedIssueId} onNewIssue={() => openNewIssue()} />
          ) : tab === 'report' ? (
            <ReportPage onSelectIssue={setSelectedIssueId} />
          ) : tab === 'portfolio' ? (
            <PortfolioRollupPage onSelectIssue={setSelectedIssueId} />
          ) : (
            <AboutPage />
          )}
        </main>

        <div className="im-bottom-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`im-bn-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
              <n.icon size={20} />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
        <button className="im-fab" onClick={() => openNewIssue()}>
          <Plus size={26} />
        </button>
      </div>

      {newIssueProjectId !== null && (
        <NewIssueModal defaultProjectId={newIssueProjectId === 'pick' ? null : newIssueProjectId} onClose={() => setNewIssueProjectId(null)} />
      )}
      {selectedIssueId && <IssueDetailModal issueId={selectedIssueId} onClose={() => setSelectedIssueId(null)} />}
    </div>
  )
}
