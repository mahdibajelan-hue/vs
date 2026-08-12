import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  Building2,
  Calculator,
  Clock,
  FileText,
  FolderKanban,
  Gauge,
  Layers,
  PiggyBank,
  Receipt,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import {
  aggregateFinancialSummaries,
  certificateOutstanding,
  computeCashFlowSeries,
  computeProjectFinancialSummary,
  ensureForwardMonths,
  paymentAgingDays,
  type ProjectFinancialSummary,
} from '../lib/financeCalc'
import { FinanceKpiTile, fmtCurrency } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { BreakdownDonut, RankedBarChart, type ChartDatum } from '../../masterdata/components/RollupCharts'
import { CashFlowSection, FundingRequirementPanel } from './CashFlowForecastPage'
import type {
  FinAnnualBudget,
  FinBudget,
  FinBudgetChange,
  FinContract,
  FinContractAmendment,
  FinGuarantee,
  FinPaymentCertificate,
} from '../types'
import type { MasterProject } from '../../masterdata/types'

type Level = 'portfolio' | 'program' | 'project'

const LEVELS: { id: Level; label: string; icon: typeof Building2 }[] = [
  { id: 'portfolio', label: 'پورتفولیو', icon: Building2 },
  { id: 'program', label: 'برنامه', icon: Briefcase },
  { id: 'project', label: 'پروژه', icon: FolderKanban },
]

/**
 * Level-aware Financial Dashboard (spec items 2 & 13): the hierarchy is Portfolio -> Program ->
 * Project — this page never starts from a bare project. Portfolio and Program render the same
 * aggregated KPI/chart set ("Program — same, aggregated" per spec), rolled up from real per-project
 * data via aggregateFinancialSummaries; Project renders the full detailed breakdown.
 */
