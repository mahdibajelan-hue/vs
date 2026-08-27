import type { ProjectRadarStatus } from './radarTypes'

const TILE_W = 60
const TILE_H = 30
const REPEATS = 3
const STRIP_W = TILE_W * REPEATS

/** A real PQRST complex — small P bump, sharp Q/R/S spike, rounded T bump — then a long flat
 * isoelectric stretch with two small trailing blips before the next beat, matching an actual
 * hospital ECG trace rather than a single symmetric blip. */
const REGULAR_PATH = 'M0 15 L10 15 L12 12 L14 15 L16 15 L18 18 L20 2 L22 19 L24 15 L28 15 L30 11 L33 15 L44 15 L46 13 L48 15 L50 15 L52 13.5 L54 15 L60 15'
/** Same PQRST shape, but compressed with an actual gap in the stroke (the `M` mid-path starts a
 * new sub-path) — reads as a literally broken, non-continuous line rather than just "faster". */
const CRITICAL_PATH = 'M0 15 L6 15 L8 13 L10 15 L12 17 L14 3 L16 18 L18 15 L22 15 M26 15 L28 12 L30 15 L60 15'

function Strip({ path, dx }: { path: string; dx: number }) {
  return (
    <g transform={`translate(${dx} 0)`}>
      {Array.from({ length: REPEATS }).map((_, i) => (
        <path
          key={i}
          d={path}
          transform={`translate(${i * TILE_W} 0)`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}

/** Project-health heartbeat monitor — color follows `STATUS_COLOR[status]`, and the rhythm itself
 * changes: a steady, regular, unbroken spike when nominal/attention/at_risk, versus a short,
 * genuinely broken (gapped) and stutter-paced line once the project is critical. */
export function HeartbeatBar({ status, color }: { status: ProjectRadarStatus; color: string }) {
  const critical = status === 'critical'
  const path = critical ? CRITICAL_PATH : REGULAR_PATH
  return (
    <div className="flex items-center gap-1.5" style={{ color }} title="Project Health Pulse">
      <svg viewBox={`0 0 ${TILE_W * 2} ${TILE_H}`} preserveAspectRatio="none" className="block h-6 w-24 sm:w-28" aria-hidden="true">
        <g className={`heartbeat-scroll ${critical ? 'is-critical' : 'is-regular'}`}>
          <Strip path={path} dx={0} />
          <Strip path={path} dx={STRIP_W} />
        </g>
      </svg>
    </div>
  )
}
