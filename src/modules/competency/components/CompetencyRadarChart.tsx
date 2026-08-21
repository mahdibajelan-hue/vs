import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DomainScore } from '../types'

interface CompetencyRadarChartProps {
  domainScores: DomainScore[]
}

// Matches COMPETENCY_ACCENT in CompetencyApp.tsx (Tailwind purple-500) — duplicated as a literal
// rather than imported to avoid a circular import back through CompetencyApp -> ... -> this file.
const ACCENT = '#a855f7'

/** Radar/spider chart of the 8 weighted domain scores (0-100 each) — every axis value is the real average of that domain's answered questions; an unanswered domain plots as 0, never a guessed midpoint. */
export function CompetencyRadarChart({ domainScores }: CompetencyRadarChartProps) {
  const data = domainScores.map((d) => ({
    domain: d.domain.shortTitle,
    امتیاز: d.percentScore ?? 0,
    fullMark: 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="75%">
        <defs>
          <radialGradient id="competencyRadarFill">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.55} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.12} />
          </radialGradient>
        </defs>
        <PolarGrid stroke="rgba(168,85,247,0.18)" />
        <PolarAngleAxis dataKey="domain" tick={{ fill: '#d9c9fb', fontSize: 12 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#8a7fa8', fontSize: 9 }} tickCount={6} />
        <Radar name="امتیاز" dataKey="امتیاز" stroke={ACCENT} fill="url(#competencyRadarFill)" strokeWidth={2} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} />
        <Tooltip
          contentStyle={{ background: 'rgba(20,10,32,0.94)', border: `1px solid ${ACCENT}55`, borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: '#e5e9f0' }}
          formatter={(value) => [`${Number(value)}٪`, 'امتیاز']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
