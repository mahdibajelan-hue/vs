const DOTS = [
  { top: '28%', left: '64%', delay: 0 },
  { top: '60%', left: '36%', delay: 0.7 },
  { top: '38%', left: '42%', delay: 1.4 },
]

const SWEEP_SECONDS = 4.5

/** Compact, decorative stand-in for the full RadarDisplay — same visual language (scope +
 * rotating sweep + pulsing signals + center dot) at card-icon scale, so the flagship card reads
 * as "this is the radar" at a glance without importing the real (SVG-ring-heavy) component. */
export function RadarMiniVisual() {
  return (
    <div className="radar-scope relative h-9 w-9 shrink-0 overflow-hidden rounded-full" aria-hidden="true">
      <div
        className="radar-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        style={{ animationDuration: `${SWEEP_SECONDS}s` }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'conic-gradient(from 0deg, color-mix(in srgb, var(--radar-green) 45%, transparent), transparent 38deg, transparent 360deg)' }}
        />
      </div>

      <div className="radar-center-dot absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'var(--radar-green)' }} />

      {DOTS.map((d, i) => (
        <span
          key={i}
          className="radar-signal absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            top: d.top,
            left: d.left,
            background: 'var(--radar-green)',
            animationDelay: `${d.delay}s`,
            animationDuration: `${SWEEP_SECONDS}s`,
          }}
        />
      ))}
    </div>
  )
}
