import { Info, TrendingDown, TrendingUp } from 'lucide-react'

const STATUS_COLOR: Record<'good' | 'warn' | 'bad', string> = {
  good: '#2ecc71',
  warn: '#f97316',
  bad: '#e74c3c',
}

export function KpiTile({
  label,
  value,
  color,
  tooltip,
  status,
  trend,
}: {
  label: string
  value: number | string
  color: string
  /** Explains what the metric means and how it's calculated — shown via a visible info icon + hover/focus popover. */
  tooltip?: string
  /** Direction-aware semantic coloring: whether this value is currently good, borderline, or concerning. */
  status?: 'good' | 'warn' | 'bad'
  /** Optional small up/down indicator, e.g. "12% بهتر از دوره قبل". isGood controls its color. */
  trend?: { direction: 'up' | 'down'; label: string; isGood: boolean }
}) {
  return (
    <div className="glass-panel group relative rounded-2xl p-3">
      {status && <span className="absolute left-3 top-3 h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />}
      <div className="flex items-center gap-1.5">
        <p className="num text-xl font-extrabold" style={{ color }}>
          {value}
        </p>
        {tooltip && (
          <button type="button" tabIndex={0} className="text-muted outline-none hover:text-secondary focus-visible:text-secondary" aria-label={`توضیح ${label}`}>
            <Info size={12} />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
      {trend && (
        <span className="mt-1 flex items-center gap-1 text-[10px] font-medium" style={{ color: trend.isGood ? '#2ecc71' : '#e74c3c' }}>
          {trend.direction === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend.label}
        </span>
      )}
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full right-2 z-20 mb-2 w-56 max-w-[80vw] rounded-lg border border-white/10 bg-[var(--bg-panel-solid)] p-2.5 text-[10px] leading-5 text-secondary opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          {tooltip}
        </div>
      )}
    </div>
  )
}