export function FinancialDashboardPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const annualBudgets = useFinanceStore((s) => s.annualBudgets)
  const guarantees = useFinanceStore((s) => s.guarantees)

  const [level, setLevel] = useState<Level>('portfolio')
  const [portfolioId, setPortfolioId] = useState('')
  const [programId, setProgramId] = useState('')
  const [projectId, setProjectId] = useState('')

  const summarize = (projectIds: string[]): ProjectFinancialSummary => {
    const summaries = projectIds.map((id) => {
      const p = projects.find((pr) => pr.id === id)
      const budget = budgets.find((b) => b.masterProjectId === id) ?? null
      const changes = budgetChanges.filter((c) => c.masterProjectId === id)
      return computeProjectFinancialSummary(id, p?.forecastCostAtCompletion ?? null, budget, changes, contracts, amendments, certificates, annualBudgets, guarantees)
    })
    return aggregateFinancialSummaries(summaries)
  }

  const scopedCashFlow = (projectIds: string[]) => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    const scopedAmendments = amendments.filter((a) => contractIds.has(a.contractId))
    const scopedCertificates = certificates.filter((c) => contractIds.has(c.contractId))
    return ensureForwardMonths(computeCashFlowSeries(scopedContracts, scopedAmendments, scopedCertificates))
  }

  const scopedCertificates = (projectIds: string[]): FinPaymentCertificate[] => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    return certificates.filter((c) => contractIds.has(c.contractId))
  }

  const scopeCurrency = (projectIds: string[]) => {
    const p = projects.find((pr) => projectIds.includes(pr.id))
    return budgets.find((b) => b.masterProjectId === p?.id)?.currency ?? p?.currency ?? 'ریال'
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">داشبورد مالی — سطح پورتفولیو / برنامه / پروژه</p>
        <h1 className="mt-1 text-lg font-extrabold">وضعیت مالی</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
          {LEVELS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLevel(id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={level === id ? { background: `${FINANCE_ACCENT}2a`, color: FINANCE_ACCENT } : undefined}
            >
              <Icon size={13} />
              <span className={level === id ? '' : 'text-secondary'}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {level === 'portfolio' && (
        <PortfolioDashboard
          portfolios={portfolios}
          programs={programs}
          projects={projects}
          portfolioId={portfolioId}
          setPortfolioId={setPortfolioId}
          summarize={summarize}
          scopedCashFlow={scopedCashFlow}
          scopedCertificates={scopedCertificates}
          scopeCurrency={scopeCurrency}
        />
      )}
      {level === 'program' && (
        <ProgramDashboard
          programs={programs}
          portfolios={portfolios}
          projects={projects}
          programId={programId}
          setProgramId={setProgramId}
          summarize={summarize}
          scopedCashFlow={scopedCashFlow}
          scopedCertificates={scopedCertificates}
          scopeCurrency={scopeCurrency}
        />
      )}
      {level === 'project' && (
        <ProjectDashboard
          projects={projects}
          projectId={projectId}
          setProjectId={setProjectId}
          contracts={contracts}
          amendments={amendments}
          certificates={certificates}
          budgets={budgets}
          budgetChanges={budgetChanges}
          annualBudgets={annualBudgets}
          guarantees={guarantees}
        />
      )}
    </div>
  )
}

type Summarize = (projectIds: string[]) => ProjectFinancialSummary
type ScopedCashFlow = (projectIds: string[]) => ReturnType<typeof computeCashFlowSeries>
type ScopedCertificates = (projectIds: string[]) => FinPaymentCertificate[]
type ScopeCurrency = (projectIds: string[]) => string

function PortfolioDashboard({
  portfolios,
  programs,
  projects,
  portfolioId,
  setPortfolioId,
  summarize,
  scopedCashFlow,
  scopedCertificates,
  scopeCurrency,
}: {
  portfolios: { id: string; name: string }[]
  programs: { id: string; name: string; portfolioId: string | null }[]
  projects: MasterProject[]
  portfolioId: string
  setPortfolioId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopedCertificates: ScopedCertificates
  scopeCurrency: ScopeCurrency
}) {
  const scopedProjects = portfolioId ? projects.filter((p) => p.portfolioId === portfolioId) : projects
  const projectIds = scopedProjects.map((p) => p.id)
  const summary = summarize(projectIds)
  const cashFlow = scopedCashFlow(projectIds)
  const currency = scopeCurrency(projectIds)
  const certs = scopedCertificates(projectIds)

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
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-1 flex items-center gap-2">
          <Building2 size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400">
            <option value="">همه پورتفولیوها ({portfolios.length})</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-muted">{scopedProjects.length} پروژه در این محدوده</p>
      </div>
      <AggregateDashboardBody
        summary={summary}
        cashFlow={cashFlow}
        currency={currency}
        certificates={certs}
        breakdown={breakdown}
        breakdownTitle="وضعیت مالی قراردادها به تفکیک برنامه (Contract Financial Status)"
        breakdownIcon={<Briefcase size={12} style={{ color: FINANCE_ACCENT }} />}
        showManagementNote
      />
    </div>
  )
}

function ProgramDashboard({
  programs,
  portfolios,
  projects,
  programId,
  setProgramId,
  summarize,
  scopedCashFlow,
  scopedCertificates,
  scopeCurrency,
}: {
  programs: { id: string; name: string; portfolioId: string | null }[]
  portfolios: { id: string; name: string }[]
  projects: MasterProject[]
  programId: string
  setProgramId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopedCertificates: ScopedCertificates
  scopeCurrency: ScopeCurrency
}) {
  const scopedProjects = programId ? projects.filter((p) => p.programId === programId) : projects.filter((p) => !!p.programId)
  const projectIds = scopedProjects.map((p) => p.id)
  const summary = summarize(projectIds)
  const cashFlow = scopedCashFlow(projectIds)
  const currency = scopeCurrency(projectIds)
  const certs = scopedCertificates(projectIds)
  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name

  const breakdown: ChartDatum[] = scopedProjects
    .map((p) => {
      const s = summarize([p.id])
      return { key: p.id, label: p.officialName, value: Math.round(s.committedCost), color: FINANCE_ACCENT }
    })
    .filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-1 flex items-center gap-2">
          <Briefcase size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400">
            <option value="">همه برنامه‌ها ({programs.length})</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {portfolioName(p.portfolioId) ? `(${portfolioName(p.portfolioId)})` : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-muted">{scopedProjects.length} پروژه در این محدوده</p>
      </div>
      <AggregateDashboardBody
        summary={summary}
        cashFlow={cashFlow}
        currency={currency}
        certificates={certs}
        breakdown={breakdown}
        breakdownTitle="وضعیت مالی قراردادها به تفکیک پروژه (Contract Financial Status)"
        breakdownIcon={<FolderKanban size={12} style={{ color: FINANCE_ACCENT }} />}
      />
    </div>
  )
}

