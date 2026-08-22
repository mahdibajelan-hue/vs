import type { ReactNode } from 'react'
import type { HealthStatus } from '../types'
import { STATUS_COLOR } from './ui'

/**
 * A bento tile.
 *
 * `span` is the whole point: the Control Tower's old layout gave every fact an
 * identically sized card, so a blocked gate and a milestone count looked equally
 * urgent. Here size carries importance, and the caller is forced to decide how
 * much of the twelve columns a thing deserves.
 */
export function TowerTile({
  children, span = 4, title, eyebrow, icon, action, variant = 'base', edge, className = '', delay = 0,
}: {
  children: ReactNode
  /** Columns out of 12 on desktop; every tile collapses to full width under 1024px. */
  span?: number
  title?: string
  eyebrow?: string
  /** A small glyph next to the title — a visual index of what kind of tile this is (gates,
   * schedule, people) so a page of many tiles reads as varied sections, not one grey wall. */
  icon?: ReactNode
  action?: ReactNode
  variant?: 'base' | 'raised' | 'verdict'
  /** Status hairline down the leading edge — use only where status is the point. */
  edge?: HealthStatus
  className?: string
  delay?: number
}) {
  const variantClass =
    variant === 'verdict' ? 'plc-tile-verdict' : variant === 'raised' ? 'plc-tile-raised' : ''

  return (
    <section
      className={`plc-tile ${variantClass} ${edge ? 'plc-tile-edge' : ''} plc-rise ${className}`}
      style={{
        gridColumn: `span ${span}`,
        animationDelay: `${delay}ms`,
        ...(edge ? ({ '--plc-edge': STATUS_COLOR[edge] } as React.CSSProperties) : {}),
      }}
    >
      {(title || eyebrow || action) && (
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {icon && (
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(56,189,248,0.10)', color: '#7dd3fc' }}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && <p className="plc-eyebrow mb-1" dir="ltr">{eyebrow}</p>}
              {title && <h2 className="plc-tile-title truncate">{title}</h2>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
