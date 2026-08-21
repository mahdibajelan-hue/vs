import { FolderKanban } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { computeProjectFinancialSummary } from '../lib/financeCalc'
import { fmtCurrency } from '../components/FinanceKpiTile'
import { SimpleTable, type SimpleTableColumn } from '../components/FinanceDashboardUI'

interface ProjectRow {
  id: string
  name: string
  portfolioName: string
  programName: string
  currentBudgetAmount: number
  currentContractValueTotal: number
  certifiedTotal: number
  paidTotal: number
  outstandingTotal: number
  eac: number | null
  budgetAbsorptionPct: number
  currency: string
}

/** پروژه‌ها — one row per project with its own financial figures (no aggregation, unlike the Portfolio/Program pages). */
export function ProjectsBrowsePage() {
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

  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name ?? '—'
  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? '—'

  const rows: ProjectRow[] = projects.map((p) => {
    const budget = budgets.find((b) => b.masterProjectId === p.id) ?? null
    const changes = budgetChanges.filter((c) => c.masterProjectId === p.id)
    const summary = computeProjectFinancialSummary(p.id, p.forecastCostAtCompletion ?? null, budget, changes, contracts, amendments, certificates, annualBudgets, guarantees)
    return {
      id: p.id,
      name: p.officialName,
      portfolioName: portfolioName(p.portfolioId),
      programName: programName(p.programId),
      currentBudgetAmount: summary.currentBudgetAmount,
      currentContractValueTotal: summary.currentContractValueTotal,
      certifiedTotal: summary.certifiedTotal,
      paidTotal: summary.paidTotal,
      outstandingTotal: summary.outstandingTotal,
      eac: summary.eac,
      budgetAbsorptionPct: summary.budgetAbsorptionPct,
      currency: budget?.currency ?? p.currency ?? 'ریال',
    }
  })

  const columns: SimpleTableColumn<ProjectRow>[] = [
    {
      key: 'name',
      label: 'پروژه',
      render: (r) => (
        <div>
          <p className="font-bold">{r.name}</p>
          <p className="fin-text-muted text-[10px]">
            {r.portfolioName} / {r.programName}
          </p>
        </div>
      ),
    },
    { key: 'budget', label: 'بودجه', render: (r) => <span className="num">{fmtCurrency(r.currentBudgetAmount, r.currency)}</span> },
    { key: 'contract', label: 'ارزش قرارداد', render: (r) => <span className="num">{fmtCurrency(r.currentContractValueTotal, r.currency)}</span> },
    { key: 'certified', label: 'تاییدشده', render: (r) => <span className="num">{fmtCurrency(r.certifiedTotal, r.currency)}</span> },
    { key: 'paid', label: 'پرداخت‌شده', render: (r) => <span className="num">{fmtCurrency(r.paidTotal, r.currency)}</span> },
    {
      key: 'outstanding',
      label: 'مانده',
      render: (r) => (
        <span className="num font-bold" style={{ color: r.outstandingTotal > 0 ? '#b8863b' : '#3e7c74' }}>
          {fmtCurrency(r.outstandingTotal, r.currency)}
        </span>
      ),
    },
    { key: 'eac', label: 'EAC', render: (r) => <span className="num">{r.eac != null ? fmtCurrency(r.eac, r.currency) : '—'}</span> },
    { key: 'absorption', label: 'جذب بودجه', render: (r) => <span className="num">{r.budgetAbsorptionPct.toLocaleString('fa-IR')}٪</span> },
  ]

  return (
    <div className="space-y-4">
      <SimpleTable title={`فهرست پروژه‌ها (${projects.length})`} icon={<FolderKanban size={13} />} columns={columns} rows={rows} />
    </div>
  )
}
