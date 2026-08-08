import { Cell, Legend, Pie, PieChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, type RiskLevel } from '../lib/riskScore'

const TOOLTIP_STYLE = {
  background: 'var(--bg-panel-solid)',
  border: '1px solid var(--border-soft)',
  borderRadius: 10,
  fontSize: 12,
}

const LEVEL_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low']

export function RiskLevelDonut({ counts }: { counts: Record<RiskLevel, number> }) {
  const total = LEVEL_ORDER.reduce((sum, l) => sum + counts[l], 0)
  const data = LEVEL_ORDER.filter((l) => counts[l] > 0).map((level) => ({ level, name: RISK_LEVEL_LABEL_FA[level], value: counts[level] }))

  if (total === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted">ریسک فعالی برای نمایش نیست</div>
  }

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
            {data.map((d) => (
              <Cell key={d.level} fill={RISK_LEVEL_COLOR[d.level]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value} ریسک`, name]} />
          <Legend
            verticalAlign="bottom"
            height={24}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
        <p className="num text-2xl font-extrabold">{total}</p>
        <p className="text-[10px] text-muted">ریسک فعال</p>
      </div>
    </div>
  )
}

export function ClosureRateGauge({ percent }: { percent: number }) {
  const data = [{ name: 'نرخ بسته‌شدن', value: percent, fill: percent >= 66 ? '#2ecc71' : percent >= 33 ? '#f1c40f' : '#e74c3c' }]
  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="70%" outerRadius="100%" barSize={14}>
          <RadialBar dataKey="value" background={{ fill: 'var(--border-soft)' }} cornerRadius={7} max={100} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="num text-2xl font-extrabold">{percent}%</p>
        <p className="text-[10px] text-muted">بسته‌شده</p>
      </div>
    </div>
  )
}
