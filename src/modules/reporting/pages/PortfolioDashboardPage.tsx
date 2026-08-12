import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, Award, CalendarClock, ChevronLeft, ClipboardList, Gauge, ListChecks, Network, PieChart, ShieldAlert, Target, Users, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { RiskHeatMap } from '../../risk/components/RiskHeatMap'
import { KpiTile } from '../../risk/components/KpiTile'
import { BreakdownDonut, ChartDrillPanel, RankedBarChart, useDrillKey, type ChartDatum } from '../../masterdata/components/RollupCharts'
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
import type { MasterProject, ProjectDependency } from '../../masterdata/types'

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

/** Same compact scaling as fmtCurrency but returns {value, unit} separately for chart bars, whose numeric label can't carry inline text. */
function compactCurrencyParts(n: number, currency: string): { value: number; unit: string } {
  const abs = Math.abs(n)
  if (abs >= 1e12) return { value: Math.round((n / 1e12) * 10) / 10, unit: `هزار میلیارد ${currency}` }
  if (abs >= 1e9) return { value: Math.round((n / 1e9) * 10) / 10, unit: `میلیارد ${currency}` }
  if (abs >= 1e6) return { value: Math.round((n / 1e6) * 10) / 10, unit: `میلیون ${currency}` }
  return { value: Math.round(n), unit: currency }
}

