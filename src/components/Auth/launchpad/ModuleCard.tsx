import type { MouseEvent, ReactNode } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ModuleCardProps {
  number: string
  title: string
  englishTag: string
  description: string
  icon: LucideIcon
  accent: string
  /** The flagship entry — Project Radar. Same footprint as every other card (all six sit in one
   * equal-size grid), but filled with a vivid accent wash + glow instead of the neutral dark
   * background, so it reads as the centerpiece by color, not by size. */
  hero?: boolean
  /** English micro-CTA shown only on the hero card (e.g. "ENTER PROJECT RADAR"). */
  cta?: string
  /** Replaces the default icon tile — used by the Radar card for its animated mini-visual. */
  visual?: ReactNode
  /** Not signed in yet: preview the module but block entry (dimmed, no hover, no click). */
  locked?: boolean
  onSelect: () => void
}

/** Cursor-follow spotlight — a soft accent-tinted glow that tracks the pointer under
 * `.hub-grid-card::before` (see index.css). Plain imperative style writes on the DOM node so
 * mousemove never triggers a React re-render. */
function trackSpotlight(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`)
  e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`)
}

/** Shared visual/interaction shell for every Launchpad module entry point. Each module gets its
 * own named component (ProjectRadarCard, PortfolioManagementCard, ...) so new modules can be
 * added later without touching this primitive — but the elevate/glow/spotlight/arrow behavior and
 * the locked-preview treatment stay identical across all of them. */
export function ModuleCard({ number, title, englishTag, description, icon: Icon, accent, hero, cta, visual, locked, onSelect }: ModuleCardProps) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={locked ? undefined : onSelect}
      onMouseMove={locked ? undefined : trackSpotlight}
      className={`hub-grid-card group flex h-full w-full flex-col rounded-2xl border p-3.5 text-right ${
        locked ? 'pointer-events-none opacity-55 grayscale-[0.4]' : ''
      }`}
      style={{
        background: hero
          ? `linear-gradient(160deg, color-mix(in srgb, ${accent} 40%, var(--bg-panel-solid)), color-mix(in srgb, ${accent} 12%, var(--bg-panel-solid)))`
          : undefined,
        borderColor: hero ? accent : 'var(--border-soft)',
        boxShadow: hero ? `0 0 56px color-mix(in srgb, ${accent} 55%, transparent)` : undefined,
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': accent,
      }}
    >
      {!hero && <div className="hub-grid-card-glow" style={{ background: accent }} />}

      <div className="relative z-10 flex items-start justify-between gap-2">
        <span
          className="font-mono text-[10px] font-bold tracking-[0.18em]"
          dir="ltr"
          style={{ color: hero ? '#031008' : accent, opacity: hero ? 0.75 : 1 }}
        >
          {number}
        </span>
        {visual ?? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110"
            style={
              hero
                ? { background: accent, borderColor: accent }
                : { background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }
            }
          >
            <Icon size={16} style={{ color: hero ? '#031008' : accent }} />
          </div>
        )}
      </div>

      <p className="relative z-10 mt-3 text-sm font-extrabold" style={{ color: hero ? '#031008' : undefined }}>
        {title}
      </p>
      <p className="eyebrow-en relative z-10 mt-0.5 text-[9px]" dir="ltr" style={{ color: hero ? 'color-mix(in srgb, #031008 70%, transparent)' : undefined }}>
        {englishTag}
      </p>
      <p
        className="relative z-10 mt-2 line-clamp-2 flex-1 text-[11px] leading-5"
        style={{ color: hero ? 'color-mix(in srgb, #031008 85%, transparent)' : 'var(--text-secondary)' }}
      >
        {description}
      </p>

      <div className="relative z-10 mt-3 flex items-center justify-between gap-2">
        {cta && !locked ? (
          <span className="text-[10px] font-bold tracking-wide" dir="ltr" style={{ color: hero ? '#031008' : accent }}>
            {cta}
          </span>
        ) : (
          <span />
        )}
        {locked ? (
          <Lock size={13} className="shrink-0 text-muted" />
        ) : (
          <ArrowRight
            size={14}
            className="shrink-0 transition-transform duration-300 group-hover:translate-x-1"
            style={{ color: hero ? '#031008' : accent }}
          />
        )}
      </div>
    </button>
  )
}
