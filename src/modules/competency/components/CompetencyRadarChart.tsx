import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DomainScore } from '../types'

interface CompetencyRadarChartProps {
  domainScores: DomainScore[]
  /** Same-length, same-order array — the average percentScore of this candidate's peers (same job
   * role) per domain, drawn as a second dashed/unfilled overlay so a lead can see at a glance which
   * axes this candidate clears or falls short of the field. Omit when there are no peers yet. */
  benchmarkScores?: DomainScore[]
  benchmarkLabel?: string
}

// Matches COMPETENCY_ACCENT in CompetencyApp.tsx (Tailwind purple-500) — duplicated as a literal
// rather than imported to avoid a circular import back through CompetencyApp -> ... -> this file.
const ACCENT = '#a855f7'
const BENCHMARK_COLOR = '#94a3b8'

/** Radar/spider chart of the weighted domain scores (0-100 each) — every axis value is the real average of that domain's answered questions; an unanswered domain plots as 0, never a guessed midpoint. */
export function CompetencyRadarChart({ domainScores, benchmarkScores, benchmarkLabel = 'میانگین سایر متقاضیان' }: CompetencyRadarChartProps) {
  const data = domainScores.map((d, i) => ({
    domain: d.domain.shortTitle,
    امتیاز: d.percentScore ?? 0,
    ...(benchmarkScores ? { میانگین: benchmarkScores[i]?.percentScore ?? 0 } : {}),
    fullMark: 100,
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={benchmarkScores ? 300 : 320}>
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
          {benchmarkScores && (
            <Radar name={benchmarkLabel} dataKey="میانگین" stroke={BENCHMARK_COLOR} strokeDasharray="4 3" fill="none" strokeWidth={1.5} dot={{ r: 2, fill: BENCHMARK_COLOR, strokeWidth: 0 }} />
          )}
          <Radar name="امتیاز متقاضی" dataKey="امتیاز" stroke={ACCENT} fill="url(#competencyRadarFill)" strokeWidth={2} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} />
          <Tooltip
            contentStyle={{ background: 'rgba(20,10,32,0.94)', border: `1px solid ${ACCENT}55`, borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: '#e5e9f0' }}
            formatter={(value, name) => [`${Number(value)}٪`, name]}
          />
        </RadarChart>
      </ResponsiveContainer>
      {benchmarkScores && (
        <div className="flex items-center justify-center gap-4 text-[10.5px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: ACCENT }} /> امتیاز متقاضی
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border border-dashed" style={{ borderColor: BENCHMARK_COLOR }} /> {benchmarkLabel}
          </span>
        </div>
      )}
    </div>
  )
}
