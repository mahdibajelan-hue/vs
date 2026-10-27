import { useId } from 'react'
import type { EstProjectDraft } from '../types'
import { computeAutoStationCounts } from '../lib/calc'
import { SAFETY, SECTION_COLOR } from '../lib/theme'

/**
 * The project drawn as its own route: land profile and/or sea, the pipe with gas flowing through
 * it, and every station the scope contains (launcher, block valves, compressor, tie-ins,
 * receiver, telecom line). It is generated from the project definition, so each card and report
 * header shows that project's real make-up rather than a stock picture.
 */
export function RouteSchematic({
  project, lengthKm, height = 120, animated = true, light = false,
}: {
  project: Pick<EstProjectDraft, 'hasOnshore' | 'hasOffshore' | 'hasCompressorStation' | 'tieInCount' | 'hasTelecomScada'>
  lengthKm?: number
  height?: number
  animated?: boolean
  light?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const W = 600, H = 120, Y = 72, X0 = 34, X1 = W - 34
  const land = project.hasOnshore, sea = project.hasOffshore
  // where the coast is when both exist: two thirds land, one third sea
  const coast = land && sea ? X0 + (X1 - X0) * 0.64 : land ? X1 + 30 : X0 - 30
  const auto = computeAutoStationCounts(lengthKm ?? 100)
  const valves = Math.min(auto.blockValve, 9)
  const valveXs = Array.from({ length: valves }, (_, i) => X0 + ((i + 1) * (X1 - X0)) / (valves + 1))
  const compX = X0 + (X1 - X0) * (sea && land ? 0.34 : 0.5)
  const ties = Math.min(project.tieInCount, 4)
  const tieXs = Array.from({ length: ties }, (_, i) => X0 + ((i + 1) * (X1 - X0)) / (ties + 1) + 18)
  const ink = light ? '#1B4B66' : '#B7C4D4'
  const faint = light ? '#CBD5E1' : 'rgba(183,196,212,0.18)'
  const hill = light ? '#E2E8F0' : 'rgba(57,135,229,0.10)'
  const water = light ? '#DCEBFA' : 'rgba(57,135,229,0.16)'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="طرح شماتیک مسیر و ایستگاه‌های پروژه" className={animated ? 'est-route is-animated' : 'est-route'} style={{ direction: 'ltr' }}>
      <defs>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SAFETY} stopOpacity={light ? 0 : 0.06} />
          <stop offset="100%" stopColor={SAFETY} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`pipe${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={SECTION_COLOR.onshore} />
          <stop offset="100%" stopColor={sea ? SECTION_COLOR.offshore : SECTION_COLOR.onshore} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={`url(#sky${uid})`} />

      {/* ground and sea */}
      {land && (
        <path d={`M0 ${Y + 6} C 70 ${Y - 26}, 120 ${Y - 4}, 170 ${Y - 18} S 270 ${Y - 30}, 330 ${Y - 6} S 420 ${Y - 22}, ${Math.min(coast, W)} ${Y + 4} L ${Math.min(coast, W)} ${H} L 0 ${H} Z`}
          fill={hill} />
      )}
      {sea && (
        <g>
          <rect x={Math.max(coast, 0)} y={Y - 2} width={W - Math.max(coast, 0)} height={H - Y + 2} fill={water} />
          {[0, 1, 2].map((i) => (
            <path key={i} className="est-wave" style={{ animationDelay: `${i * -1.3}s` }}
              d={`M${Math.max(coast, 0) + 6} ${Y + 8 + i * 12} q 10 -5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0`}
              fill="none" stroke={light ? '#93C5FD' : 'rgba(147,197,253,0.35)'} strokeWidth="1.2" />
          ))}
        </g>
      )}

      {/* telecom line above the route */}
      {project.hasTelecomScada && (
        <g>
          <line x1={X0} y1={Y - 30} x2={X1} y2={Y - 30} stroke={SECTION_COLOR.telecom} strokeOpacity="0.55" strokeDasharray="2 5" />
          {[0.18, 0.5, 0.82].map((f) => (
            <g key={f} transform={`translate(${X0 + (X1 - X0) * f} ${Y - 30})`}>
              <line x1="0" y1="0" x2="0" y2="-10" stroke={SECTION_COLOR.telecom} strokeWidth="1.4" />
              <circle cx="0" cy="-12" r="2.2" fill={SECTION_COLOR.telecom} className="est-blink" />
            </g>
          ))}
        </g>
      )}

      {/* tie-in branches */}
      {tieXs.map((x) => (
        <g key={x}>
          <path d={`M${x} ${Y} l 14 22 h 26`} fill="none" stroke={SECTION_COLOR.tieIn} strokeWidth="3" strokeLinecap="round" />
          <circle cx={x + 40} cy={Y + 22} r="3.4" fill={SECTION_COLOR.tieIn} />
        </g>
      ))}

      {/* the pipe and the flow inside it */}
      <line x1={X0} y1={Y} x2={X1} y2={Y} stroke={faint} strokeWidth="9" strokeLinecap="round" />
      <line x1={X0} y1={Y} x2={X1} y2={Y} stroke={`url(#pipe${uid})`} strokeWidth="5" strokeLinecap="round" />
      <line x1={X0} y1={Y} x2={X1} y2={Y} stroke="#fff" strokeOpacity="0.75" strokeWidth="1.6" strokeDasharray="6 18" className="est-flow" />

      {/* block valves */}
      {valveXs.map((x) => (
        <rect key={x} x={x - 4} y={Y - 4} width="8" height="8" transform={`rotate(45 ${x} ${Y})`} fill={SECTION_COLOR.blockValve} stroke={light ? '#fff' : '#0A121C'} strokeWidth="1.5" />
      ))}

      {/* compressor station */}
      {project.hasCompressorStation && (
        <g transform={`translate(${compX} ${Y})`}>
          <rect x="-17" y="-34" width="34" height="26" rx="5" fill={SECTION_COLOR.compressor} />
          <line x1="0" y1="-8" x2="0" y2="0" stroke={SECTION_COLOR.compressor} strokeWidth="3" />
          <g transform="translate(0 -21)">
            <g className="est-spin">
              {[0, 120, 240].map((a) => <path key={a} d="M0 0 C 3 -3, 3 -8, 0 -9 C -2 -6, -2 -3, 0 0" fill="#fff" transform={`rotate(${a})`} />)}
            </g>
            <circle r="1.6" fill={SECTION_COLOR.compressor} />
          </g>
        </g>
      )}

      {/* launcher and receiver at the ends */}
      <g transform={`translate(${X0} ${Y})`}>
        <circle r="9" fill={SECTION_COLOR.launcher} className="est-pulse" />
        <circle r="9" fill={SECTION_COLOR.launcher} />
        <path d="M-3 -4 L4 0 L-3 4 Z" fill="#0A121C" />
      </g>
      <g transform={`translate(${X1} ${Y})`}>
        <circle r="9" fill={SECTION_COLOR.receiver} />
        <rect x="-3.5" y="-3.5" width="7" height="7" rx="1.5" fill="#0A121C" />
      </g>

      {lengthKm != null && lengthKm > 0 && (
        <text x={(X0 + X1) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={ink} fontFamily="'Fira Code', monospace">
          {Math.round(lengthKm).toLocaleString('en-US')} km
        </text>
      )}
    </svg>
  )
}
