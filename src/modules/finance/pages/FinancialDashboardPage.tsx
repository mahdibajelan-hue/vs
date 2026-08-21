import { useState } from 'react'
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
  PieChart,
  Receipt,
  Scale,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import {
  activeGuaranteesTotal,
  aggregateFinancialSummaries,
  certificateOutstanding,
  claimsExposureTotal,
  computeCashFlowSeries,
  computeProjectFinancialSummary,
  ensureForwardMonths,
  expiringGuarantees,
  paymentAgingDays,
  retentionLiability,
  todayIso,
  type ProjectFinancialSummary,
} from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import {
  AlertFeed,
  CashFlowComboChart,
  DonutPanel,
  MetricCard,
  MiniStatCard,
  RankedProgressTable,
  SimpleTable,
  StampBadge,
  type AlertItem,
  type SimpleTableColumn,
  type StampTone,
} from '../components/FinanceDashboardUI'
import { CostProgressCheckCard } from '../components/CostProgressCheckCard'
import { ExecutiveExportButton } from '../components/ExecutiveExportButton'
import type { ExecutiveReportExtras } from '../components/ExecutiveReportPrint'
import type { ChartDatum } from '../../masterdata/components/RollupCharts'
import type { FinClaim, FinContractRole, FinGuarantee, FinPaymentCertificate, FinRetentionRelease } from '../types'
import { FIN_CONTRACT_ROLE_COLOR, FIN_CONTRACT_ROLE_LABEL_FA, FIN_CONTRACT_ROLES, FIN_CERTIFICATE_TYPE_LABEL_FA } from '../types'
import type { MasterProject } from '../../masterdata/types'

type Level = 'portfolio' | 'program' | 'project'

const LEVELS: { id: Level; label: string; icon: typeof Building2 }[] = [
  { id: 'portfolio', label: 'پرتفولیو', icon: Building2 },
  { id: 'program', label: 'طرح', icon: Briefcase },
  { id: 'project', label: 'پروژه', icon: FolderKanban },
]

