import { useEffect, useState } from 'react'
import { ClipboardList, FileSearch, LayoutDashboard, ListTree, Loader2, MapPinned, Plus, Sparkles } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { useMissionStore } from './store/useMissionStore'
import type { MissionRepo } from './repo/types'
import { NavContext, type View } from './nav'
import { ErrorBanner } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { MissionListPage } from './pages/MissionListPage'
import { MissionFormPage } from './pages/MissionFormPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { InterviewPage } from './pages/InterviewPage'
import { SummaryPage } from './pages/SummaryPage'
import { ReportPage } from './pages/ReportPage'
import { FindingsPage } from './pages/FindingsPage'
import { QuestionSetsPage } from './pages/QuestionSetsPage'
import './missions.css'

interface Props {
  onExitToHub: () => void
  onBackToRadar?: () => void
  /** Injected for demos/tests; the product uses the Supabase repository. */
  repo?: MissionRepo
  initialView?: View
  /** Hide the global header actions (used when embedded in a preview harness). */
  embedded?: boolean
}

const NAV: { key: View['kind']; label: string; icon: typeof LayoutDashboard; view: View }[] = [
  { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, view: { kind: 'dashboard' } },
  { key: 'list', label: 'مأموریت‌ها', icon: ClipboardList, view: { kind: 'list' } },
  { key: 'findings', label: 'یافته‌ها', icon: FileSearch, view: { kind: 'findings' } },
  { key: 'sets', label: 'سؤال‌ها', icon: ListTree, view: { kind: 'sets' } },
]

/** The section a deeper page belongs to, so the nav stays lit while inside a mission. */
function sectionOf(v: View): View['kind'] {
  if (v.kind === 'form' || v.kind === 'mission' || v.kind === 'interview' || v.kind === 'summary' || v.kind === 'report') return 'list'
  return v.kind
}

export function MissionsApp({ onExitToHub, onBackToRadar, repo, initialView, embedded }: Props) {
  const [view, setView] = useState<View>(initialView ?? { kind: 'dashboard' })
  const init = useMissionStore((s) => s.init)
  const setRepo = useMissionStore((s) => s.setRepo)
  const ready = useMissionStore((s) => s.ready)
  const loading = useMissionStore((s) => s.loading)
  const error = useMissionStore((s) => s.error)
  const clearError = useMissionStore((s) => s.clearError)
  const ai = useMissionStore((s) => s.ai)

  useEffect(() => {
    if (repo) setRepo(repo)
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (v: View) => {
    setView(v)
    document.getElementById('ms-main')?.scrollTo({ top: 0 })
  }
  const section = sectionOf(view)
  const immersive = view.kind === 'interview'

  return (
    <NavContext.Provider value={{ view, go }}>
      <div className="ms-root flex h-screen w-screen flex-col overflow-hidden" dir="rtl">
        <header className="ms-no-print flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2.5 sm:px-5" style={{ borderColor: 'var(--ms-line)', background: 'color-mix(in srgb, var(--ms-panel) 86%, transparent)', backdropFilter: 'blur(14px)' }}>
          <button className="flex min-w-0 items-center gap-2.5 text-right" onClick={() => go({ kind: 'dashboard' })} aria-label="داشبورد مأموریت‌ها">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--ms-accent)', color: 'var(--ms-accent-ink)' }}>
              <MapPinned size={20} aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[14.5px] font-black">مأموریت و بازدید پروژه</span>
              <span className="ms-muted hidden text-[10.5px] sm:block" dir="ltr">Mission · Visit · Debrief · Insight</span>
            </span>
          </button>

          <nav className="order-3 hidden items-center gap-1 rounded-xl p-1 md:order-none md:flex" style={{ background: 'var(--ms-panel-2)', border: '1px solid var(--ms-line)' }} aria-label="بخش‌ها">
            {NAV.map((n) => (
              <button key={n.key} onClick={() => go(n.view)} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${section === n.key ? '' : 'ms-ink2 hover:text-[var(--ms-ink)]'}`} style={section === n.key ? { background: 'var(--ms-accent)', color: 'var(--ms-accent-ink)' } : undefined} aria-current={section === n.key ? 'page' : undefined}>
                <n.icon size={14} aria-hidden /> {n.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="ms-pill hidden lg:inline-flex" title="موتور تحلیل پاسخ‌ها">
              <Sparkles size={12} aria-hidden /> {ai.enhanced ? ai.label : 'موتور قواعد'}
            </span>
            <button className="ms-btn ms-btn-primary ms-btn-sm" onClick={() => go({ kind: 'form' })}>
              <Plus size={14} aria-hidden /> <span className="hidden sm:inline">درخواست مأموریت</span>
              <span className="sm:hidden">جدید</span>
            </button>
            {!embedded && <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />}
          </div>
        </header>

        <StorageErrorBanner />

        <main id="ms-main" className="ms-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-5 md:pb-8" style={immersive ? { padding: 0, overflow: 'hidden' } : undefined}>
          {error && !immersive && <ErrorBanner message={error} onClose={clearError} />}
          {!ready ? (
            <div className="flex h-64 items-center justify-center">
              {loading ? <Loader2 className="animate-spin" style={{ color: 'var(--ms-accent)' }} /> : <p className="ms-muted text-sm">{error ?? 'در حال بارگذاری…'}</p>}
            </div>
          ) : view.kind === 'dashboard' ? (
            <DashboardPage />
          ) : view.kind === 'list' ? (
            <MissionListPage initialFilter={view.filter} />
          ) : view.kind === 'form' ? (
            <MissionFormPage missionId={view.id} />
          ) : view.kind === 'mission' ? (
            <MissionDetailPage id={view.id} />
          ) : view.kind === 'interview' ? (
            <InterviewPage id={view.id} />
          ) : view.kind === 'summary' ? (
            <SummaryPage id={view.id} />
          ) : view.kind === 'report' ? (
            <ReportPage id={view.id} />
          ) : view.kind === 'findings' ? (
            <FindingsPage />
          ) : (
            <QuestionSetsPage />
          )}
        </main>

        {!immersive && (
          <nav className="ms-bottom-nav ms-no-print" aria-label="بخش‌ها">
            {NAV.map((n) => (
              <button key={n.key} className={section === n.key ? 'is-on' : ''} onClick={() => go(n.view)}>
                <n.icon size={19} aria-hidden />
                {n.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </NavContext.Provider>
  )
}
