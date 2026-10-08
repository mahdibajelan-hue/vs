import { tone } from '../lib/tone'

/**
 * Hand-rolled SVG donut/ring charts — zero new dependency (no chart library), matching the
 * ui-ux-pro-max chart guidance for part-to-whole data: max ~6 labeled slices, largest slice first
 * (placed at 12 o'clock), every value always printed as text next to its color (never color alone),
 * and a text-only fallback list underneath for screen readers / small screens. Colors read from the
 * FARIN token system (`tone()` / `--fx-*`) so both themes stay correct automatically — see
 * farinTheme.css.
 */

const R = 42
const CIRCUMFERENCE = 2 * Math.PI * R

/** A single 0-100 value as a ring — e.g. an overall score, a Big Five trait, a role-fit percentage.
 * Center content is passed in so callers can show a number, an icon, or both. */
export function RingChart({
  value,
  color,
  size = 96,
  strokeWidth = 10,
  children,
  label,
  className = '',
}: {
  value: number | null
  color: string
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
  label: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const offset = CIRCUMFERENCE * (1 - pct / 100)
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, ...tone(color) }}
      role="img"
      aria-label={`${label}: ${value != null ? Math.round(value).toLocaleString('fa-IR') : '—'} از ۱۰۰`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--fx-track)" strokeWidth={strokeWidth} />
        {value != null && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  )
}

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

/** A multi-slice donut for part-to-whole breakdowns (e.g. MCQ answers by category/difficulty). Caps
 * at `maxSlices` (default 6, per chart-domain guidance) — beyond that the smallest slices merge into
 * a "سایر" bucket rather than rendering an unreadable wheel. Slices are sorted largest-first and the
 * largest starts at 12 o'clock. Always paired with a text legend (value is never color-only). */
export function DonutChart({
  slices,
  size = 140,
  strokeWidth = 20,
  centerLabel,
  centerValue,
  maxSlices = 6,
}: {
  slices: DonutSlice[]
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerValue?: string
  maxSlices?: number
}) {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  const shown = sorted.slice(0, maxSlices)
  const rest = sorted.slice(maxSlices)
  const restTotal = rest.reduce((sum, s) => sum + s.value, 0)
  const final: DonutSlice[] = restTotal > 0 ? [...shown, { key: '__other__', label: 'سایر', value: restTotal, color: 'var(--fx-chart-muted)' }] : shown
  const total = final.reduce((sum, s) => sum + s.value, 0)

  let cursor = 0
  const arcs = final.map((s) => {
    const fraction = total > 0 ? s.value / total : 0
    const dash = fraction * CIRCUMFERENCE
    const offset = -cursor * CIRCUMFERENCE
    cursor += fraction
    return { ...s, dash, offset, fraction }
  })

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${centerLabel ?? 'نمودار'}: ${final.map((s) => `${s.label} ${Math.round((s.value / (total || 1)) * 100)}٪`).join('، ')}`}
      >
        <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--fx-track)" strokeWidth={strokeWidth} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${a.dash} ${CIRCUMFERENCE - a.dash}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </svg>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <span className="num text-lg font-black leading-none" style={{ color: 'var(--text-primary)' }}>{centerValue}</span>}
            {centerLabel && <span className="fx-muted mt-0.5 text-[9.5px]">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="fx-text-2 min-w-0 flex-1 truncate">{a.label}</span>
            <span className="num shrink-0 font-bold" style={{ color: 'var(--text-primary)' }}>
              {Math.round((a.value / (total || 1)) * 100).toLocaleString('fa-IR')}٪
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
