import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, Briefcase, Building2, Calculator, CalendarClock, FolderKanban, Landmark, Scale, Target, TrendingDown, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import {
  aggregateFinancialSummaries,
  computeCashFlowSeries,
  computeProjectFinancialSummary,
  cumulativeCashFlow,
  ensureForwardMonths,
  mergeRequiredCashflow,
  todayIso,
  type CashFlowPointWithRequired,
  type ProjectFinancialSummary,
} from '../lib/financeCalc'
import { fmtCurrency, fmtMonthJalali } from '../components/FinanceKpiTile'
import { MetricCard } from '../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../FinanceApp'
import { RankedBarChart, type ChartDatum } from '../../masterdata/components/RollupCharts'
import type { MasterProject } from '../../masterdata/types'

type Level = 'portfolio' | 'program' | 'project'

const LEVELS: { id: Level; label: string; icon: typeof Building2 }[] = [
  { id: 'portfolio', label: 'پورتفولیو', icon: Building2 },
  { id: 'program', label: 'برنامه', icon: Briefcase },
  { id: 'project', label: 'پروژه', icon: FolderKanban },
]

export function CashFlowForecastPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const cashflowForecasts = useFinanceStore((s) => s.cashflowForecasts)

  const [level, setLevel] = useState<Level>('portfolio')
  const [portfolioId, setPortfolioId] = useState<string>('')
  const [programId, setProgramId] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')

  const summarize = (projectIds: string[]): ProjectFinancialSummary => {
    const summaries = projectIds.map((id) => {
      const p = projects.find((pr) => pr.id === id)
      const budget = budgets.find((b) => b.masterProjectId === id) ?? null
      const changes = budgetChanges.filter((c) => c.masterProjectId === id)
      return computeProjectFinancialSummary(id, p?.forecastCostAtCompletion ?? null, budget, changes, contracts, amendments, certificates)
    })
    return aggregateFinancialSummaries(summaries)
  }

  /** Also merges the contractor-submitted monthly Cash Call onto the series, so "required" (what the contractor said) and "gap" (required - actual paid) chart alongside planned/actual/forecast. */
  const scopedCashFlow = (projectIds: string[]): CashFlowPointWithRequired[] => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    const scopedAmendments = amendments.filter((a) => contractIds.has(a.contractId))
    const scopedCertificates = certificates.filter((c) => contractIds.has(c.contractId))
    const scopedForecasts = cashflowForecasts.filter((f) => contractIds.has(f.contractId))
    // Spec: "minimum 12-month forecast" at every level — pad forward months with zero activity rather than truncating the chart/report.
    const points = ensureForwardMonths(computeCashFlowSeries(scopedContracts, scopedAmendments, scopedCertificates))
    return mergeRequiredCashflow(points, scopedForecasts)
  }

  const scopeCurrency = (projectIds: string[]) => {
    const p = projects.find((pr) => projectIds.includes(pr.id))
    return budgets.find((b) => b.masterProjectId === p?.id)?.currency ?? p?.currency ?? 'ریال'
  }

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <p className="text-xs fin-text-muted">جریان نقدی و پیش‌بینی مالی — سطح پروژه / برنامه / پورتفولیو</p>
        <h1 className="mt-1 text-lg font-extrabold">تجمیع مالی چندسطحی</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-full border p-1 w-fit" style={{ borderColor: 'var(--fin-divider)' }}>
          {LEVELS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLevel(id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={level === id ? { background: `${FINANCE_ACCENT}2a`, color: FINANCE_ACCENT } : undefined}
            >
              <Icon size={13} />
              <span className={level === id ? '' : 'fin-text-secondary'}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {level === 'portfolio' && (
        <PortfolioScope
          portfolios={portfolios}
          programs={programs}
          projects={projects}
          portfolioId={portfolioId}
          setPortfolioId={setPortfolioId}
          summarize={summarize}
          scopedCashFlow={scopedCashFlow}
          scopeCurrency={scopeCurrency}
        />
      )}
      {level === 'program' && (
        <ProgramScope
          programs={programs}
          portfolios={portfolios}
          projects={projects}
          programId={programId}
          setProgramId={setProgramId}
          summarize={summarize}
          scopedCashFlow={scopedCashFlow}
          scopeCurrency={scopeCurrency}
        />
      )}
      {level === 'project' && (
        <ProjectScope projects={projects} projectId={projectId} setProjectId={setProjectId} summarize={summarize} scopedCashFlow={scopedCashFlow} scopeCurrency={scopeCurrency} />
      )}
    </div>
  )
}

type Summarize = (projectIds: string[]) => ProjectFinancialSummary
type ScopedCashFlow = (projectIds: string[]) => CashFlowPointWithRequired[]
type ScopeCurrency = (projectIds: string[]) => string