/**
 * Level-aware Financial Dashboard (spec items 2 & 13): Portfolio -> Program -> Project, every
 * level rolled up from real project data. Visual language matches the exec-dashboard mockup: white
 * metric/donut/table cards on the module's dark-navy (or light) shell — see finance-dashboard.css.
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
  const claims = useFinanceStore((s) => s.claims)
  const retentionReleases = useFinanceStore((s) => s.retentionReleases)

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

  const scopedGuarantees = (projectIds: string[]): FinGuarantee[] => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    return guarantees.filter((g) => contractIds.has(g.contractId))
  }

  const scopedClaims = (projectIds: string[]): FinClaim[] => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    return claims.filter((c) => contractIds.has(c.contractId))
  }

  const scopedRetentionReleases = (projectIds: string[]): FinRetentionRelease[] => {
    const idSet = new Set(projectIds)
    const scopedContracts = contracts.filter((c) => idSet.has(c.masterProjectId))
    const contractIds = new Set(scopedContracts.map((c) => c.id))
    return retentionReleases.filter((r) => contractIds.has(r.contractId))
  }

  const scopedExtras = (projectIds: string[]): ExecutiveReportExtras => {
    const g = scopedGuarantees(projectIds)
    const cl = scopedClaims(projectIds)
    const certs = scopedCertificates(projectIds)
    const rr = scopedRetentionReleases(projectIds)
    return {
      claimsExposure: claimsExposureTotal(cl),
      claimCount: cl.length,
      retentionLiabilityAmount: retentionLiability(certs, rr),
      activeGuaranteesTotalAmount: activeGuaranteesTotal(g),
      expiringGuaranteeCount: expiringGuarantees(g).length,
    }
  }

  const scopeCurrency = (projectIds: string[]) => {
    const p = projects.find((pr) => projectIds.includes(pr.id))
    return budgets.find((b) => b.masterProjectId === p?.id)?.currency ?? p?.currency ?? 'ریال'
  }

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <div className="flex flex-wrap items-center gap-1 rounded-full p-1 w-fit" style={{ background: 'var(--fin-divider)' }}>
          {LEVELS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLevel(id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={level === id ? { background: '#c9a654', color: '#fff' } : { color: 'var(--fin-text-secondary)' }}
            >
              <Icon size={13} />
              {label}
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
          scopedGuarantees={scopedGuarantees}
          scopeCurrency={scopeCurrency}
          scopedExtras={scopedExtras}
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
          scopedGuarantees={scopedGuarantees}
          scopeCurrency={scopeCurrency}
          scopedExtras={scopedExtras}
        />
      )}
      {level === 'project' && (
        <ProjectDashboard
          projects={projects}
          contracts={contracts}
          projectId={projectId}
          setProjectId={setProjectId}
          summarize={summarize}
          scopedCashFlow={scopedCashFlow}
          scopedCertificates={scopedCertificates}
          scopedGuarantees={scopedGuarantees}
          scopeCurrency={scopeCurrency}
          scopedExtras={scopedExtras}
        />
      )}
    </div>
  )
}

type Summarize = (projectIds: string[]) => ProjectFinancialSummary
type ScopedCashFlow = (projectIds: string[]) => ReturnType<typeof computeCashFlowSeries>
type ScopedCertificates = (projectIds: string[]) => FinPaymentCertificate[]
type ScopedGuarantees = (projectIds: string[]) => FinGuarantee[]
type ScopeCurrency = (projectIds: string[]) => string
type ScopedExtras = (projectIds: string[]) => ExecutiveReportExtras

function PortfolioDashboard({
  portfolios,
  programs,
  projects,
  portfolioId,
  setPortfolioId,
  summarize,
  scopedCashFlow,
  scopedCertificates,
  scopedGuarantees,
  scopeCurrency,
  scopedExtras,
}: {
  portfolios: { id: string; name: string }[]
  programs: { id: string; name: string; portfolioId: string | null }[]
  projects: MasterProject[]
  portfolioId: string
  setPortfolioId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopedCertificates: ScopedCertificates
  scopedGuarantees: ScopedGuarantees
  scopeCurrency: ScopeCurrency
  scopedExtras: ScopedExtras
}) {
  const scopedProjects = portfolioId ? projects.filter((p) => p.portfolioId === portfolioId) : projects
  const projectIds = scopedProjects.map((p) => p.id)
  const scopedPrograms = portfolioId ? programs.filter((pr) => pr.portfolioId === portfolioId) : programs

  const breakdown: ChartDatum[] = scopedPrograms
    .map((pr, i) => ({ key: pr.id, label: pr.name, value: Math.round(summarize(projects.filter((p) => p.programId === pr.id).map((p) => p.id)).committedCost), color: DONUT_PALETTE[i % DONUT_PALETTE.length] }))
    .filter((d) => d.value > 0)

  const rankedRows = scopedPrograms
    .map((pr) => {
      const ids = projects.filter((p) => p.programId === pr.id).map((p) => p.id)
      const cf = scopedCashFlow(ids)
      const need = next12MonthNeed(cf)
      return { key: pr.id, label: pr.name, need }
    })
    .filter((r) => r.need > 0)
    .sort((a, b) => b.need - a.need)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center gap-3 p-4">
        <Building2 size={14} style={{ color: '#c9a654' }} />
        <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="fin-input w-56">
          <option value="">همه پرتفولیوها ({portfolios.length})</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="fin-text-muted text-[11px]">{scopedProjects.length} پروژه در این محدوده</span>
        <div className="mr-auto">
          <ExecutiveExportButton
            scopeLabel="گزارش اجرایی سطح پرتفولیو"
            entityName={portfolioId ? portfolios.find((p) => p.id === portfolioId)?.name || 'پرتفولیو' : 'کل شرکت (همه پرتفولیوها)'}
            currency={scopeCurrency(projectIds)}
            summary={summarize(projectIds)}
            extras={scopedExtras(projectIds)}
          />
        </div>
      </div>
      <DashboardBody
        summary={summarize(projectIds)}
        cashFlow={scopedCashFlow(projectIds)}
        certificates={scopedCertificates(projectIds)}
        guarantees={scopedGuarantees(projectIds)}
        currency={scopeCurrency(projectIds)}
        breakdown={breakdown}
        breakdownTitle="توزیع ارزش قراردادها به تفکیک طرح"
        rankedRows={rankedRows}
        rankedTitle="طرح‌های با بیشترین نیاز نقدینگی (۳ ماه آینده)"
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
  scopedGuarantees,
  scopeCurrency,
  scopedExtras,
}: {
  programs: { id: string; name: string; portfolioId: string | null }[]
  portfolios: { id: string; name: string }[]
  projects: MasterProject[]
  programId: string
  setProgramId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopedCertificates: ScopedCertificates
  scopedGuarantees: ScopedGuarantees
  scopeCurrency: ScopeCurrency
  scopedExtras: ScopedExtras
}) {
  const scopedProjects = programId ? projects.filter((p) => p.programId === programId) : projects.filter((p) => !!p.programId)
  const projectIds = scopedProjects.map((p) => p.id)
  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name

  const breakdown: ChartDatum[] = scopedProjects
    .map((p, i) => ({ key: p.id, label: p.officialName, value: Math.round(summarize([p.id]).committedCost), color: DONUT_PALETTE[i % DONUT_PALETTE.length] }))
    .filter((d) => d.value > 0)

  const rankedRows = scopedProjects
    .map((p) => ({ key: p.id, label: p.officialName, need: next12MonthNeed(scopedCashFlow([p.id])) }))
    .filter((r) => r.need > 0)
    .sort((a, b) => b.need - a.need)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center gap-3 p-4">
        <Briefcase size={14} style={{ color: '#c9a654' }} />
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="fin-input w-56">
          <option value="">همه طرح‌ها ({programs.length})</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {portfolioName(p.portfolioId) ? `(${portfolioName(p.portfolioId)})` : ''}
            </option>
          ))}
        </select>
        <span className="fin-text-muted text-[11px]">{scopedProjects.length} پروژه در این محدوده</span>
        <div className="mr-auto">
          <ExecutiveExportButton
            scopeLabel="گزارش اجرایی سطح طرح"
            entityName={programId ? programs.find((p) => p.id === programId)?.name || 'طرح' : 'همه طرح‌ها'}
            currency={scopeCurrency(projectIds)}
            summary={summarize(projectIds)}
            extras={scopedExtras(projectIds)}
          />
        </div>
      </div>
      <DashboardBody
        summary={summarize(projectIds)}
        cashFlow={scopedCashFlow(projectIds)}
        certificates={scopedCertificates(projectIds)}
        guarantees={scopedGuarantees(projectIds)}
        currency={scopeCurrency(projectIds)}
        breakdown={breakdown}
        breakdownTitle="توزیع ارزش قراردادها به تفکیک پروژه"
        rankedRows={rankedRows}
        rankedTitle="پروژه‌های با بیشترین نیاز نقدینگی (۳ ماه آینده)"
      />
    </div>
  )
}

function ProjectDashboard({
  projects,
  contracts,
  projectId,
  setProjectId,
  summarize,
  scopedCashFlow,
  scopedCertificates,
  scopedGuarantees,
  scopeCurrency,
  scopedExtras,
}: {
  projects: MasterProject[]
  contracts: { id: string; masterProjectId: string; title: string; contractNumber: string; contractRole: FinContractRole }[]
  projectId: string
  setProjectId: (v: string) => void
  summarize: Summarize
  scopedCashFlow: ScopedCashFlow
  scopedCertificates: ScopedCertificates
  scopedGuarantees: ScopedGuarantees
  scopeCurrency: ScopeCurrency
  scopedExtras: ScopedExtras
}) {
  const activeId = projectId || projects[0]?.id || ''
  const project = projects.find((p) => p.id === activeId)
  const projectContracts = contracts.filter((c) => c.masterProjectId === activeId)

  const breakdown: ChartDatum[] = FIN_CONTRACT_ROLES.map((role) => {
    const roleContracts = projectContracts.filter((c) => c.contractRole === role)
    // committed cost isn't per-contract in `summarize`; approximate the role split from contract count-weighted summary for a simple, honest visual (exact rial split lives on the Cost Management page).
    return { key: role, label: FIN_CONTRACT_ROLE_LABEL_FA[role], value: roleContracts.length, color: FIN_CONTRACT_ROLE_COLOR[role] }
  }).filter((d) => d.value > 0)

  if (!project) return <div className="fin-card flex h-40 items-center justify-center text-sm fin-text-muted">پروژه‌ای برای نمایش وجود ندارد.</div>

  const projectSummary = summarize([activeId])
  const financialPercent = projectSummary.currentBudgetAmount > 0 ? Math.round((projectSummary.certifiedTotal / projectSummary.currentBudgetAmount) * 1000) / 10 : 0

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center gap-3 p-4">
        <FolderKanban size={14} style={{ color: '#c9a654' }} />
        <select value={activeId} onChange={(e) => setProjectId(e.target.value)} className="fin-input w-56">
          {projects.length === 0 && <option value="">پروژه‌ای ثبت نشده</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.officialName}
            </option>
          ))}
        </select>
        <div className="mr-auto">
          <ExecutiveExportButton
            scopeLabel="گزارش اجرایی سطح پروژه"
            entityName={project.officialName}
            currency={scopeCurrency([activeId])}
            summary={projectSummary}
            extras={scopedExtras([activeId])}
          />
        </div>
      </div>
      <CostProgressCheckCard project={project} financialPercent={financialPercent} />
      <DashboardBody
        summary={projectSummary}
        cashFlow={scopedCashFlow([activeId])}
        certificates={scopedCertificates([activeId])}
        guarantees={scopedGuarantees([activeId])}
        currency={scopeCurrency([activeId])}
        breakdown={breakdown}
        breakdownTitle="قراردادهای پروژه به تفکیک نوع"
        breakdownUnit="مورد"
        rankedRows={[]}
        rankedTitle=""
      />
    </div>
  )
}

const DONUT_PALETTE = ['#3e7c74', '#5c7290', '#8b6e9c', '#a65d82', '#b8863b', '#c9a654', '#b5573a']

/** Sum of the next 3 forward months' funding-requirement bucket — used to rank child entities by near-term cash need. */
function next12MonthNeed(points: { month: string; forecast: number }[]): number {
  const nowMonth = todayIso().slice(0, 7)
  return points
    .filter((p) => p.month >= nowMonth)
    .slice(0, 3)
    .reduce((sum, p) => sum + p.forecast, 0)
}

