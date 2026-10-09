import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Activity, Bell, Bot, CircleHelp, FileBarChart, Gauge, Home, Layers, Loader2, Network, Plus, ScanSearch, Settings2, ShieldAlert, ShieldCheck, TrendingUp, ArrowLeftRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { fetchModuleProjectMappings } from '../masterdata/lib/hierarchyRollup'
import { HelpButton } from '../issues/components/Help'
import '../issues/issues.css'
import './risk.css'
import { useRiskStore } from './store/useRiskStore'
import { useRiskPeopleStore } from './store/useRiskPeopleStore'
import { useRiskRole } from './lib/useRiskData'
import { RK_HELP } from './lib/help'
import { RiskDrawer, type RiskTabId } from './components/RiskDrawer'
import { RiskFormModal } from './components/RiskFormModal'
import { HubPage } from './pages/HubPage'

const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const AssessmentPage = lazy(() => import('./pages/AssessmentPage').then((m) => ({ default: m.AssessmentPage })))
const ResponsePage = lazy(() => import('./pages/ResponsePage').then((m) => ({ default: m.ResponsePage })))
const MonitoringPage = lazy(() => import('./pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })))
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })))
const IntegrationPage = lazy(() => import('./pages/IntegrationPage').then((m) => ({ default: m.IntegrationPage })))
const KpiPage = lazy(() => import('./pages/KpiPage').then((m) => ({ default: m.KpiPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })))

export type RiskTab = 'home' | 'register' | 'assessment' | 'response' | 'monitoring' | 'dashboard' | 'portfolio' | 'assistant' | 'integration' | 'kpi' | 'reports' | 'alerts' | 'settings' | 'help'
export interface PageProps { onOpenRisk: (id: string, tab?: RiskTabId) => void; onNew: () => void; onGo: (tab: RiskTab) => void }

const NAV: { id: RiskTab; label: string; icon: LucideIcon; color: string; help: keyof typeof RK_HELP }[] = [
  { id: 'home', label: 'خانه', icon: Home, color: '#f59e0b', help: 'hub' },
  { id: 'register', label: 'شناسایی و ثبت', icon: ScanSearch, color: '#0ea5e9', help: 'register' },
  { id: 'assessment', label: 'ارزیابی', icon: TrendingUp, color: '#f59e0b', help: 'assessment' },
  { id: 'response', label: 'پاسخ و اقدام', icon: ShieldCheck, color: '#22c55e', help: 'response' },
  { id: 'monitoring', label: 'پایش و اثربخشی', icon: Activity, color: '#8b5cf6', help: 'monitoring' },
  { id: 'dashboard', label: 'داشبورد', icon: Gauge, color: '#6366f1', help: 'dashboard' },
  { id: 'portfolio', label: 'هوش پورتفولیو', icon: Network, color: '#14b8a6', help: 'portfolio' },
  { id: 'assistant', label: 'دستیار هوشمند', icon: Bot, color: '#a78bfa', help: 'assistant' },
  { id: 'integration', label: 'یکپارچگی', icon: ArrowLeftRight, color: '#f43f5e', help: 'integration' },
  { id: 'kpi', label: 'شاخص‌ها', icon: Layers, color: '#eab308', help: 'kpi' },
  { id: 'reports', label: 'گزارش‌ها', icon: FileBarChart, color: '#0891b2', help: 'reports' },
  { id: 'alerts', label: 'اعلان و تشدید', icon: Bell, color: '#ef4444', help: 'alerts' },
  { id: 'settings', label: 'تنظیمات', icon: Settings2, color: '#94a3b8', help: 'settings' },
  { id: 'help', label: 'راهنما', icon: CircleHelp, color: '#64748b', help: 'hub' },
]