function PortfolioScope({
  portfolios,
  programs,
  projects,
  portfolioId,
  setPortfolioId,
  summarize,
  scopedCashFlow,
  scopeCurrency,
}: {
  portfolios: { id: string; name: string }[]
  programs: { id: string; name: string; portfolioId: string | null }[]
  projects: MasterProject[]
  portfolioId: string
  setPortfolioId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopeCurrency: ScopeCurrency
}) {
  const scopedProjects = portfolioId ? projects.filter((p) => p.portfolioId === portfolioId) : projects
  const projectIds = scopedProjects.map((p) => p.id)
  const summary = summarize(projectIds)
  const cashFlow = scopedCashFlow(projectIds)
  const currency = scopeCurrency(projectIds)

  const scopedPrograms = portfolioId ? programs.filter((pr) => pr.portfolioId === portfolioId) : programs
  const breakdown: ChartDatum[] = scopedPrograms
    .map((pr) => {
      const ids = projects.filter((p) => p.programId === pr.id).map((p) => p.id)
      const s = summarize(ids)
      return { key: pr.id, label: pr.name, value: Math.round(s.committedCost), color: FINANCE_ACCENT }
    })
    .filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Building2 size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="fin-input">
            <option value="">همه پورتفولیوها ({portfolios.length})</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] fin-text-muted">{scopedProjects.length} پروژه در این محدوده</p>
      </div>
      <ScopeKpis summary={summary} currency={currency} />
      <FundingRequirementPanel cashFlow={cashFlow} currency={currency} showManagementNote />
      <CashFlowSection cashFlow={cashFlow} currency={currency} />
      {breakdown.length > 0 && (
        <RankedBarChart title="هزینه متعهدشده به تفکیک برنامه" icon={<Briefcase size={12} style={{ color: FINANCE_ACCENT }} />} data={breakdown} unit={currency} formatValue={(n) => fmtCurrency(n)} />
      )}
    </div>
  )
}

function ProgramScope({
  programs,
  portfolios,
  projects,
  programId,
  setProgramId,
  summarize,
  scopedCashFlow,
  scopeCurrency,
}: {
  programs: { id: string; name: string; portfolioId: string | null }[]
  portfolios: { id: string; name: string }[]
  projects: MasterProject[]
  programId: string
  setProgramId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopeCurrency: ScopeCurrency
}) {
  const scopedProjects = programId ? projects.filter((p) => p.programId === programId) : projects.filter((p) => !!p.programId)
  const projectIds = scopedProjects.map((p) => p.id)
  const summary = summarize(projectIds)
  const cashFlow = scopedCashFlow(projectIds)
  const currency = scopeCurrency(projectIds)
  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name

  const breakdown: ChartDatum[] = scopedProjects
    .map((p) => {
      const s = summarize([p.id])
      return { key: p.id, label: p.officialName, value: Math.round(s.committedCost), color: FINANCE_ACCENT }
    })
    .filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Briefcase size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="fin-input">
            <option value="">همه برنامه‌ها ({programs.length})</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {portfolioName(p.portfolioId) ? `(${portfolioName(p.portfolioId)})` : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] fin-text-muted">{scopedProjects.length} پروژه در این محدوده</p>
      </div>
      <ScopeKpis summary={summary} currency={currency} />
      <FundingRequirementPanel cashFlow={cashFlow} currency={currency} />
      <CashFlowSection cashFlow={cashFlow} currency={currency} />
      {breakdown.length > 0 && (
        <RankedBarChart title="هزینه متعهدشده به تفکیک پروژه" icon={<FolderKanban size={12} style={{ color: FINANCE_ACCENT }} />} data={breakdown} unit={currency} formatValue={(n) => fmtCurrency(n)} />
      )}
    </div>
  )
}

function ProjectScope({
  projects,
  projectId,
  setProjectId,
  summarize,
  scopedCashFlow,
  scopeCurrency,
}: {
  projects: MasterProject[]
  projectId: string
  setProjectId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopeCurrency: ScopeCurrency
}) {
  const activeId = projectId || projects[0]?.id || ''
  const projectIds = activeId ? [activeId] : []
  const summary = summarize(projectIds)
  const cashFlow = scopedCashFlow(projectIds)
  const currency = scopeCurrency(projectIds)

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <div className="flex items-center gap-2">
          <FolderKanban size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={activeId} onChange={(e) => setProjectId(e.target.value)} className="fin-input">
            {projects.length === 0 && <option value="">پروژه‌ای ثبت نشده</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.officialName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ScopeKpis summary={summary} currency={currency} />
      <FundingRequirementPanel cashFlow={cashFlow} currency={currency} />
      <CashFlowSection cashFlow={cashFlow} currency={currency} />
    </div>
  )
}

