import { useId, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { BreakdownDonut, type ChartDatum, type ChartTheme } from '../../masterdata/components/RollupCharts'
import { fmtMonthJalali } from './FinanceKpiTile'

/** Compact axis-tick formatter (no currency suffix — space is tight on a chart axis). */
function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} هزار میلیارد`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیون`
  return `${sign}${Math.round(abs).toLocaleString('fa-IR')}`
}

/** Light-card theme for donuts/bars drawn on the module's new white fin-card surface, regardless of the shell's dark/light mode. */
const FIN_CHART_THEME: ChartTheme = {
  panelBg: '#ffffff',
  border: 'rgba(15, 23, 42, 0.08)',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
}

/** Executive metric card: icon circle, large number, label, trend pill — the KPI-row primitive from the mockup. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  trend,
}: {
  icon: LucideIcon
  label: string
  value: string
  color: string
  /** Positive = up (green), negative = down (red); omit when there's no meaningful trend. */
  trend?: { pct: number; goodDirection?: 'up' | 'down' }
}) {
  const trendUp = trend != null && trend.pct >= 0
  const trendGood = trend == null ? true : trend.goodDirection === 'down' ? !trendUp : trendUp
  return (
    <div className="fin-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${color}1a` }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="num fin-text text-2xl font-extrabold leading-tight">{value}</p>
        <p className="fin-text-secondary mt-1 text-[11px] font-medium">{label}</p>
      </div>
      {trend && (
        <p className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: trendGood ? '#16a34a' : '#dc2626' }}>
          {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend.pct).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪ نسبت به ماه قبل
        </p>
      )}
    </div>
  )
}

/** Smaller single-stat card for secondary metric rows. */
export function MiniStatCard({ icon: Icon, label, value, color, sub }: { icon: LucideIcon; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="fin-card flex flex-col items-center gap-2 p-4 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${color}1a` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <p className="num fin-text text-xl font-extrabold">{value}</p>
      <p className="fin-text-secondary text-[10.5px] font-medium">{label}</p>
      {sub && <p className="fin-text-muted text-[9.5px]">{sub}</p>}
    </div>
  )
}

/** White fin-card wrapper around the shared BreakdownDonut, pre-themed for the light card surface. */
export function DonutPanel({
  title,
  icon,
  data,
  unit,
  formatTotal,
  height = 190,
}: {
  title: string
  icon?: ReactNode
  data: ChartDatum[]
  unit?: string
  formatTotal?: (n: number) => string
  height?: number
}) {
  return (
    <div className="fin-card p-4">
      <p className="fin-text mb-2 flex items-center gap-1.5 text-[12px] font-bold">
        {icon} {title}
      </p>
      <BreakdownDonut title="" data={data} unit={unit} height={height} formatTotal={formatTotal} theme={FIN_CHART_THEME} />
    </div>
  )
}

export interface ComboSeriesPoint {
  month: string
  actual: number
  planned: number
  forecast: number
}

/** Planned/Actual/Forecast cash-flow combo chart: green bars for actual, solid blue line for planned/paid, dashed amber line for forecast. */
export function CashFlowComboChart({ title, icon, points, currency }: { title: string; icon?: ReactNode; points: ComboSeriesPoint[]; currency: string }) {
  const gid = useId()
  return (
    <div className="fin-card p-4">
      <p className="fin-text mb-2 flex items-center gap-1.5 text-[12px] font-bold">
        {icon} {title}
      </p>
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-[11px] fin-text-muted">داده کافی برای رسم نمودار ثبت نشده است</div>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gid}-actual`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fmtMonthJalali} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompact} />
              <RTooltip
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: '#475569' }}
                labelFormatter={(label) => fmtMonthJalali(String(label))}
                formatter={(value, name) => [`${Number(value).toLocaleString('fa-IR')} ${currency}`, String(name)]}
              />
              <Bar dataKey="actual" name="جریان نقدی واقعی" fill={`url(#${gid}-actual)`} radius={[6, 6, 0, 0]} barSize={22} />
              <Line type="monotone" dataKey="planned" name="پرداخت واقعی" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="forecast" name="جریان نقدینگی پیش‌بینی‌شده" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export interface AlertItem {
  id: string
  severity: 'bad' | 'warn' | 'info'
  days: number
  daysLabel: string
  text: string
}

const ALERT_TONE: Record<AlertItem['severity'], string> = { bad: '#ef4444', warn: '#f59e0b', info: '#3b82f6' }

/** Alerts/warnings feed card — severity dot, day-count badge, message. */
export function AlertFeed({ title, icon, items }: { title: string; icon?: ReactNode; items: AlertItem[] }) {
  return (
    <div className="fin-card flex flex-col p-4">
      <p className="fin-text mb-3 flex items-center gap-1.5 text-[12px] font-bold">
        {icon} {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] fin-text-muted">هشداری برای نمایش وجود ندارد.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: ALERT_TONE[a.severity] }} />
              <p className="min-w-0 flex-1 text-[11.5px] leading-5 fin-text">{a.text}</p>
              <span
                className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: `${ALERT_TONE[a.severity]}1a`, color: ALERT_TONE[a.severity] }}
              >
                {a.daysLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface RankedProgressRow {
  key: string
  label: string
  value: string
  pct: number
  color: string
}

/** "Top N by X" table with an inline progress bar — used for the cash-need-ranked-projects panel. */
export function RankedProgressTable({ title, icon, rows, valueLabel }: { title: string; icon?: ReactNode; rows: RankedProgressRow[]; valueLabel: string }) {
  return (
    <div className="fin-card p-4">
      <p className="fin-text mb-3 flex items-center gap-1.5 text-[12px] font-bold">
        {icon} {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] fin-text-muted">داده‌ای برای نمایش نیست.</p>
      ) : (
        <table className="w-full text-right text-[11px]">
          <thead>
            <tr className="fin-text-muted text-[10px]">
              <th className="pb-2 font-medium">درصد پیشرفت</th>
              <th className="pb-2 font-medium">{valueLabel}</th>
              <th className="pb-2 font-medium">مورد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                <td className="w-28 py-2">
                  <div className="flex items-center gap-2">
                    <span className="num fin-text-secondary shrink-0 text-[10.5px]">{r.pct.toLocaleString('fa-IR')}٪</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(15,23,42,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: r.color }} />
                    </div>
                  </div>
                </td>
                <td className="num fin-text py-2 font-bold">{r.value}</td>
                <td className="fin-text py-2">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export interface SimpleTableColumn<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
}

/** Generic small data table on a fin-card, used for the "latest certificates" panel and similar lists. */
export function SimpleTable<T extends { id: string }>({ title, icon, columns, rows }: { title: string; icon?: ReactNode; columns: SimpleTableColumn<T>[]; rows: T[] }) {
  return (
    <div className="fin-card p-4">
      <p className="fin-text mb-3 flex items-center gap-1.5 text-[12px] font-bold">
        {icon} {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] fin-text-muted">داده‌ای برای نمایش نیست.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted text-[10px]">
                {columns.map((c) => (
                  <th key={c.key} className="pb-2 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                  {columns.map((c) => (
                    <td key={c.key} className="fin-text py-2">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
