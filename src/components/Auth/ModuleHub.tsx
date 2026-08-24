import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Award, Banknote, Briefcase, BarChart3, Calculator, CheckCircle2,
  Clock3, GitBranch, Package, Radar, Route, ShieldAlert, Sparkles, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { useMasterDataStore } from '../../modules/masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useLifecycleStore } from '../../modules/lifecycle/store/useLifecycleStore'
import { DEFAULT_STAGE_ORDER, STAGE_LABEL_FA, type StageKey } from '../../modules/lifecycle/types'
import { ContextSwitcher } from '../../modules/masterdata/components/ContextSwitcher'
import { SignOutButton } from './SignOutButton'

const GOLD = '#c9a227'

interface ModuleDef {
  key: ModuleKey
  title: string
  englishTag: string
  teaser: string
  bullets: string[]
  icon: LucideIcon
  accent: string
  status: 'active' | 'soon'
}

const MODULES: ModuleDef[] = [
  {
    key: 'risk',
    title: 'مدیریت ریسک',
    englishTag: 'Risk Management',
    teaser: 'شناسایی و کنترل ریسک‌های پروژه',
    bullets: ['شناسایی و ارزیابی ریسک‌های پروژه', 'پایش روند و گزارش مدیریتی'],
    icon: ShieldAlert,
    accent: '#e74c3c',
    status: 'active',
  },
  {
    key: 'issues',
    title: 'مدیریت مسائل',
    englishTag: 'Issue Management',
    teaser: 'پیگیری مسائل و موانع اجرایی',
    bullets: ['ثبت و پیگیری مسائل اجرایی', 'گزارش تاخیر لحظه‌ای'],
    icon: AlertTriangle,
    accent: '#a78bfa',
    status: 'active',
  },
  {
    key: 'pipepulse',
    title: 'PipePulse',
    englishTag: 'Piping Progress Intelligence',
    teaser: 'پایش بصری پیشرفت پایپینگ',
    bullets: ['پایش بصری پیشرفت خطوط', 'برنامه زمان‌بندی و گزارش‌دهی'],
    icon: Sparkles,
    accent: '#0ea5e9',
    status: 'active',
  },
  {
    key: 'reporting',
    title: 'گزارش‌گیری هوشمند',
    englishTag: 'Intelligent Reporting',
    teaser: 'گزارش‌های یکپارچه از همه ماژول‌ها',
    bullets: ['تجمیع زنده داده از همه ماژول‌ها', 'هشدار زودهنگام و مرکز تصمیم'],
    icon: BarChart3,
    accent: '#2dd4bf',
    status: 'active',
  },
  {
    key: 'executive',
    title: 'مدیریت سبد پروژه‌ها',
    englishTag: 'Portfolio Management',
    teaser: 'کنترل استراتژیک، مالی و ریسک کل سبد پروژه‌ها',
    bullets: ['وضعیت کلی سلامت پورتفولیو برای مدیران ارشد', 'ابزار تصمیم‌گیری اجرایی، نه جمع ساده KPIهای پروژه'],
    icon: Briefcase,
    accent: '#6366f1',
    status: 'active',
  },
  {
    key: 'finance',
    title: 'مدیریت مالی پروژه',
    englishTag: 'Financial Management',
    teaser: 'بودجه، قرارداد، صورت‌وضعیت و جریان نقدی',
    bullets: ['کنترل بودجه، تعهدات قراردادی و صورت‌وضعیت‌ها', 'پیش‌بینی جریان نقدی از پروژه تا پورتفولیو'],
    icon: Banknote,
    accent: '#10b981',
    status: 'active',
  },
  {
    key: 'material',
    title: 'مدیریت تامین کالا',
    englishTag: 'Material Supply Management',
    teaser: 'ردیابی کالا از MTO تا انبار و تخصیص',
    bullets: ['زنجیره کامل تامین: MTO، خرید، ساخت، حمل و انبار', 'کسری و آمادگی اجرا برای هر بسته کاری'],
    icon: Package,
    accent: '#f59e0b',
    status: 'active',
  },
  {
    key: 'pipelinedigitaltwin',
    title: 'دوقلوی دیجیتال خط لوله',
    englishTag: 'Pipeline Digital Twin',
    teaser: 'نمایش سه‌بعدی جغرافیایی و کنترل اجرای خط لوله',
    bullets: ['مسیر خط روی مدل سه‌بعدی زمین (Cesium)', 'واردکردن مسیر از KMZ/KML و محاسبه Chainage'],
    icon: Route,
    accent: '#38bdf8',
    status: 'active',
  },
  {
    key: 'competency',
    title: 'ارزیابی شایستگی',
    englishTag: 'Competency Assessment',
    teaser: 'مصاحبه ساختاریافته و امتیازدهی مدیران پروژه',
    bullets: ['ثبت مشخصات و سوابق نامزد پیش از مصاحبه', 'امتیازدهی در ۷ حوزه شایستگی و نمودار رادار'],
    icon: Award,
    accent: '#a855f7',
    status: 'active',
  },
  {
    key: 'estimator',
    title: 'برآورد هزینه پروژه',
    englishTag: 'Project Cost Estimator',
    teaser: 'ماشین‌حساب برآورد مالی EPC خط لوله',
    bullets: ['ساختار شکست هزینه (CBS) و تحلیل حساسیت', 'زمان‌بندی فصلی جریان نقدی و خروجی گزارش'],
    icon: Calculator,
    accent: '#F2B705',
    status: 'active',
  },
  {
    key: 'lifecycle',
    title: 'چرخه عمر و برج کنترل',
    englishTag: 'Project Lifecycle & Control Tower',
    teaser: 'وضعیت واقعی پروژه‌ها در سه سطح سبد، طرح و پروژه',
    bullets: ['مراحل و گیت‌های چرخه عمر با سنجش آمادگی عبور', 'Milestone، هشدار زودهنگام و موارد نیازمند توجه مدیریت'],
    icon: GitBranch,
    accent: '#38bdf8',
    status: 'active',
  },
  {
    key: 'admin',
    title: 'مدیریت کاربران',
    englishTag: 'User & Access Management',
    teaser: 'دسترسی کاربران در همه ماژول‌ها',
    bullets: ['مدیریت کاربران و نقش‌ها', 'دسترسی یکپارچه به هر سه ماژول'],
    icon: Users,
    accent: GOLD,
    status: 'active',
  },
]

