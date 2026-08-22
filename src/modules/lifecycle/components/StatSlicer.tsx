import type { ReactNode } from 'react'
import type { HealthStatus } from '../types'
import { STATUS_TEXT_COLOR } from './ui'

/**
 * A stat card that doubles as a filter control — the thing that actually makes a dashboard read
 * as "dynamic" the way a Power BI report does. A report full of numbers is static; a report where
 * clicking a number re-scopes everything below it is live.
 *
 * `tone` accepts either a HealthStatus (routed through STATUS_TEXT_COLOR, so the number stays
 * legible on the dark surface) or a raw hex for metrics that aren't a health colour. It colours
 * the number itself — pass it unconditionally for a card whose whole identity IS a status (the
 * four health-mix cards), or conditioned on the count for a "problem" card (red once something is
 * actually wrong, green/omitted when clear). `active` is a separate concern: it only drives the
 * selected-slicer border and background, never the value colour, so a card doesn't change what it
 * is reporting just because the user clicked it.
 */
export function StatSlicer({
  icon, label, value, sub, tone, active, onClick, disabled,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  sub?: string
  tone?: HealthStatus | string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const resolvedTone = tone ? (STATUS_TEXT_COLOR as Record<string, string>)[tone] ?? tone : '#38bdf8'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      data-active={active ? 'true' : 'false'}
      className="plc-tile plc-slicer flex w-full flex-col items-start gap-2 text-right disabled:cursor-default"
      style={{ '--plc-slicer-tone': resolvedTone, padding: '14px 16px' } as React.CSSProperties}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="plc-stat-label line-clamp-2">{label}</span>
        <span className="mt-0.5 shrink-0 opacity-80" style={{ color: resolvedTone }}>{icon}</span>
      </span>
      <span key={String(value)} className="plc-stat-value plc-value-in" style={tone ? { color: resolvedTone } : undefined}>
        {value}
      </span>
      {sub && <span className="plc-stat-sub">{sub}</span>}
    </button>
  )
}
