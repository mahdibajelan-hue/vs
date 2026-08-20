import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DomainScore } from '../types'

interface CompetencyRadarChartProps {
  domainScores: DomainScore[]
}

/** Radar/spider chart of the 7 domain scores (0-100 each) — every axis value is the real average of that domain's answered questions; an unanswered domain plots as 0, never a guessed midpoint. */
export function CompetencyRadarChart({ domainScores }: CompetencyRadarChartProps) {
  const data = domainScores.map((d) => ({
    domain: d.domain.shortTitle,
    امتیاز: d.percentScore ?? 0,
    fullMark: 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="rgba(255,255,255,0.12)" />
        <PolarAngleAxis dataKey="domain" tick={{ fill: '#c9d2e3', fontSize: 12 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#7d8aa3', fontSize: 9 }} tickCount={6} />
        <Radar name="امتیاز" dataKey="امتیاز" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.35} />
        <Tooltip
          contentStyle={{ background: 'rgba(10,14,20,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: '#e5e9f0' }}
          formatter={(value) => [`${Number(value)}٪`, 'امتیاز']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