const MODULE_BY_KEY = new Map(MODULES.map((m) => [m.key, m]))

/**
 * Phase-1 static curated table (spec decision: manual table, not computed relevance) — which
 * modules genuinely have work to do at each lifecycle stage. Only Finance and Material are
 * mapped: they're the two modules with a real masterProjectId link AND a natural per-stage
 * workload (see the 12-module connectivity audit — the other 9 modules are either cross-cutting
 * utilities that don't vary by stage, or not yet linked to a master project at all).
 */
const STAGE_MODULE_MAP: Record<StageKey, ModuleKey[]> = {
  idea: [],
  pre_project: [],
  initiation: [],
  planning: ['finance'],
  engineering: ['material'],
  procurement: ['material', 'finance'],
  execution: ['material', 'finance'],
  commissioning: ['finance'],
  handover: ['finance'],
  close_out: ['finance'],
  lessons_learned: [],
}

/** Always-visible cross-cutting utilities — not stage-specific by nature, so never highlighted or hidden. */
const CROSS_CUTTING: ModuleKey[] = ['reporting', 'executive', 'admin']

/** Not yet linked to a master project (no masterProjectId / confirmed mapping) — stay in a fixed
 * sidebar, reachable regardless of which project or stage is selected, never stage-highlighted. */
const FIXED_SIDEBAR: ModuleKey[] = ['risk', 'issues', 'pipepulse', 'competency', 'estimator', 'pipelinedigitaltwin']