/** Shared Portfolio/Program KPI + chart body (spec item 13: "Program — same, aggregated"). */
function AggregateDashboardBody({
  summary,
  cashFlow,
  currency,
  certificates,
  breakdown,
  breakdownTitle,
  breakdownIcon,
  showManagementNote,
}: {
  summary: ProjectFinancialSummary
  cashFlow: ReturnType<typeof computeCashFlowSeries>
  currency: string
  certificates: FinPaymentCertificate[]
  breakdown: ChartDatum[]
  breakdownTitle: string
  breakdownIcon: ReactNode
  showManagementNote?: boolean
}) {
  const exposureData: ChartDatum[] = [
    { key: 'paid', label: 'پرداخت‌شده', value: Math.max(0, summary.paidTotal), color: '#2ecc71' },
    { key: 'exposure', label: 'مواجهه مالی باقی‌مانده', value: Math.max(0, summary.financialExposure), color: '#e74c3c' },
  ]
  const aging = agingBuckets(certificates)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <FinanceKpiTile
          icon={Wallet}
          label="بودجه کل (Total Budget)"
          value={fmtCurrency(summary.currentBudgetAmount, currency)}
          color={FINANCE_ACCENT}
          tooltip="مجموع بودجه مصوب به‌علاوه هر تغییر بودجه ثبت‌شده در همه پروژه‌های این محدوده — افزایش یعنی تخصیص بودجه بیشتر."
        />
        <FinanceKpiTile
          icon={FileText}
          label="ارزش کل قراردادها (Total Contract Value)"
          value={fmtCurrency(summary.currentContractValueTotal, currency)}
          color="#38bdf8"
          tooltip="مجموع ارزش جاری همه قراردادهای این محدوده (اصلی + الحاقیه‌ها + سهم ارزی)."
        />
        <FinanceKpiTile
          icon={ShieldCheck}
          label="مبلغ تاییدشده (Certified)"
          value={fmtCurrency(summary.certifiedTotal, currency)}
          color="#a78bfa"
          tooltip="مجموع مبالغ تاییدشده صورت‌وضعیت‌ها. فاصله زیاد با ارزش قرارداد یعنی کار زیادی هنوز تایید نشده."
        />
        <FinanceKpiTile
          icon={Banknote}
          label="مبلغ پرداخت‌شده (Paid)"
          value={fmtCurrency(summary.paidTotal, currency)}
          color="#2ecc71"
          tooltip="مجموع مبالغ واقعا پرداخت‌شده به پیمانکاران این محدوده، شامل معادل ریالی سهم ارزی."
        />
        <FinanceKpiTile
          icon={Receipt}
          label="مانده پرداخت‌نشده (Outstanding)"
          value={fmtCurrency(summary.outstandingTotal, currency)}
          color={summary.outstandingTotal > 0 ? '#f1c40f' : '#2ecc71'}
          status={summary.outstandingTotal > 0 ? 'warn' : 'good'}
          tooltip="تفاوت بین مبلغ تاییدشده و پرداخت‌شده — افزایش این عدد یعنی بدهی جاری به پیمانکاران رو به رشد است."
        />
        <FinanceKpiTile
          icon={TrendingUp}
          label="پیش‌بینی هزینه در تکمیل (EAC)"
          value={summary.eac != null ? fmtCurrency(summary.eac, currency) : 'ثبت نشده'}
          color="#f59e0b"
          tooltip="مجموع برآورد هزینه در تکمیل (EAC) پروژه‌هایی از این محدوده که این مقدار برایشان ثبت شده است."
        />
        <FinanceKpiTile
          icon={Gauge}
          label="جذب بودجه (Budget Absorption)"
          value={`${summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪`}
          color={summary.budgetAbsorptionPct > 100 ? '#e74c3c' : '#2ecc71'}
          status={summary.budgetAbsorptionPct > 100 ? 'bad' : 'good'}
          tooltip="سهم هزینه متعهدشده از بودجه جاری این محدوده. بالای ۱۰۰٪ یعنی تعهدات از بودجه مصوب فراتر رفته است."
        />
        <FinanceKpiTile
          icon={Scale}
          label="مواجهه مالی (Financial Exposure)"
          value={fmtCurrency(summary.financialExposure, currency)}
          color={summary.financialExposure > 0 ? '#f1c40f' : '#2ecc71'}
          status={summary.financialExposure > 0 ? 'warn' : 'good'}
          tooltip="هزینه متعهدشده منهای مبلغ پرداخت‌شده — یعنی چه مقدار سرمایه هنوز پرداخت‌نشده و در معرض ریسک است."
          emphasize
        />
        <FinanceKpiTile
          icon={ShieldCheck}
          label="مجموع ضمانت‌نامه‌های معتبر"
          value={fmtCurrency(summary.guaranteesTotal, currency)}
          color="#2ecc71"
          status={summary.expiringGuaranteeCount > 0 ? 'warn' : 'good'}
          tooltip={`مجموع ضمانت‌نامه‌های معتبر دریافتی از پیمانکاران این محدوده.${summary.expiringGuaranteeCount > 0 ? ` ${summary.expiringGuaranteeCount} ضمانت‌نامه تا ۶۰ روز آینده منقضی می‌شود.` : ''}`}
        />
      </div>

      <FundingRequirementPanel cashFlow={cashFlow} currency={currency} showManagementNote={showManagementNote} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BulletComparison
          icon={<Wallet size={12} style={{ color: FINANCE_ACCENT }} />}
          title="بودجه جاری در برابر پیش‌بینی هزینه در تکمیل (EAC)"
          valueLabel="EAC / پیش‌بینی هزینه"
          value={summary.eac ?? summary.committedCost}
          targetLabel="بودجه جاری (خط هدف)"
          target={summary.currentBudgetAmount}
          currency={currency}
          emptyHint={summary.eac == null ? 'EAC برای پروژه‌های این محدوده ثبت نشده — مقدار جایگزین: هزینه متعهدشده.' : undefined}
        />
        <BulletComparison
          icon={<ShieldCheck size={12} style={{ color: '#a78bfa' }} />}
          title="مبلغ تاییدشده در برابر مبلغ پرداخت‌شده"
          valueLabel="پرداخت‌شده"
          value={summary.paidTotal}
          targetLabel="تاییدشده (خط هدف)"
          target={summary.certifiedTotal}
          currency={currency}
        />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
          <PiggyBank size={12} style={{ color: '#e74c3c' }} /> مواجهه مالی (Financial Exposure)
        </p>
        <p className="mb-2 text-[10px] leading-5 text-muted">از مجموع هزینه متعهدشده این محدوده، چه سهمی پرداخت شده و چه سهمی هنوز در معرض ریسک مالی است.</p>
        <BreakdownDonut title="" data={exposureData} unit={currency} height={190} formatTotal={(n) => fmtCurrency(n, currency)} />
      </div>

      <CashFlowSection cashFlow={cashFlow} currency={currency} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {breakdown.length > 0 && <RankedBarChart title={breakdownTitle} icon={breakdownIcon} data={breakdown} unit={currency} formatValue={(n) => fmtCurrency(n)} />}
        {aging.some((a) => a.value > 0) && (
          <RankedBarChart title="مانده پرداخت‌نشده به تفکیک قدمت (Payment Aging)" icon={<Clock size={12} style={{ color: '#f59e0b' }} />} data={aging} unit={currency} formatValue={(n) => fmtCurrency(n)} />
        )}
      </div>
    </div>
  )
}

