import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpen, Building2, Plus, Radar, Telescope, Bell, CalendarDays, CircleHelp, ClipboardCheck, Gauge, Home, ListChecks, Loader2, Network, OctagonAlert, PieChart, Scale, Settings2, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { fetchModuleProjectMappings } from '../masterdata/lib/hierarchyRollup'
import { useIssuesStore } from './store/useIssuesStore'
import { useIssuesMembersStore } from './store/useIssuesMembersStore'
import { useIssueWorkStore } from './store/useIssueWorkStore'
import { useIssueConfigStore } from './store/useIssueConfigStore'
import { useDecisionStore } from './store/useDecisionStore'
import { HubPage } from './pages/HubPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RegisterPage } from './pages/RegisterPage'
import { TrackingPage } from './pages/TrackingPage'
import { CalendarPage } from './pages/CalendarPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { KpiReportPage } from './pages/KpiReportPage'
import { ReportPage } from './pages/ReportPage'
import { PortfolioRollupPage } from './pages/PortfolioRollupPage'
import { PortfolioInsightsPage } from './pages/PortfolioInsightsPage'
import { DecisionsPage } from './pages/DecisionsPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpPage } from './pages/HelpPage'
import { NewIssueModal } from './components/NewIssueModal'
import { IssueDrawer } from './components/IssueDrawer'
import { HelpButton } from './components/Help'
import type { HelpKey } from './lib/help'
import type { IssueFilter } from './lib/imRegister'
import './issues.css'

const TaskIssueApp = lazy(() => import('../taskissue/TaskIssueApp').then((m) => ({ default: m.TaskIssueApp })))

export type Tab = 'home' | 'issues' | 'tracking' | 'calendar' | 'mywork' | 'decisions' | 'tower' | 'kpi' | 'insights' | 'notifications' | 'knowledge' | 'projects' | 'report' | 'portfolio' | 'field' | 'settings' | 'help'
type DrawerTab = 'overview' | 'tasks' | 'extensions' | 'decisions'

