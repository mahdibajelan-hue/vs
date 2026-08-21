import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeldsBySize } from '../../lib/progress'

const PALETTE = ['#38bdf8', '#2ecc71', '#f1c40f', '#a78bfa', '#fb923c', '#f472b6', '#34d399', '#60a5fa']

export function WeldsBySizeChart({ data }: { data: WeldsBySize[] }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">داده‌ای موجود نیست</div>
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="size" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          contentStyle={{
            background: 'var(--bg-panel-solid)',
            border: '1px solid var(--border-soft)',
            borderRadius: 10,
            fontSize: 12,
          }}
          formatter={(v) => [`${v} سرجوش`, '']}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={46}>
          {data.map((entry, i) => (
            <Cell key={entry.size} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