function ProjectDashboard({
  projects,
  projectId,
  setProjectId,
  contracts,
  amendments,
  certificates,
  budgets,
  budgetChanges,
  annualBudgets,
  guarantees,
}: {
  projects: MasterProject[]
  projectId: string
  setProjectId: (v: string) => void
  contracts: FinContract[]
  amendments: FinContractAmendment[]
  certificates: FinPaymentCertificate[]
  budgets: FinBudget[]
  budgetChanges: FinBudgetChange[]
  annualBudgets: FinAnnualBudget[]
  guarantees: FinGuarantee[]
}) {
  const activeId = projectId || projects[0]?.id || ''
  const project = projects.find((p) => p.id === activeId)

  const projectContracts = useMemo(() => contracts.filter((c) => c.masterProjectId === activeId), [contracts, activeId])
  const contractIds = useMemo(() => new Set(projectContracts.map((c) => c.id)), [projectContracts])
  const projectAmendments = useMemo(() => amendments.filter((a) => contractIds.has(a.contractId)), [amendments, contractIds])
  const projectCertificates = useMemo(() => certificates.filter((c) => contractIds.has(c.contractId)), [certificates, contractIds])

  const budget = budgets.find((b) => b.masterProjectId === activeId) ?? null
  const projectChanges = budgetChanges.filter((c) => c.masterProjectId === activeId)
  const currency = budget?.currency ?? project?.currency ?? 'ریال'
  const eac = project?.forecastCostAtCompletion ?? null

  const summary = useMemo(
    () => computeProjectFinancialSummary(activeId, eac, budget, projectChanges, contracts, amendments, certificates, annualBudgets, guarantees),
    [activeId, eac, budget, projectChanges, contracts, amendments, certificates, annualBudgets, guarantees],
  )

  const cashFlow = useMemo(
    () => ensureForwardMonths(computeCashFlowSeries(projectContracts, projectAmendments, projectCertificates)),
    [projectContracts, projectAmendments, projectCertificates],
  )
  const aging = useMemo(() => agingBuckets(projectCertificates), [projectCertificates])

  if (!project) return <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">پروژه‌ای برای نمایش وجود ندارد.</div>

  const currentContractValueTotal = summary.currentContractValueTotal

  const outstandingData: ChartDatum[] = projectCertificates
    .map((c) => {
      const outstanding = certificateOutstanding(c)
      const agingDays = paymentAgingDays(c)
      return { key: c.id, label: c.certificateNumber || c.certificateDate, value: Math.max(0, Math.round(outstanding)), color: agingDays != null && agingDays > 30 ? '#e74c3c' : '#f1c40f' }
    })
    .filter((d) => d.value > 0)

  const exposureData: ChartDatum[] = [
    { key: 'paid', label: 'پرداخت‌شده', value: Math.max(0, summary.paidTotal), color: '#2ecc71' },
    { key: 'exposure', label: 'مواجهه مالی باقی‌مانده', value: Math.max(0, summary.financialExposure), color: '#e74c3c' },
  ]

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FolderKanban size={14} style={{ color: FINANCE_ACCENT }} />
          <select value={activeId} onChange={(e) => setProjectId(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400">
            {projects.length === 0 && <option value="">پروژه‌ای ثبت نشده</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.officialName}
              </option>
            ))}
          </select>
        </div>
        <h1 className="mt-2 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <FinanceKpiTile icon={FileText} label="ارزش قرارداد (Contract Value)" value={fmtCurrency(summary.contractValueTotal, currency)} color={FINANCE_ACCENT} tooltip="مجموع ارزش اولیه همه قراردادهای این پروژه (EPC، مشاور، MC، TPI، سایر)، پیش از الحاقیه‌ها." />
        <FinanceKpiTile icon={Wallet} label="بودجه مصوب (Approved Budget)" value={fmtCurrency(summary.approvedBudget, currency)} color={FINANCE_ACCENT} tooltip="بودجه کل مصوب پروژه — با بودجه سال جاری اشتباه گرفته نشود، این عدد برای کل عمر پروژه است." />
        <FinanceKpiTile
          icon={Wallet}
          label="بودجه سال جاری (Annual Budget)"
          value={summary.annualBudgetAmount != null ? fmtCurrency(summary.annualBudgetAmount, currency) : 'ثبت نشده'}
          color="#38bdf8"
          tooltip="بودجه تخصیص‌یافته برای سال شمسی جاری این پروژه — مستقل از بودجه کل پروژه، از بخش «بودجه سالانه» ثبت می‌شود."
        />
        <FinanceKpiTile icon={ShieldCheck} label="مبلغ تاییدشده (Certified)" value={fmtCurrency(summary.certifiedTotal, currency)} color="#a78bfa" tooltip="مجموع مبالغ تاییدشده صورت‌وضعیت‌های همه قراردادهای این پروژه." />
        <FinanceKpiTile icon={Banknote} label="مبلغ پرداخت‌شده (Paid)" value={fmtCurrency(summary.paidTotal, currency)} color="#2ecc71" tooltip="مجموع مبالغ واقعا پرداخت‌شده، شامل معادل ریالی سهم ارزی پرداختی." />
        <FinanceKpiTile
          icon={Receipt}
          label="مانده پرداخت‌نشده (Outstanding)"
          value={fmtCurrency(summary.outstandingTotal, currency)}
          color={summary.outstandingTotal > 0 ? '#f1c40f' : '#2ecc71'}
          status={summary.outstandingTotal > 0 ? 'warn' : 'good'}
          tooltip="تفاوت بین مبلغ تاییدشده و پرداخت‌شده — بدهی جاری کارفرما به پیمانکاران این پروژه."
        />
        <FinanceKpiTile icon={Calculator} label="هزینه متعهدشده (Committed)" value={fmtCurrency(summary.committedCost, currency)} color="#38bdf8" tooltip="ارزش جاری همه قراردادهای فعال/تکمیل‌شده این پروژه، صرف‌نظر از پیمانکار EPC یا مشاور/MC/TPI." />
        <FinanceKpiTile icon={Gauge} label="هزینه واقعی/تاییدشده (Actual)" value={fmtCurrency(summary.actualCost, currency)} color="#a78bfa" tooltip="هزینه‌ای که واقعا تایید شده و انجام‌شده تلقی می‌شود — نه صرفا تعهد قراردادی." />
        <FinanceKpiTile icon={Layers} label="هزینه باقی‌مانده تا تکمیل (Cost to Complete)" value={fmtCurrency(summary.costToComplete, currency)} color="#f59e0b" tooltip="پیش‌بینی هزینه (EAC یا هزینه متعهدشده) منهای هزینه تاییدشده تاکنون." />
        <FinanceKpiTile icon={TrendingUp} label="پیش‌بینی هزینه در تکمیل (EAC)" value={eac != null ? fmtCurrency(eac, currency) : 'ثبت نشده'} color="#f59e0b" tooltip="Estimate at Completion — برآورد کل هزینه پروژه در پایان کار، از شناسنامه پروژه خوانده می‌شود." />
        <FinanceKpiTile
          icon={Scale}
          label="بودجه باقی‌مانده (Remaining)"
          value={fmtCurrency(summary.remainingBudget, currency)}
          color={summary.remainingBudget >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.remainingBudget >= 0 ? 'good' : 'bad'}
          tooltip="بودجه جاری منهای هزینه متعهدشده. منفی یعنی تعهدات از بودجه فراتر رفته است."
        />
        <FinanceKpiTile
          icon={TrendingDown}
          label="انحراف بودجه (Variance)"
          value={fmtCurrency(summary.budgetVariance, currency)}
          color={summary.budgetVariance >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
          tooltip="بودجه جاری منهای پیش‌بینی هزینه (EAC). مثبت یعنی در چارچوب بودجه، منفی یعنی هشدار فراتر رفتن از بودجه."
        />
        <FinanceKpiTile
          icon={Gauge}
          label="جذب بودجه (Budget Absorption)"
          value={`${summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪`}
          color={summary.budgetAbsorptionPct > 100 ? '#e74c3c' : '#2ecc71'}
          status={summary.budgetAbsorptionPct > 100 ? 'bad' : 'good'}
          tooltip="سهم هزینه متعهدشده از بودجه جاری پروژه. بالای ۱۰۰٪ یعنی تعهدات از بودجه مصوب عبور کرده است."
        />
        <FinanceKpiTile
          icon={Clock}
          label="معطلی پرداخت (Payment Aging)"
          value={summary.certificateCount > 0 && summary.overdueCertificateCount >= 0 ? `${summary.overdueCertificateCount} صورت‌وضعیت معوق` : '—'}
          color={summary.overdueCertificateCount > 0 ? '#e74c3c' : '#38bdf8'}
          status={summary.overdueCertificateCount > 0 ? 'bad' : 'good'}
          tooltip="تعداد صورت‌وضعیت‌هایی که بیش از ۳۰ روز از ارسال آن‌ها گذشته و هنوز مانده پرداخت‌نشده دارند."
        />
        <FinanceKpiTile
          icon={Clock}
          label="میانگین تاخیر واقعی پرداخت"
          value={summary.avgPaymentDelayDays != null ? `${summary.avgPaymentDelayDays.toLocaleString('fa-IR')} روز` : '—'}
          color={summary.avgPaymentDelayDays != null && summary.avgPaymentDelayDays > 30 ? '#e74c3c' : '#38bdf8'}
          status={summary.avgPaymentDelayDays != null ? (summary.avgPaymentDelayDays > 30 ? 'bad' : 'good') : undefined}
          tooltip="میانگین فاصله زمانی بین تاریخ تایید و تاریخ پرداخت واقعی صورت‌وضعیت‌های پرداخت‌شده. عدد بالا یعنی روند پرداخت کند شده است."
        />
        <FinanceKpiTile
          icon={AlertTriangle}
          label="حداکثر تاخیر پرداخت"
          value={summary.maxPaymentDelayDays != null ? `${summary.maxPaymentDelayDays.toLocaleString('fa-IR')} روز` : '—'}
          color={summary.maxPaymentDelayDays != null && summary.maxPaymentDelayDays > 60 ? '#e74c3c' : '#f59e0b'}
          tooltip="بدترین (طولانی‌ترین) تاخیر پرداخت ثبت‌شده در بین صورت‌وضعیت‌های این پروژه."
        />
        <FinanceKpiTile
          icon={Receipt}
          label="مطالبات معوق (Overdue Payable)"
          value={fmtCurrency(summary.overduePayableTotal, currency)}
          color={summary.overduePayableTotal > 0 ? '#e74c3c' : '#2ecc71'}
          status={summary.overduePayableTotal > 0 ? 'bad' : 'good'}
          tooltip="مانده پرداخت‌نشده صورت‌وضعیت‌هایی که بیش از ۳۰ روز از سررسید آن‌ها گذشته است."
        />
        <FinanceKpiTile
          icon={Scale}
          label="طلب مازاد پیمانکار (Contractor Overpayment)"
          value={fmtCurrency(summary.contractorOverpaymentTotal, currency)}
          color={summary.contractorOverpaymentTotal > 0 ? '#f1c40f' : '#2ecc71'}
          status={summary.contractorOverpaymentTotal > 0 ? 'warn' : 'good'}
          tooltip="زمانی که مبلغ پرداختی به پیمانکار از مبلغ تاییدشده بیشتر باشد (مثلا پیش‌پرداخت هنوز کامل بازپس‌گیری نشده)."
        />
        <FinanceKpiTile
          icon={ShieldCheck}
          label="مجموع ضمانت‌نامه‌های معتبر"
          value={fmtCurrency(summary.guaranteesTotal, currency)}
          color="#2ecc71"
          status={summary.expiringGuaranteeCount > 0 ? 'warn' : 'good'}
          tooltip={`مجموع ضمانت‌نامه‌های معتبر دریافتی از پیمانکاران این پروژه.${summary.expiringGuaranteeCount > 0 ? ` ${summary.expiringGuaranteeCount} ضمانت‌نامه تا ۶۰ روز آینده منقضی می‌شود.` : ''}`}
          emphasize
        />
      </div>

      <FundingRequirementPanel cashFlow={cashFlow} currency={currency} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BulletComparison
          icon={<Wallet size={12} style={{ color: FINANCE_ACCENT }} />}
          title="بودجه جاری در برابر پیش‌بینی هزینه در تکمیل (EAC)"
          valueLabel="EAC"
          value={eac ?? summary.committedCost}
          targetLabel="بودجه جاری (خط هدف)"
          target={summary.currentBudgetAmount}
          currency={currency}
          emptyHint={eac == null ? 'EAC از شناسنامه پروژه ثبت نشده — مقدار جایگزین: هزینه متعهدشده.' : undefined}
        />
        <BulletComparison
          icon={<ShieldCheck size={12} style={{ color: '#a78bfa' }} />}
          title="مبلغ تاییدشده در برابر مبلغ پرداخت‌شده"
          valueLabel="پرداخت‌شده"
          value={summary.paidTotal}
          targetLabel="تاییدشده (خط هدف)"
          target={summary.certifiedTotal}
          currency={currency}
        />
        <BulletComparison
          icon={<FileText size={12} style={{ color: '#38bdf8' }} />}
          title="ارزش اولیه قرارداد در برابر ارزش جاری قرارداد"
          valueLabel="ارزش جاری"
          value={currentContractValueTotal}
          targetLabel="ارزش اولیه (خط هدف)"
          target={summary.contractValueTotal}
          currency={currency}
        />
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
            <PiggyBank size={12} style={{ color: '#e74c3c' }} /> مواجهه مالی (Financial Exposure)
          </p>
          <p className="mb-2 text-[10px] leading-5 text-muted">از مجموع هزینه متعهدشده، چه سهمی پرداخت شده و چه سهمی هنوز در معرض ریسک مالی است.</p>
          <BreakdownDonut title="" data={exposureData} unit={currency} height={190} formatTotal={(n) => fmtCurrency(n, currency)} />
        </div>
      </div>

      <CashFlowSection cashFlow={cashFlow} currency={currency} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankedBarChart
          title="مانده پرداخت‌نشده صورت‌وضعیت‌ها (Outstanding Payments)"
          icon={<AlertTriangle size={12} style={{ color: '#f1c40f' }} />}
          data={outstandingData}
          unit={currency}
          formatValue={(n) => fmtCurrency(n)}
        />
        {aging.some((a) => a.value > 0) && (
          <RankedBarChart title="مانده پرداخت‌نشده به تفکیک قدمت (Payment Aging)" icon={<Clock size={12} style={{ color: '#f59e0b' }} />} data={aging} unit={currency} formatValue={(n) => fmtCurrency(n)} />
        )}
      </div>
    </div>
  )
}

