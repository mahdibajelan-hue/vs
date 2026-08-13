import { useMemo } from 'react'
import { Calculator, Gauge, Layers, Scale, ShieldCheck, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { computeProjectFinancialSummary, currentContractValue } from '../lib/financeCalc'
import { fmtCurrency } from '../components/FinanceKpiTile'
import { MetricCard } from '../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../FinanceApp'
import { BulletComparison } from './FinancialDashboardPage'
import { BreakdownDonut, type ChartDatum } from '../../masterdata/components/RollupCharts'
import { FIN_CONTRACT_ROLE_COLOR, FIN_CONTRACT_ROLE_LABEL_FA, FIN_CONTRACT_ROLES, FIN_CONTRACT_STATUS_LABEL_FA, type FinContractRole } from '../types'

/**
 * Independent Cost Management tab (spec item 9): Cost Incurred to Date, Committed Cost, Forecast
 * Cost, Cost to Complete, EAC, Budget vs EAC, Variance — and, per the spec's explicit warning,
 * project cost is NOT limited to the EPC contractor: every contract role (Consultant/MC/TPI/Other)
 * feeds the same totals below, broken out by role in the two donuts so that's visible at a glance.
 */
export function CostManagementPage({ masterProjectId }: { masterProjectId: string }) {
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

  const forecastCost = eac ?? summary.committedCost

  const committedByRole: ChartDatum[] = useMemo(() => {
    const map = new Map<FinContractRole, number>()
    for (const c of projectContracts) {
      if (c.status !== 'active' && c.status !== 'completed') continue
      map.set(c.contractRole, (map.get(c.contractRole) ?? 0) + currentContractValue(c, projectAmendments))
    }
    return FIN_CONTRACT_ROLES.map((r) => ({ key: r, label: FIN_CONTRACT_ROLE_LABEL_FA[r], value: Math.round(map.get(r) ?? 0), color: FIN_CONTRACT_ROLE_COLOR[r] })).filter((d) => d.value > 0)
  }, [projectContracts, projectAmendments])

  const certifiedByRole: ChartDatum[] = useMemo(() => {
    const roleOf = new Map(projectContracts.map((c) => [c.id, c.contractRole]))
    const map = new Map<FinContractRole, number>()
    for (const cert of projectCertificates) {
      const role = roleOf.get(cert.contractId)
      if (!role) continue
      map.set(role, (map.get(role) ?? 0) + (cert.certifiedAmount ?? 0))
    }
    return FIN_CONTRACT_ROLES.map((r) => ({ key: r, label: FIN_CONTRACT_ROLE_LABEL_FA[r], value: Math.round(map.get(r) ?? 0), color: FIN_CONTRACT_ROLE_COLOR[r] })).filter((d) => d.value > 0)
  }, [projectContracts, projectCertificates])

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <p className="text-xs fin-text-muted">مدیریت هزینه پروژه (Cost Management)</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        <p className="mt-1 text-[10.5px] leading-5 fin-text-muted">
          هزینه پروژه صرفا محدود به پیمانکار EPC نیست — قراردادهای مشاور نظارت، مدیریت طرح (MC)، بازرسی شخص ثالث (TPI) و سایر قراردادهای مرتبط نیز در همه اعداد این صفحه لحاظ شده‌اند.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          icon={Gauge}
          label="هزینه واقعی تا امروز (Cost Incurred to Date)"
          value={fmtCurrency(summary.actualCost, currency)}
          color="#a78bfa"
          tooltip="مجموع مبالغ تاییدشده صورت‌وضعیت‌های همه قراردادهای پروژه (EPC، مشاور، MC، TPI، سایر) تا امروز — معیار هزینه واقعا انجام‌شده، نه تعهد قراردادی."
          emphasize
        />
        <MetricCard
          icon={Calculator}
          label="هزینه متعهدشده (Committed Cost)"
          value={fmtCurrency(summary.committedCost, currency)}
          color="#38bdf8"
          tooltip="ارزش جاری همه قراردادهای فعال/تکمیل‌شده پروژه، از هر نوع (EPC/مشاور/MC/TPI/سایر) — یعنی چقدر تعهد مالی امضا شده، صرف‌نظر از اینکه هنوز پرداخت شده یا نه."
        />
        <MetricCard
          icon={TrendingUp}
          label="پیش‌بینی هزینه (Forecast Cost)"
          value={fmtCurrency(forecastCost, currency)}
          color="#f59e0b"
          tooltip="در صورت ثبت EAC از شناسنامه پروژه همان مقدار، در غیر این صورت هزینه متعهدشده به‌عنوان بهترین برآورد جایگزین در نظر گرفته می‌شود."
        />
        <MetricCard
          icon={Layers}
          label="هزینه باقی‌مانده تا تکمیل (Cost to Complete)"
          value={fmtCurrency(summary.costToComplete, currency)}
          color="#f59e0b"
          tooltip="پیش‌بینی هزینه منهای آنچه تاکنون تاییدشده — یعنی چه مقدار هزینه دیگر تا پایان پروژه پیش‌بینی می‌شود."
        />
        <MetricCard
          icon={TrendingUp}
          label="پیش‌بینی هزینه در تکمیل (EAC)"
          value={eac != null ? fmtCurrency(eac, currency) : 'در شناسنامه پروژه ثبت نشده'}
          color="#f59e0b"
          tooltip="Estimate at Completion — برآورد کل هزینه پروژه در پایان کار، از شناسنامه پروژه در داده پایه خوانده می‌شود."
        />
        <MetricCard
          icon={Scale}
          label="انحراف بودجه (Budget vs EAC Variance)"
          value={fmtCurrency(summary.budgetVariance, currency)}
          color={summary.budgetVariance >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
          tooltip="بودجه جاری منهای پیش‌بینی هزینه (EAC). مثبت یعنی پروژه در چارچوب بودجه پیش می‌رود؛ منفی یعنی هزینه از بودجه فراتر می‌رود."
        />
        <MetricCard
          icon={Wallet}
          label="بودجه جاری پروژه"
          value={fmtCurrency(summary.currentBudgetAmount, currency)}
          color={FINANCE_ACCENT}
          tooltip="بودجه مصوب به‌علاوه هر تغییر بودجه ثبت‌شده — مبنای مقایسه با EAC در نمودار زیر."
        />
        <MetricCard
          icon={ShieldCheck}
          label="جذب بودجه (Budget Absorption)"
          value={`${summary.budgetAbsorptionPct.toLocaleString('fa-IR')}٪`}
          color={summary.budgetAbsorptionPct > 100 ? '#e74c3c' : '#2ecc71'}
          status={summary.budgetAbsorptionPct > 100 ? 'bad' : 'good'}
          tooltip="سهم هزینه متعهدشده از بودجه جاری پروژه. بالای ۱۰۰٪ یعنی تعهدات از بودجه مصوب عبور کرده است."
        />
      </div>

      <BulletComparison
        icon={<TrendingDown size={12} style={{ color: '#f59e0b' }} />}
        title="بودجه جاری در برابر پیش‌بینی هزینه در تکمیل (EAC)"
        valueLabel="EAC / پیش‌بینی هزینه"
        value={forecastCost}
        targetLabel="بودجه جاری (خط هدف)"
        target={summary.currentBudgetAmount}
        currency={currency}
        emptyHint={eac == null ? 'EAC از شناسنامه پروژه ثبت نشده — مقدار جایگزین: هزینه متعهدشده.' : undefined}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="fin-card p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
            <Calculator size={12} style={{ color: '#38bdf8' }} /> هزینه متعهدشده به تفکیک نوع قرارداد
          </p>
          <p className="mb-2 text-[10px] leading-5 fin-text-muted">سهم هر نوع قرارداد (EPC/مشاور/MC/TPI/سایر) از کل تعهد مالی پروژه.</p>
          <BreakdownDonut title="" data={committedByRole} unit={currency} height={210} formatTotal={(n) => fmtCurrency(n, currency)} />
        </div>
        <div className="fin-card p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
            <Gauge size={12} style={{ color: '#a78bfa' }} /> هزینه واقعی (تاییدشده) به تفکیک نوع قرارداد
          </p>
          <p className="mb-2 text-[10px] leading-5 fin-text-muted">سهم هر نوع قرارداد از هزینه واقعا تاییدشده تا امروز.</p>
          <BreakdownDonut title="" data={certifiedByRole} unit={currency} height={210} formatTotal={(n) => fmtCurrency(n, currency)} />
        </div>
      </div>

      <div className="fin-card overflow-x-auto p-4">
        <p className="mb-3 text-[11px] font-bold">وضعیت هزینه به تفکیک قرارداد</p>
        {projectContracts.length === 0 ? (
          <p className="text-xs fin-text-muted">قراردادی برای این پروژه ثبت نشده است.</p>
        ) : (
          <table className="w-full min-w-[560px] text-right text-xs">
            <thead>
              <tr className="border-b text-[10.5px] fin-text-muted" style={{ borderColor: 'var(--fin-divider)' }}>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">نوع</th>
                <th className="pb-2 font-medium">وضعیت</th>
                <th className="pb-2 font-medium">ارزش جاری قرارداد</th>
                <th className="pb-2 font-medium">هزینه تاییدشده</th>
                <th className="pb-2 font-medium">مانده تا سقف قرارداد</th>
              </tr>
            </thead>
            <tbody>
              {projectContracts.map((c) => {
                const current = currentContractValue(c, projectAmendments)
                const certified = projectCertificates.filter((cert) => cert.contractId === c.id).reduce((s, cert) => s + (cert.certifiedAmount ?? 0), 0)
                return (
                  <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--fin-divider)' }}>
                    <td className="py-2">
                      <p className="font-bold">{c.title || c.contractNumber || 'بدون عنوان'}</p>
                      <p className="num text-[10px] fin-text-muted" dir="ltr">
                        {c.contractNumber}
                      </p>
                    </td>
                    <td className="py-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{ borderColor: `${FIN_CONTRACT_ROLE_COLOR[c.contractRole]}55`, color: FIN_CONTRACT_ROLE_COLOR[c.contractRole] }}
                      >
                        {FIN_CONTRACT_ROLE_LABEL_FA[c.contractRole]}
                      </span>
                    </td>
                    <td className="py-2 text-[10.5px] fin-text-secondary">{FIN_CONTRACT_STATUS_LABEL_FA[c.status]}</td>
                    <td className="num py-2 font-bold">{fmtCurrency(current, c.currency)}</td>
                    <td className="num py-2">{fmtCurrency(certified, c.currency)}</td>
                    <td className="num py-2" style={{ color: current - certified >= 0 ? undefined : '#e74c3c' }}>
                      {fmtCurrency(current - certified, c.currency)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