/** مدیریت ریسک — Enterprise Project Risk Management. Users, projects and access come from the central platform. */
export function RiskApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const loadingFlag = useRiskStore((s) => s.loading)
  const loaded = useRiskStore((s) => s.loaded)
  const loading = loadingFlag || !loaded
  const error = useRiskStore((s) => s.error)
  const projects = useRiskStore((s) => s.projects)
  const scope = useRiskStore((s) => s.scopeProjectId)
  const setScope = useRiskStore((s) => s.setScope)
  const fetchAll = useRiskStore((s) => s.fetchAll)
  const syncProjects = useRiskStore((s) => s.syncProjects)
  const fetchPeople = useRiskPeopleStore((s) => s.fetchAll)
  const [tab, setTab] = useState<RiskTab>('home')
  const [openRisk, setOpenRisk] = useState<{ id: string; tab: RiskTabId } | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const role = useRiskRole(scope === 'all' ? null : scope)

  useEffect(() => { (async () => { await syncProjects(); await fetchAll() })(); fetchPeople() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // Arrived from Project Radar with a project in context: the whole module is scoped to that project.
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!contextProjectId) return
    fetchModuleProjectMappings('risk').then((map) => {
      const resolved = map.get(contextProjectId)
      if (resolved) { setScope(resolved); setTab('register'); setLocked(true) }
    })
    return () => { if (useRiskStore.getState().scopeProjectId !== 'all') setScope('all') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A mission finding / issue asked to open one of these risks.
  const pendingLink = useDeepLinkStore((s) => s.pending)
  const clearLink = useDeepLinkStore((s) => s.clear)
  useEffect(() => {
    if (!loading && pendingLink?.module === 'risk') { setOpenRisk({ id: pendingLink.recordId, tab: 'overview' }); clearLink() }
  }, [loading, pendingLink, clearLink])

  const cur = useMemo(() => NAV.find((n) => n.id === tab)!, [tab])
  useEffect(() => { document.getElementById('im-main')?.scrollTo({ top: 0 }); document.querySelector('.im-nav-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])
  const page: PageProps = { onOpenRisk: (id, t = 'overview') => setOpenRisk({ id, tab: t }), onNew: () => setNewOpen(true), onGo: setTab }

  return (
    <div className="im-root rk-root" dir="rtl">
      <header className="im-head">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: 'linear-gradient(135deg, #ef4444, #be123c)' }}><ShieldAlert size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">مدیریت ریسک</h1>
              <p className="im-head-eyebrow">Enterprise Risk Management</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {!locked && projects.length > 1 && (
              <select className="im-select-pill" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="پروژه">
                <option value="all">همهٔ پروژه‌ها</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.shortCode ? p.shortCode + ' · ' : ''}{p.name}</option>)}
              </select>
            )}
            {tab !== 'help' && <HelpButton content={RK_HELP[cur.help]} />}
            {role.canEdit && <button className="im-btn im-btn-primary im-btn-lg" onClick={() => setNewOpen(true)}><Plus size={18} strokeWidth={2.6} /> ریسک جدید</button>}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های مدیریت ریسک">
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
            <div style={{ display: 'flex', justifyContent: 'center' }}>{error ? <span className="im-err">{error}</span> : <Loader2 size={20} className="animate-spin" style={{ color: 'var(--im-accent)' }} aria-label="در حال بارگذاری" />}</div>
          </div>
        ) : (
          <Suspense fallback={<div className="im-page"><div className="im-skeleton" style={{ height: 240 }} /></div>}>
            <div key={tab}>
              {tab === 'home' && <HubPage onGo={setTab} />}
              {tab === 'register' && <RegisterPage {...page} />}
              {tab === 'assessment' && <AssessmentPage {...page} />}
              {tab === 'response' && <ResponsePage {...page} />}
              {tab === 'monitoring' && <MonitoringPage {...page} />}
              {tab === 'dashboard' && <DashboardPage {...page} />}
              {tab === 'portfolio' && <PortfolioPage {...page} />}
              {tab === 'assistant' && <AssistantPage {...page} />}
              {tab === 'integration' && <IntegrationPage {...page} />}
              {tab === 'kpi' && <KpiPage {...page} />}
              {tab === 'reports' && <ReportsPage {...page} />}
              {tab === 'alerts' && <AlertsPage {...page} />}
              {tab === 'settings' && <SettingsPage {...page} />}
              {tab === 'help' && <HelpPage />}
            </div>
          </Suspense>
        )}
      </main>

      {role.canEdit && <button className="im-fab" onClick={() => setNewOpen(true)} aria-label="ریسک جدید"><Plus size={26} /></button>}
      {newOpen && <RiskFormModal defaultProjectId={scope !== 'all' ? scope : undefined} onClose={() => setNewOpen(false)} onSaved={(id) => setOpenRisk({ id, tab: 'overview' })} />}
      {openRisk && <RiskDrawer key={openRisk.id + openRisk.tab} riskId={openRisk.id} initialTab={openRisk.tab} onClose={() => setOpenRisk(null)} />}
      
    </div>
  )
}