/**
 * Portfolio Executive Dashboard — deliberately independent from the per-project PipePulse
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
    return <div className="flex h-40 items-center justify-center text-xs text-muted">در حال بارگذاری داشبورد اجرایی پورتفولیو...</div>
  }

  if (projects.length === 0) {
    return <div className="flex h-40 items-center justify-center text-xs text-muted">هنوز پروژه‌ای در داده پایه تعریف نشده است.</div>
  }

  return (
    <div className="space-y-4">
      <ScopeBreadcrumb
        portfolios={portfolios}
        programs={programs}
        projects={projects}
        scopePortfolioId={scopePortfolioId}
        scopeProgramId={scopeProgramId}
        scopeProjectId={scopeProjectId}
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

      <KpiRow totals={totals} currency={currency} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HealthDistributionWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <StrategicAlignmentWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <CostExposureWidget totals={totals} currency={currency} />
        <ScheduleExposureWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
      </div>

      <RiskHeatMap risks={scopedRisks} assessments={scopedAssessments} activeCell={null} onCellClick={() => {}} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImportanceHealthMatrixWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <TopCriticalProjectsWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <PriorityRankingWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <ResourceCapacityWidget summaries={scopedSummaries} onDrillProject={drillToProject} />
        <ExecutiveDecisionsWidget summaries={scopedSummaries} projectName={projectName} onDrillProject={drillToProject} />
        <DependencyWidget dependencies={dependencies} summaries={scopedSummaries} allProjects={projects} onDrillProject={drillToProject} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scope navigation
// ---------------------------------------------------------------------------

function ScopeBreadcrumb({
  portfolios,
  programs,
  projects,
  scopePortfolioId,
  scopeProgramId,
  scopeProjectId,
  onRoot,
  onPortfolio,
  onProgram,
}: {
  portfolios: { id: string; name: string }[]
  programs: { id: string; name: string }[]
  projects: MasterProject[]
  scopePortfolioId: string | null
  scopeProgramId: string | null
  scopeProjectId: string | null
  onRoot: () => void
  onPortfolio: (id: string) => void
  onProgram: (id: string) => void
}) {
  const portfolio = scopePortfolioId ? portfolios.find((p) => p.id === scopePortfolioId) : null
  const program = scopeProgramId ? programs.find((p) => p.id === scopeProgramId) : null
  const project = scopeProjectId ? projects.find((p) => p.id === scopeProjectId) : null

  return (
    <div className="glass-panel flex flex-wrap items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs">
      <button onClick={onRoot} className={`rounded-full px-2.5 py-1 font-medium transition-colors ${!portfolio ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
        کل پورتفولیو
      </button>
      {portfolio && (
        <>
          <ChevronLeft size={12} className="opacity-40" />
          <button
            onClick={() => onPortfolio(portfolio.id)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${!program ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}
          >
            {portfolio.name}
          </button>
        </>
      )}
      {program && (
        <>
          <ChevronLeft size={12} className="opacity-40" />
          <button
            onClick={() => onProgram(program.id)}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${!project ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}
          >
            {program.name}
          </button>
        </>
      )}
      {project && (
        <>
          <ChevronLeft size={12} className="opacity-40" />
          <span className="rounded-full bg-teal-500/20 px-2.5 py-1 font-medium text-teal-300">{project.officialName}</span>
        </>
      )}
    </div>
  )
}

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
  portfolios: { id: string; name: string; code: string }[]
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
      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-2 text-xs font-bold text-muted">پورتفولیوها — برای ورود کلیک کنید</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {portfolios.map((pf) => {
            const projectIds = projects.filter((p) => p.portfolioId === pf.id).map((p) => p.id)
            const avgHealth = healthOf(projectIds)
            return (
              <button
                key={pf.id}
                onClick={() => onPortfolio(pf.id)}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-right transition-colors hover:bg-white/5"
              >
                <p className="truncate text-xs font-bold">{pf.name}</p>
                <p className="mt-1 text-[10px] text-muted">{projectIds.length} پروژه</p>
                {avgHealth != null && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${avgHealth}%`, background: avgHealth >= 70 ? '#2ecc71' : avgHealth >= 40 ? '#f1c40f' : '#e74c3c' }} />
                  </div>
                )}
              </button>
            )
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
                    <div className="h-full rounded-full" style={{ width: `${avgHealth}%`, background: avgHealth >= 70 ? '#2ecc71' : avgHealth >= 40 ? '#f1c40f' : '#e74c3c' }} />
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

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

function KpiRow({ totals, currency }: { totals: ReturnType<typeof aggregatePortfolioTotals>; currency: string }) {
  const scheduleKnown = totals.projectCount - totals.scheduleBuckets.unknown
  const scheduleLatePercent = scheduleKnown > 0 ? Math.round(((totals.scheduleBuckets.late_30 + totals.scheduleBuckets.late_30_90 + totals.scheduleBuckets.late_over_90) / scheduleKnown) * 100) : null
  const alignmentPercent = totals.alignedKnownCount > 0 ? Math.round((totals.alignedCount / totals.alignedKnownCount) * 100) : null
  const changeExposurePercent = totals.projectCount > 0 ? Math.round((totals.changeExposureCount / totals.projectCount) * 100) : 0

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
      <KpiTile
        label="شاخص سلامت پورتفولیو"
        value={totals.avgHealthScore}
        color={totals.avgHealthScore >= 70 ? '#2ecc71' : totals.avgHealthScore >= 40 ? '#f1c40f' : '#e74c3c'}
        status={totals.avgHealthScore >= 70 ? 'good' : totals.avgHealthScore >= 40 ? 'warn' : 'bad'}
        tooltip="میانگین وزنی وضعیت زمان‌بندی، ریسک، مسائل باز و تصمیمات معوق هر پروژه — از ۰ تا ۱۰۰."
      />
      <KpiTile
        label="همراستایی استراتژیک"
        value={alignmentPercent == null ? '—' : `${alignmentPercent}٪`}
        color="#38bdf8"
        tooltip="سهم پروژه‌های زیرمجموعه طرح/پورتفولیویی که اهداف استراتژیک برای آن‌ها ثبت شده — به‌عنوان شاخص جایگزین، چون امتیاز عددی همراستایی در سامانه ثبت نمی‌شود."
      />
      <KpiTile label="بودجه مصوب کل (BAC)" value={fmtCurrency(totals.bacSum, currency)} color="#a78bfa" tooltip="مجموع مبلغ قرارداد پروژه‌های این محدوده." />
      <KpiTile
        label="پیش‌بینی هزینه در تکمیل (EAC)"
        value={totals.eacCoverageCount > 0 ? fmtCurrency(totals.eacSum, currency) : 'ثبت نشده'}
        color="#f59e0b"
        tooltip={`فقط پروژه‌هایی که EAC برایشان ثبت شده (${totals.eacCoverageCount} از ${totals.projectCount}) — از صفحه شناسنامه پروژه قابل ثبت است.`}
      />
      <KpiTile
        label={totals.eacCoverageCount === 0 ? 'مواجهه هزینه‌ای (VAC)' : totals.costExposureSum >= 0 ? 'مواجهه هزینه‌ای (VAC) — صرفه‌جویی' : 'مواجهه هزینه‌ای (VAC) — مازاد هزینه'}
        value={totals.eacCoverageCount > 0 ? fmtCurrency(Math.abs(totals.costExposureSum), currency) : 'ثبت نشده'}
        color={totals.costExposureSum >= 0 ? '#2ecc71' : '#e74c3c'}
        status={totals.eacCoverageCount === 0 ? undefined : totals.costExposureSum >= 0 ? 'good' : 'bad'}
        tooltip="BAC منهای EAC، فقط روی پروژه‌های دارای هر دو مقدار. مقدار منفی یعنی هزینه پیش‌بینی‌شده از بودجه مصوب فراتر رفته است."
      />
      <KpiTile
        label="مواجهه زمان‌بندی"
        value={scheduleLatePercent == null ? '—' : `${scheduleLatePercent}٪ تاخیر`}
        color="#f97316"
        status={scheduleLatePercent == null ? undefined : scheduleLatePercent <= 15 ? 'good' : scheduleLatePercent <= 40 ? 'warn' : 'bad'}
        tooltip="سهم پروژه‌هایی که پیش‌بینی پایان آن‌ها از تاریخ برنامه‌ریزی‌شده عقب‌تر است."
      />
      <KpiTile label="پروژه‌های بحرانی" value={totals.criticalProjectCount} color="#e74c3c" status={totals.criticalProjectCount === 0 ? 'good' : 'bad'} tooltip="پروژه‌هایی با شاخص سلامت زیر ۴۰." />
      <KpiTile label="پروژه‌های پرریسک" value={totals.highRiskProjectCount} color="#f97316" status={totals.highRiskProjectCount === 0 ? 'good' : 'warn'} tooltip="پروژه‌های دارای حداقل یک ریسک فعال با سطح زیاد یا بحرانی." />
      <KpiTile
        label="نقاط عطف معوق"
        value={totals.overdueMilestoneCount}
        color="#e74c3c"
        status={totals.overdueMilestoneCount === 0 ? 'good' : 'bad'}
        tooltip="فازهای پروژه (Master Data) با تاریخ پایان برنامه‌ریزی‌شده گذشته که هنوز تکمیل نشده‌اند."
      />
      <KpiTile
        label="پوشش منابع کلیدی"
        value={totals.avgRoleCoverage == null ? '—' : `${Math.round(totals.avgRoleCoverage * 100)}٪`}
        color="#38bdf8"
        tooltip="سهم نقش‌های کلیدی تعریف‌شده که برای هر پروژه فردی مشخص شده — شاخص جایگزین برای ظرفیت منابع، چون ساعت/نفرساعت واقعی در سامانه ثبت نمی‌شود."
      />
      <KpiTile label="تحقق منافع (Benefits)" value="ثبت نشده" color="#64748b" tooltip="هیچ داده یا معیار جایگزینی برای تحقق منافع در سامانه وجود ندارد — به‌جای فرضی‌سازی، این شاخص خالی نمایش داده می‌شود." />
      <KpiTile label="مسائل بحرانی باز" value={totals.openCriticalIssueCount} color="#e74c3c" status={totals.openCriticalIssueCount === 0 ? 'good' : 'bad'} tooltip="مسائل با اولویت بحرانی که هنوز باز/در حال اقدام/منتظر تایید هستند." />
      <KpiTile
        label="تصمیمات معوق مدیریتی"
        value={totals.pendingDecisionCount}
        color="#f1c40f"
        status={totals.overduePendingDecisionCount === 0 ? 'good' : 'bad'}
        trend={totals.overduePendingDecisionCount > 0 ? { direction: 'up', label: `${totals.overduePendingDecisionCount} مورد از مهلت گذشته`, isGood: false } : undefined}
        tooltip="تصمیمات با وضعیت در انتظار/در حال بررسی."
      />
      <KpiTile
        label="مواجهه تغییرات"
        value={`${changeExposurePercent}٪`}
        color="#8b5cf6"
        status={changeExposurePercent <= 20 ? 'good' : changeExposurePercent <= 50 ? 'warn' : 'bad'}
        tooltip="سهم پروژه‌هایی که تاریخ تکمیل بازنگری شده یا نسخه خط مبنا تغییر کرده — نشانه واقعی تغییرات اعمال‌شده."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widgets 1-4
// ---------------------------------------------------------------------------

function HealthDistributionWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const { activeKey, setActiveKey, clear } = useDrillKey()
  const counts: Record<HealthTier, number> = { healthy: 0, watch: 0, critical: 0 }
  for (const s of summaries) counts[s.health]++
  const data: ChartDatum[] = (['healthy', 'watch', 'critical'] as HealthTier[]).map((h) => ({ key: h, label: HEALTH_LABEL_FA[h], value: counts[h], color: HEALTH_COLOR[h] }))
  const filtered = activeKey ? summaries.filter((s) => s.health === activeKey) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <BreakdownDonut title="۱. توزیع سلامت پورتفولیو" icon={<Gauge size={12} className="text-teal-400" />} data={data} unit="پروژه" activeKey={activeKey} onSliceClick={setActiveKey} />
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

function StrategicAlignmentWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const { activeKey, setActiveKey, clear } = useDrillKey()
  const aligned = summaries.filter((s) => s.strategicallyAligned === true).length
  const notAligned = summaries.filter((s) => s.strategicallyAligned === false).length
  const unknown = summaries.filter((s) => s.strategicallyAligned === null).length
  const data: ChartDatum[] = [
    { key: 'aligned', label: 'همراستا', value: aligned, color: '#2ecc71' },
    { key: 'not', label: 'ناهمراستا', value: notAligned, color: '#e74c3c' },
    { key: 'unknown', label: 'نامشخص (بدون طرح/پورتفولیو مشخص)', value: unknown, color: '#64748b' },
  ]
  const filtered = activeKey === 'aligned' ? summaries.filter((s) => s.strategicallyAligned === true) : activeKey === 'not' ? summaries.filter((s) => s.strategicallyAligned === false) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <BreakdownDonut title="۲. همراستایی استراتژیک" icon={<Target size={12} className="text-teal-400" />} data={data} unit="پروژه" activeKey={activeKey} onSliceClick={setActiveKey} />
      <p className="mt-2 text-[10px] leading-5 text-muted">
        هر پروژه همراستا شمرده می‌شود اگر طرح یا پورتفولیوی آن دارای متن «اهداف استراتژیک» ثبت‌شده باشد — چون امتیاز عددی همراستایی هنوز در سامانه وجود ندارد.
      </p>
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

function CostExposureWidget({ totals, currency }: { totals: ReturnType<typeof aggregatePortfolioTotals>; currency: string }) {
  const scale = Math.max(totals.bacSum, totals.eacSum, Math.abs(totals.costExposureSum), 1)
  const unit = compactCurrencyParts(scale, currency).unit
  const divisor = scale / compactCurrencyParts(scale, currency).value || 1
  const data: ChartDatum[] = [
    { key: 'bac', label: 'بودجه مصوب (BAC)', value: Math.round((totals.bacSum / divisor) * 10) / 10, color: '#a78bfa' },
    { key: 'eac', label: 'پیش‌بینی هزینه (EAC)', value: Math.round((totals.eacSum / divisor) * 10) / 10, color: '#f59e0b' },
    { key: 'exposure', label: 'مواجهه هزینه‌ای (VAC)', value: Math.round((Math.abs(totals.costExposureSum) / divisor) * 10) / 10, color: totals.costExposureSum >= 0 ? '#2ecc71' : '#e74c3c' },
  ]
  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="۳. مواجهه هزینه‌ای — BAC در برابر EAC" icon={<Wallet size={12} className="text-teal-400" />} data={data} unit={unit} />
      {totals.eacCoverageCount === 0 ? (
        <p className="mt-2 text-[10px] text-muted">هنوز هیچ پروژه‌ای پیش‌بینی هزینه در تکمیل (EAC) ثبت نکرده — این نمودار تا ثبت اولین مقدار خالی می‌ماند.</p>
      ) : (
        <p className="mt-2 text-[10px] text-muted">
          بر مبنای {totals.eacCoverageCount} از {totals.projectCount} پروژه که EAC برایشان ثبت شده است.
        </p>
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
      <BreakdownDonut title="۴. مواجهه زمان‌بندی" icon={<CalendarClock size={12} className="text-teal-400" />} data={data} unit="پروژه" activeKey={activeKey} onSliceClick={setActiveKey} />
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
// Widgets 6-11 (5 is the RiskHeatMap rendered inline in the page body)
// ---------------------------------------------------------------------------

function ImportanceHealthMatrixWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const [active, setActive] = useState<{ importance: StrategicImportance; health: HealthTier } | null>(null)
  const importances: StrategicImportance[] = ['high', 'medium', 'low']
  const healths: HealthTier[] = ['critical', 'watch', 'healthy']

  const cellItems = (importance: StrategicImportance, health: HealthTier) =>
    summaries.filter((s) => s.health === health && strategicImportanceOf(s, summaries) === importance)

  const activeItems = active ? cellItems(active.importance, active.health) : []

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <ShieldAlert size={12} className="text-teal-400" /> ۶. ماتریس اهمیت استراتژیک × سلامت پروژه
      </p>
      <p className="mb-2 text-[10px] leading-5 text-muted">اهمیت استراتژیک بر مبنای رتبه مبلغ قرارداد (BAC) در میان پروژه‌های این محدوده تخمین زده می‌شود.</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: '70px repeat(3, 1fr)' }} dir="ltr">
        <div />
        {healths.map((h) => (
          <div key={h} className="text-center text-[9px] text-muted">
            {HEALTH_LABEL_FA[h]}
          </div>
        ))}
        {importances.map((imp) => (
          <Fragment key={imp}>
            <div className="flex items-center text-[9px] text-muted">{IMPORTANCE_LABEL_FA[imp]}</div>
            {healths.map((h) => {
              const items = cellItems(imp, h)
              const isActive = active?.importance === imp && active?.health === h
              const flagStrategicUnhealthy = imp === 'high' && h !== 'healthy' && items.length > 0
              return (
                <button
                  key={`${imp}-${h}`}
                  onClick={() => setActive(isActive ? null : { importance: imp, health: h })}
                  className="flex h-11 items-center justify-center rounded-lg text-sm font-bold text-white transition-transform hover:scale-[1.04]"
                  style={{
                    background: HEALTH_COLOR[h],
                    opacity: items.length === 0 ? 0.18 : isActive ? 1 : 0.75,
                    outline: flagStrategicUnhealthy ? '2px solid white' : isActive ? '2px solid rgba(255,255,255,0.6)' : 'none',
                  }}
                >
                  {items.length > 0 ? items.length : ''}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-muted">حاشیه سفید = پروژه‌های با اهمیت استراتژیک بالا که سالم نیستند و نیاز به توجه فوری مدیریت دارند.</p>
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

function TopCriticalProjectsWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const data: ChartDatum[] = summaries
    .filter((s) => s.health !== 'healthy')
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: 100 - s.healthScore, color: HEALTH_COLOR[s.health] }))

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="۷. پروژه‌های بحرانی برتر — نیازمند توجه مدیریت" icon={<AlertTriangle size={12} className="text-teal-400" />} data={data} unit="شاخص عدم سلامت" onBarClick={onDrillProject} />
    </div>
  )
}

function PriorityRankingWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const withBac = summaries.filter((s) => s.bac != null)
  const maxBac = Math.max(1, ...withBac.map((s) => s.bac as number))
  const priorityOf = (s: ProjectDashboardSummary) => {
    const financial = s.bac != null ? (s.bac / maxBac) * 100 : 40
    const risk = 100 - riskScoreOf(s.highestActiveRiskLevel)
    const urgency = Math.max(0, 100 - (s.daysLate != null ? Math.min(100, s.daysLate) : 40))
    const strategic = s.strategicallyAligned === true ? 100 : s.strategicallyAligned === false ? 30 : 50
    return Math.round((financial + risk + urgency + strategic) / 4)
  }
  const data: ChartDatum[] = [...summaries]
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: priorityOf(s), color: '#38bdf8' }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="۸. اولویت‌بندی پورتفولیو" icon={<Award size={12} className="text-teal-400" />} data={data} unit="امتیاز" onBarClick={onDrillProject} />
      <p className="mt-2 text-[10px] leading-5 text-muted">
        ترکیب مساوی ارزش مالی (سهم از بودجه)، ریسک، فوریت زمان‌بندی و همراستایی استراتژیک — شاخص «منافع (Benefit)» به دلیل نبود داده واقعی در این ترکیب لحاظ نشده است.
      </p>
    </div>
  )
}

function riskScoreOf(level: 'low' | 'medium' | 'high' | 'critical' | null): number {
  if (level === 'critical') return 95
  if (level === 'high') return 65
  if (level === 'medium') return 30
  if (level === 'low') return 10
  return 0
}

function ResourceCapacityWidget({ summaries, onDrillProject }: { summaries: ProjectDashboardSummary[]; onDrillProject: (id: string) => void }) {
  const data: ChartDatum[] = summaries
    .filter((s) => s.roleCoverageRatio != null)
    .map((s) => ({ key: s.masterProjectId, label: s.project.officialName, value: Math.round((s.roleCoverageRatio as number) * 100), color: '#38bdf8' }))

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="۹. پوشش منابع کلیدی به تفکیک پروژه" icon={<Users size={12} className="text-teal-400" />} data={data} unit="٪" onBarClick={onDrillProject} />
      <p className="mt-2 text-[10px] leading-5 text-muted">سهم نقش‌های کلیدی پروژه (مدیر پروژه، مدیر ریسک، PMO و ...) که فرد مشخصی برایشان تعیین شده — شاخص جایگزین برای ظرفیت منابع.</p>
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
      <RankedBarChart title="۱۰. تصمیمات مدیریتی معوق" icon={<ClipboardList size={12} className="text-teal-400" />} data={data} unit="تصمیم" onBarClick={onDrillProject} />
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
    color: '#a78bfa',
  }))
  const atRisk = impacts.filter((i) => i.atRisk)

  return (
    <div className="glass-panel rounded-2xl p-4">
      <RankedBarChart title="۱۱. وابستگی‌های بین‌پروژه‌ای — تعداد پروژه‌های وابسته" icon={<Network size={12} className="text-teal-400" />} data={data} unit="پروژه وابسته" onBarClick={onDrillProject} />
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