/**
 * Funding Requirement (spec item 12): this module forecasts expected monthly certificate and
 * expected monthly payment as a single "remaining commitment spread to completion" figure (see
 * computeCashFlowSeries's forecast field) rather than two independently modeled numbers — so both
 * are read off the same monthly forecast bucket here. `showManagementNote` renders the explicit
 * plain-language portfolio-level summary the spec calls for ("how much certificate/cash does the
 * whole company need this month, and over the next 12 months").
 */
export function FundingRequirementPanel({ cashFlow, currency, showManagementNote }: { cashFlow: CashFlowPointWithRequired[]; currency: string; showManagementNote?: boolean }) {
  const nowMonth = todayIso().slice(0, 7)
  const forwardPoints = cashFlow.filter((p) => p.month >= nowMonth).slice(0, 12)
  const thisMonth = forwardPoints[0]?.forecast ?? 0
  const next12Total = forwardPoints.reduce((sum, p) => sum + p.forecast, 0)
  const hasContractorEstimate = cashFlow.some((p) => p.required > 0)
  const thisMonthGap = forwardPoints[0]?.gap ?? 0

  return (
    <div className="fin-card p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        <Landmark size={12} style={{ color: FINANCE_ACCENT }} /> نیاز مالی و پیش‌بینی تامین بودجه (Funding Requirement)
      </p>
      <p className="mb-3 text-[10px] leading-5 fin-text-muted">
        برآورد ماهانه صورت‌وضعیت و پرداخت مورد انتظار، بر مبنای تعهد باقیمانده قراردادها تا تاریخ تکمیل برنامه‌ریزی‌شده هر قرارداد.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={CalendarClock}
          label="نیاز مالی برآوردی ماه جاری"
          value={fmtCurrency(thisMonth, currency)}
          color="#b8863b"
          tooltip="مبلغ برآوردی صورت‌وضعیت/پرداخت مورد انتظار در ماه جاری، بر مبنای تعهد باقیمانده قراردادهای فعال این محدوده."
        />
        <MetricCard
          icon={Landmark}
          label="نیاز مالی کل ۱۲ ماه آینده"
          value={fmtCurrency(next12Total, currency)}
          color="#b8863b"
          tooltip="مجموع نیاز مالی برآوردی این محدوده برای ۱۲ ماه پیش رو — پاسخ به «تا یک سال آینده چقدر منبع مالی لازم است»."
          emphasize
        />
        {hasContractorEstimate && (
          <MetricCard
            icon={AlertTriangle}
            label="اختلاف نیاز اعلامی پیمانکار و پرداخت واقعی (ماه جاری)"
            value={fmtCurrency(thisMonthGap, currency)}
            color={thisMonthGap > 0 ? '#b5573a' : '#3e7c74'}
            status={thisMonthGap > 0 ? 'bad' : 'good'}
            tooltip="نیاز نقدینگی اعلامی پیمانکار برای این ماه (از بخش «قراردادها») منهای پرداخت واقعی همان ماه. مثبت یعنی پرداخت از نیاز اعلامی پیمانکار عقب‌تر است."
          />
        )}
      </div>
      {showManagementNote && (
        <p className="mt-3 rounded-lg border p-2.5 text-[10.5px] leading-6 fin-text-secondary" style={{ borderColor: 'var(--fin-divider)' }}>
          گزارش مدیریتی: بر اساس تعهدات باقیمانده قراردادهای این پورتفولیو، برآورد می‌شود در ماه جاری حدود{' '}
          <span className="num font-bold" style={{ color: FINANCE_ACCENT }}>
            {fmtCurrency(thisMonth, currency)}
          </span>{' '}
          صورت‌وضعیت/پرداخت مورد نیاز باشد و برای تامین مالی ۱۲ ماه پیش رو مجموعا حدود{' '}
          <span className="num font-bold" style={{ color: FINANCE_ACCENT }}>
            {fmtCurrency(next12Total, currency)}
          </span>{' '}
          منبع مالی باید در نظر گرفته شود.
        </p>
      )}
    </div>
  )
}

