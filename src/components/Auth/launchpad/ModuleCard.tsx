import type { ReactNode } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleCardProps {
  number: string
  title: string
  englishTag: string
  description: string
  icon: LucideIcon
  accent: string
  /** The flagship entry — marked with an accent border, not a bigger footprint (the grid is
   * meant to stay small/uniform per the minimal-launcher brief). */
  hero?: boolean
  /** English micro-CTA shown only on the hero card (e.g. "ENTER PROJECT RADAR"). */
  cta?: string
  /** Replaces the default icon tile — used by the Radar card for its animated mini-visual. */
  visual?: ReactNode
  /** Not signed in yet: preview the module but block entry (dimmed, no hover, no click). */
  locked?: boolean
  onSelect: () => void
}

/** Shared visual/interaction shell for every Launchpad module entry point. Each module gets its
 * own named component (ProjectRadarCard, PortfolioManagementCard, ...) so new modules can be
 * added later without touching this primitive — but the elevate/glow/arrow behavior and the
 * locked-preview treatment stay identical across all of them. */
export function ModuleCard({ number, title, englishTag, description, icon: Icon, accent, hero, cta, visual, locked, onSelect }: ModuleCardProps) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={locked ? undefined : onSelect}
      className={`hub-grid-card group flex w-full flex-col rounded-xl border p-3.5 text-right ${locked ? 'pointer-events-none opacity-55 grayscale-[0.4]' : ''}`}
      style={{
        borderColor: hero ? 'color-mix(in srgb, var(--radar-green) 40%, var(--border-soft))' : 'var(--border-soft)',
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: accent }} />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.18em]" dir="ltr" style={{ color: accent }}>
          {number}
        </span>
        {visual ?? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
          >
            <Icon size={16} style={{ color: accent }} />
          </div>
        )}
      </div>

      <p className="relative z-10 mt-3 text-sm font-extrabold">{title}</p>
      <p className="eyebrow-en relative z-10 mt-0.5 text-[9px]" dir="ltr">
        {englishTag}
      </p>
      <p className="relative z-10 mt-2 line-clamp-2 flex-1 text-[11px] leading-5 text-secondary">{description}</p>

      <div className="relative z-10 mt-3 flex items-center justify-between gap-2">
        {cta && !locked ? (
          <span className="text-[10px] font-bold tracking-wide" dir="ltr" style={{ color: accent }}>
            {cta}
          </span>
        ) : (
          <span />
        )}
        {locked ? (
          <Lock size={13} className="shrink-0 text-muted" />
        ) : (
          <ArrowRight size={14} className="shrink-0 transition-transform duration-300 group-hover:translate-x-1" style={{ color: accent }} />
        )}
      </div>
    </button>
  )
}
