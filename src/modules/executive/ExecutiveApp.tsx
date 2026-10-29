import { useEffect, useState, type ReactNode } from 'react'
import { Activity, Briefcase, Gauge, Layers3, ClipboardList, FlaskConical, Gavel, HardHat, LayoutDashboard, ListTree, Loader2, ShieldAlert, Star } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { LifecyclePipelinePage } from './LifecyclePipelinePage'
import { useModuleStore } from '../../store/useModuleStore'
import { usePortfolioStore } from './store/usePortfolioStore'
import { usePortfolioViews, type PortfolioScope } from './lib/usePortfolioViews'
import { OverviewTab } from './pages/OverviewTab'
import { DashboardTab } from './pages/DashboardTab'
import { PriorityTab } from './pages/PriorityTab'
import { PerformanceTab } from './pages/PerformanceTab'
import { RiskTab } from './pages/RiskTab'
import { DecisionsTab } from './pages/DecisionsTab'
import { ScenarioTab } from './pages/ScenarioTab'
import { ResourceTab } from './pages/ResourceTab'
import { IssuesTab } from './pages/IssuesTab'
import { GuideTab } from './pages/GuideTab'
import { DecisionDialog } from './components/DecisionDialog'
import { ScopePicker } from './components/ScopePicker'
import { faNum } from './components/pfUi'
import './mpv.css'
import './portfolio.css'

const MODULE_ACCENT = '#6366f1'

type Tab = 'dashboard' | 'overview' | 'priority' | 'performance' | 'scenario' | 'resources' | 'issues' | 'risk' | 'decisions' | 'pipeline' | 'guide'
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'dashboard', label: 'داشبورد', icon: <Gauge size={15} /> },
  { key: 'overview', label: 'نمای کلی', icon: <LayoutDashboard size={15} /> },
  { key: 'priority', label: 'اولویت‌بندی', icon: <Star size={15} /> },
  { key: 'performance', label: 'عملکرد و پیش‌بینی', icon: <Activity size={15} /> },
  { key: 'scenario', label: 'سناریو و بودجه', icon: <FlaskConical size={15} /> },
  { key: 'resources', label: 'ظرفیت منابع', icon: <HardHat size={15} /> },
  { key: 'issues', label: 'موانع و مسائل', icon: <ClipboardList size={15} /> },
  { key: 'risk', label: 'ریسک و وابستگی', icon: <ShieldAlert size={15} /> },
  { key: 'decisions', label: 'تصمیم‌های سبد', icon: <Gavel size={15} /> },
  { key: 'pipeline', label: 'مراحل چرخهٔ عمر', icon: <ListTree size={15} /> },
]

/**
 * Portfolio Management — its own top-level app for senior management (council review 1405/08): one scope picker
 * (portfolio → program), and tabs by the job the manager is doing rather than one long page of widgets.
 */
