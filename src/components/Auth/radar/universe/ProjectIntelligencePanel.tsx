import { ArrowUpRight, GitBranch, Lightbulb, Sparkles, TrendingUp, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { INSIGHT_KIND_COLOR, INSIGHT_KIND_LABEL, type InsightKind, type ProjectIntelligenceInsight } from './universeTypes'

const INSIGHT_ICON: Record<InsightKind, LucideIcon> = {
  emerging_risk: ArrowUpRight,
  velocity: Zap,
  conversion: TrendingUp,
  impact: Sparkles,
  relationship: GitBranch,
  recommendation: Lightbulb,
}

/** The AI layer over Risk Universe / Issue Shockwave / Event Stream: a short, scannable list of
 * what the (mock, rule-based) analysis found — never a wall of text, matching the brief's own
 * "minimal, data-driven" direction rather than a generic chatbot-style writeup. */
export function ProjectIntelligencePanel({ insights }: { insights: ProjectIntelligenceInsight[] }) {
  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles size={14} style={{ color: 'var(--radar-cyan)' }} />
        <h3 className="text-[11px] font-bold tracking-wide text-muted">PROJECT INTELLIGENCE</h3>
      </div>
      <ul className="space-y-2">
        {insights.map((insight) => {
          const Icon = INSIGHT_ICON[insight.kind]
          const color = INSIGHT_KIND_COLOR[insight.kind]
          return (
            <li key={insight.id} className="flex items-start gap-2.5 rounded-xl px-1.5 py-1.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
                <Icon size={13} style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color }}>{INSIGHT_KIND_LABEL[insight.kind]}</span>
                <p className="mt-0.5 text-[11.5px] leading-5 text-secondary">{insight.text}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