export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const allLifecycles = useLifecycleStore((s) => s.allLifecycles)
  const fetchPortfolioWide = useLifecycleStore((s) => s.fetchPortfolioWide)
  const contextProjectId = useProjectContextStore((s) => s.projectId)

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    fetchPortfolioWide()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(() => masterProjects.find((p) => p.id === contextProjectId) ?? null, [masterProjects, contextProjectId])
  const currentStageKey = useMemo(() => {
    if (!selectedProject) return null
    return allLifecycles.find((l) => l.projectId === selectedProject.id)?.currentStageKey ?? null
  }, [allLifecycles, selectedProject])

  const highlighted = useMemo(() => new Set(currentStageKey ? (STAGE_MODULE_MAP[currentStageKey as StageKey] ?? []) : []), [currentStageKey])

  const isVisible = (key: ModuleKey) => hasModuleAccess(accessibleModules, key)
  const stageModules = (['finance', 'material'] as ModuleKey[]).filter(isVisible)
  const crossCuttingModules = CROSS_CUTTING.filter(isVisible)
  const sidebarModules = FIXED_SIDEBAR.filter(isVisible)
  const lifecycleVisible = isVisible('lifecycle')

  const handleSelect = (m: ModuleDef) => {
    if (m.status === 'active') {
      onEnterModule(m.key)
      return
    }
    setNotice(`ماژول «${m.title}» به‌زودی راه‌اندازی می‌شود`)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  // overflow-x: hidden forces the browser's USED value for overflow-y to `auto` — even when
  // overflow-y is explicitly set to `visible` — per the CSS Overflow spec's "used value"
  // computation (only exempt if the other axis is `clip`, not `hidden`). That silently turned
  // this div into its OWN nested scroll container (confirmed: its scrollHeight exceeded its
  // clientHeight independently of the page), competing with the page's normal body scroll — two
  // scrollable ancestors fighting over the same swipe is exactly what made mobile scrolling feel
  // stuck and need several tries. overflow-x-clip clips the decorative blobs the same as hidden
  // did, but is explicitly exempt from that auto-computation, so this div never becomes a scroll
  // container — only body/html scroll, one unambiguous container.
  return (
    <div className="relative min-h-screen w-screen overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="hub-blob hub-blob-a" style={{ background: '#0ea5e9' }} />
      <div className="hub-blob hub-blob-b" style={{ background: '#a78bfa' }} />
      <div className="hub-blob hub-blob-c" style={{ background: '#e74c3c' }} />

      <header className="hub-grid-topbar hub-fade-in flex items-center justify-between border-b px-6 py-4 sm:px-10" style={{ borderColor: 'var(--border-soft)', animationDelay: '0ms' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'rgba(201,162,39,0.35)', background: 'rgba(201,162,39,0.08)' }}>
            <span className="rasta-wordmark text-base" style={{ fontWeight: 800 }}>
              R
            </span>
          </div>
          <div className="leading-tight">
            <p className="rasta-wordmark text-xl" style={{ fontWeight: 800 }}>
              RASTA
            </p>
            <p className="eyebrow-en" dir="ltr">
              Integrated Project Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <p className="text-xs font-bold tracking-[0.25em]" style={{ color: GOLD }}>
              PLATFORM SUITE
            </p>
            <div className="rasta-brokenline">
              <span className="rasta-brokenline-seg" />
              <span className="rasta-brokenline-dot" />
              <span className="rasta-brokenline-seg is-reverse" />
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-10 sm:px-10">
        <div className="hub-fade-in mb-8 text-center" style={{ animationDelay: '80ms' }}>
          <h1 className="text-3xl font-extrabold sm:text-4xl">پلتفرم یکپارچه مدیریت و کنترل پروژه</h1>
          <p className="eyebrow-en mt-2" dir="ltr">
            Unified Project Management & Control Platform
          </p>
          <p className="mt-3 text-sm text-secondary">یک پروژه را انتخاب کنید تا مراحل و ماژول‌های مرتبط آن نمایان شود</p>
        </div>

        <div className="hub-fade-in mb-8 flex justify-center" style={{ animationDelay: '120ms' }}>
          <ContextSwitcher />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* ── Main column: stage bar + lifecycle hero + stage-mapped/cross-cutting modules ── */}
          <div className="min-w-0 flex-1 space-y-6">
            <StageBar project={selectedProject} currentStageKey={currentStageKey} />

            {lifecycleVisible && (
              <button
                onClick={() => onEnterModule('lifecycle')}
                className="hub-grid-card hub-fade-in group flex w-full items-center gap-4 rounded-2xl border p-5 text-right"
                style={{ borderColor: 'color-mix(in srgb, var(--plc-amber, #f0a836) 40%, var(--border-soft))', animationDelay: '160ms' }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110"
                  style={{ background: 'color-mix(in srgb, var(--plc-amber, #f0a836) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--plc-amber, #f0a836) 40%, transparent)' }}
                >
                  <Radar size={22} style={{ color: 'var(--plc-amber, #f0a836)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold">ورود به برج کنترل پروژه</p>
                  <p className="mt-0.5 text-xs text-secondary">
                    {selectedProject
                      ? currentStageKey
                        ? `«${selectedProject.officialName}» اکنون در مرحله «${STAGE_LABEL_FA[currentStageKey as StageKey]}» است`
                        : `«${selectedProject.officialName}» هنوز در چرخه عمر تعریف نشده است`
                      : 'مراحل، گیت‌ها، Milestone و هشدارهای زودهنگام همه پروژه‌ها'}
                  </p>
                </div>
                <ArrowLeft size={16} className="shrink-0 transition-transform duration-300 group-hover:-translate-x-0.5" style={{ color: 'var(--plc-amber, #f0a836)' }} />
              </button>
            )}

            {stageModules.length > 0 && (
              <section>
                <SectionLabel
                  text={selectedProject && currentStageKey ? `کار این مرحله (${STAGE_LABEL_FA[currentStageKey as StageKey]})` : 'ماژول‌های وابسته به مرحله'}
                  hint={!selectedProject ? 'با انتخاب پروژه، ماژول مرتبط با مرحله فعلی برجسته می‌شود' : undefined}
                />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {stageModules.map((key, i) => {
                    const m = MODULE_BY_KEY.get(key)!
                    return (
                      <ModuleCard
                        key={m.key}
                        module={m}
                        index={i}
                        onSelect={() => handleSelect(m)}
                        emphasize={highlighted.has(m.key)}
                        tag={highlighted.has(m.key) ? 'کار در این مرحله' : undefined}
                      />
                    )
                  })}
                </div>
              </section>
            )}

            {crossCuttingModules.length > 0 && (
              <section>
                <SectionLabel text="ابزارهای همیشه در دسترس" hint="مستقل از مرحله پروژه" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {crossCuttingModules.map((key, i) => {
                    const m = MODULE_BY_KEY.get(key)!
                    return <ModuleCard key={m.key} module={m} index={i} onSelect={() => handleSelect(m)} />
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── Fixed sidebar: modules not yet linked to master data, unaffected by stage/project ── */}
          {sidebarModules.length > 0 && (
            <aside className="hub-fade-in w-full shrink-0 lg:w-72" style={{ animationDelay: '200ms' }}>
              <SectionLabel text="ابزارهای مستقل" hint="پروژه اختصاصی هر ماژول را داخل خودش انتخاب کنید" />
              <div className="space-y-2.5">
                {sidebarModules.map((key) => {
                  const m = MODULE_BY_KEY.get(key)!
                  return <SidebarModuleCard key={m.key} module={m} onSelect={() => handleSelect(m)} />
                })}
              </div>
            </aside>
          )}
        </div>

        <p className="hub-fade-in mt-12 text-center text-[11px] text-muted" style={{ animationDelay: '500ms' }}>
          © {new Date().getFullYear()} RASTA — Developed &amp; Designed by Mahdi Bajelan
        </p>
      </main>

      {notice && (
        <div className="hub-toast fixed bottom-8 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-[var(--bg-panel-solid)] px-5 py-2.5 text-xs font-medium shadow-2xl">
          <span className="flex items-center gap-2">
            <Clock3 size={14} className="text-brand-400" />
            {notice}
          </span>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-sm font-bold text-secondary">{text}</h2>
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </div>
  )
}

function StageBar({ project, currentStageKey }: { project: { officialName: string } | null; currentStageKey: string | null }) {
  const currentIndex = currentStageKey ? DEFAULT_STAGE_ORDER.indexOf(currentStageKey as StageKey) : -1

  return (
    <div className="hub-fade-in glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)', animationDelay: '140ms' }}>
      {!project ? (
        <p className="py-2 text-center text-[11px] text-muted">
          برای مشاهده مراحل چرخه عمر و برجسته‌شدن ماژول‌های مرتبط، یک پروژه از بالا انتخاب کنید
        </p>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {DEFAULT_STAGE_ORDER.map((stageKey, i) => {
            const isCurrent = i === currentIndex
            const isPast = currentIndex >= 0 && i < currentIndex
            const relevantModules = STAGE_MODULE_MAP[stageKey]
            return (
              <div key={stageKey} className="flex shrink-0 items-center gap-1.5">
                <div
                  className="flex flex-col items-center gap-1 rounded-xl border px-2.5 py-1.5"
                  style={{
                    borderColor: isCurrent ? 'var(--plc-amber, #f0a836)' : 'var(--border-soft)',
                    background: isCurrent ? 'color-mix(in srgb, var(--plc-amber, #f0a836) 12%, transparent)' : isPast ? 'color-mix(in srgb, var(--border-soft) 60%, transparent)' : 'transparent',
                    opacity: isPast || isCurrent ? 1 : 0.55,
                  }}
                >
                  <span className="whitespace-nowrap text-[10px] font-bold" style={{ color: isCurrent ? 'var(--plc-amber, #f0a836)' : undefined }}>
                    {STAGE_LABEL_FA[stageKey]}
                  </span>
                  {relevantModules.length > 0 && (
                    <div className="flex items-center gap-1">
                      {relevantModules.map((mk) => (
                        <span key={mk} className="h-1.5 w-1.5 rounded-full" style={{ background: MODULE_BY_KEY.get(mk)?.accent }} title={MODULE_BY_KEY.get(mk)?.title} />
                      ))}
                    </div>
                  )}
                </div>
                {i < DEFAULT_STAGE_ORDER.length - 1 && <div className="h-px w-3 shrink-0" style={{ background: 'var(--border-soft)' }} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ModuleCard({
  module: m, index, onSelect, emphasize, tag,
}: {
  module: ModuleDef
  index: number
  onSelect: () => void
  emphasize?: boolean
  tag?: string
}) {
  const Icon = m.icon
  return (
    <button
      onClick={onSelect}
      className="hub-grid-card hub-fade-in group flex flex-col rounded-[1.25rem] border p-5 text-right"
      style={{
        borderColor: emphasize ? 'color-mix(in srgb, var(--plc-amber, #f0a836) 55%, var(--border-soft))' : 'var(--border-soft)',
        boxShadow: emphasize ? '0 0 0 1px color-mix(in srgb, var(--plc-amber, #f0a836) 30%, transparent) inset' : undefined,
        animationDelay: `${120 + index * 70}ms`,
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': m.accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: m.accent }} />

      <div className="relative z-10 mb-4 flex items-start justify-between">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${m.accent}1a`, borderColor: `${m.accent}44` }}
        >
          <Icon size={22} style={{ color: m.accent }} />
        </div>
        {tag ? (
          <span
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
            style={{ borderColor: 'color-mix(in srgb, var(--plc-amber, #f0a836) 45%, transparent)', color: 'var(--plc-amber, #f0a836)', background: 'color-mix(in srgb, var(--plc-amber, #f0a836) 10%, transparent)' }}
          >
            {tag}
          </span>
        ) : m.status === 'active' ? (
          <span className="flex items-center gap-1 rounded-full border border-green-400/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-300">
            <CheckCircle2 size={10} /> فعال
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-muted">
            <Clock3 size={10} /> به‌زودی
          </span>
        )}
      </div>

      <p className="relative z-10 text-base font-extrabold" style={{ fontFamily: m.key === 'pipepulse' ? "'Montserrat', sans-serif" : undefined }}>
        {m.title}
      </p>
      <p className="eyebrow-en relative z-10 mt-0.5" dir="ltr">
        {m.englishTag}
      </p>

      <div className="relative z-10 mt-3.5 space-y-1.5">
        {m.bullets.map((b) => (
          <div key={b} className="flex items-start gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: m.accent }} />
            <p className="text-[11px] leading-5 text-secondary">{b}</p>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-auto flex items-center gap-1.5 pt-4 text-xs font-bold transition-all duration-300 group-hover:gap-2.5" style={{ color: m.accent }}>
        {m.status === 'active' ? 'ورود به ماژول' : 'مشاهده جزئیات'}
        <ArrowLeft size={14} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
      </div>
    </button>
  )
}

/** Compact card for the fixed sidebar — icon, title and an arrow, no bullets — so six modules fit
 * comfortably in a narrow persistent column regardless of which project/stage is active. */
function SidebarModuleCard({ module: m, onSelect }: { module: ModuleDef; onSelect: () => void }) {
  const Icon = m.icon
  return (
    <button
      onClick={onSelect}
      className="hub-grid-card group flex w-full items-center gap-3 rounded-xl border p-3 text-right"
      style={{
        borderColor: 'var(--border-soft)',
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': m.accent,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110"
        style={{ background: `${m.accent}1a`, borderColor: `${m.accent}44` }}
      >
        <Icon size={17} style={{ color: m.accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-bold" style={{ fontFamily: m.key === 'pipepulse' ? "'Montserrat', sans-serif" : undefined }}>
          {m.title}
        </p>
        <p className="truncate text-[10px] text-muted">{m.teaser}</p>
      </div>
      <ArrowLeft size={13} className="shrink-0 text-muted transition-transform duration-300 group-hover:-translate-x-0.5" />
    </button>
  )
}
