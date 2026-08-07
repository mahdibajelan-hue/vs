import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SCurvePoint } from '../../lib/progress'
import { formatJalali } from '../../lib/jalali'

export function SCurveChart({ data }: { data: SCurvePoint[] }) {
  if (data.length === 0) {
    return <EmptyState />
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="date" tickFormatter={formatJalali} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} unit="%" />
        <Tooltip
          labelFormatter={(label) => (typeof label === 'string' ? formatJalali(label) : label)}
          contentStyle={{
            background: 'var(--bg-panel-solid)',
            border: '1px solid var(--border-soft)',
            borderRadius: 10,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="actualPercent" name="واقعی" stroke="#38bdf8" fill="url(#actualFill)" strokeWidth={2.5} />
        <Line type="monotone" dataKey="plannedPercent" name="برنامه‌ای" stroke="#f1c40f" strokeWidth={2.5} strokeDasharray="5 4" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function EmptyState() {
  return <div className="flex h-full items-center justify-center text-sm text-muted">داده‌ای برای نمایش نمودار موجود نیست</div>
}
