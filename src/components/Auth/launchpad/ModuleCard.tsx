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
  /** The flagship entry — Project Radar. Rendered noticeably bigger and centered above the
   * regular grid by ModuleLaunchpad, not just accent-bordered like the others. */
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
      className={`hub-grid-card group flex w-full flex-col rounded-2xl border text-right ${hero ? 'p-8' : 'p-3.5'} ${
        locked ? 'pointer-events-none opacity-55 grayscale-[0.4]' : ''
      }`}
      style={{
        borderColor: hero ? 'color-mix(in srgb, var(--radar-green) 45%, var(--border-soft))' : 'var(--border-soft)',
        boxShadow: hero ? '0 0 40px color-mix(in srgb, var(--radar-green) 10%, transparent)' : undefined,
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: accent }} />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <span className={`font-mono font-bold tracking-[0.18em] ${hero ? 'text-xs' : 'text-[10px]'}`} dir="ltr" style={{ color: accent }}>
          {number}
        </span>
        {visual ?? (
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110 ${hero ? 'h-16 w-16' : 'h-9 w-9'}`}
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
          >
            <Icon size={hero ? 28 : 16} style={{ color: accent }} />
          </div>
        )}
      </div>

      <p className={`relative z-10 font-extrabold ${hero ? 'mt-5 text-2xl' : 'mt-3 text-sm'}`}>{title}</p>
      <p className={`eyebrow-en relative z-10 ${hero ? 'mt-1 text-[11px]' : 'mt-0.5 text-[9px]'}`} dir="ltr">
        {englishTag}
      </p>
      <p className={`relative z-10 flex-1 text-secondary ${hero ? 'mt-3 text-[13px] leading-6' : 'mt-2 line-clamp-2 text-[11px] leading-5'}`}>{description}</p>

      <div className={`relative z-10 flex items-center justify-between gap-2 ${hero ? 'mt-6' : 'mt-3'}`}>
        {cta && !locked ? (
          <span className="font-bold tracking-wide text-[10px]" dir="ltr" style={{ color: accent }}>
            {cta}
          </span>
        ) : (
          <span />
        )}
        {locked ? (
          <Lock size={hero ? 16 : 13} className="shrink-0 text-muted" />
        ) : (
          <ArrowRight size={hero ? 18 : 14} className="shrink-0 transition-transform duration-300 group-hover:translate-x-1" style={{ color: accent }} />
        )}
      </div>
    </button>
  )
}
