import { useMemo } from 'react'
import { useFinanceStore } from '../store/useFinanceStore'
import { useFinanceControlStore } from '../store/useFinanceControlStore'
import { currentBudget, certificatePaidTotal } from '../lib/financeCalc'
import { forecast } from '../lib/financeControl'
import { useThresholds } from '../lib/useThresholds'
import { fmtCurrency } from './FinanceKpiTile'

const OVERRUN_FA = { none: 'در محدودهٔ بودجه', watch: 'نزدیک به سقف بودجه', possible: 'با تصویب تغییرات در جریان، از بودجه عبور می‌کند', likely: 'با ارقام تصویب‌شده هم از بودجه گذشته است' } as const
const OVERRUN_COLOR = { none: '#3e7c74', watch: '#c28a2b', possible: '#c28a2b', likely: '#b5573a' } as const

/**
 * Forecast final cost from what is actually in the books: contracts at their approved (amended) value + land exposure from the land module.
 * The proposed amounts of changes still in flight are a separate dashed «scenario» line and never part of the base figure.
 */
export function ForecastCard({ masterProjectId }: { masterProjectId: string }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const claims = useFinanceStore((s) => s.claims)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const land = useFinanceControlStore((s) => s.land.get(masterProjectId)) ?? null
  const changes = useFinanceControlStore((s) => s.changes).filter((c) => c.masterProjectId === masterProjectId)
  const { thresholds } = useThresholds()

  const f = useMemo(() => {
    const ids = new Set(contracts.map((c) => c.id))
    const projectCerts = certificates.filter((c) => ids.has(c.contractId))
    const budget = currentBudget(budgets.find((b) => b.masterProjectId === masterProjectId) ?? null, budgetChanges.filter((c) => c.masterProjectId === masterProjectId))
    return forecast({ contracts, amendments, certificates: projectCerts, claims: claims.filter((c) => ids.has(c.contractId)), land, budget, thresholds, paidContracts: projectCerts.reduce((n, c) => n + certificatePaidTotal(c), 0),
      pending: changes.map((c) => ({ contractId: c.contractId, status: c.status, proposedAmount: c.proposedAmount })) })
  }, [contracts, amendments, certificates, claims, budgets, budgetChanges, land, changes, thresholds, masterProjectId])

  const max = Math.max(f.budget, f.scenarioEac, f.baseEac, 1)
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`
  const color = OVERRUN_COLOR[f.overrun]
  return (
    <div className="fin-card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-extrabold">هزینهٔ نهایی پیش‌بینی‌شده و احتمال تجاوز از بودجه</p><span className="text-xs font-bold" style={{ color }}>{OVERRUN_FA[f.overrun]}</span></div>
      <div className="relative h-7 overflow-hidden rounded-md" style={{ background: 'var(--fin-divider)' }} aria-hidden>
        <div className="absolute inset-y-0 start-0" style={{ width: pct(f.contractCommitted), background: '#5c7290' }} />
        <div className="absolute inset-y-0" style={{ insetInlineStart: pct(f.contractCommitted), width: `calc(${pct(f.baseEac)} - ${pct(f.contractCommitted)})`, background: '#8a6fb0' }} />
        {f.scenarioDelta > 0 && <div className="absolute inset-y-0 border border-dashed" style={{ insetInlineStart: pct(f.baseEac), width: `calc(${pct(f.scenarioEac)} - ${pct(f.baseEac)})`, borderColor: '#c28a2b', background: 'repeating-linear-gradient(45deg,#c28a2b33,#c28a2b33 4px,transparent 4px,transparent 8px)' }} />}
        {f.budget > 0 && <div className="absolute inset-y-0 w-0.5" style={{ insetInlineStart: pct(f.budget), background: 'var(--fin-text)' }} title="بودجهٔ جاری" />}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <Fig c="#5c7290" label="قراردادها (مصوب، با الحاقیه)" v={fmtCurrency(f.contractCommitted)} />
        <Fig c="#8a6fb0" label="تملک اراضی (پرداخت + تعهد)" v={fmtCurrency(f.landExposure)} />
        <Fig label="هزینهٔ نهایی بر پایهٔ ارقام مصوب" v={fmtCurrency(f.baseEac)} strong />
        <Fig c="#c28a2b" label="سناریو: تغییرات تصویب‌نشده" v={`+${fmtCurrency(f.scenarioDelta)}`} sub={f.scenarioDelta ? `جمع سناریو ${fmtCurrency(f.scenarioEac)}` : undefined} />
        <Fig label="بودجهٔ جاری" v={f.budget ? fmtCurrency(f.budget) : 'ثبت نشده'} sub={f.budget ? `${f.baseOverrun > 0 ? 'کسری' : 'مانده'} ${fmtCurrency(Math.abs(f.baseOverrun))}` : undefined} />
      </div>
      <p className="text-[10.5px] leading-5 fin-text-muted">مبلغ ریالی و ارزی قرارداد جدا از هم جمع نمی‌شوند مگر با معادل ریالی ثبت‌شده با نرخ و تاریخ نرخ. ادعاهای باز ({fmtCurrency(f.claimsExposure)}) جزو پیش‌بینی نیستند و جداگانه رصد می‌شوند.</p>
    </div>
  )
}
function Fig({ label, v, sub, c, strong }: { label: string; v: string; sub?: string; c?: string; strong?: boolean }) {
  return <div><p className="fin-text-muted flex items-center gap-1 text-[10.5px]">{c && <i className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />}{label}</p><p className={`num mt-0.5 ${strong ? 'text-sm font-extrabold' : 'font-bold'}`}>{v}</p>{sub && <p className="text-[10px] fin-text-muted">{sub}</p>}</div>
}
