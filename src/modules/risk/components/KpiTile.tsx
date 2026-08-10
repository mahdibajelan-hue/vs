import { TrendingDown, TrendingUp } from 'lucide-react'

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
  /** Explains what the metric means and how it's calculated — shown as a native hover tooltip. */
  tooltip?: string
  /** Direction-aware semantic coloring: whether this value is currently good, borderline, or concerning. */
  status?: 'good' | 'warn' | 'bad'
  /** Optional small up/down indicator, e.g. "12% بهتر از دوره قبل". isGood controls its color. */
  trend?: { direction: 'up' | 'down'; label: string; isGood: boolean }
}) {
  return (
    <div className="glass-panel relative rounded-2xl p-3" title={tooltip}>
      {status && <span className="absolute left-3 top-3 h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />}
      <p className="num text-xl font-extrabold" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
      {trend && (
        <span className="mt-1 flex items-center gap-1 text-[10px] font-medium" style={{ color: trend.isGood ? '#2ecc71' : '#e74c3c' }}>
          {trend.direction === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend.label}
        </span>
      )}
    </div>
  )
}
