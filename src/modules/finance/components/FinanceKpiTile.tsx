import { Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatJalali, isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'

const STATUS_DOT: Record<'good' | 'warn' | 'bad', string> = { good: '#3e7c74', warn: '#b8863b', bad: '#b5573a' }

/**
 * Executive-level KPI tile: large bold numbers first (spec: "قابل درک در چند ثانیه"), a status
 * dot as the only carrier of good/warn/bad semantics, and a hover tooltip every KPI is expected
 * to carry — definition + what it means + how to read an increase/decrease, all in one string
 * (caller composes it; see e.g. ProjectFinancialOverviewPage for the phrasing convention).
 */
export function FinanceKpiTile({
  icon: Icon,
  label,
  value,
  color,
  status,
  tooltip,
  emphasize,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  status?: 'good' | 'warn' | 'bad'
  tooltip?: string
  /** Slightly larger card for headline KPIs (e.g. Total Guarantees, per spec "برجسته نمایش داده شود"). */
  emphasize?: boolean
}) {
  return (
    <div className={`glass-panel group relative flex flex-col gap-2 rounded-2xl ${emphasize ? 'p-4' : 'p-3.5'}`}>
      <div className="flex items-start justify-between">
        <div className={`flex items-center justify-center rounded-lg ${emphasize ? 'h-9 w-9' : 'h-8 w-8'}`} style={{ background: `${color}1a` }}>
          <Icon size={emphasize ? 17 : 15} style={{ color }} />
        </div>
        <div className="flex items-center gap-1">
          {status && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[status] }} />}
          {tooltip && (
            <button type="button" tabIndex={0} className="text-muted outline-none hover:text-secondary focus-visible:text-secondary" aria-label={`توضیح ${label}`}>
              <Info size={11} />
            </button>
          )}
        </div>
      </div>
      <div>
        <p className={`num truncate font-extrabold leading-tight ${emphasize ? 'text-2xl' : 'text-xl'}`} style={{ color }}>
          {value}
        </p>
        <p className="mt-0.5 text-[10.5px] font-medium leading-4 text-secondary">{label}</p>
      </div>
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full right-2 z-20 mb-2 w-64 max-w-[85vw] rounded-lg border border-white/10 bg-[var(--bg-panel-solid)] p-2.5 text-[10.5px] leading-5 text-secondary opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
          {tooltip}
        </div>
      )}
    </div>
  )
}

/** Compact currency formatting (میلیون/میلیارد/هزار میلیارد) — mirrors the same helper in the Portfolio Dashboard so both modules read consistently. */
export function fmtCurrency(n: number, currency = ''): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const suffix = currency ? ` ${currency}` : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} هزار میلیارد${suffix}`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد${suffix}`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیون${suffix}`
  return `${sign}${Math.round(abs).toLocaleString('fa-IR')}${suffix}`
}

/** Every date in this module is displayed as Jalali (شمسی) — this is the one place that formatting happens. */
export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return formatJalali(iso) || '—'
}

/** Chart month-axis label in Jalali — input is a "YYYY-MM" Gregorian month key (see financeCalc's CashFlowPoint.month). */
export function fmtMonthJalali(monthIso: string): string {
  const j = isoToJalali(`${monthIso}-01`)
  if (!j) return monthIso
  return `${JALALI_MONTHS[j.jm - 1]} ${String(j.jy).slice(2)}`
}
