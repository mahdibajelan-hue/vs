import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts'
import type { ReactNode } from 'react'

/** Power-BI-like categorical palette, tuned to stay readable on the dark and the light surface. */
export const PB = { teal: '#01b8aa', blue: '#4f8ef7', coral: '#fd625e', yellow: '#f2c80f', violet: '#a66999', sky: '#8ad4eb', orange: '#fe9666', slate: '#6b7c93', green: '#2ecc8f' }
export const PB_SERIES = [PB.teal, PB.blue, PB.yellow, PB.coral, PB.violet, PB.orange, PB.sky, PB.slate]

export const axisProps = { tick: { fontSize: 10.5, fill: 'var(--im-muted)' }, axisLine: { stroke: 'var(--im-line)' }, tickLine: false as const }
export const gridProps = { stroke: 'var(--im-line)', strokeDasharray: '2 5', vertical: false as const }

/** Tooltip card used by every chart of the module. */
export function ChartTip({ active, payload, label, fmt, unit }: { active?: boolean; payload?: { name?: string; value?: number | string | null; color?: string; dataKey?: string }[]; label?: string | number; fmt?: (v: number) => string; unit?: string }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && p.value !== '')
  if (!rows.length) return null
  return (
    <div className="fn-tip">
      {label != null && <b>{label}</b>}
      {rows.map((p) => <div key={String(p.dataKey ?? p.name)}><i style={{ background: p.color }} />{p.name}<span>{typeof p.value === 'number' ? (fmt ? fmt(p.value) : p.value.toLocaleString('fa-IR', { maximumFractionDigits: 1 })) : p.value}{unit ? ` ${unit}` : ''}</span></div>)}
    </div>
  )
}

/** Tiny area sparkline for KPI cards. */
export function Spark({ data, color = PB.teal, h = 38 }: { data: number[]; color?: string; h?: number }) {
  if (data.length < 2) return null
  const id = `sp${color.replace('#', '')}${data.length}`
  const d = data.map((v, i) => ({ i, v }))
  return (
    <div className="fn-spark" style={{ height: h }} aria-hidden dir="ltr">
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={d} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart></ResponsiveContainer>
    </div>
  )
}

/** Donut with a number in the middle and a legend that carries values — the part shares are read from, not the arcs. */
export function Donut({ data, center, fmt, h = 190 }: { data: { name: string; value: number; color: string }[]; center?: { v: ReactNode; l: string }; fmt: (v: number) => string; h?: number }) {
  const total = data.reduce((n, d) => n + Math.max(0, d.value), 0)
  return (
    <div className="fn-donut">
      <div style={{ height: h, position: 'relative' }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} isAnimationActive>
            {data.filter((d) => d.value > 0).map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={<ChartTip fmt={fmt} />} />
        </PieChart></ResponsiveContainer>
        {center && <div className="fn-donut-c"><b>{center.v}</b><span>{center.l}</span></div>}
      </div>
      <ul className="fn-legend-list">{data.map((d) => <li key={d.name}><i style={{ background: d.color }} /><span>{d.name}</span><b>{fmt(d.value)}</b><em>{total ? `${Math.round((Math.max(0, d.value) / total) * 100).toLocaleString('fa-IR')}٪` : '—'}</em></li>)}</ul>
    </div>
  )
}

export interface WfStep { label: string; value: number; kind: 'total' | 'delta'; color?: string }
/** Waterfall: totals stand on the axis, deltas float from the running level (negative = spending). Range bars, so levels below zero are drawn below zero. */
export function Waterfall({ steps, fmt, h = 240 }: { steps: WfStep[]; fmt: (v: number) => string; h?: number }) {
  let level = 0
  const rows = steps.map((s) => {
    if (s.kind === 'total') { level = s.value; return { name: s.label, range: [Math.min(0, s.value), Math.max(0, s.value)] as [number, number], raw: s.value, color: s.value < 0 ? PB.coral : s.color ?? PB.blue } }
    const from = level; level += s.value
    return { name: s.label, range: [Math.min(from, level), Math.max(from, level)] as [number, number], raw: s.value, color: s.value < 0 ? s.color ?? PB.coral : s.color ?? PB.teal }
  })
  return (
    <div style={{ height: h }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 18, right: 8, left: 4, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval={0} /><YAxis {...axisProps} width={46} tickFormatter={(v: number) => fmt(v)} />
        <ReferenceLine y={0} stroke="var(--im-line-2)" />
        <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--im-text) 5%, transparent)' }} content={({ active, payload }) => (active && payload?.length ? <div className="fn-tip"><b>{(payload[0].payload as { name: string }).name}</b><div>{fmt((payload[0].payload as { raw: number }).raw)}</div></div> : null)} />
        <Bar dataKey="range" radius={[5, 5, 5, 5]}>{rows.map((r) => <Cell key={r.name} fill={r.color} />)}<LabelList dataKey="raw" position="top" formatter={(v) => fmt(Number(v))} style={{ fontSize: 10.5, fill: 'var(--im-muted-2)', fontWeight: 700 }} /></Bar>
      </BarChart>
    </ResponsiveContainer></div>
  )
}

/** Circular progress with a value in the middle (physical vs financial progress, coverage…). */
export function Ring({ pct, color = PB.teal, label, size = 112 }: { pct: number | null; color?: string; label: string; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0))
  return (
    <div className="fn-ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pct == null ? 'نامشخص' : Math.round(v)}٪`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--im-panel-3)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .8s var(--im-ease)' }} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: size / 4.2, fontWeight: 800, fill: 'var(--im-text)', fontVariantNumeric: 'tabular-nums' }}>{pct == null ? '—' : `${Math.round(v).toLocaleString('fa-IR')}٪`}</text>
      </svg>
      <span>{label}</span>
    </div>
  )
}

/** Horizontal bars with the value at the end — for rankings and aging buckets. */
export function HBars({ data, fmt, h }: { data: { name: string; value: number; color?: string }[]; fmt: (v: number) => string; h?: number }) {
  return (
    <div style={{ height: h ?? Math.max(120, data.length * 38 + 20) }} dir="ltr"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }} barCategoryGap="28%">
        <XAxis type="number" hide /><YAxis type="category" dataKey="name" {...axisProps} width={96} tick={{ fontSize: 11, fill: 'var(--im-muted-2)' }} />
        <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--im-text) 5%, transparent)' }} content={<ChartTip fmt={fmt} />} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive>{data.map((d, i) => <Cell key={d.name} fill={d.color ?? PB_SERIES[i % PB_SERIES.length]} />)}<LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 11, fill: 'var(--im-text)', fontWeight: 700 }} /></Bar>
      </BarChart>
    </ResponsiveContainer></div>
  )
}

/** Chart panel: title, optional right-side control and the chart — one frame for every visual. */
export function Tile({ title, hint, action, children, span }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; span?: 2 | 3 }) {
  return (
    <section className={`fn-tile${span ? ` s${span}` : ''}`}>
      <header><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>{action}</header>
      {children}
    </section>
  )
}
