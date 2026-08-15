import { Home, Route as RouteIcon, Settings } from 'lucide-react'
import { SignOutButton } from '../../components/Auth/SignOutButton'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { usePdtStore } from './store/usePdtStore'
import { DashboardPage } from './pages/DashboardPage'

const MODULE_ACCENT = '#38bdf8'

/**
 * Pipeline Digital Twin — MVP shell. Single demo project for now (no multi-project switching or
 * Supabase-backed persistence yet; per the spec, the visualization/UX/data-model layer comes first,
 * a real backend later). "See the Pipeline, Understand the Project": there's deliberately no list
 * of forms/tables to land on first — the dashboard *is* the pipeline.
 */
export function PipelineDigitalTwinApp({ onExitToHub }: { onExitToHub: () => void }) {
  const projectName = usePdtStore((s) => s.projectName)
  const englishTag = usePdtStore((s) => s.englishTag)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: `${MODULE_ACCENT}55`, background: `${MODULE_ACCENT}1a` }}
          >
            <RouteIcon size={18} style={{ color: MODULE_ACCENT }} />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold">دوقلوی دیجیتال خط لوله</p>
            <p className="hidden text-[10px] text-muted sm:block" dir="ltr">
              {englishTag}
            </p>
          </div>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:mx-2 sm:block" />
          <span className="hidden truncate text-xs text-secondary sm:inline" dir="ltr">
            {projectName}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            disabled
            title="در دسترس نیست — نسخهٔ آزمایشی"
            className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-muted opacity-50 sm:flex sm:px-3"
          >
            <Settings size={13} /> تنظیمات
          </button>
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-secondary hover:bg-white/5 sm:px-3">
            <Home size={13} /> <span className="hidden sm:inline">بازگشت به ماژول‌ها</span>
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 sm:px-3" />
        </div>
      </header>

      <StorageErrorBanner />

      <main className="min-h-0 flex-1 overflow-hidden">
        <DashboardPage />
      </main>
    </div>
  )
}
