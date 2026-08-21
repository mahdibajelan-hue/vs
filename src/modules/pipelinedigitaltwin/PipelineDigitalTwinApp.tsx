import { CalendarDays, Route as RouteIcon, Settings } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { useAuthStore } from '../../store/useAuthStore'
import { usePdtStore } from './store/usePdtStore'
import { DashboardPage } from './pages/DashboardPage'
import type { ProjectPhase } from './types'
import { formatJalali } from '../../lib/jalali'

const MODULE_ACCENT = '#38bdf8'

const PHASE_OPTIONS: { value: ProjectPhase; label: string }[] = [
  { value: 'design', label: 'طراحی' },
  { value: 'procurement', label: 'تأمین کالا' },
  { value: 'construction', label: 'ساخت' },
  { value: 'commissioning', label: 'راه‌اندازی' },
]

/**
 * Pipeline Digital Twin — MVP shell. Single demo project for now (no multi-project switching or
 * Supabase-backed persistence yet; per the spec, the visualization/UX/data-model layer comes first,
 * a real backend later). "See the Pipeline, Understand the Project": there's deliberately no list
 * of forms/tables to land on first — the dashboard *is* the pipeline.
 */
export function PipelineDigitalTwinApp({ onExitToHub }: { onExitToHub: () => void }) {
  const projectName = usePdtStore((s) => s.projectName)
  const englishTag = usePdtStore((s) => s.englishTag)
  const projectPhase = usePdtStore((s) => s.projectPhase)
  const setProjectPhase = usePdtStore((s) => s.setProjectPhase)
  const profile = useAuthStore((s) => s.profile)
  const todayIso = new Date().toISOString().slice(0, 10)

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

        <div className="hidden items-center gap-2.5 md:flex">
          <label className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px]">
            <span className="text-muted">فاز پروژه</span>
            <select
              value={projectPhase}
              onChange={(e) => setProjectPhase(e.target.value as ProjectPhase)}
              className="bg-transparent font-bold outline-none"
            >
              {PHASE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value} className="bg-[#11151c]">
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium">
            <CalendarDays size={12} className="text-muted" />
            <span className="num">{formatJalali(todayIso)}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {profile && (
            <div className="hidden items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-2.5 lg:flex">
              <div className="min-w-0 text-left leading-tight">
                <p className="truncate text-[11px] font-bold">{profile.fullName || profile.email}</p>
                <p className="truncate text-[9px] text-muted">{profile.positionTitle || '—'}</p>
              </div>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: `${MODULE_ACCENT}33`, color: MODULE_ACCENT }}>
                {(profile.fullName || profile.email).slice(0, 1)}
              </div>
            </div>
          )}
          <button
            disabled
            title="در دسترس نیست — نسخهٔ آزمایشی"
            className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-muted opacity-50 sm:flex sm:px-3"
          >
            <Settings size={13} /> تنظیمات
          </button>
          <ModuleHeaderActions onExitToHub={onExitToHub} />
        </div>
      </header>

      <StorageErrorBanner />

      <main className="min-h-0 flex-1 overflow-hidden">
        <DashboardPage />
      </main>
    </div>
  )
}
