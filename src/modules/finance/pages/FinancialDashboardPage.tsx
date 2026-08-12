import { useId, useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  Banknote,
  Calculator,
  Clock,
  FileText,
  Gauge,
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
import { computeProjectFinancialSummary, computeCashFlowSeries, cumulativeCashFlow, paymentAgingDays } from '../lib/financeCalc'
import { FinanceKpiTile, fmtCurrency } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { BreakdownDonut, RankedBarChart, type ChartDatum } from '../../masterdata/components/RollupCharts'

export function FinancialDashboardPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)

  const projectContracts = useMemo(() => contracts.filter((c) => c.masterProjectId === masterProjectId), [contracts, masterProjectId])
  const contractIds = useMemo(() => new Set(projectContracts.map((c) => c.id)), [projectContracts])
  const projectAmendments = useMemo(() => amendments.filter((a) => contractIds.has(a.contractId)), [amendments, contractIds])
  const projectCertificates = useMemo(() => certificates.filter((c) => contractIds.has(c.contractId)), [certificates, contractIds])

  const budget = budgets.find((b) => b.masterProjectId === masterProjectId) ?? null
  const projectChanges = budgetChanges.filter((c) => c.masterProjectId === masterProjectId)
  const currency = budget?.currency ?? project?.currency ?? 'ریال'
  const eac = project?.forecastCostAtCompletion ?? null

  const summary = useMemo(
    () => computeProjectFinancialSummary(masterProjectId, eac, budget, projectChanges, contracts, amendments, certificates),
    [masterProjectId, eac, budget, projectChanges, contracts, amendments, certificates],
  )

  const agingSamples = projectCertificates.map((c) => paymentAgingDays(c)).filter((d): d is number => d != null)
  const avgAging = agingSamples.length > 0 ? Math.round(agingSamples.reduce((s, d) => s + d, 0) / agingSamples.length) : null

  const cashFlowMonthly = useMemo(() => computeCashFlowSeries(projectContracts, projectAmendments, projectCertificates), [projectContracts, projectAmendments, projectCertificates])
  const cashFlowCumulative = useMemo(() => cumulativeCashFlow(cashFlowMonthly), [cashFlowMonthly])

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const currentContractValueTotal = summary.currentContractValueTotal

  const outstandingData: ChartDatum[] = projectCertificates
    .map((c) => {
      const outstanding = (c.certifiedAmount ?? c.payableAmount) - c.paidAmount
      const aging = paymentAgingDays(c)
      return { key: c.id, label: c.certificateNumber || c.certificateDate, value: Math.max(0, Math.round(outstanding)), color: aging != null && aging > 30 ? '#e74c3c' : '#f1c40f' }
    })
    .filter((d) => d.value > 0)

  const exposureData: ChartDatum[] = [
    { key: 'paid', label: 'پرداخت‌شده', value: Math.max(0, summary.paidTotal), color: '#2ecc71' },
    { key: 'exposure', label: 'مواجهه مالی باقی‌مانده', value: Math.max(0, summary.financialExposure), color: '#e74c3c' },
  ]

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">داشبورد مالی پروژه</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <FinanceKpiTile icon={FileText} label="ارزش قرارداد (Contract Value)" value={fmtCurrency(summary.contractValueTotal, currency)} color={FINANCE_ACCENT} />
        <FinanceKpiTile icon={Wallet} label="بودجه مصوب (Approved Budget)" value={fmtCurrency(summary.approvedBudget, currency)} color={FINANCE_ACCENT} />
        <FinanceKpiTile icon={ShieldCheck} label="مبلغ تاییدشده (Certified)" value={fmtCurrency(summary.certifiedTotal, currency)} color="#a78bfa" />
        <FinanceKpiTile icon={Banknote} label="مبلغ پرداخت‌شده (Paid)" value={fmtCurrency(summary.paidTotal, currency)} color="#2ecc71" />
        <FinanceKpiTile
          icon={Receipt}
          label="مانده پرداخت‌نشده (Outstanding)"
          value={fmtCurrency(summary.outstandingTotal, currency)}
          color={summary.outstandingTotal > 0 ? '#f1c40f' : '#2ecc71'}
          status={summary.outstandingTotal > 0 ? 'warn' : 'good'}
        />
        <FinanceKpiTile icon={Calculator} label="هزینه متعهدشده (Committed)" value={fmtCurrency(summary.committedCost, currency)} color="#38bdf8" />
        <FinanceKpiTile icon={Gauge} label="هزینه واقعی/تاییدشده (Actual)" value={fmtCurrency(summary.actualCost, currency)} color="#a78bfa" />
        <FinanceKpiTile icon={TrendingUp} label="پیش‌بینی هزینه در تکمیل (EAC)" value={eac != null ? fmtCurrency(eac, currency) : 'ثبت نشده'} color="#f59e0b" />
        <FinanceKpiTile
          icon={Scale}
          label="بودجه باقی‌مانده (Remaining)"
          value={fmtCurrency(summary.remainingBudget, currency)}
          color={summary.remainingBudget >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.remainingBudget >= 0 ? 'good' : 'bad'}
        />
        <FinanceKpiTile
          icon={TrendingDown}
          label="انحراف بودجه (Variance)"
          value={fmtCurrency(summary.budgetVariance, currency)}
          color={summary.budgetVariance >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
        />
        <FinanceKpiTile
          icon={Clock}
          label="معطلی پرداخت (Payment Aging)"
          value={avgAging != null ? `${avgAging} روز` : '—'}
          color={avgAging != null && avgAging > 30 ? '#e74c3c' : '#38bdf8'}
          status={avgAging != null ? (avgAging > 30 ? 'bad' : 'good') : undefined}
          tooltip="میانگین روزهای سپری‌شده از ارسال صورت‌وضعیت‌های دارای مانده پرداخت‌نشده."
        />
      </div>

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

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
          <TrendingUp size={12} style={{ color: FINANCE_ACCENT }} /> جریان نقدی — ماهانه و تجمعی
        </p>
        <p className="mb-2 text-[10px] leading-5 text-muted">برنامه (بر مبنای بازه قرارداد)، واقعی (بر مبنای پرداخت صورت‌وضعیت) و پیش‌بینی (باقیمانده تعهد تا افق برنامه)، بر مبنای داده‌های واقعی قرارداد و صورت‌وضعیت.</p>
        {cashFlowMonthly.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-center text-[11px] text-muted">هنوز داده کافی برای رسم جریان نقدی ثبت نشده (نیاز به قرارداد با تاریخ یا صورت‌وضعیت پرداخت‌شده)</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CashFlowArea title="ماهانه" points={cashFlowMonthly} currency={currency} />
            <CashFlowArea title="تجمعی" points={cashFlowCumulative} currency={currency} />
          </div>
        )}
      </div>

      <RankedBarChart
        title="مانده پرداخت‌نشده صورت‌وضعیت‌ها (Outstanding Payments)"
        icon={<AlertTriangle size={12} style={{ color: '#f1c40f' }} />}
        data={outstandingData}
        unit={currency}
        formatValue={(n) => fmtCurrency(n)}
      />
    </div>
  )
}

function BulletComparison({
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

function CashFlowArea({ title, points, currency }: { title: string; points: { month: string; planned: number; actual: number; forecast: number }[]; currency: string }) {
  const gid = useId()
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-bold text-secondary">{title}</p>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`${gid}-actual`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2ecc71" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2ecc71" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${gid}-forecast`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${gid}-planned`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={30} tickFormatter={(v: number) => fmtCurrency(v)} />
            <RTooltip
              contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: 'var(--text-secondary)' }}
              formatter={(value, name) => [fmtCurrency(Number(value), currency), String(name)]}
            />
            <Area type="monotone" dataKey="planned" name="برنامه" stroke="#38bdf8" strokeWidth={1.5} fill={`url(#${gid}-planned)`} />
            <Area type="monotone" dataKey="actual" name="واقعی" stroke="#2ecc71" strokeWidth={2} fill={`url(#${gid}-actual)`} />
            <Area type="monotone" dataKey="forecast" name="پیش‌بینی" stroke="#f59e0b" strokeWidth={1.5} fill={`url(#${gid}-forecast)`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
