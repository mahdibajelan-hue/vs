import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleCardProps {
  number: string
  title: string
  englishTag: string
  description: string
  icon: LucideIcon
  accent: string
  /** The flagship entry — slightly larger, carries the CTA line, visually the primary module. */
  hero?: boolean
  /** English micro-CTA shown only on the hero card (e.g. "ENTER PROJECT RADAR"). */
  cta?: string
  /** Replaces the default icon tile — used by the Radar card for its animated mini-visual. */
  visual?: ReactNode
  onSelect: () => void
}

/** Shared visual/interaction shell for every Launchpad module entry point. Each module gets its
 * own named component (ProjectRadarCard, PortfolioManagementCard, ...) so new modules can be
 * added later without touching this primitive — but the elevate/glow/arrow behavior stays
 * identical across all of them. */
export function ModuleCard({ number, title, englishTag, description, icon: Icon, accent, hero, cta, visual, onSelect }: ModuleCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`hub-grid-card group flex w-full flex-col rounded-2xl border text-right ${hero ? 'p-7' : 'p-6'}`}
      style={{
        borderColor: hero ? 'color-mix(in srgb, var(--radar-green) 40%, var(--border-soft))' : 'var(--border-soft)',
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: accent }} />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-bold tracking-[0.2em]" dir="ltr" style={{ color: accent }}>
          {number}
        </span>
        {visual ?? (
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${hero ? 'h-14 w-14' : 'h-11 w-11'}`}
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
          >
            <Icon size={hero ? 24 : 19} style={{ color: accent }} />
          </div>
        )}
      </div>

      <p className={`relative z-10 mt-5 font-extrabold ${hero ? 'text-xl' : 'text-lg'}`}>{title}</p>
      <p className="eyebrow-en relative z-10 mt-1" dir="ltr">
        {englishTag}
      </p>
      <p className="relative z-10 mt-3 flex-1 text-[12.5px] leading-6 text-secondary">{description}</p>

      <div className="relative z-10 mt-5 flex items-center justify-between gap-2">
        {cta ? (
          <span className="text-[11px] font-bold tracking-wide" dir="ltr" style={{ color: accent }}>
            {cta}
          </span>
        ) : (
          <span />
        )}
        <ArrowRight size={16} className="shrink-0 transition-transform duration-300 group-hover:translate-x-1" style={{ color: accent }} />
      </div>
    </button>
  )
}
