import { useEffect } from 'react'
import { BellRing, ClipboardList, Coins, Factory, FileBarChart, GitCompareArrows, Route as RouteIcon, LayoutDashboard, Loader2, Map as MapIcon, Rows3, Settings, Spline, Sprout } from 'lucide-react'
import './landacq.css'
import { ModuleHeaderActions, StorageErrorBanner } from './platform'
import { useLandStore, useLandAnalysis, type TabKey } from './store/useLandStore'
import type { LandRepo } from './repo/types'
import { ErrorToast } from './components/ui'
import { ParcelDrawer } from './components/ParcelDrawer'
import { TowerPage } from './pages/TowerPage'
import { MapPage } from './pages/MapPage'
import { ParcelsPage } from './pages/ParcelsPage'
import { SchedulePage } from './pages/SchedulePage'
import { ActionsPage } from './pages/ActionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StationsPage } from './pages/StationsPage'
import { CrossingsPage } from './pages/CrossingsPage'
import { FinancePage } from './pages/FinancePage'
import { PlanPage } from './pages/PlanPage'
import { FrontsPage } from './pages/FrontsPage'
import { ReportsPage } from './pages/ReportsPage'
import { HelpButton } from './components/Help'
import type { HelpKey } from './lib/help'
import { faNum } from './lib/fa'

interface Props {
  repo: LandRepo
  onExitToHub: () => void
  onBackToRadar: () => void
}

/** `phase` is the step of the four-step method the tab belongs to (see the «روش کار» help); `color` tints the tab. */
const PHASES = [
  { n: 1, label: 'شناخت مسیر', color: '#38bdf8', first: 'tower' },
  { n: 2, label: 'برنامه آزادسازی', color: '#a78bfa', first: 'plan' },
  { n: 3, label: 'تطبیق با برنامه پیمانکار', color: '#fbbf24', first: 'schedule' },
  { n: 4, label: 'بهینه‌سازی جبهه‌ها', color: '#34d399', first: 'fronts' },
] as const
const TABS: { key: TabKey; label: string; icon: typeof Rows3; phase?: 1 | 2 | 3 | 4; color: string }[] = [
  { key: 'tower', label: 'برج کنترل', icon: LayoutDashboard, phase: 1, color: '#38bdf8' },
  { key: 'map', label: 'نقشه', icon: MapIcon, phase: 1, color: '#38bdf8' },
  { key: 'parcels', label: 'قطعه‌ها', icon: Rows3, phase: 1, color: '#38bdf8' },
  { key: 'stations', label: 'ایستگاه‌ها', icon: Factory, phase: 1, color: '#38bdf8' },
  { key: 'crossings', label: 'عبور از تأسیسات', icon: Spline, phase: 1, color: '#38bdf8' },
  { key: 'plan', label: 'برنامه آزادسازی', icon: ClipboardList, phase: 2, color: '#a78bfa' },
  { key: 'schedule', label: 'تطبیق با برنامه', icon: GitCompareArrows, phase: 3, color: '#fbbf24' },
  { key: 'fronts', label: 'جبهه‌های کاری', icon: RouteIcon, phase: 4, color: '#34d399' },
  { key: 'reports', label: 'گزارش‌ها', icon: FileBarChart, color: '#fb7185' },
  { key: 'actions', label: 'اقدام‌ها', icon: BellRing, color: '#f97316' },
  { key: 'finance', label: 'مالی و بودجه', icon: Coins, color: '#2dd4bf' },
  { key: 'settings', label: 'تنظیمات', icon: Settings, color: '#94a3b8' },
]