interface CertRow {
  id: string
  certificateNumber: string
  certificateType: string
  certifiedAmount: number | null
  certificateDate: string
}

/** Shared body for all 3 dashboard levels — the section layout mirrors the mockup 1:1. */
function DashboardBody({
  summary,
  cashFlow,
  certificates,
  guarantees,
  currency,
  breakdown,
  breakdownTitle,
  breakdownUnit,
  rankedRows,
  rankedTitle,
}: {
  summary: ProjectFinancialSummary
  cashFlow: ReturnType<typeof computeCashFlowSeries>
  certificates: FinPaymentCertificate[]
  guarantees: FinGuarantee[]
  currency: string
  breakdown: ChartDatum[]
  breakdownTitle: string
  breakdownUnit?: string
  rankedRows: { key: string; label: string; need: number }[]
  rankedTitle: string
}) {
  const nowMonth = todayIso().slice(0, 7)
  const forwardPoints = cashFlow.filter((p) => p.month >= nowMonth).slice(0, 12)
  const fundingThisMonth = forwardPoints[0]?.forecast ?? 0
  const fundingNext12 = forwardPoints.reduce((sum, p) => sum + p.forecast, 0)

  const budgetDonut: ChartDatum[] = [
    { key: 'approved', label: 'مصوب‌شده', value: Math.max(0, summary.currentBudgetAmount), color: '#3e7c74' },
    { key: 'absorbed', label: 'جذب‌شده', value: Math.max(0, summary.committedCost), color: '#5c7290' },
    { key: 'remaining', label: 'باقی‌مانده', value: Math.max(0, summary.currentBudgetAmount - summary.committedCost), color: '#94a3b8' },
  ]

  const overdueAmount = summary.overduePayableTotal
  const payableNotOverdue = Math.max(0, summary.outstandingTotal - overdueAmount)
  const paymentDonut: ChartDatum[] = [
    { key: 'paid', label: 'پرداخت‌شده', value: Math.max(0, summary.paidTotal), color: '#3e7c74' },
    { key: 'payable', label: 'قابل‌پرداخت', value: payableNotOverdue, color: '#b8863b' },
    { key: 'overdue', label: 'تاخیر در پرداخت', value: overdueAmount, color: '#b5573a' },
  ]

  const doneCost = summary.actualCost
  const forecastCost = summary.eac ?? summary.committedCost
  const eacDonut: ChartDatum[] = [
    { key: 'done', label: 'هزینه تا امروز', value: Math.max(0, doneCost), color: '#3e7c74' },
    { key: 'remaining', label: 'هزینه پیش‌بینی‌شده باقی‌مانده', value: Math.max(0, forecastCost - doneCost), color: '#5c7290' },
  ]

  const activeGuaranteeCount = guarantees.filter((g) => g.status === 'active').length

  const latestCerts: CertRow[] = [...certificates]
    .sort((a, b) => (a.certificateDate < b.certificateDate ? 1 : -1))
    .slice(0, 5)
    .map((c) => ({ id: c.id, certificateNumber: c.certificateNumber, certificateType: FIN_CERTIFICATE_TYPE_LABEL_FA[c.certificateType], certifiedAmount: c.certifiedAmount, certificateDate: c.certificateDate }))

  const certColumns: SimpleTableColumn<CertRow>[] = [
    { key: 'number', label: 'شماره/نوع', render: (r) => <span>{r.certificateNumber || '—'} <span className="fin-text-muted text-[10px]">({r.certificateType})</span></span> },
    { key: 'amount', label: 'مبلغ', render: (r) => <span className="num font-bold">{r.certifiedAmount != null ? fmtCurrency(r.certifiedAmount, currency) : 'در انتظار تایید'}</span> },
    { key: 'date', label: 'تاریخ', render: (r) => <span className="num">{fmtDate(r.certificateDate)}</span> },
  ]

  const alerts: AlertItem[] = []
  for (const c of certificates) {
    const aging = paymentAgingDays(c)
    if (aging != null && aging > 30 && certificateOutstanding(c) > 0) {
      alerts.push({ id: `cert-${c.id}`, severity: 'bad', days: aging, daysLabel: `${aging.toLocaleString('fa-IR')} روز`, text: `تاخیر در پرداخت صورت‌وضعیت شماره ${c.certificateNumber || '—'}` })
    }
  }
  for (const g of guarantees) {
    if (g.status !== 'active' || !g.expiryDate) continue
    const daysLeft = Math.round((Date.parse(g.expiryDate) - Date.now()) / 86400000)
    if (daysLeft <= 60) {
      alerts.push({ id: `g-${g.id}`, severity: daysLeft <= 15 ? 'bad' : 'warn', days: daysLeft, daysLabel: daysLeft <= 0 ? 'منقضی' : `${daysLeft.toLocaleString('fa-IR')} روز`, text: `ضمانت‌نامه شماره ${g.number || '—'} تا ${daysLeft <= 0 ? 'اکنون' : `${daysLeft} روز دیگر`} منقضی می‌شود` })
    }
  }
  if (summary.budgetVariance < 0) {
    alerts.push({ id: 'variance', severity: 'warn', days: 0, daysLabel: 'هشدار', text: 'پیش‌بینی هزینه در تکمیل (EAC) از بودجه جاری فراتر رفته است' })
  }
  alerts.sort((a, b) => a.days - b.days)

  const healthTone: StampTone = summary.remainingBudget < 0 ? 'bad' : summary.budgetAbsorptionPct > 90 ? 'warn' : 'good'
  const healthLabel = summary.remainingBudget < 0 ? 'کسری بودجه' : summary.budgetAbsorptionPct > 90 ? 'نیازمند پیگیری' : 'در وضعیت کنترل'

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="fin-text-secondary text-[10.5px] font-semibold tracking-[0.01em]">بودجه باقی‌مانده پس از تعهدات جاری</p>
          <p className="fin-hero-figure fin-text num mt-1 text-[34px] leading-none sm:text-[40px]" style={{ color: summary.remainingBudget >= 0 ? undefined : 'var(--fin-bad)' }}>
            {fmtCurrency(summary.remainingBudget, currency)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StampBadge label={healthLabel} tone={healthTone} />
          <div className="text-left">
            <p className="fin-text-muted text-[9.5px]">جذب بودجه</p>
            <p className="num fin-text text-sm font-bold">{summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={Wallet} label="بودجه کل" value={fmtCurrency(summary.currentBudgetAmount, currency)} color="#3e7c74" />
        <MetricCard icon={FileText} label="ارزش کل قراردادها" value={fmtCurrency(summary.currentContractValueTotal, currency)} color="#5c7290" />
        <MetricCard icon={ShieldCheck} label="مبلغ صورت‌وضعیت (تاییدشده)" value={fmtCurrency(summary.certifiedTotal, currency)} color="#8b6e9c" />
        <MetricCard icon={Banknote} label="مبلغ پرداخت‌شده" value={fmtCurrency(summary.paidTotal, currency)} color="#a65d82" />
        <MetricCard icon={Calculator} label="موجودی تعهدات" value={fmtCurrency(summary.committedCost, currency)} color="#b8863b" />
        <MetricCard icon={PieChart} label="پیش‌بینی نیاز نقدینگی ۱۲ ماهه" value={fmtCurrency(fundingNext12, currency)} color="#3e7c74" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <DonutPanel title="وضعیت بودجه" icon={<Wallet size={13} />} data={budgetDonut} unit={currency} formatTotal={() => `${summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪`} />
        <div className="lg:col-span-1">
          <CashFlowComboChart title="نمودار جریان نقدینگی (۱۲ ماه)" icon={<Gauge size={13} />} points={cashFlow.map((p) => ({ month: p.month, actual: p.actual, planned: p.planned, forecast: p.forecast }))} currency={currency} />
        </div>
        <DonutPanel title={breakdownTitle} icon={<PieChart size={13} />} data={breakdown} unit={breakdownUnit ?? currency} formatTotal={(n) => (breakdownUnit ? n.toLocaleString('fa-IR') : fmtCurrency(n, currency))} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <DonutPanel title="وضعیت پرداخت‌ها" icon={<Receipt size={13} />} data={paymentDonut} unit={currency} formatTotal={(n) => fmtCurrency(n, currency)} />
        <div className="grid grid-cols-2 gap-3">
          <MiniStatCard icon={Clock} label="میانگین تاخیر پرداخت" value={summary.avgPaymentDelayDays != null ? `${summary.avgPaymentDelayDays.toLocaleString('fa-IR')} روز` : '—'} color="#b8863b" />
          <MiniStatCard icon={UserRound} label="بدهی کارفرما" value={fmtCurrency(summary.outstandingTotal, currency)} color="#b5573a" />
          <MiniStatCard icon={Scale} label="دریافت بیش از حد پیمانکار" value={fmtCurrency(summary.contractorOverpaymentTotal, currency)} color="#c4793a" />
          <MiniStatCard icon={ShieldCheck} label="ضمانت‌نامه‌های فعال" value={activeGuaranteeCount.toLocaleString('fa-IR')} color="#c9a654" sub={fmtCurrency(summary.guaranteesTotal, currency)} />
        </div>
        <DonutPanel title="وضعیت هزینه (EAC)" icon={<Calculator size={13} />} data={eacDonut} unit={currency} formatTotal={(n) => fmtCurrency(n, currency)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {rankedRows.length > 0 ? (
          <RankedProgressTable
            title={rankedTitle}
            icon={<AlertTriangle size={13} />}
            valueLabel="نیاز نقدینگی (۳ ماه)"
            rows={rankedRows.slice(0, 6).map((r, i) => {
              const max = rankedRows[0]?.need || 1
              return { key: r.key, label: r.label, value: fmtCurrency(r.need, currency), pct: Math.round((r.need / max) * 100), color: DONUT_PALETTE[i % DONUT_PALETTE.length] }
            })}
          />
        ) : (
          <div className="fin-card p-4 text-[11px] fin-text-muted">داده کافی برای رتبه‌بندی نیاز نقدینگی وجود ندارد.</div>
        )}
        <SimpleTable title="آخرین صورت‌وضعیت‌های ثبت‌شده" icon={<Receipt size={13} />} columns={certColumns} rows={latestCerts} />
        <AlertFeed title="اخبار و هشدارها" icon={<AlertTriangle size={13} />} items={alerts.slice(0, 6)} />
      </div>

      {fundingThisMonth > 0 && (
        <p className="fin-card p-3 text-[11px] leading-6 fin-text-secondary">
          گزارش مدیریتی: برآورد می‌شود در ماه جاری حدود <span className="num font-bold fin-text">{fmtCurrency(fundingThisMonth, currency)}</span> نیاز مالی/پرداخت وجود داشته باشد و برای ۱۲ ماه پیش رو مجموعا حدود{' '}
          <span className="num font-bold fin-text">{fmtCurrency(fundingNext12, currency)}</span> منبع مالی باید در نظر گرفته شود.
        </p>
      )}
    </div>
  )
}

/**
 * Kept here for backward compatibility with pages not yet migrated to the new fin-card visual
 * language (see task tracking "Reskin remaining Finance pages") — a budget-vs-target bullet bar
 * on the old glass-panel surface.
 */
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
  icon: React.ReactNode
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
        <div className="absolute inset-y-0 rounded-lg" style={{ right: 0, width: `${valuePct}%`, background: over ? '#b5573a' : '#c9a654', opacity: 0.85 }} />
        <div className="absolute inset-y-[-4px] w-[2.5px] rounded-full bg-white" style={{ right: `${targetPct}%` }} title={targetLabel} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: over ? '#b5573a' : '#c9a654' }} /> {valueLabel}: <span className="num font-bold">{fmtCurrency(value, currency)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-0.5 bg-white" /> {targetLabel}: <span className="num font-bold">{fmtCurrency(target, currency)}</span>
        </span>
      </div>
      {emptyHint && <p className="mt-2 text-[10px] leading-5 text-muted">{emptyHint}</p>}
    </div>
  )
}