function ScopeKpis({ summary, currency }: { summary: ProjectFinancialSummary; currency: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <MetricCard icon={Wallet} label="بودجه جاری" value={fmtCurrency(summary.currentBudgetAmount, currency)} color={FINANCE_ACCENT} />
      <MetricCard icon={Calculator} label="هزینه متعهدشده" value={fmtCurrency(summary.committedCost, currency)} color="#5c7290" />
      <MetricCard icon={Banknote} label="مبلغ پرداخت‌شده" value={fmtCurrency(summary.paidTotal, currency)} color="#3e7c74" />
      <MetricCard
        icon={Scale}
        label="بودجه باقی‌مانده"
        value={fmtCurrency(summary.remainingBudget, currency)}
        color={summary.remainingBudget >= 0 ? '#3e7c74' : '#b5573a'}
        status={summary.remainingBudget >= 0 ? 'good' : 'bad'}
      />
      <MetricCard
        icon={TrendingDown}
        label="انحراف بودجه"
        value={fmtCurrency(summary.budgetVariance, currency)}
        color={summary.budgetVariance >= 0 ? '#3e7c74' : '#b5573a'}
        status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
      />
      <MetricCard icon={Target} label="پیش‌بینی هزینه در تکمیل (EAC)" value={summary.eac != null ? fmtCurrency(summary.eac, currency) : 'ثبت نشده'} color="#b8863b" />
      <MetricCard
        icon={Scale}
        label="مواجهه مالی (Exposure)"
        value={fmtCurrency(summary.financialExposure, currency)}
        color={summary.financialExposure > 0 ? '#b8863b' : '#3e7c74'}
        status={summary.financialExposure > 0 ? 'warn' : 'good'}
      />
      <MetricCard icon={FolderKanban} label="تعداد قرارداد" value={summary.contractCount.toLocaleString('fa-IR')} color="#7c8794" />
    </div>
  )
}

export function CashFlowSection({ cashFlow, currency }: { cashFlow: CashFlowPointWithRequired[]; currency: string }) {
  const cumulative = cumulativeCashFlow(cashFlow)
  const gid = useId()
  const hasContractorEstimate = cashFlow.some((p) => p.required > 0)
  if (cashFlow.length === 0) {
    return <div className="fin-card p-8 text-center text-xs fin-text-muted">داده کافی برای رسم جریان نقدی در این محدوده ثبت نشده است.</div>
  }
  return (
    <div className="fin-card p-4">
      <p className="mb-2 text-[11px] font-bold">جریان نقدی — ماهانه و تجمعی</p>
      {hasContractorEstimate && (
        <p className="mb-2 text-[10px] leading-5 fin-text-muted">
          «نیاز اعلامی پیمانکار» برآورد ماهانه‌ای است که خود پیمانکار ثبت کرده (از بخش «قراردادها» ← «برآورد نقدینگی ماهانه پیمانکار»)؛ «اختلاف» = نیاز اعلامی منهای پرداخت واقعی همان ماه.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[
          { title: 'ماهانه', points: cashFlow, showRequired: hasContractorEstimate },
          { title: 'تجمعی', points: cumulative, showRequired: false },
        ].map(({ title, points, showRequired }) => (
          <div key={title}>
            <p className="mb-1.5 text-[10.5px] font-bold fin-text-secondary">{title}</p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`${gid}-${title}-actual`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3e7c74" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3e7c74" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`${gid}-${title}-forecast`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b8863b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#b8863b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`${gid}-${title}-planned`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5c7290" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#5c7290" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`${gid}-${title}-required`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a65d82" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#a65d82" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--fin-divider)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--fin-text-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtMonthJalali} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--fin-text-muted)' }} tickLine={false} axisLine={false} width={30} tickFormatter={(v: number) => fmtCurrency(v)} />
                  <RTooltip
                    contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--fin-divider)', borderRadius: 10, fontSize: 11 }}
                    labelStyle={{ color: 'var(--fin-text-secondary)' }}
                    labelFormatter={(label) => fmtMonthJalali(String(label))}
                    formatter={(value, name) => [fmtCurrency(Number(value), currency), String(name)]}
                  />
                  <Area type="monotone" dataKey="planned" name="برنامه" stroke="#5c7290" strokeWidth={1.5} fill={`url(#${gid}-${title}-planned)`} />
                  <Area type="monotone" dataKey="actual" name="واقعی" stroke="#3e7c74" strokeWidth={2} fill={`url(#${gid}-${title}-actual)`} />
                  <Area type="monotone" dataKey="forecast" name="پیش‌بینی (نیاز مالی)" stroke="#b8863b" strokeWidth={1.5} fill={`url(#${gid}-${title}-forecast)`} />
                  {showRequired && (
                    <Area type="monotone" dataKey="required" name="نیاز اعلامی پیمانکار" stroke="#a65d82" strokeWidth={1.5} fill={`url(#${gid}-${title}-required)`} />
                  )}
                  {showRequired && <Line type="monotone" dataKey="gap" name="اختلاف (نیاز - واقعی)" stroke="#b5573a" strokeWidth={2} strokeDasharray="4 3" dot={false} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
