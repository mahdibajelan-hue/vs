import { useEffect, useState } from 'react'
import { BarChart3, ClipboardList, FolderKanban, Gauge, Info, LayoutDashboard, ListChecks, Loader2, MoreHorizontal, Network, Plus, Settings2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { fetchModuleProjectMappings } from '../masterdata/lib/hierarchyRollup'
import { useIssuesStore } from './store/useIssuesStore'
import { useIssuesMembersStore } from './store/useIssuesMembersStore'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RegisterPage } from './pages/RegisterPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { KpiReportPage } from './pages/KpiReportPage'
import { SettingsPage } from './pages/SettingsPage'
import { useIssueWorkStore } from './store/useIssueWorkStore'
import { useIssueConfigStore } from './store/useIssueConfigStore'
import type { IssueFilter } from './lib/imRegister'
import { ReportPage } from './pages/ReportPage'
import { PortfolioRollupPage } from './pages/PortfolioRollupPage'
import { AboutPage } from './pages/AboutPage'
import { NewIssueModal } from './components/NewIssueModal'
import { IssueDrawer } from './components/IssueDrawer'
import './issues.css'

type Tab = 'dashboard' | 'mywork' | 'issues' | 'projects' | 'kpi' | 'report' | 'portfolio' | 'settings' | 'about'

// Per-project member management (پیگیری/تایید roles) lives inside هر پروژه (ProjectsPage ->
// MembersModal) — a standalone cross-project "کاربران" tab here duplicated that and is gone;
// cross-module user/access administration is the dedicated «مدیریت کاربران» hub module.
const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; primary?: boolean }[] = [
  { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, primary: true },
  { id: 'mywork', label: 'کارهای من', icon: ListChecks, primary: true },
  { id: 'issues', label: 'مسائل', icon: ClipboardList, primary: true },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban, primary: true },
  { id: 'kpi', label: 'شاخص‌ها', icon: Gauge },
  { id: 'report', label: 'گزارش تاخیر', icon: BarChart3 },
  { id: 'portfolio', label: 'تحلیل سه‌سطحی', icon: Network },
  { id: 'settings', label: 'تنظیمات و قوانین', icon: Settings2 },
  { id: 'about', label: 'درباره ما', icon: Info },
]

export function IssuesApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
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
  const [drawerTab, setDrawerTab] = useState<'overview' | 'tasks' | 'extensions'>('overview')
  const [registerFilter, setRegisterFilter] = useState<Partial<IssueFilter> | undefined>(undefined)
  const [registerKey, setRegisterKey] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const issuesCount = useIssuesStore((st) => st.issues.length)
  const fetchWork = useIssueWorkStore((st) => st.fetchAll)
  const cfgLoaded = useIssueConfigStore((st) => st.loaded)
  const fetchCfg = useIssueConfigStore((st) => st.fetch)
  const openIssue = (id: string, tab: 'overview' | 'tasks' | 'extensions' = 'overview') => { setDrawerTab(tab); setSelectedIssueId(id) }
  const goRegister = (f?: Partial<IssueFilter>) => { setRegisterFilter(f); setRegisterKey((k) => k + 1); setTab('issues') }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (!cfgLoaded) fetchCfg() }, [cfgLoaded, fetchCfg])
  // tasks/extensions follow the issue list (reloaded whenever the set of visible issues changes)
  useEffect(() => { if (!loading) fetchWork() }, [loading, issuesCount, fetchWork])

  // Arrived here from Project Radar with a project already in context: open straight into that
  // project's issue list instead of the dashboard, and stay locked to it — hide every
  // cross-project view (dashboard, all-issues list, report, portfolio rollup) so there's no way
  // to wander back to a list of other projects.
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [lockedToProject, setLockedToProject] = useState(false)
  useEffect(() => {
    if (!contextProjectId) return
    fetchModuleProjectMappings('issues').then((map) => {
      const resolved = map.get(contextProjectId)
      if (resolved) {
        setProjectFilter(resolved)
        setTab('projects')
        setLockedToProject(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrived from a mission finding («مشاهده در مدیریت Issue»): open that issue once the list has loaded.
  const pendingLink = useDeepLinkStore((s) => s.pending)
  const clearLink = useDeepLinkStore((s) => s.clear)
  useEffect(() => {
    if (!loading && pendingLink?.module === 'issues') {
      openIssue(pendingLink.recordId)
      clearLink()
    }
  }, [loading, pendingLink, clearLink])

  const visibleNav = lockedToProject ? NAV.filter((n) => n.id === 'projects' || n.id === 'about') : NAV

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
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
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
            {visibleNav.map((n) => (
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
              <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
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
            <DashboardPage onSelectIssue={openIssue} onOpenMyWork={() => setTab('mywork')} onOpenRegister={(f) => goRegister({ stage: 'active', ...f })} />
          ) : tab === 'mywork' ? (
            <MyWorkPage onOpen={openIssue} />
          ) : tab === 'projects' ? (
            <ProjectsPage
              activeProjectId={projectFilter}
              onOpenProject={setProjectFilter}
              onBack={() => setProjectFilter(null)}
              onSelectIssue={openIssue}
              onNewIssue={openNewIssue}
            />
          ) : tab === 'issues' ? (
            <RegisterPage key={registerKey} onSelectIssue={openIssue} onNewIssue={() => openNewIssue()} initialFilter={registerFilter} />
          ) : tab === 'kpi' ? (
            <KpiReportPage onSelectIssue={openIssue} />
          ) : tab === 'settings' ? (
            <SettingsPage />
          ) : tab === 'report' ? (
            <ReportPage onSelectIssue={openIssue} />
          ) : tab === 'portfolio' ? (
            <PortfolioRollupPage onSelectIssue={openIssue} />
          ) : (
            <AboutPage />
          )}
        </main>

        <div className="im-bottom-nav">
          {NAV.filter((n) => n.primary).map((n) => (
            <button key={n.id} className={`im-bn-item ${tab === n.id ? 'active' : ''}`} onClick={() => { setMoreOpen(false); setTab(n.id) }}>
              <n.icon size={20} />
              <span>{n.label}</span>
            </button>
          ))}
          <button className={`im-bn-item ${moreOpen || !NAV.find((n) => n.id === tab)?.primary ? 'active' : ''}`} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
            <MoreHorizontal size={20} />
            <span>بیشتر</span>
          </button>
        </div>
        {moreOpen && (
          <div className="im-more-sheet" role="menu">
            {NAV.filter((n) => !n.primary).map((n) => (
              <button key={n.id} role="menuitem" className={`im-nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => { setTab(n.id); setMoreOpen(false) }}>
                <n.icon size={18} />
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        )}
        <button className="im-fab" onClick={() => openNewIssue()}>
          <Plus size={26} />
        </button>
      </div>

      {newIssueProjectId !== null && (
        <NewIssueModal defaultProjectId={newIssueProjectId === 'pick' ? null : newIssueProjectId} onClose={() => setNewIssueProjectId(null)} onCreated={(id) => openIssue(id)} />
      )}
      {selectedIssueId && <IssueDrawer key={selectedIssueId + drawerTab} issueId={selectedIssueId} initialTab={drawerTab} onClose={() => setSelectedIssueId(null)} />}
    </div>
  )
}
