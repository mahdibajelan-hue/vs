import { Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'

const STATUS_DOT: Record<'good' | 'warn' | 'bad', string> = { good: '#2ecc71', warn: '#f1c40f', bad: '#e74c3c' }

export function MaterialKpiTile({
  icon: Icon,
  label,
  value,
  color,
  status,
  tooltip,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  status?: 'good' | 'warn' | 'bad'
  tooltip?: string
}) {
  return (
    <div className="glass-panel group relative flex flex-col gap-2 rounded-2xl p-3.5">
      <div className="flex items-start justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
          <Icon size={15} style={{ color }} />
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
        <p className="num truncate text-lg font-extrabold leading-tight" style={{ color }}>
          {value}
        </p>
        <p className="mt-0.5 text-[10.5px] font-medium leading-4 text-secondary">{label}</p>
      </div>
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full right-2 z-20 mb-2 w-56 max-w-[80vw] rounded-lg border border-white/10 bg-[var(--bg-panel-solid)] p-2.5 text-[10px] leading-5 text-secondary opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
          {tooltip}
        </div>
      )}
    </div>
  )
}

/** Quantity formatting with fa-IR digit grouping and an optional unit suffix. */
export function fmtQty(n: number, unit = ''): string {
  const suffix = unit ? ` ${unit}` : ''
  return `${n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}${suffix}`
}

/** Weight formatting — switches to tons above 1000kg for readability. */
export function fmtWeight(kg: number): string {
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} تن`
  return `${kg.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلوگرم`
}

/** Every date in this module is displayed as Jalali (شمسی) — mirrors the Finance module's helper. */
export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return formatJalali(iso) || '—'
}

/** Compact currency formatting (میلیون/میلیارد/هزار میلیارد) — mirrors the Finance module's helper. */
export function fmtValue(n: number, currency = ''): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const suffix = currency ? ` ${currency}` : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} هزار میلیارد${suffix}`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد${suffix}`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیون${suffix}`
  return `${sign}${Math.round(abs).toLocaleString('fa-IR')}${suffix}`
}