/** Outstanding balance bucketed by days-since-submission — the Payment Aging chart shared by every dashboard level. */
function agingBuckets(certs: FinPaymentCertificate[]): ChartDatum[] {
  const buckets = [
    { key: 'b0', label: '۰ تا ۳۰ روز', max: 30, color: '#38bdf8' },
    { key: 'b1', label: '۳۱ تا ۶۰ روز', max: 60, color: '#f1c40f' },
    { key: 'b2', label: '۶۱ تا ۹۰ روز', max: 90, color: '#f59e0b' },
    { key: 'b3', label: 'بیش از ۹۰ روز', max: Infinity, color: '#e74c3c' },
  ]
  const sums = buckets.map((b) => ({ ...b, value: 0 }))
  for (const c of certs) {
    const days = paymentAgingDays(c)
    if (days == null) continue
    const outstanding = certificateOutstanding(c)
    if (outstanding <= 0) continue
    const bucket = sums.find((b) => days <= b.max) ?? sums[sums.length - 1]
    bucket.value += outstanding
  }
  return sums.map((b) => ({ key: b.key, label: b.label, value: Math.round(b.value), color: b.color }))
}

export function BulletComparison({
  icon,
  title,
  valueLabel,
  value,
  targetLabel,
  target,
  currency,
  emptyHint,
}: {
  icon: ReactNode
  title: string
  valueLabel: string
  value: number
  targetLabel: string
  target: number
  currency: string
  emptyHint?: string
}) {
  const max = Math.max(value, target, 1) * 1.08
  const valuePct = Math.min(100, (value / max) * 100)
  const targetPct = Math.min(100, (target / max) * 100)
  const over = value > target

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        {icon} {title}
      </p>
      <div className="relative mt-4 h-6 w-full rounded-lg" style={{ background: 'rgba(148,163,184,0.12)' }}>
        <div className="absolute inset-y-0 rounded-lg" style={{ right: 0, width: `${valuePct}%`, background: over ? '#e74c3c' : FINANCE_ACCENT, opacity: 0.85 }} />
        <div className="absolute inset-y-[-4px] w-[2.5px] rounded-full bg-white" style={{ right: `${targetPct}%` }} title={targetLabel} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: over ? '#e74c3c' : FINANCE_ACCENT }} /> {valueLabel}: <span className="num font-bold">{fmtCurrency(value, currency)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-0.5 bg-white" /> {targetLabel}: <span className="num font-bold">{fmtCurrency(target, currency)}</span>
        </span>
      </div>
      {emptyHint && <p className="mt-2 text-[10px] leading-5 text-muted">{emptyHint}</p>}
    </div>
  )
}
