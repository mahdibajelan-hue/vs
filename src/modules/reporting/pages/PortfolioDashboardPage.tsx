import { Fragment, useId, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  Flag,
  Gauge,
  Gift,
  Info,
  Layers,
  ListChecks,
  Network,
  PieChart,
  RefreshCw,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { RiskHeatMap } from '../../risk/components/RiskHeatMap'
import { computeExposureTimeline } from '../../risk/lib/riskAnalytics'
import type { RmRisk, RmRiskAssessment } from '../../risk/types'
import { ChartDrillPanel, RankedBarChart, useDrillKey, type ChartDatum } from '../../masterdata/components/RollupCharts'
import { PORTFOLIO_PROGRAM_STATUS_LABEL_FA } from '../../masterdata/types'
import {
  aggregatePortfolioTotals,
  buildProjectSummaries,
  computeDependencyImpacts,
  strategicImportanceOf,
  usePortfolioDashboardRaw,
  type HealthTier,
  type ProjectDashboardSummary,
  type ScheduleBucket,
  type StrategicImportance,
} from '../lib/portfolioDashboard'
import type { MasterProject, Portfolio, ProjectDependency } from '../../masterdata/types'

// Module identity — distinct from every KPI category color below and from every other hub module's accent.
const MODULE_ACCENT = '#6366f1'

// Status colors carry ONE meaning across the whole page: green/amber/red = good/watch/critical. Never reused decoratively.
const HEALTH_COLOR: Record<HealthTier, string> = { healthy: '#2ecc71', watch: '#f1c40f', critical: '#e74c3c' }
const HEALTH_LABEL_FA: Record<HealthTier, string> = { healthy: 'سالم', watch: 'نیازمند توجه', critical: 'بحرانی' }
const SCHEDULE_BUCKET_COLOR: Record<ScheduleBucket, string> = { on_time: '#2ecc71', late_30: '#f1c40f', late_30_90: '#f97316', late_over_90: '#e74c3c', unknown: '#64748b' }
const SCHEDULE_BUCKET_LABEL_FA: Record<ScheduleBucket, string> = {
  on_time: 'طبق برنامه',
  late_30: 'تاخیر تا ۳۰ روز',
  late_30_90: 'تاخیر ۳۰ تا ۹۰ روز',
  late_over_90: 'تاخیر بیش از ۹۰ روز',
  unknown: 'بدون پیش‌بینی ثبت‌شده',
}
const IMPORTANCE_LABEL_FA: Record<StrategicImportance, string> = { high: 'بالا', medium: 'متوسط', low: 'پایین' }

// KPI icon colors are purely a wayfinding grouping (3 families), never a status signal — status lives only in the small dot.
const CAT = { strategic: '#a78bfa', risk: '#f97316', people: '#2dd4bf' }

/** A distinct visual identity per portfolio (icon chip + glow), independent of health color — mirrors the module hub's own card identity system so a portfolio "feels" like a place, not just a filter. */
const PORTFOLIO_ACCENTS = ['#38bdf8', '#a78bfa', '#2dd4bf', '#f59e0b', '#f472b6', '#22c55e', '#818cf8', '#fb923c']

/** Compact currency formatting (میلیون/میلیارد/هزار میلیارد) — raw rial amounts on real contracts run into the trillions and overflow any fixed-width KPI tile or bar label if printed in full. */
function fmtCurrency(n: number, currency = ''): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const suffix = currency ? ` ${currency}` : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} هزار میلیارد${suffix}`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد${suffix}`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیون${suffix}`
  return `${sign}${Math.round(abs).toLocaleString('fa-IR')}${suffix}`
}

function healthTone(score: number): HealthTier {
  return score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'critical'
}

/**
 * Portfolio Management Dashboard — deliberately independent from the per-project PipePulse
 * dashboard (spec: no Project Progress/S-Curve/SPI-CPI/WBS here). Every KPI/widget is computed
 * from real rows already in the system (see lib/portfolioDashboard.ts for the exact formula and
 * which numbers are honest proxies vs. directly real) — nothing here is invented to fill a slot.
 * Drill-down is a single scope filter (Portfolio -> Program -> Project) that every KPI/widget below
 * recomputes against, plus per-widget click-to-drill into the underlying rows (same Power-BI-style
 * pattern as every other module's rollup page).
 */
export function PortfolioDashboardPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const dependencies = useMasterDataStore((s) => s.dependencies)

  const allMasterProjectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const { data: raw, loading } = usePortfolioDashboardRaw(allMasterProjectIds)

  const allSummaries = useMemo(() => (raw ? buildProjectSummaries(projects, portfolios, programs, raw) : []), [raw, projects, portfolios, programs])

  const [scopePortfolioId, setScopePortfolioId] = useState<string | null>(null)
  const [scopeProgramId, setScopeProgramId] = useState<string | null>(null)
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(null)

  const drillToPortfolio = (id: string | null) => {
    setScopePortfolioId(id)
    setScopeProgramId(null)
    setScopeProjectId(null)
  }
  const drillToProgram = (id: string) => {
    const program = programs.find((p) => p.id === id)
    setScopePortfolioId(program?.portfolioId ?? null)
    setScopeProgramId(id)
    setScopeProjectId(null)
  }
  const drillToProject = (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (project) {
      setScopePortfolioId(project.portfolioId)
      setScopeProgramId(project.programId)
    }
    setScopeProjectId(id)
  }

  const scopedSummaries = useMemo(() => {
    return allSummaries.filter((s) => {
      if (scopeProjectId) return s.masterProjectId === scopeProjectId
      if (scopeProgramId) return s.programId === scopeProgramId
      if (scopePortfolioId) return s.portfolioId === scopePortfolioId
      return true
    })
  }, [allSummaries, scopePortfolioId, scopeProgramId, scopeProjectId])

  const totals = useMemo(() => aggregatePortfolioTotals(scopedSummaries), [scopedSummaries])

  const scopedRisks = useMemo(() => (raw ? scopedSummaries.flatMap((s) => raw.risksByMaster.get(s.masterProjectId) ?? []) : []), [raw, scopedSummaries])
  const scopedAssessments = useMemo(() => (raw ? scopedRisks.flatMap((r) => raw.assessmentsByRisk.get(r.id) ?? []) : []), [raw, scopedRisks])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.officialName ?? '—'
  const currency = scopedSummaries.find((s) => s.project.currency)?.project.currency ?? 'ریال'

  if (loading && !raw) {
    return <div className="flex h-40 items-center justify-center text-xs text-muted">در حال بارگذاری داشبورد مدیریت سبد پروژه‌ها...</div>
  }

  if (projects.length === 0) {
    return <div className="flex h-40 items-center justify-center text-xs text-muted">هنوز پروژه‌ای در داده پایه تعریف نشده است.</div>
  }

  return (
    <div className="space-y-4">
      <ScopeHero
        portfolios={portfolios}
        programs={programs}
        projects={projects}
        scopePortfolioId={scopePortfolioId}
        scopeProgramId={scopeProgramId}
        scopeProjectId={scopeProjectId}
        totals={totals}
        onRoot={() => drillToPortfolio(null)}
        onPortfolio={drillToPortfolio}
        onProgram={drillToProgram}
      />

      <LevelPicker
        portfolios={portfolios}
        programs={programs}
        projects={projects}
        summaries={allSummaries}
        scopePortfolioId={scopePortfolioId}
        scopeProgramId={scopeProgramId}
        scopeProjectId={scopeProjectId}
        onPortfolio={drillToPortfolio}
        onProgram={drillToProgram}
        onProject={drillToProject}
      />

      <KpiStrip totals={totals} currency={currency} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PriorityLeaderboardWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <TopCriticalProjectsWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RiskHeatMap risks={scopedRisks} assessments={scopedAssessments} activeCell={null} onCellClick={() => {}} />
        <ImportanceHealthMatrixWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RiskExposureTrendWidget risks={scopedRisks} assessments={scopedAssessments} />
        <CostExposureBulletWidget totals={totals} currency={currency} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HealthDistributionWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <StrategicAlignmentWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <ScheduleExposureWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ResourceCapacityWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <ExecutiveDecisionsWidget summaries={scopedSummaries} projectName={projectName} onDrillProject={drillToProject} />
        <DependencyWidget dependencies={dependencies} summaries={scopedSummaries} allProjects={projects} onDrillProject={drillToProject} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero: big scope title + breadcrumb trail + spotlighted Portfolio Health Index
// ---------------------------------------------------------------------------

function ScopeHero({
  portfolios,
  programs,
  projects,
  scopePortfolioId,
  scopeProgramId,
  scopeProjectId,
  totals,
  onRoot,
  onPortfolio,
  onProgram,
}: {
  portfolios: Portfolio[]
  programs: { id: string; name: string; code: string }[]
  projects: MasterProject[]
  scopePortfolioId: string | null
  scopeProgramId: string | null
  scopeProjectId: string | null
  totals: ReturnType<typeof aggregatePortfolioTotals>
  onRoot: () => void
  onPortfolio: (id: string) => void
  onProgram: (id: string) => void
}) {
  const portfolio = scopePortfolioId ? portfolios.find((p) => p.id === scopePortfolioId) : null
  const program = scopeProgramId ? programs.find((p) => p.id === scopeProgramId) : null
  const project = scopeProjectId ? projects.find((p) => p.id === scopeProjectId) : null

  const { title, eyebrow, Icon, code } = project
    ? { title: project.officialName, eyebrow: 'پروژه', Icon: Briefcase, code: project.projectIdCode }
    : program
      ? { title: program.name, eyebrow: 'طرح', Icon: Layers, code: program.code }
      : portfolio
        ? { title: portfolio.name, eyebrow: 'پورتفولیو', Icon: Briefcase, code: portfolio.code }
        : { title: 'کل سبد پروژه‌های سازمان', eyebrow: 'نمای کلی', Icon: Briefcase, code: '' }

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${MODULE_ACCENT}55`, background: `${MODULE_ACCENT}1a` }}>
              <Icon size={17} style={{ color: MODULE_ACCENT }} />
            </div>
            <span className="text-[11px] font-bold tracking-wide" style={{ color: MODULE_ACCENT }}>
              {eyebrow}
            </span>
            {code && (
              <span className="num text-[11px] text-muted" dir="ltr">
                {code}
              </span>
            )}
          </div>
          <h1 className="mt-2 truncate text-2xl font-extrabold leading-tight sm:text-[2rem]">{title}</h1>
          <p className="mt-1 text-xs text-secondary" dir="ltr">
            Portfolio Management Dashboard
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={onRoot}
              className="rounded-full px-2.5 py-1 font-medium transition-colors"
              style={!portfolio ? { background: `${MODULE_ACCENT}2a`, color: MODULE_ACCENT } : undefined}
            >
              <span className={portfolio ? 'text-secondary hover:text-current' : ''}>کل پورتفولیو</span>
            </button>
            {portfolio && (
              <>
                <ChevronLeft size={12} className="opacity-40" />
                <button
                  onClick={() => onPortfolio(portfolio.id)}
                  className="rounded-full px-2.5 py-1 font-medium transition-colors"
                  style={!program ? { background: `${MODULE_ACCENT}2a`, color: MODULE_ACCENT } : undefined}
                >
                  <span className={program ? 'text-secondary hover:text-current' : ''}>{portfolio.name}</span>
                </button>
              </>
            )}
            {program && (
              <>
                <ChevronLeft size={12} className="opacity-40" />
                <button
                  onClick={() => onProgram(program.id)}
                  className="rounded-full px-2.5 py-1 font-medium transition-colors"
                  style={!project ? { background: `${MODULE_ACCENT}2a`, color: MODULE_ACCENT } : undefined}
                >
                  <span className={project ? 'text-secondary hover:text-current' : ''}>{program.name}</span>
                </button>
              </>
            )}
            {project && (
              <>
                <ChevronLeft size={12} className="opacity-40" />
                <span className="rounded-full px-2.5 py-1 font-medium" style={{ background: `${MODULE_ACCENT}2a`, color: MODULE_ACCENT }}>
                  {project.officialName}
                </span>
              </>
            )}
          </div>
        </div>

        <HealthSpotlight score={totals.avgHealthScore} projectCount={totals.projectCount} healthy={totals.healthy} watch={totals.watch} critical={totals.critical} />
      </div>
    </div>
  )
}

