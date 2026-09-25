import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RollupTotals } from '../lib/portfolioRollup'
import { STATUS_COLOR, STATUS_TEXT_COLOR, faNum } from './ui'

const AXIS = { fill: 'var(--text-muted)', fontSize: 10 }

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,23,42,0.96)',
    border: '1px solid rgba(148,163,184,0.25)',
    borderRadius: 10,
    fontSize: 12,
    padding: '7px 11px',
    direction: 'rtl' as const,
  },
  labelStyle: { color: '#e2e8f0', fontWeight: 700, fontSize: 12 },
  itemStyle: { color: '#cbd5e1', fontSize: 12 },
}

/**
 * The health mix as a donut, with the project count sitting in the centre.
 *
 * This is the report's one glanceable "how is the portfolio doing" shape — everything else on
 * the page is either a filter for it or a drill into one slice of it.
 */
export function HealthMixDonut({ totals }: { totals: RollupTotals }) {
  const data = useMemo(
    () => [
      { key: 'green' as const, name: 'در مسیر', value: totals.onTrack },
      { key: 'yellow' as const, name: 'در معرض ریسک', value: totals.atRisk },
      { key: 'red' as const, name: 'تأخیرکرده', value: totals.delayed },
      { key: 'black' as const, name: 'مسدود', value: totals.blocked },
    ].filter((d) => d.value > 0),
    [totals],
  )

  if (totals.projects === 0) {
    return <p className="py-10 text-center text-[12px] text-muted">پروژه‌ای در این سطح نیست</p>
  }

  return (
    <div className="relative" dir="ltr" style={{ width: '100%', height: 168 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="94%"
            paddingAngle={3}
            stroke="none"
            isAnimationActive
            animationDuration={700}
          >
            {data.map((d) => <Cell key={d.key} fill={STATUS_COLOR[d.key]} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [`${faNum(Number(v))} پروژه`, String(n)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" dir="rtl">
        <span className="plc-stat-value">{faNum(totals.projects)}</span>
        <span className="plc-stat-sub">پروژه</span>
      </div>
    </div>
  )
}

export interface ReadinessDatum {
  id: string
  name: string
  value: number
  status: 'green' | 'yellow' | 'red' | 'black'
  blocked?: boolean
}

/**
 * Readiness compared across whatever the current drill level's children are — portfolios,
 * plans, or projects. The chart's content changing shape with the breadcrumb (not just its
 * data) is what makes drilling down feel like a real report rather than a filtered list.
 */
export function ReadinessComparisonBars({ data, onSelect }: { data: ReadinessDatum[]; onSelect?: (id: string) => void }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-[12px] text-muted">داده‌ای برای مقایسه در این سطح نیست</p>
  }

  return (
    <div dir="ltr" style={{ width: '100%', height: Math.max(160, data.length * 30) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 4 }} barSize={13}>
          <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={116} tick={{ ...AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(148,163,184,0.06)' }}
            formatter={(v) => [`${faNum(Number(v))}٪`, 'آمادگی']}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            fillOpacity={0.85}
            isAnimationActive
            animationDuration={650}
            cursor={onSelect ? 'pointer' : undefined}
            onClick={(entry) => onSelect?.((entry as unknown as ReadinessDatum).id)}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.blocked ? '#64748b' : STATUS_TEXT_COLOR[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
