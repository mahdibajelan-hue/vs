import { useEffect } from 'react'
import { BellRing, CalendarRange, Coins, Factory, LayoutDashboard, Loader2, Map as MapIcon, Rows3, Settings, Spline, Sprout } from 'lucide-react'
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
import { faNum } from './lib/fa'

interface Props {
  repo: LandRepo
  onExitToHub: () => void
  onBackToRadar: () => void
}

const TABS: { key: TabKey; label: string; icon: typeof Rows3 }[] = [
  { key: 'tower', label: 'برج کنترل', icon: LayoutDashboard },
  { key: 'map', label: 'نقشه', icon: MapIcon },
  { key: 'parcels', label: 'قطعه‌ها', icon: Rows3 },
  { key: 'stations', label: 'ایستگاه‌ها', icon: Factory },
  { key: 'crossings', label: 'عبور از تأسیسات', icon: Spline },
  { key: 'finance', label: 'مالی و بودجه', icon: Coins },
  { key: 'schedule', label: 'برنامه', icon: CalendarRange },
  { key: 'actions', label: 'اقدام‌ها', icon: BellRing },
  { key: 'settings', label: 'تنظیمات', icon: Settings },
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

  const badge = (k: TabKey) => (k === 'actions' ? kpis.actionRequired + kpis.overdueActions + kpis.legalOverdue : k === 'crossings' ? crossings.filter((x) => x.st.status === 'critical').length : k === 'finance' ? (data?.parcels.filter((p) => p.priceException?.status === 'requested').length ?? 0) + (data?.route && !data.route.settings.budgetAmount ? 1 : 0) : 0)

  return (
    <div className="la-root flex h-screen w-screen flex-col overflow-hidden" dir="rtl" style={{ background: 'var(--bg-app)' }}>
      <header className="shrink-0 border-b px-3 pt-2.5 sm:px-5" style={{ borderColor: 'var(--la-line)', background: 'var(--la-surface)' }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--la-accent-soft)', color: 'var(--la-accent)' }}><Sprout size={20} aria-hidden /></span>
            <div className="min-w-0 leading-tight">
              <h1 className="m-0 truncate text-[14.5px] font-black">مدیریت تملک و آزادسازی اراضی مسیر</h1>
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
        <nav className="la-tabs" role="tablist" aria-label="بخش‌های مدیریت تملک و آزادسازی اراضی">
          {TABS.map((t) => (
            <button key={t.key} className="la-tab" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              <t.icon size={15} aria-hidden /> {t.label}
              {badge(t.key) > 0 && <span className="la-num rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: '#ef4444', color: '#fff' }}>{faNum(badge(t.key))}</span>}
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