/** The Portfolio Health Index gets a dedicated spotlight treatment — a glowing radial gauge, not just another tile in the grid — since it's the single "is this under control?" number an executive looks at first. */
function HealthSpotlight({ score, projectCount, healthy, watch, critical }: { score: number; projectCount: number; healthy: number; watch: number; critical: number }) {
  const tier = healthTone(score)
  const color = HEALTH_COLOR[tier]
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)

  return (
    <div
      className="relative flex shrink-0 items-center gap-4 rounded-2xl border p-4"
      style={{ borderColor: `${color}44`, background: `linear-gradient(135deg, ${color}14, transparent 70%)`, boxShadow: `0 0 40px -12px ${color}55` }}
    >
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
          <circle cx={55} cy={55} r={radius} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={9} />
          <circle
            cx={55}
            cy={55}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 6px ${color}aa)`, transition: 'stroke-dashoffset 500ms ease' }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="num text-3xl font-extrabold" style={{ color }}>
            {score}
          </p>
          <p className="text-[9px] text-muted">از ۱۰۰</p>
        </div>
        {tier === 'critical' && <div className="absolute inset-0 -z-10 animate-ping rounded-full opacity-20" style={{ background: color }} />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-secondary">شاخص سلامت پورتفولیو</p>
        <p className="mt-0.5 text-[10px] leading-4 text-muted">میانگین وزنی زمان‌بندی، ریسک، مسائل باز و تصمیمات معوق هر پروژه</p>
        <div className="mt-2.5 flex items-center gap-2.5 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_COLOR.healthy }} />
            سالم <span className="num font-bold">{healthy}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_COLOR.watch }} />
            توجه <span className="num font-bold">{watch}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_COLOR.critical }} />
            بحرانی <span className="num font-bold">{critical}</span>
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-muted">
          از مجموع <span className="num font-bold text-secondary">{projectCount}</span> پروژه در این محدوده
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scope navigation — Portfolio -> Program -> Project drill-down
// ---------------------------------------------------------------------------

function LevelPicker({
  portfolios,
  programs,
  projects,
  summaries,
  scopePortfolioId,
  scopeProgramId,
  scopeProjectId,
  onPortfolio,
  onProgram,
  onProject,
}: {
  portfolios: Portfolio[]
  programs: { id: string; name: string; code: string; portfolioId: string | null }[]
  projects: MasterProject[]
  summaries: ProjectDashboardSummary[]
  scopePortfolioId: string | null
  scopeProgramId: string | null
  scopeProjectId: string | null
  onPortfolio: (id: string) => void
  onProgram: (id: string) => void
  onProject: (id: string) => void
}) {
  if (scopeProjectId) return null

  const healthOf = (masterProjectIds: string[]) => {
    const list = summaries.filter((s) => masterProjectIds.includes(s.masterProjectId))
    if (list.length === 0) return null
    return Math.round(list.reduce((sum, s) => sum + s.healthScore, 0) / list.length)
  }

  if (!scopePortfolioId) {
    return (
      <div>
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold text-secondary">
          <Briefcase size={12} style={{ color: MODULE_ACCENT }} /> پورتفولیوهای سازمان — برای مشاهده کنترل استراتژیک هر یک کلیک کنید
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {portfolios.map((pf, i) => {
            const portfolioPrograms = programs.filter((pg) => pg.portfolioId === pf.id)
            const projectIds = projects.filter((p) => p.portfolioId === pf.id).map((p) => p.id)
            const avgHealth = healthOf(projectIds)
            const accent = PORTFOLIO_ACCENTS[i % PORTFOLIO_ACCENTS.length]
            return <PortfolioIdentityCard key={pf.id} portfolio={pf} accent={accent} programCount={portfolioPrograms.length} projectCount={projectIds.length} avgHealth={avgHealth} onSelect={() => onPortfolio(pf.id)} />
          })}
        </div>
      </div>
    )
  }

  const portfolioPrograms = programs.filter((pg) => pg.portfolioId === scopePortfolioId)
  const programIds = new Set(portfolioPrograms.map((pg) => pg.id))
  const directProjects = projects.filter((p) => p.portfolioId === scopePortfolioId && (!p.programId || !programIds.has(p.programId)))

  if (!scopeProgramId) {
    if (portfolioPrograms.length === 0 && directProjects.length === 0) return null
    return (
      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-2 text-xs font-bold text-muted">طرح‌ها و پروژه‌های مستقیم این پورتفولیو</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {portfolioPrograms.map((pg) => {
            const projectIds = projects.filter((p) => p.programId === pg.id).map((p) => p.id)
            const avgHealth = healthOf(projectIds)
            return (
              <button key={pg.id} onClick={() => onProgram(pg.id)} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-right transition-colors hover:bg-white/5">
                <p className="truncate text-xs font-bold">{pg.name}</p>
                <p className="mt-1 text-[10px] text-muted">{projectIds.length} پروژه — طرح</p>
                {avgHealth != null && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${avgHealth}%`, background: HEALTH_COLOR[healthTone(avgHealth)] }} />
                  </div>
                )}
              </button>
            )
          })}
          {directProjects.map((p) => (
            <button key={p.id} onClick={() => onProject(p.id)} className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-right transition-colors hover:bg-white/5">
              <p className="truncate text-xs font-bold">{p.officialName}</p>
              <p className="mt-1 text-[10px] text-muted">پروژه مستقیم پورتفولیو</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const programProjects = projects.filter((p) => p.programId === scopeProgramId)
  if (programProjects.length === 0) return null
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-2 text-xs font-bold text-muted">پروژه‌های این طرح</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {programProjects.map((p) => (
          <button key={p.id} onClick={() => onProject(p.id)} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-right transition-colors hover:bg-white/5">
            <p className="truncate text-xs font-bold">{p.officialName}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Each portfolio gets its own identity (accent color + glow), mirroring the module hub's own card language — but kept narrow (5-up on desktop) so it reads as an entry point, not the dominant element on the page. */
function PortfolioIdentityCard({
  portfolio,
  accent,
  programCount,
  projectCount,
  avgHealth,
  onSelect,
}: {
  portfolio: Portfolio
  accent: string
  programCount: number
  projectCount: number
  avgHealth: number | null
  onSelect: () => void
}) {
  const healthColor = avgHealth == null ? '#64748b' : HEALTH_COLOR[healthTone(avgHealth)]
  return (
    <button
      onClick={onSelect}
      className="hub-grid-card glass-panel group flex flex-col rounded-2xl border p-3.5 text-right"
      style={{
        borderColor: 'var(--border-soft)',
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: accent }} />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110" style={{ background: `${accent}1a`, borderColor: `${accent}44` }}>
            <Briefcase size={16} style={{ color: accent }} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight">{portfolio.name}</p>
            {portfolio.code && (
              <p className="num text-[9.5px] text-muted" dir="ltr">
                {portfolio.code}
              </p>
            )}
          </div>
        </div>
        {avgHealth != null && (
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
              <circle cx={18} cy={18} r={14} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={3.5} />
              <circle cx={18} cy={18} r={14} fill="none" stroke={healthColor} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={2 * Math.PI * 14} strokeDashoffset={2 * Math.PI * 14 * (1 - avgHealth / 100)} />
            </svg>
            <span className="num absolute text-[9px] font-extrabold">{avgHealth}</span>
          </div>
        )}
      </div>

      {portfolio.description && <p className="relative z-10 mt-2 line-clamp-1 text-[10.5px] leading-4 text-secondary">{portfolio.description}</p>}

      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5 text-[9.5px] text-muted">
        <span className="flex items-center gap-1">
          <Layers size={10} /> <span className="num">{programCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <Briefcase size={10} /> <span className="num">{projectCount}</span>
        </span>
        <span className="rounded-full border border-white/10 px-1.5 py-0.5">{PORTFOLIO_PROGRAM_STATUS_LABEL_FA[portfolio.status]}</span>
      </div>

      <div className="relative z-10 mt-2 flex items-center gap-1 text-[10.5px] font-bold transition-all duration-300 group-hover:gap-1.5" style={{ color: accent }}>
        مشاهده کنترل استراتژیک
        <ChevronLeft size={12} className="rotate-180 transition-transform duration-300 group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// KPI strip — small chips, packed tightly; color communicates category only, the dot communicates status
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<'good' | 'warn' | 'bad', string> = { good: '#2ecc71', warn: '#f1c40f', bad: '#e74c3c' }

function KpiChip({
  icon: Icon,
  label,
  value,
  color,
  status,
  tooltip,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  status?: 'good' | 'warn' | 'bad'
  tooltip?: string
}) {
  return (
    <div className="glass-panel group relative flex items-center gap-2 rounded-xl px-2.5 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="num truncate text-sm font-extrabold leading-none">{value}</p>
        <p className="mt-1 truncate text-[9px] leading-none text-muted">{label}</p>
      </div>
      {status && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} />}
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full right-2 z-20 mb-2 w-52 max-w-[80vw] rounded-lg border border-white/10 bg-[var(--bg-panel-solid)] p-2.5 text-[10px] leading-5 text-secondary opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
          <span className="mb-0.5 flex items-center gap-1 font-bold text-primary">
            <Info size={10} /> {label}
          </span>
          {tooltip}
        </div>
      )}
    </div>
  )
}

function KpiStrip({ totals, currency }: { totals: ReturnType<typeof aggregatePortfolioTotals>; currency: string }) {
  const scheduleKnown = totals.projectCount - totals.scheduleBuckets.unknown
  const scheduleLatePercent = scheduleKnown > 0 ? Math.round(((totals.scheduleBuckets.late_30 + totals.scheduleBuckets.late_30_90 + totals.scheduleBuckets.late_over_90) / scheduleKnown) * 100) : null
  const alignmentPercent = totals.alignedKnownCount > 0 ? Math.round((totals.alignedCount / totals.alignedKnownCount) * 100) : null
  const changeExposurePercent = totals.projectCount > 0 ? Math.round((totals.changeExposureCount / totals.projectCount) * 100) : 0

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
      <KpiChip
        icon={Target}
        label="همراستایی استراتژیک"
        value={alignmentPercent == null ? '—' : `${alignmentPercent}٪`}
        color={CAT.strategic}
        tooltip="سهم پروژه‌های زیرمجموعه طرح/پورتفولیویی که اهداف استراتژیک برای آن‌ها ثبت شده."
      />
      <KpiChip icon={Wallet} label="بودجه مصوب کل (BAC)" value={fmtCurrency(totals.bacSum, currency)} color={CAT.strategic} tooltip="مجموع مبلغ قرارداد پروژه‌های این محدوده." />
      <KpiChip
        icon={TrendingUp}
        label="پیش‌بینی هزینه (EAC)"
        value={totals.eacCoverageCount > 0 ? fmtCurrency(totals.eacSum, currency) : 'ثبت نشده'}
        color={CAT.strategic}
        tooltip={`فقط پروژه‌هایی که EAC برایشان ثبت شده (${totals.eacCoverageCount} از ${totals.projectCount}).`}
      />
      <KpiChip
        icon={Scale}
        label="مواجهه هزینه‌ای (VAC)"
        value={totals.eacCoverageCount > 0 ? fmtCurrency(Math.abs(totals.costExposureSum), currency) : 'ثبت نشده'}
        color={CAT.strategic}
        status={totals.eacCoverageCount === 0 ? undefined : totals.costExposureSum >= 0 ? 'good' : 'bad'}
        tooltip="BAC منهای EAC. مقدار منفی یعنی هزینه پیش‌بینی‌شده از بودجه مصوب فراتر رفته است."
      />
      <KpiChip
        icon={CalendarClock}
        label="مواجهه زمان‌بندی"
        value={scheduleLatePercent == null ? '—' : `${scheduleLatePercent}٪`}
        color={CAT.risk}
        status={scheduleLatePercent == null ? undefined : scheduleLatePercent <= 15 ? 'good' : scheduleLatePercent <= 40 ? 'warn' : 'bad'}
        tooltip="سهم پروژه‌هایی که پیش‌بینی پایان آن‌ها از تاریخ برنامه‌ریزی‌شده عقب‌تر است."
      />
      <KpiChip icon={AlertTriangle} label="پروژه‌های بحرانی" value={totals.criticalProjectCount} color={CAT.risk} status={totals.criticalProjectCount === 0 ? 'good' : 'bad'} tooltip="پروژه‌هایی با شاخص سلامت زیر ۴۰." />
      <KpiChip icon={ShieldAlert} label="پروژه‌های پرریسک" value={totals.highRiskProjectCount} color={CAT.risk} status={totals.highRiskProjectCount === 0 ? 'good' : 'warn'} tooltip="پروژه‌های دارای حداقل یک ریسک فعال با سطح زیاد یا بحرانی." />
      <KpiChip icon={Flag} label="نقاط عطف معوق" value={totals.overdueMilestoneCount} color={CAT.risk} status={totals.overdueMilestoneCount === 0 ? 'good' : 'bad'} tooltip="فازهای پروژه با تاریخ پایان برنامه‌ریزی‌شده گذشته که هنوز تکمیل نشده‌اند." />
      <KpiChip icon={AlertCircle} label="مسائل بحرانی باز" value={totals.openCriticalIssueCount} color={CAT.risk} status={totals.openCriticalIssueCount === 0 ? 'good' : 'bad'} tooltip="مسائل با اولویت بحرانی که هنوز باز/در حال اقدام/منتظر تایید هستند." />
      <KpiChip
        icon={Users}
        label="پوشش منابع کلیدی"
        value={totals.avgRoleCoverage == null ? '—' : `${Math.round(totals.avgRoleCoverage * 100)}٪`}
        color={CAT.people}
        tooltip="سهم نقش‌های کلیدی تعریف‌شده که برای هر پروژه فردی مشخص شده."
      />
      <KpiChip icon={Gift} label="تحقق منافع" value="ثبت نشده" color="#64748b" tooltip="هیچ داده یا معیار جایگزینی برای تحقق منافع در سامانه وجود ندارد." />
      <KpiChip
        icon={ClipboardList}
        label="تصمیمات معوق"
        value={totals.pendingDecisionCount}
        color={CAT.people}
        status={totals.overduePendingDecisionCount === 0 ? 'good' : 'bad'}
        tooltip={`تصمیمات در انتظار/در حال بررسی${totals.overduePendingDecisionCount > 0 ? ` — ${totals.overduePendingDecisionCount} مورد از مهلت گذشته` : ''}.`}
      />
      <KpiChip
        icon={RefreshCw}
        label="مواجهه تغییرات"
        value={`${changeExposurePercent}٪`}
        color={CAT.people}
        status={changeExposurePercent <= 20 ? 'good' : changeExposurePercent <= 50 ? 'warn' : 'bad'}
        tooltip="سهم پروژه‌هایی که تاریخ تکمیل بازنگری شده یا نسخه خط مبنا تغییر کرده."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Priority leaderboard — brought up near the top since it's the widget that answers
// "which projects need a management decision first," combining financial/risk/urgency/alignment signals.
// ---------------------------------------------------------------------------

const RANK_COLOR = ['#eab308', '#94a3b8', '#b45309']

function riskScoreOf(level: 'low' | 'medium' | 'high' | 'critical' | null): number {
  if (level === 'critical') return 95
  if (level === 'high') return 65
  if (level === 'medium') return 30
  if (level === 'low') return 10
  return 0
}

function PriorityLeaderboardWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const withBac = summaries.filter((s) => s.bac != null)
  const maxBac = Math.max(1, ...withBac.map((s) => s.bac as number))
  const priorityOf = (s: ProjectDashboardSummary) => {
    const financial = s.bac != null ? (s.bac / maxBac) * 100 : 40
    const risk = 100 - riskScoreOf(s.highestActiveRiskLevel)
    const urgency = Math.max(0, 100 - (s.daysLate != null ? Math.min(100, s.daysLate) : 40))
    const strategic = s.strategicallyAligned === true ? 100 : s.strategicallyAligned === false ? 30 : 50
    return Math.round((financial + risk + urgency + strategic) / 4)
  }
  const ranked = summaries
    .map((s) => ({ s, score: priorityOf(s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <Award size={12} style={{ color: CAT.strategic }} /> اولویت‌بندی پورتفولیو — نیازمند تصمیم مدیریت
      </p>
      <p className="mb-3 text-[10px] leading-5 text-muted">ترکیب مساوی ارزش مالی، ریسک، فوریت زمان‌بندی و همراستایی استراتژیک — بدون شاخص «منافع» به دلیل نبود داده واقعی.</p>
      {ranked.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-[11px] text-muted">داده‌ای برای نمایش نیست</div>
      ) : (
        <div className="space-y-1">
          {ranked.map(({ s, score }, i) => (
            <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-right transition-colors hover:bg-white/5">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                style={i < 3 ? { background: `${RANK_COLOR[i]}2a`, color: RANK_COLOR[i] } : { background: 'rgba(148,163,184,0.12)', color: 'var(--text-muted)' }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.project.officialName}</span>
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10 sm:w-24">
                <span className="block h-full rounded-full" style={{ width: `${score}%`, background: CAT.strategic }} />
              </span>
              <span className="num w-6 shrink-0 text-left text-[11px] font-bold">{score}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TopCriticalProjectsWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const data: ChartDatum[] = summaries
    .filter((s) => s.health !== 'healthy')
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: 100 - s.healthScore, color: HEALTH_COLOR[s.health] }))

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="پروژه‌های بحرانی برتر — نیازمند توجه مدیریت" icon={<AlertTriangle size={12} style={{ color: CAT.risk }} />} data={data} unit="شاخص عدم سلامت" onBarClick={onDrillProject} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Risk heat map (existing shared component) + Strategic Importance x Health matrix
// ---------------------------------------------------------------------------

function ImportanceHealthMatrixWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const [active, setActive] = useState<{ importance: StrategicImportance; health: HealthTier } | null>(null)
  const importances: StrategicImportance[] = ['high', 'medium', 'low']
  const healths: HealthTier[] = ['critical', 'watch', 'healthy']

  const cellItems = (importance: StrategicImportance, health: HealthTier) =>
    summaries.filter((s) => s.health === health && strategicImportanceOf(s, summaries) === importance)

  const rowTotal = (importance: StrategicImportance) => healths.reduce((sum, h) => sum + cellItems(importance, h).length, 0)
  const activeItems = active ? cellItems(active.importance, active.health) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <ShieldAlert size={12} style={{ color: CAT.risk }} /> ماتریس اهمیت استراتژیک × سلامت پروژه
      </p>
      <p className="mb-3 text-[10px] leading-5 text-muted">
        اهمیت استراتژیک بر مبنای رتبه مبلغ قرارداد (BAC) تخمین زده می‌شود — هر ردیف یک سطح اهمیت و هر ستون یک وضعیت سلامت را نشان می‌دهد؛ عدد داخل هر خانه، تعداد پروژه‌های آن ترکیب است.
      </p>

      <div className="mb-2 flex items-center justify-end gap-3 text-[10px]">
        {healths.map((h) => (
          <span key={h} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: HEALTH_COLOR[h] }} />
            {HEALTH_LABEL_FA[h]}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[380px] gap-1.5" style={{ gridTemplateColumns: '96px repeat(3, 1fr)' }}>
          <div className="flex items-end justify-center pb-1 text-[10px] font-bold text-secondary">اهمیت ↓ سلامت →</div>
          {healths.map((h) => (
            <div key={h} className="rounded-lg py-1.5 text-center text-[10px] font-bold" style={{ background: `${HEALTH_COLOR[h]}1f`, color: HEALTH_COLOR[h] }}>
              {HEALTH_LABEL_FA[h]}
            </div>
          ))}
          {importances.map((imp) => {
            const total = rowTotal(imp)
            return (
              <Fragment key={imp}>
                <div className="flex flex-col items-center justify-center rounded-lg bg-white/[0.03] py-1 text-center">
                  <span className="text-[11px] font-bold">{IMPORTANCE_LABEL_FA[imp]}</span>
                  <span className="num text-[9px] text-muted">{total} پروژه</span>
                </div>
                {healths.map((h) => {
                  const items = cellItems(imp, h)
                  const isActive = active?.importance === imp && active?.health === h
                  const flagStrategicUnhealthy = imp === 'high' && h !== 'healthy' && items.length > 0
                  const percent = total > 0 ? Math.round((items.length / total) * 100) : 0
                  return (
                    <button
                      key={`${imp}-${h}`}
                      onClick={() => setActive(isActive ? null : { importance: imp, health: h })}
                      className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg text-white transition-transform hover:scale-[1.03]"
                      style={{
                        background: HEALTH_COLOR[h],
                        opacity: items.length === 0 ? 0.15 : isActive ? 1 : 0.8,
                        outline: flagStrategicUnhealthy ? '2.5px solid white' : isActive ? '2px solid rgba(255,255,255,0.7)' : 'none',
                        outlineOffset: flagStrategicUnhealthy || isActive ? '-2.5px' : 0,
                      }}
                    >
                      {items.length > 0 && (
                        <>
                          <span className="num text-lg font-extrabold leading-none">{items.length}</span>
                          <span className="num text-[9px] opacity-90">{percent}٪</span>
                        </>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-secondary">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-white" />
        حاشیه سفید ضخیم = پروژه‌های با <b>اهمیت استراتژیک بالا</b> که سالم نیستند — نیازمند توجه فوری مدیریت ارشد
      </div>

      {active && activeItems.length > 0 && (
        <div className="mt-3">
          <ChartDrillPanel title={`اهمیت ${IMPORTANCE_LABEL_FA[active.importance]} — ${HEALTH_LABEL_FA[active.health]}`} count={activeItems.length} onClose={() => setActive(null)}>
            {activeItems.map((s) => (
              <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="block w-full rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/5">
                {s.project.officialName}
              </button>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Risk exposure trend — the one genuine time-series in this dashboard, built from real
// risk identification/review dates (riskAnalytics.computeExposureTimeline) — never fabricated.
// ---------------------------------------------------------------------------

function RiskExposureTrendWidget({ risks, assessments }: { risks: RmRisk[]; assessments: RmRiskAssessment[] }) {
  const gradientId = useId()
  const points = useMemo(() => computeExposureTimeline(risks, assessments), [risks, assessments])

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <TrendingUp size={12} style={{ color: CAT.risk }} /> روند مواجهه ریسک پورتفولیو
      </p>
      <p className="mb-2 text-[10px] leading-5 text-muted">مجموع امتیاز ریسک‌های فعال در هر تاریخ شناسایی یا بازبینی واقعی — تنها نمودار روند این داشبورد که از سابقه واقعی داده ساخته می‌شود.</p>
      {points.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-center text-[11px] text-muted">داده تاریخی کافی برای رسم روند ثبت نشده (نیاز به حداقل دو رویداد شناسایی/بازبینی ریسک)</div>
      ) : (
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CAT.risk} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CAT.risk} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={30} />
              <RTooltip
                contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: 'var(--text-secondary)' }}
                formatter={(value) => [value, 'مجموع امتیاز ریسک']}
              />
              <Area type="monotone" dataKey="totalExposure" stroke={CAT.risk} strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cost exposure — bullet-style comparison bar (EAC bar against a BAC target marker)
// ---------------------------------------------------------------------------

function CostExposureBulletWidget({ totals, currency }: { totals: ReturnType<typeof aggregatePortfolioTotals>; currency: string }) {
  const max = Math.max(totals.bacSum, totals.eacSum, 1) * 1.08
  const bacPct = Math.min(100, (totals.bacSum / max) * 100)
  const eacPct = Math.min(100, (totals.eacSum / max) * 100)
  const over = totals.eacSum > totals.bacSum

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <Wallet size={12} style={{ color: CAT.strategic }} /> مواجهه هزینه‌ای — EAC در برابر خط هدف BAC
      </p>
      {totals.eacCoverageCount === 0 ? (
        <div className="flex h-20 items-center justify-center text-center text-[11px] text-muted">هنوز هیچ پروژه‌ای پیش‌بینی هزینه در تکمیل (EAC) ثبت نکرده.</div>
      ) : (
        <>
          <div className="relative mt-4 h-6 w-full rounded-lg" style={{ background: 'rgba(148,163,184,0.12)' }}>
            <div className="absolute inset-y-0 rounded-lg" style={{ right: 0, width: `${eacPct}%`, background: over ? '#e74c3c' : CAT.strategic, opacity: 0.85 }} />
            <div className="absolute inset-y-[-4px] w-[2.5px] rounded-full bg-white" style={{ right: `${bacPct}%` }} title="خط هدف BAC" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: over ? '#e74c3c' : CAT.strategic }} /> EAC: <span className="num font-bold">{fmtCurrency(totals.eacSum, currency)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-0.5 bg-white" /> BAC (خط هدف): <span className="num font-bold">{fmtCurrency(totals.bacSum, currency)}</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted">
            {over ? 'میله از خط هدف عبور کرده — هزینه پیش‌بینی‌شده از بودجه مصوب بیشتر است.' : 'میله هنوز به خط هدف نرسیده — هزینه پیش‌بینی‌شده در محدوده بودجه مصوب است.'} بر مبنای {totals.eacCoverageCount} از{' '}
            {totals.projectCount} پروژه دارای EAC.
          </p>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Distribution widgets — donut kept for Health, stacked segment bars for the other two
// (visually distinct from both the donut and the ranked bar charts used elsewhere)
// ---------------------------------------------------------------------------

function HealthDistributionWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const { activeKey, setActiveKey, clear } = useDrillKey()
  const counts: Record<HealthTier, number> = { healthy: 0, watch: 0, critical: 0 }
  for (const s of summaries) counts[s.health]++
  const total = summaries.length
  const radius = 40
  const stroke = 15
  const circumference = 2 * Math.PI * radius
  let cumulative = 0
  const segments = (['healthy', 'watch', 'critical'] as HealthTier[])
    .filter((h) => counts[h] > 0)
    .map((h) => {
      const len = (counts[h] / total) * circumference
      const gap = 3
      const visibleLen = Math.max(0, len - gap)
      const offset = -(cumulative + gap / 2)
      cumulative += len
      return { h, visibleLen, offset }
    })
  const filtered = activeKey ? summaries.filter((s) => s.health === activeKey) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold">
        <Gauge size={12} style={{ color: CAT.risk }} /> توزیع سلامت پورتفولیو
      </p>
      {total === 0 ? (
        <div className="flex h-40 items-center justify-center text-[11px] text-muted">داده‌ای برای نمایش نیست</div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              {segments.map((s) => {
                const isActive = activeKey === s.h
                const isDimmed = !!activeKey && !isActive
                return (
                  <circle
                    key={s.h}
                    cx={50}
                    cy={50}
                    r={radius}
                    fill="none"
                    stroke={HEALTH_COLOR[s.h]}
                    strokeWidth={isActive ? stroke + 3 : stroke}
                    strokeDasharray={`${s.visibleLen} ${circumference - s.visibleLen}`}
                    strokeDashoffset={s.offset}
                    opacity={isDimmed ? 0.3 : 1}
                    onClick={() => setActiveKey(isActive ? '' : s.h)}
                    style={{ cursor: 'pointer', transition: 'stroke-width 120ms, opacity 120ms' }}
                  />
                )
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="num text-xl font-extrabold">{total}</p>
              <p className="text-[9px] text-muted">مجموع</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {(['healthy', 'watch', 'critical'] as HealthTier[]).map((h) => (
              <button key={h} onClick={() => setActiveKey(activeKey === h ? '' : h)} className="flex items-center gap-1.5 text-[11px]" style={{ opacity: activeKey && activeKey !== h ? 0.55 : 1 }}>
                <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_COLOR[h] }} />
                {HEALTH_LABEL_FA[h]} <span className="num font-bold">{counts[h]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {activeKey && (
        <div className="mt-3">
          <ChartDrillPanel title={`پروژه‌های ${HEALTH_LABEL_FA[activeKey as HealthTier]}`} count={filtered.length} onClose={clear}>
            {filtered.map((s) => (
              <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="block w-full rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/5">
                {s.project.officialName}
              </button>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

function StackedSegmentBar({ data, activeKey, onSegmentClick }: { data: ChartDatum[]; activeKey: string | null; onSegmentClick: (key: string) => void }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) {
    return <div className="flex h-10 items-center justify-center rounded-full bg-white/5 text-[10px] text-muted">داده‌ای برای نمایش نیست</div>
  }
  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.12)' }}>
        {data
          .filter((d) => d.value > 0)
          .map((d) => {
            const isDimmed = !!activeKey && activeKey !== d.key
            return (
              <button
                key={d.key}
                onClick={() => onSegmentClick(d.key)}
                title={`${d.label}: ${d.value}`}
                style={{ width: `${(d.value / total) * 100}%`, background: d.color, opacity: isDimmed ? 0.3 : 1, transition: 'opacity 120ms' }}
              />
            )
          })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d) => (
          <button key={d.key} onClick={() => onSegmentClick(d.key)} className="flex items-center gap-1.5 text-[10.5px]" style={{ opacity: activeKey && activeKey !== d.key ? 0.55 : 1 }}>
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.label} <span className="num font-bold">{d.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StrategicAlignmentWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const { activeKey, setActiveKey, clear } = useDrillKey()
  const aligned = summaries.filter((s) => s.strategicallyAligned === true).length
  const notAligned = summaries.filter((s) => s.strategicallyAligned === false).length
  const unknown = summaries.filter((s) => s.strategicallyAligned === null).length
  const data: ChartDatum[] = [
    { key: 'aligned', label: 'همراستا', value: aligned, color: '#2ecc71' },
    { key: 'not', label: 'ناهمراستا', value: notAligned, color: '#e74c3c' },
    { key: 'unknown', label: 'نامشخص', value: unknown, color: '#64748b' },
  ]
  const filtered = activeKey === 'aligned' ? summaries.filter((s) => s.strategicallyAligned === true) : activeKey === 'not' ? summaries.filter((s) => s.strategicallyAligned === false) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold">
        <Target size={12} style={{ color: CAT.strategic }} /> همراستایی استراتژیک
      </p>
      <StackedSegmentBar data={data} activeKey={activeKey} onSegmentClick={setActiveKey} />
      <p className="mt-2 text-[10px] leading-5 text-muted">هر پروژه همراستا شمرده می‌شود اگر طرح یا پورتفولیوی آن دارای متن «اهداف استراتژیک» ثبت‌شده باشد.</p>
      {activeKey && filtered.length > 0 && (
        <div className="mt-3">
          <ChartDrillPanel title="پروژه‌ها" count={filtered.length} onClose={clear}>
            {filtered.map((s) => (
              <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="block w-full rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/5">
                {s.project.officialName}
              </button>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

function ScheduleExposureWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const { activeKey, setActiveKey, clear } = useDrillKey()
  const counts: Record<ScheduleBucket, number> = { on_time: 0, late_30: 0, late_30_90: 0, late_over_90: 0, unknown: 0 }
  for (const s of summaries) counts[s.scheduleBucket]++
  const data: ChartDatum[] = (['on_time', 'late_30', 'late_30_90', 'late_over_90', 'unknown'] as ScheduleBucket[]).map((b) => ({
    key: b,
    label: SCHEDULE_BUCKET_LABEL_FA[b],
    value: counts[b],
    color: SCHEDULE_BUCKET_COLOR[b],
  }))
  const filtered = activeKey ? summaries.filter((s) => s.scheduleBucket === activeKey) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold">
        <CalendarClock size={12} style={{ color: CAT.risk }} /> مواجهه زمان‌بندی
      </p>
      <StackedSegmentBar data={data} activeKey={activeKey} onSegmentClick={setActiveKey} />
      {activeKey && (
        <div className="mt-3">
          <ChartDrillPanel title={SCHEDULE_BUCKET_LABEL_FA[activeKey as ScheduleBucket]} count={filtered.length} onClose={clear}>
            {filtered.map((s) => (
              <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="block w-full rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/5">
                {s.project.officialName} {s.daysLate != null && s.daysLate > 0 && <span className="num text-muted">— {s.daysLate} روز تاخیر</span>}
              </button>
            ))}
          </ChartDrillPanel>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Remaining ranked lists
// ---------------------------------------------------------------------------

function ResourceCapacityWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const data: ChartDatum[] = summaries
    .filter((s) => s.roleCoverageRatio != null)
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: Math.round((s.roleCoverageRatio as number) * 100), color: CAT.people }))

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="پوشش منابع کلیدی به تفکیک پروژه" icon={<Users size={12} style={{ color: CAT.people }} />} data={data} unit="٪" onBarClick={onDrillProject} />
      <p className="mt-2 text-[10px] leading-5 text-muted">سهم نقش‌های کلیدی پروژه که فرد مشخصی برایشان تعیین شده — شاخص جایگزین برای ظرفیت منابع.</p>
    </div>
  )
}

function ExecutiveDecisionsWidget({
  summaries,
  projectName,
  onDrillProject,
}: {
  summaries: ProjectDashboardSummary[]
  projectName: (id: string) => string
  onDrillProject: (id: string) => void
}) {
  const data: ChartDatum[] = summaries
    .filter((s) => s.pendingDecisionCount > 0)
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: s.pendingDecisionCount, color: s.overduePendingDecisionCount > 0 ? '#e74c3c' : '#f1c40f' }))

  const overdueProjects = summaries.filter((s) => s.overduePendingDecisionCount > 0)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="تصمیمات مدیریتی معوق" icon={<ClipboardList size={12} style={{ color: CAT.people }} />} data={data} unit="تصمیم" onBarClick={onDrillProject} />
      {overdueProjects.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-bold text-red-300">از مهلت گذشته:</p>
          {overdueProjects.map((s) => (
            <button key={s.masterProjectId} onClick={() => onDrillProject(s.masterProjectId)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-right text-[11px] hover:bg-white/5">
              <ListChecks size={11} className="text-red-400" /> {projectName(s.masterProjectId)}
              <span className="num text-muted">— {s.overduePendingDecisionCount} تصمیم معوق</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DependencyWidget({
  dependencies,
  summaries,
  allProjects,
  onDrillProject,
}: {
  dependencies: ProjectDependency[]
  summaries: ProjectDashboardSummary[]
  allProjects: MasterProject[]
  onDrillProject: (id: string) => void
}) {
  const impacts = computeDependencyImpacts(dependencies, summaries)
  const fanIn = new Map<string, number>()
  for (const dep of dependencies) fanIn.set(dep.dependsOnProjectId, (fanIn.get(dep.dependsOnProjectId) ?? 0) + 1)
  const data: ChartDatum[] = [...fanIn.entries()].map(([id, count]) => ({
    key: id,
    label: allProjects.find((p) => p.id === id)?.officialName ?? '—',
    value: count,
    color: CAT.strategic,
  }))
  const atRisk = impacts.filter((i) => i.atRisk)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="وابستگی‌های بین‌پروژه‌ای" icon={<Network size={12} style={{ color: CAT.strategic }} />} data={data} unit="پروژه وابسته" onBarClick={onDrillProject} />
      {dependencies.length === 0 ? (
        <p className="mt-2 text-[10px] text-muted">هنوز هیچ وابستگی بین‌پروژه‌ای در شناسنامه پروژه‌ها ثبت نشده است.</p>
      ) : atRisk.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-bold text-red-300">وابستگی‌های در معرض ریسک تاخیر آبشاری:</p>
          {atRisk.map((i) => (
            <button
              key={i.dependency.id}
              onClick={() => onDrillProject(i.fromProject.id)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-right text-[11px] hover:bg-white/5"
            >
              <PieChart size={11} className="text-red-400" />
              {i.fromProject.officialName} ← وابسته به {i.onProject.officialName}
              {i.onProjectDaysLate != null && i.onProjectDaysLate > 0 && <span className="num text-muted">({i.onProjectDaysLate} روز تاخیر)</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-green-300">هیچ‌کدام از پروژه‌های مرجع وابستگی در وضعیت تاخیر یا ناسالم نیستند.</p>
      )}
    </div>
  )
}
