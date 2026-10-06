import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleCardProps {
  number: string
  title: string
  englishTag: string
  description: string
  icon: LucideIcon
  accent: string
  /** The flagship entry — Project Radar. It owns the big tile of the bento grid and carries the live mini-radar. */
  hero?: boolean
  /** English micro-CTA shown only on the hero card (e.g. "ENTER PROJECT RADAR"). */
  cta?: string
  /** Replaces the default icon chip — used by the Radar card for its animated mini-visual. */
  visual?: ReactNode
  /** Not signed in yet: preview the module but block entry (dimmed, no hover, no click). */
  locked?: boolean
  onSelect: () => void
}

/** Cursor-follow spotlight — plain imperative style writes so mousemove never re-renders React. */
function trackSpotlight(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`)
  e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`)
}

/**
 * One tile of the launchpad's bento grid (see `.launchpad-bento` in index.css). Every module owns a
 * colour: the tile is washed with it, carries a rail on its leading edge, an oversized tilted icon
 * as a watermark, and a glow on hover — so the grid reads as seven distinct instruments instead of
 * seven identical dark boxes. Sizes come from the grid area the tile sits in (Radar: 2×2, Competency
 * and Missions: 2×1, the rest: 1×1); on a phone everything collapses to a compact two-column grid
 * where only the Radar tile keeps its description.
 */
export function ModuleCard({ number, title, englishTag, description, icon: Icon, accent, hero, cta, visual, locked, onSelect }: ModuleCardProps) {
  // Before sign-in: only the bare icon shows — the full tile appears once the user is authenticated.
  if (locked) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3" title={title}>
        {visual ?? (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
            <Icon size={26} style={{ color: accent }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseMove={trackSpotlight}
      className={`lp-tile group ${hero ? 'is-hero' : ''}`}
      style={{ '--a': accent } as CSSProperties}
    >
      <Icon className="lp-tile-mark" size={hero ? 150 : 92} strokeWidth={1.25} aria-hidden />
      <span className="lp-tile-head">
        {visual ?? (
          <span className="lp-tile-chip">
            <Icon size={18} />
          </span>
        )}
        <span className="lp-tile-no" dir="ltr">{number}</span>
      </span>
      <span className="lp-tile-body">
        <span className="lp-tile-title">{title}</span>
        <span className="lp-tile-en" dir="ltr">{englishTag}</span>
        <span className="lp-tile-desc">{description}</span>
      </span>
      <span className="lp-tile-foot">
        {cta ? <span className="lp-tile-cta" dir="ltr">{cta}</span> : <span />}
        <ArrowLeft size={16} className="lp-tile-arrow" />
      </span>
    </button>
  )
}

