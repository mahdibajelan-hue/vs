import { useEffect, useState } from 'react'
import { BarChart3, ClipboardList, LayoutDashboard, Loader2, Network, Wand2 } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useReportingStore } from './store/useReportingStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { DashboardPage } from './pages/DashboardPage'
import { ReportBuilderPage } from './pages/ReportBuilderPage'
import { ReportCenterPage } from './pages/ReportCenterPage'
import { DecisionCenterPage } from './pages/DecisionCenterPage'
import { PortfolioReportPage } from './pages/PortfolioReportPage'

type Tab = 'dashboard' | 'builder' | 'center' | 'decisions' | 'portfolio'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'داشبورد هوشمند', icon: LayoutDashboard },
  { id: 'builder', label: 'ساخت گزارش', icon: Wand2 },
  { id: 'center', label: 'مرکز گزارش‌ها', icon: BarChart3 },
  { id: 'decisions', label: 'مرکز تصمیم', icon: ClipboardList },
  { id: 'portfolio', label: 'گزارش پورتفولیو/طرح', icon: Network },
]

export function ReportingApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const profilesLoaded = useReportingStore((s) => s.profilesLoaded)
  const fetchProfiles = useReportingStore((s) => s.fetchProfiles)
  const fetchProjectData = useReportingStore((s) => s.fetchProjectData)

  const [projectId, setProjectId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')

  useEffect(() => {
    if (!masterDataLoaded) fetchMasterData()
    if (!profilesLoaded) fetchProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [projects, projectId])

  useEffect(() => {
    if (projectId) fetchProjectData(projectId)
  }, [projectId, fetchProjectData])

  if (masterDataLoading && !masterDataLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin text-teal-400" />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/10">
            <BarChart3 size={18} className="text-teal-400" />
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-extrabold">گزارش‌گیری هوشمند</p>
            <p className="text-[10px] text-muted" dir="ltr">
              Intelligent Reporting
            </p>
          </div>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="w-36 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400 sm:w-auto"
          >
            <option value="">پروژه‌ای انتخاب کنید</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.officialName}
              </option>
            ))}
          </select>
        </div>

        <nav className="order-3 hidden w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:order-none lg:flex lg:w-auto">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === id ? 'bg-brand-500/20 text-brand-300' : 'text-secondary hover:bg-white/5'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>

        <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
      </header>

      <StorageErrorBanner />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-16 sm:p-4 lg:pb-4">
        {tab === 'portfolio' ? (
          <PortfolioReportPage />
        ) : !projectId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {projects.length === 0 ? 'ابتدا از بخش داده پایه یک پروژه تعریف کنید' : 'یک پروژه را از بالا انتخاب کنید'}
          </div>
        ) : tab === 'dashboard' ? (
          <DashboardPage masterProjectId={projectId} />
        ) : tab === 'builder' ? (
          <ReportBuilderPage masterProjectId={projectId} />
        ) : tab === 'center' ? (
          <ReportCenterPage masterProjectId={projectId} />
        ) : (
          <DecisionCenterPage masterProjectId={projectId} />
        )}
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around overflow-x-auto border-t bg-[var(--bg-panel-solid)] py-1.5 lg:hidden" style={{ borderColor: 'var(--border-soft)' }}>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[9px] shrink-0 ${tab === id ? 'text-teal-400' : 'text-muted'}`}
          >
            <Icon size={16} />
            <span className="max-w-[4.2rem] truncate">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