export function ExecutiveApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const allProjects = useMasterDataStore((s) => s.projects)
  const [tab, setTab] = useState<Tab>(() => { const e = useModuleStore.getState().takeEntryTab(); return e === 'pipeline' || e === 'issues' || e === 'guide' || e === 'overview' ? e : 'dashboard' })
  const [scope, setScope] = useState<PortfolioScope>({ portfolioId: null, programId: null })
  const [deciding, setDeciding] = useState<{ id: string | null } | null>(null)
  const canGovern = usePortfolioStore((s) => s.canGovern)

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pv = usePortfolioViews(scope)

  if (masterDataLoading && !masterDataLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: MODULE_ACCENT }} />
      </div>
    )
  }

  const scopedPrograms = programs.filter((p) => !scope.portfolioId || p.portfolioId === scope.portfolioId)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${MODULE_ACCENT}55`, background: `${MODULE_ACCENT}1a` }}>
            <Briefcase size={18} style={{ color: MODULE_ACCENT }} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold">مدیریت سبد پروژه‌ها</p>
            <p className="text-[10px] text-muted">اولویت، عملکرد و تصمیم در سطح سبد</p>
          </div>
        </div>
        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} onGuide={() => setTab(tab === 'guide' ? 'dashboard' : 'guide')} guideActive={tab === 'guide'} />
      </header>

      <StorageErrorBanner />

      <div className="pf-bar no-print" dir="rtl">
        <nav className="pf-tabs" role="tablist" aria-label="بخش‌های پرتفولیو">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'is-on' : ''} onClick={() => setTab(t.key)}>{t.icon}{t.label}</button>
          ))}
        </nav>
        {tab !== 'pipeline' && tab !== 'guide' && (
          <div className="pf-scope">
            <ScopePicker icon={Briefcase} caption="پورتفولیو" allLabel="همهٔ پورتفولیوها" tone="#4f46e5" value={scope.portfolioId}
              options={portfolios.map((p) => ({ id: p.id, label: p.name, count: allProjects.filter((x) => x.portfolioId === p.id).length }))}
              onChange={(id) => setScope({ portfolioId: id, programId: null })} />
            <ScopePicker icon={Layers3} caption="طرح" allLabel="همهٔ طرح‌ها" tone="#0d9488" value={scope.programId}
              options={scopedPrograms.map((p) => ({ id: p.id, label: p.name, count: allProjects.filter((x) => x.programId === p.id).length }))}
              onChange={(id) => setScope((s) => ({ ...s, programId: id }))} />
            {!pv.snapshotsReady && pv.progress.total > 0 && (
              <span className="pf-loading" role="status"><Loader2 size={13} className="animate-spin" /> {pv.cachedAt ? `نمایش دادهٔ ${faNum(Math.max(1, Math.round((Date.now() - pv.cachedAt) / 60000)))} دقیقه پیش · در حال به‌روزرسانی` : `شاخص پروژه‌ها ${faNum(pv.progress.done)} از ${faNum(pv.progress.total)}`}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4" dir="rtl">
        <div key={tab} className="pf-page">
          {tab === 'pipeline' ? <LifecyclePipelinePage onBack={() => setTab('overview')} />
            : tab === 'guide' ? <GuideTab onOpenTab={(t) => setTab(t as Tab)} />
            : !pv.rawLoaded ? <div className="pf-skel-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="pf-skel" />)}</div>
            : tab === 'dashboard' ? <DashboardTab views={pv.views} projects={pv.inScope} risks={pv.scopedRisks} riskMaster={pv.riskMaster} assessments={pv.scopedAssessments} issuesByMaster={pv.issuesByMaster} currency={pv.currency} canGovern={canGovern} onDecide={(id) => setDeciding({ id })} onOpenTab={setTab} />
            : tab === 'overview' ? <OverviewTab views={pv.views} currency={pv.currency} canGovern={canGovern} onDecide={(id) => setDeciding({ id })} onOpenPipeline={() => setTab('pipeline')} onOpenTab={setTab} />
            : tab === 'priority' ? <PriorityTab views={pv.views} currency={pv.currency} />
            : tab === 'performance' ? <PerformanceTab views={pv.views} currency={pv.currency} />
            : tab === 'scenario' ? <ScenarioTab views={pv.views} projects={pv.inScope} currency={pv.currency} />
            : tab === 'resources' ? <ResourceTab views={pv.views} />
            : tab === 'issues' ? <IssuesTab projects={pv.inScope} issuesByMaster={pv.issuesByMaster} />
            : tab === 'risk' ? <RiskTab views={pv.views} risks={pv.scopedRisks} assessments={pv.scopedAssessments} summaries={pv.summaries} />
            : <DecisionsTab views={pv.views} onDecide={(id) => setDeciding({ id })} />}
        </div>
      </div>

      {deciding && <DecisionDialog views={pv.views} initialId={deciding.id} onClose={() => setDeciding(null)} />}
    </div>
  )
}