const NAV: { id: Tab; label: string; icon: LucideIcon; color: string; help: HelpKey }[] = [
  { id: 'home', label: 'خانه', icon: Home, color: '#f59e0b', help: 'hub' },
  { id: 'issues', label: 'مسائل', icon: OctagonAlert, color: '#f97316', help: 'issues' },
  { id: 'tracking', label: 'پیگیری یکپارچه', icon: ListChecks, color: '#0ea5e9', help: 'tracking' },
  { id: 'calendar', label: 'تقویم کاری', icon: CalendarDays, color: '#eab308', help: 'calendar' },
  { id: 'mywork', label: 'کارهای من', icon: ClipboardCheck, color: '#ef4444', help: 'mywork' },
  { id: 'decisions', label: 'تصمیم‌ها', icon: Scale, color: '#8b5cf6', help: 'decisions' },
  { id: 'tower', label: 'برج کنترل', icon: Gauge, color: '#6366f1', help: 'tower' },
  { id: 'kpi', label: 'شاخص‌ها', icon: PieChart, color: '#22c55e', help: 'kpi' },
  { id: 'insights', label: 'هوش پورتفولیو', icon: Telescope, color: '#14b8a6', help: 'insights' },
  { id: 'notifications', label: 'اعلان و تشدید', icon: Bell, color: '#f43f5e', help: 'notifications' },
  { id: 'knowledge', label: 'دانش', icon: BookOpen, color: '#ec4899', help: 'knowledge' },
  { id: 'projects', label: 'پروژه‌ها', icon: Building2, color: '#0891b2', help: 'projects' },
  { id: 'report', label: 'گزارش تأخیر', icon: BarChart3, color: '#fb923c', help: 'lateReport' },
  { id: 'portfolio', label: 'تحلیل سه‌سطحی', icon: Network, color: '#a78bfa', help: 'rollup' },
  { id: 'field', label: 'پایش میدانی', icon: Radar, color: '#d97706', help: 'field' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#94a3b8', help: 'settings' },
  { id: 'help', label: 'راهنما', icon: CircleHelp, color: '#64748b', help: 'hub' },
]

/** مدیریت موانع و اقدامات — Issue & Task Management. Users, projects and access come from the central platform. */
export function IssuesApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const loading = useIssuesStore((s) => s.loading)
  const projects = useIssuesStore((s) => s.projects)
  const scope = useIssuesStore((s) => s.scopeProjectId)
  const setScope = useIssuesStore((s) => s.setScope)
  const fetchAll = useIssuesStore((s) => s.fetchAll)
  const issuesCount = useIssuesStore((s) => s.issues.length)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const fetchMembersForProject = useIssuesMembersStore((s) => s.fetchForProject)
  const fetchWork = useIssueWorkStore((s) => s.fetchAll)
  const cfgLoaded = useIssueConfigStore((s) => s.loaded)
  const fetchCfg = useIssueConfigStore((s) => s.fetch)
  const fetchDecisions = useDecisionStore((s) => s.fetchAll)
  const [tab, setTab] = useState<Tab>('home')
  const [newIssueProjectId, setNewIssueProjectId] = useState<string | null | 'pick'>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview')
  const [registerFilter, setRegisterFilter] = useState<Partial<IssueFilter> | undefined>(undefined)
  const [registerKey, setRegisterKey] = useState(0)

  const openIssue = (id: string, t: DrawerTab = 'overview') => { setDrawerTab(t); setSelectedIssueId(id) }
  const goRegister = (f?: Partial<IssueFilter>) => { setRegisterFilter(f); setRegisterKey((k) => k + 1); setTab('issues') }
  const openNew = (projectId?: string) => setNewIssueProjectId(projectId ?? 'pick')

  useEffect(() => { fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => { if (!cfgLoaded) fetchCfg() }, [cfgLoaded, fetchCfg])
  useEffect(() => { if (!loading) { fetchWork(); fetchDecisions() } }, [loading, issuesCount, fetchWork, fetchDecisions])
  useEffect(() => { for (const p of projects) if (!(p.id in membersByProject)) fetchMembersForProject(p.id) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projects])

  // Arrived from Project Radar with a project in context: the whole module is scoped to that project (and the picker is hidden).
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!contextProjectId) return
    fetchModuleProjectMappings('issues').then((map) => {
      const resolved = map.get(contextProjectId)
      if (resolved) { setScope(resolved); setTab('tracking'); setLocked(true) }
    })
    return () => { if (useIssuesStore.getState().scopeProjectId !== 'all') setScope('all') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrived from a mission finding / risk / lifecycle link: open that issue once the list has loaded.
  const pendingLink = useDeepLinkStore((s) => s.pending)
  const clearLink = useDeepLinkStore((s) => s.clear)
  useEffect(() => {
    if (!loading && pendingLink?.module === 'issues') { openIssue(pendingLink.recordId); clearLink() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pendingLink, clearLink])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])

  const go = (t: Tab) => setTab(t)

  return (
    <div className="im-root" dir="rtl">
      <header className="im-head">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden><Workflow size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">مدیریت موانع و اقدامات</h1>
              <p className="im-head-eyebrow">Issue &amp; Task Management</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {!locked && projects.length > 1 && (
              <select className="im-select-pill" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="پروژه">
                <option value="all">همهٔ پروژه‌ها</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.shortCode ? p.shortCode + ' · ' : ''}{p.name}</option>)}
              </select>
            )}
            {tab !== 'help' && <HelpButton topic={cur.help} />}
            <button className="im-btn im-btn-primary im-btn-lg" onClick={() => openNew()}><Plus size={18} strokeWidth={2.6} /> مسئلهٔ جدید</button>
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های مدیریت موانع و اقدامات">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={tab === n.id} className="im-nav-tab" style={{ ['--c' as string]: n.color }} onClick={() => setTab(n.id)}>
              <n.icon size={15} aria-hidden />{n.label}
            </button>
          ))}
        </nav>
      </header>

      <StorageErrorBanner />

      <main className="im-main" id="im-main">
        {loading ? (
          <div className="im-page" style={{ display: 'grid', gap: 12 }}>
            <div className="im-skeleton" style={{ height: 150, borderRadius: 22 }} />
            <div className="im-tiles">{Array.from({ length: 6 }, (_, k) => <div key={k} className="im-skeleton" style={{ height: 96, borderRadius: 18 }} />)}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}><Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" /></div>
          </div>
        ) : (
          <div key={tab + (tab === 'issues' ? registerKey : '')}>
            {tab === 'home' && <HubPage onGo={go} />}
            {tab === 'issues' && <RegisterPage onSelectIssue={openIssue} onNewIssue={() => openNew()} initialFilter={registerFilter} />}
            {tab === 'tracking' && <TrackingPage onOpen={openIssue} />}
            {tab === 'calendar' && <CalendarPage onOpen={openIssue} />}
            {tab === 'mywork' && <MyWorkPage onOpen={openIssue} />}
            {tab === 'decisions' && <DecisionsPage onOpenIssue={(id) => openIssue(id, 'decisions')} />}
            {tab === 'tower' && <DashboardPage onSelectIssue={openIssue} onOpenMyWork={() => setTab('mywork')} onOpenRegister={(f) => goRegister({ stage: 'active', ...f })} />}
            {tab === 'kpi' && <KpiReportPage onSelectIssue={openIssue} />}
            {tab === 'insights' && <PortfolioInsightsPage onSelectIssue={openIssue} />}
            {tab === 'notifications' && <NotificationsPage />}
            {tab === 'knowledge' && <KnowledgePage onOpenIssue={openIssue} />}
            {tab === 'projects' && <ProjectsPage onOpenProject={(id) => { setScope(id); setTab('tracking') }} />}
            {tab === 'report' && <div className="im-page"><ReportPage onSelectIssue={openIssue} /></div>}
            {tab === 'portfolio' && <div className="im-page"><PortfolioRollupPage onSelectIssue={openIssue} /></div>}
            {tab === 'field' && (
              <div className="im-page" style={{ height: 'calc(100vh - 190px)', minHeight: 420 }}>
                <Suspense fallback={<div className="im-skeleton" style={{ height: 200 }} />}>
                  <TaskIssueApp embedded onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
                </Suspense>
              </div>
            )}
            {tab === 'settings' && <SettingsPage />}
            {tab === 'help' && <HelpPage />}
          </div>
        )}
      </main>

      <button className="im-fab" onClick={() => openNew()} aria-label="مسئلهٔ جدید"><Plus size={26} /></button>

      {newIssueProjectId !== null && (
        <NewIssueModal defaultProjectId={newIssueProjectId === 'pick' ? null : newIssueProjectId} onClose={() => setNewIssueProjectId(null)} onCreated={(id) => openIssue(id)} />
      )}
      {selectedIssueId && <IssueDrawer key={selectedIssueId + drawerTab} issueId={selectedIssueId} initialTab={drawerTab} onClose={() => setSelectedIssueId(null)} />}
    </div>
  )
}