/** مدیریت تملک و آزادسازی اراضی مسیر — Land Acquisition & Right of Way Management. */
export function LandAcqApp({ repo, onExitToHub, onBackToRadar }: Props) {
  const init = useLandStore((s) => s.init)
  const tab = useLandStore((s) => s.tab)
  const setTab = useLandStore((s) => s.setTab)
  const projects = useLandStore((s) => s.projects)
  const projectId = useLandStore((s) => s.projectId)
  const selectProject = useLandStore((s) => s.selectProject)
  const loading = useLandStore((s) => s.loading)
  const error = useLandStore((s) => s.error)
  const clearError = useLandStore((s) => s.clearError)
  const selectedId = useLandStore((s) => s.selectedId)
  const select = useLandStore((s) => s.selectParcel)
  const data = useLandStore((s) => s.data)
  const { byId, kpis, crossings } = useLandAnalysis()
  const selected = selectedId ? byId.get(selectedId) : undefined

  useEffect(() => {
    void init(repo)
  }, [init, repo])
  // keep the selected tab in view when the row of tabs is wider than the screen
  useEffect(() => {
    document.querySelector('.la-head .la-tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [tab])

  const badge = (k: TabKey) => (k === 'actions' ? kpis.actionRequired + kpis.overdueActions + kpis.legalOverdue : k === 'crossings' ? crossings.filter((x) => x.st.status === 'critical').length : k === 'finance' ? (data?.parcels.filter((p) => p.priceException?.status === 'requested').length ?? 0) + (data?.route && !data.route.settings.budgetAmount ? 1 : 0) : 0)

  return (
    <div className="la-root flex h-screen w-screen flex-col overflow-hidden" dir="rtl" style={{ background: 'var(--bg-app)' }}>
      <header className="la-head shrink-0 px-3 pt-2.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="la-logo" aria-hidden><Sprout size={21} /></span>
            <div className="min-w-0 leading-tight">
              <h1 className="la-head-title m-0 truncate text-[15px] font-black">مدیریت تملک و آزادسازی اراضی مسیر</h1>
              <p className="la-eyebrow m-0 hidden sm:block" dir="ltr">Land Acquisition &amp; Right of Way Management</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {projects.length > 0 && (
              <select className="la-select" style={{ width: 'auto', maxWidth: 'min(220px, 56vw)' }} value={projectId ?? ''} onChange={(e) => void selectProject(e.target.value)} aria-label="پروژه">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
          </div>
        </div>
        <div className="la-steps" role="group" aria-label="چهار گام روش کار">
          {PHASES.map((ph, i) => {
            const cur = TABS.find((t) => t.key === tab)?.phase
            return (
              <div key={ph.n} className="la-step-wrap">
                <button type="button" className="la-step" aria-current={cur === ph.n ? 'step' : undefined} style={{ '--p': ph.color } as React.CSSProperties} onClick={() => setTab(ph.first as TabKey)}>
                  <b className="la-num">{faNum(ph.n)}</b>
                  <span>{ph.label}</span>
                </button>
                {i < PHASES.length - 1 && <span className="la-step-line" aria-hidden />}
              </div>
            )
          })}
          <span className="ms-auto flex items-center gap-1.5">
            <HelpButton topic="method" label="توضیح روش" />
            <HelpButton topic={tab as HelpKey} label="راهنمای این بخش" />
          </span>
        </div>
        <nav className="la-tabs" role="tablist" aria-label="بخش‌های مدیریت تملک و آزادسازی اراضی">
          {TABS.map((t) => (
            <button key={t.key} className="la-tab" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} style={{ '--p': t.color } as React.CSSProperties}>
              <t.icon size={15} aria-hidden /> {t.label}
              {badge(t.key) > 0 && <span className="la-num la-tab-badge">{faNum(badge(t.key))}</span>}
            </button>
          ))}
        </nav>
      </header>

      <StorageErrorBanner />

      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-4 sm:px-5" id="la-main">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--la-accent)' }} aria-label="در حال بارگذاری" /></div>
        ) : !projectId ? (
          <div className="la-card mx-auto mt-8 max-w-md p-8 text-center text-[13px]" style={{ color: 'var(--la-ink-2)' }}>پروژه‌ای برای شما تعریف نشده است. ابتدا در «اطلاعات پایه» یک پروژه بسازید یا دسترسی بگیرید.</div>
        ) : (
          <div key={tab} className="la-rise">
            {tab === 'tower' && <TowerPage />}
            {tab === 'map' && <MapPage />}
            {tab === 'parcels' && <ParcelsPage />}
            {tab === 'stations' && <StationsPage />}
            {tab === 'crossings' && <CrossingsPage />}
            {tab === 'finance' && <FinancePage />}
            {tab === 'plan' && <PlanPage />}
            {tab === 'fronts' && <FrontsPage />}
            {tab === 'reports' && <ReportsPage />}
            {tab === 'schedule' && <SchedulePage />}
            {tab === 'actions' && <ActionsPage />}
            {tab === 'settings' && <SettingsPage />}
          </div>
        )}
      </main>

      {selected && <ParcelDrawer key={selected.parcel.id} a={selected} onClose={() => select(null)} />}
      {error && <ErrorToast message={error} onClose={clearError} />}
    </div>
  )
}
