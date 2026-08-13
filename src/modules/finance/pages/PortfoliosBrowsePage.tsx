import { Building2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { computeProjectFinancialSummary, aggregateFinancialSummaries } from '../lib/financeCalc'
import { fmtCurrency } from '../components/FinanceKpiTile'
import { SimpleTable, type SimpleTableColumn } from '../components/FinanceDashboardUI'

interface PortfolioRow {
  id: string
  name: string
  projectCount: number
  currentBudgetAmount: number
  currentContractValueTotal: number
  certifiedTotal: number
  paidTotal: number
  outstandingTotal: number
  budgetAbsorptionPct: number
  currency: string
}

/** پرتفولیوها — one row per portfolio with financial figures rolled up from its real projects (spec item 2). */
export function PortfoliosBrowsePage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const projects = useMasterDataStore((s) => s.projects)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const annualBudgets = useFinanceStore((s) => s.annualBudgets)
  const guarantees = useFinanceStore((s) => s.guarantees)

  const rows: PortfolioRow[] = portfolios.map((pf) => {
    const scopedProjects = projects.filter((p) => p.portfolioId === pf.id)
    const summaries = scopedProjects.map((p) => {
      const budget = budgets.find((b) => b.masterProjectId === p.id) ?? null
      const changes = budgetChanges.filter((c) => c.masterProjectId === p.id)
      return computeProjectFinancialSummary(p.id, p.forecastCostAtCompletion ?? null, budget, changes, contracts, amendments, certificates, annualBudgets, guarantees)
    })
    const agg = aggregateFinancialSummaries(summaries)
    const currency = budgets.find((b) => scopedProjects.some((p) => p.id === b.masterProjectId))?.currency ?? scopedProjects[0]?.currency ?? 'ریال'
    return {
      id: pf.id,
      name: pf.name,
      projectCount: scopedProjects.length,
      currentBudgetAmount: agg.currentBudgetAmount,
      currentContractValueTotal: agg.currentContractValueTotal,
      certifiedTotal: agg.certifiedTotal,
      paidTotal: agg.paidTotal,
      outstandingTotal: agg.outstandingTotal,
      budgetAbsorptionPct: agg.budgetAbsorptionPct,
      currency,
    }
  })

  const columns: SimpleTableColumn<PortfolioRow>[] = [
    { key: 'name', label: 'پرتفولیو', render: (r) => <span className="font-bold">{r.name}</span> },
    { key: 'count', label: 'تعداد پروژه', render: (r) => <span className="num">{r.projectCount.toLocaleString('fa-IR')}</span> },
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
    { key: 'absorption', label: 'جذب بودجه', render: (r) => <span className="num">{r.budgetAbsorptionPct.toLocaleString('fa-IR')}٪</span> },
  ]

  return (
    <div className="space-y-4">
      <SimpleTable title={`فهرست پرتفولیوها (${portfolios.length})`} icon={<Building2 size={13} />} columns={columns} rows={rows} />
    </div>
  )
}
