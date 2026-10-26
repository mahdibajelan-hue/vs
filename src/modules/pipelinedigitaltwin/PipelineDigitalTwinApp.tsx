import { useEffect, useState, type CSSProperties } from 'react'
import { BookOpen, Boxes, Briefcase, CalendarDays, Gauge, HardHat, Loader2, Route as RouteIcon, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useModuleStore } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { usePdtStore, type Lens } from './store/usePdtStore'
import { DashboardPage } from './pages/DashboardPage'
import { RouteSetup } from './components/RouteSetup'
import { SettingsDialog } from './components/SettingsDialog'
import { useOfficial } from './hooks/useOfficial'
import { TwinGuide } from './components/TwinGuide'
import './twin.css'

const MODULE_ACCENT = '#38bdf8'
const LENSES: { key: Lens; label: string; who: string; icon: LucideIcon; color: string }[] = [
  { key: 'construction', label: 'ساخت', who: 'کاربر کارگاه و مدیر پروژه', icon: HardHat, color: '#f59e0b' },
  { key: 'assets', label: 'دارایی‌ها', who: 'مسئول دارایی فیزیکی', icon: Boxes, color: '#a78bfa' },
  { key: 'operation', label: 'بهره‌برداری', who: 'بهره‌بردار', icon: Gauge, color: '#22c55e' },
  { key: 'executive', label: 'مدیریتی', who: 'مدیرعامل', icon: Briefcase, color: '#38bdf8' },
]

/**
 * Pipeline Digital Twin of the project in context. One line, four readings of it: construction (site + project manager),
 * physical assets (asset manager), operation (operator) and the executive summary (CEO). The route is the project's
 * shared route, the numbers other modules own are read from them, and everything entered here is saved per project.
 */
export function PipelineDigitalTwinApp({ onExitToHub, onBackToRadar }: { onExitToHub: () => void; onBackToRadar: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = usePdtStore()
  const official = useOfficial(projectId)
  const [settings, setSettings] = useState(false)
  const [guide, setGuide] = useState(false)
  // another module can open the twin on one of its data layers (enterModule('pipelinedigitaltwin', …, 'pssr'))
  const [initialLayer] = useState<'pssr' | 'land' | null>(() => { const t = useModuleStore.getState().entryTab; return t === 'pssr' || t === 'land' ? t : null })
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  const projectName = project?.officialName ?? ''
  const hasRoute = st.route.points.length >= 2

  return (
    <div className="tw flex h-screen w-screen flex-col overflow-hidden" data-lens={st.lens} style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${MODULE_ACCENT}55`, background: `${MODULE_ACCENT}1a` }}>
            <RouteIcon size={18} style={{ color: MODULE_ACCENT }} />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold">دوقلوی دیجیتال خط لوله</p>
            <p className="truncate text-[11px] text-muted">{projectName || 'پروژه‌ای انتخاب نشده'}{project?.projectCode ? ` · ${project.projectCode}` : ''}</p>
          </div>
        </div>

        {projectId && hasRoute && (
          <nav className="tw-lens" aria-label="نمای نقش">
            {LENSES.map((l) => { const I = l.icon; return (
              <button key={l.key} type="button" aria-pressed={st.lens === l.key} title={`نمای ${l.label} — برای ${l.who}`} style={{ '--c': l.color } as CSSProperties} onClick={() => st.setLens(l.key)}><I size={14} aria-hidden /><span>{l.label}</span></button>
            ) })}
          </nav>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          {st.phase && <span className="tw-chip hidden lg:inline-flex">فاز چرخهٔ عمر: <b>{st.phase}</b></span>}
          {hasRoute && <span className={`tw-chip hidden md:inline-flex ${st.routeOrigin === 'twin' && st.route.source === 'demo' ? 'is-warn' : ''}`} title={st.routeOrigin === 'land' ? 'همان مسیری که ماژول تحصیل اراضی رسم می‌کند' : ''}>{st.routeOrigin === 'land' ? 'مسیر مشترک پروژه' : st.route.source === 'demo' ? 'مسیر نمونه (فرضی)' : 'مسیر این ماژول'} · <b>{(st.route.lengthMeters / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} km</b></span>}
          <span className="tw-chip hidden sm:inline-flex"><CalendarDays size={12} /> <b className="num">{formatJalali(new Date().toISOString().slice(0, 10))}</b></span>
          <button type="button" className="tw-btn" onClick={() => setGuide(true)}><BookOpen size={14} /> راهنما</button>
          {projectId && <button type="button" className="tw-btn" onClick={() => setSettings(true)} title="مشخصات لوله و مسیر"><Settings size={14} /> تنظیمات</button>}
          <ModuleHeaderActions onExitToHub={onExitToHub} onBackToRadar={onBackToRadar} />
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {!projectId ? <Center>ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</Center>
          : st.loading ? <Center><Loader2 size={22} className="animate-spin" /> در حال بارگذاری دوقلوی دیجیتال…</Center>
          : st.error && !hasRoute ? <Center>{st.error}</Center>
          : !hasRoute ? (
            <div className="tw-onboard">
              <div>
                <h2>مسیر خط لولهٔ این پروژه هنوز ثبت نشده است</h2>
                <p>دوقلوی دیجیتال روی مسیر واقعی ساخته می‌شود: سرجوش‌ها هر {st.settings.stockLengthM.toLocaleString('fa-IR')} متر روی مسیر قرار می‌گیرند، پیشرفت ساخت روی آن‌ها ثبت می‌شود و دارایی‌ها (شیرها، ایستگاه‌ها، تقاطع‌ها…) با کیلومترشان روی خط نشان داده می‌شوند. {st.plannedKm ? `طول برنامه‌ریزی‌شدهٔ مسیر در ماژول تحصیل اراضی ${st.plannedKm.toLocaleString('fa-IR')} کیلومتر است.` : ''}</p>
                <RouteSetup projectName={projectName} />
              </div>
            </div>
          )
          : <DashboardPage key={projectId} initialLayer={initialLayer} official={official} />}
      </main>
      {guide && <TwinGuide onClose={() => setGuide(false)} />}
      {settings && <SettingsDialog projectName={projectName} onClose={() => setSettings(false)} />}
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center gap-2 p-6 text-center text-sm text-secondary">{children}</div>
}
