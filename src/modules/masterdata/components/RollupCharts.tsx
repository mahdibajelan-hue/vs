import { useId, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * Shared Power-BI-style chart primitives for every module's Portfolio/Program/Project rollup
 * page (Risk, Issue Management, PipePulse, Reporting) — one visual system instead of four,
 * following the same donut convention already shipped in RiskKpiCharts (center total label,
 * TOOLTIP_STYLE, Legend formatter). Every chart here is click-to-drill: clicking a slice/bar (or
 * its legend chip) calls back with that segment's key so the caller can show the underlying rows
 * — see ChartDrillPanel below for the standard "here's that segment's data" surface.
 *
 * Theme-agnostic by design: colors default to RASTA's global CSS tokens (--bg-panel-solid etc.)
 * so Risk/PipePulse/Reporting need no overrides, while Issue Management (which ships its own
 * scoped --im-* dark palette, see issues.css) passes those instead.
 */
export interface ChartDatum {
  key: string
  label: string
  value: number
  color: string
}

export interface ChartTheme {
  panelBg: string
  border: string
  textSecondary: string
  textMuted: string
}

const DEFAULT_THEME: ChartTheme = {
  panelBg: 'var(--bg-panel-solid)',
  border: 'var(--border-soft)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
}

function tooltipStyle(theme: ChartTheme) {
  return { background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 12 }
}

function ChartShell({ title, icon, subtitle, children }: { title: string; icon?: ReactNode; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold">
        {icon}
        {title}
      </p>
      {subtitle && <p className="mb-1.5 text-[10px] text-muted">{subtitle}</p>}
      {children}
    </div>
  )
}

const DONUT_RADIUS = 40
const DONUT_STROKE = 15
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
const DONUT_GAP = 3

/**
 * Donut breakdown by a discrete dimension (risk level, issue status, decision status, ...) —
 * clicking a slice or its legend chip toggles it as the active drill-down key.
 *
 * Hand-built as plain SVG (stroke-dasharray ring segments) rather than recharts' <Pie>: with
 * React 19, recharts v3's <Pie> silently corrupts its own angle math whenever another chart
 * (e.g. the RankedBarChart below) is mounted alongside it with click handlers active — reliably
 * reproducible even with unique `id`s on every chart, isolated down to Pie specifically (Bar
 * alone, or Pie completely alone, both render correctly every time). Rather than depend on an
 * unresolved upstream incompatibility, a ring chart is simple enough to own directly.
 */
export function BreakdownDonut({
  title,
  icon,
  data,
  unit = '',
  activeKey,
  onSliceClick,
  theme = DEFAULT_THEME,
  height = 200,
  formatTotal,
}: {
  title: string
  icon?: ReactNode
  data: ChartDatum[]
  unit?: string
  activeKey?: string | null
  onSliceClick?: (key: string) => void
  theme?: ChartTheme
  height?: number
  /** Formats the center total label — defaults to the raw count, but currency-valued donuts (e.g. Finance) need their own formatting. */
  formatTotal?: (n: number) => string
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const nonZero = data.filter((d) => d.value > 0)

  if (total === 0) {
    return (
      <ChartShell title={title} icon={icon}>
        <div className="flex items-center justify-center rounded-xl text-[11px]" style={{ height, color: theme.textMuted, background: `${theme.border}` }}>
          داده‌ای برای نمایش نیست
        </div>
      </ChartShell>
    )
  }

  const handleClick = (key: string) => onSliceClick?.(activeKey === key ? '' : key)

  let cumulative = 0
  const segments = nonZero.map((d) => {
    const len = (d.value / total) * DONUT_CIRCUMFERENCE
    const visibleLen = Math.max(0, len - (nonZero.length > 1 ? DONUT_GAP : 0))
    const offset = -(cumulative + (len - visibleLen) / 2)
    cumulative += len
    return { ...d, visibleLen, offset }
  })

  return (
    <ChartShell title={title} icon={icon}>
      <div className="relative flex flex-col items-center justify-center gap-3" style={{ height }}>
        <div className="relative" style={{ width: Math.min(height - 40, 160), height: Math.min(height - 40, 160) }}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            {segments.map((s) => {
              const isActive = activeKey === s.key
              const isDimmed = !!activeKey && !isActive
              return (
                <circle
                  key={s.key}
                  cx={50}
                  cy={50}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isActive ? DONUT_STROKE + 3 : DONUT_STROKE}
                  strokeDasharray={`${s.visibleLen} ${DONUT_CIRCUMFERENCE - s.visibleLen}`}
                  strokeDashoffset={s.offset}
                  opacity={isDimmed ? 0.32 : 1}
                  onClick={() => handleClick(s.key)}
                  style={{ cursor: onSliceClick ? 'pointer' : undefined, transition: 'stroke-width 120ms, opacity 120ms' }}
                >
                  <title>
                    {s.label}: {s.value}
                    {unit ? ` ${unit}` : ''}
                  </title>
                </circle>
              )
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="num text-xl font-extrabold">{formatTotal ? formatTotal(total) : total}</p>
            <p className="text-[9px]" style={{ color: theme.textMuted }}>
              مجموع
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {data.map((d) => {
            const dimmed = !!activeKey && activeKey !== d.key
            return (
              <button
                key={d.key}
                onClick={() => handleClick(d.key)}
                disabled={!onSliceClick || d.value === 0}
                className="flex items-center gap-1.5 text-[11px] transition-opacity disabled:cursor-default"
                style={{ color: dimmed ? theme.textMuted : theme.textSecondary, opacity: dimmed ? 0.6 : 1 }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                {d.label}
              </button>
            )
          })}
        </div>
      </div>
    </ChartShell>
  )
}

/**
 * Ranked horizontal bar comparison across items (projects/programs) — capped to the top N so 16
 * projects don't turn into an unreadable wall of bars; clicking a bar drills into that item.
 */
export function RankedBarChart({
  title,
  icon,
  data,
  unit = '',
  activeKey,
  onBarClick,
  theme = DEFAULT_THEME,
  maxItems = 8,
  barColor,
  formatValue,
}: {
  title: string
  icon?: ReactNode
  data: ChartDatum[]
  unit?: string
  activeKey?: string | null
  onBarClick?: (key: string) => void
  theme?: ChartTheme
  maxItems?: number
  barColor?: string
  /** Formats bar-end labels and tooltip values — defaults to the raw number, but currency-valued charts (e.g. Finance) need their own formatting. */
  formatValue?: (n: number) => string
}) {
  // See the matching comment on BreakdownDonut's chartId — Bar accepts the same id prop and
  // needs the same protection when multiple charts are mounted together.
  const chartId = useId()
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, maxItems)
  const height = Math.max(120, sorted.length * 30 + 20)

  if (sorted.length === 0) {
    return (
      <ChartShell title={title} icon={icon}>
        <div className="flex items-center justify-center rounded-xl text-[11px]" style={{ height: 120, color: theme.textMuted, background: `${theme.border}` }}>
          داده‌ای برای نمایش نیست
        </div>
      </ChartShell>
    )
  }

  const handleClick = (key: string) => onBarClick?.(activeKey === key ? '' : key)

  return (
    <ChartShell title={title} icon={icon} subtitle={data.length > maxItems ? `${maxItems} مورد برتر از ${data.length}` : undefined}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fontSize: 10.5, fill: theme.textSecondary }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '…' : v)}
            />
            <Tooltip
              cursor={{ fill: theme.border }}
              contentStyle={tooltipStyle(theme)}
              formatter={(value) => [`${formatValue ? formatValue(Number(value)) : value}${unit ? ' ' + unit : ''}`, '']}
            />
            <Bar
              id={chartId}
              dataKey="value"
              radius={[0, 4, 4, 0]}
              barSize={18}
              label={{ position: 'right', fontSize: 10.5, fill: theme.textSecondary, formatter: formatValue ? (v: string | number | boolean | null | undefined) => formatValue(Number(v)) : undefined }}
            >
              {sorted.map((d) => {
                const isActive = activeKey === d.key
                const isDimmed = !!activeKey && !isActive
                return (
                  <Cell
                    key={d.key}
                    fill={d.color || barColor || 'var(--color-brand-500)'}
                    fillOpacity={isDimmed ? 0.35 : 1}
                    onClick={() => handleClick(d.key)}
                    cursor={onBarClick ? 'pointer' : undefined}
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  )
}

/** Standard chrome for "here's the data behind the segment you clicked" — each caller supplies its own row renderer. */
export function ChartDrillPanel({ title, count, onClose, children }: { title: string; count: number; onClose: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3" style={{ border: '1px solid var(--border-soft)' }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold">
          {title} ({count})
        </p>
        <button onClick={onClose} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted hover:bg-white/5 transition-colors">
          <X size={11} /> پاک‌کردن فیلتر
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

/** Convenience hook: tracks the active drill-down key for one chart group, with toggle-off-on-reclick built in. */
export function useDrillKey() {
  const [key, setKey] = useState<string>('')
  return { activeKey: key || null, setActiveKey: setKey, clear: () => setKey('') }
}
