import { useMemo, useState } from 'react'
import { MissionOriginChip } from '../../../modules/missions/integration/originChip'
import { AlertTriangle, CircleAlert, Clock, FileText, Flag, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SEVERITY_COLOR, SEVERITY_LABEL_FA, SIGNAL_CATEGORY_LABEL_FA,
  type RadarSignal, type SignalCategory, type SignalSeverity,
} from './radarTypes'

const SWEEP_SECONDS = 8
const LEGEND_SEVERITIES: SignalSeverity[] = ['critical', 'high', 'medium', 'low']

const CATEGORY_ICON: Record<SignalCategory, LucideIcon> = {
  risk: AlertTriangle,
  issue: CircleAlert,
  delay: Clock,
  change: RefreshCw,
  milestone: Flag,
  contract: FileText,
  gate: ShieldCheck,
}

/** 12 concentric rings instead of the old 4: the outermost is green, the one right beneath it is
 * blue-green — the two sit almost touching rather than spread across the field, and their colors
 * are blended toward each other instead of a stark green/blue contrast — while the remaining 10
 * are thin, faint grid lines filling the rest of the radius down toward the center. */
const OUTER_RING = 1
const SECOND_RING = 0.92
const GRID_RING_COUNT = 10
const GRID_RING_MIN = 0.08
const RINGS = [
  OUTER_RING,
  SECOND_RING,
  ...Array.from({ length: GRID_RING_COUNT }, (_, i) => {
    const t = (i + 1) / GRID_RING_COUNT
    return SECOND_RING - t * (SECOND_RING - GRID_RING_MIN)
  }),
]
/** The second ring reads as "blue" but is mixed most of the way toward the outer ring's green so
 * the pair feels like one close family of hues rather than two contrasting colors. */
/** A true, natural green (not the app-wide neon mint `--radar-green`, which reads too aqua/cyan
 * for this specific console-screen look) plus a clearly distinct blue for the second ring —
 * scoped to this component only, matching the reference radar screenshot's own palette. */
const RADAR_RING_GREEN = '#2ecc71'
const RADAR_RING_GREEN_BRIGHT = '#8ff5b3'
const RADAR_RING_BLUE = '#38bdf8'
/** Uneven, patchy visibility across the faint grid rings — a few soft sectors dim out and back in
 * — so the grid reads like a real radar console's phosphor persistence instead of a mechanically
 * perfect stack of identical circles. */
const RADAR_GRID_FADE_MASK = `conic-gradient(from 0deg,
  white 0deg, white 55deg,
  rgba(255,255,255,0.22) 68deg, rgba(255,255,255,0.22) 78deg,
  white 90deg, white 195deg,
  rgba(255,255,255,0.28) 208deg, rgba(255,255,255,0.28) 224deg,
  white 236deg, white 292deg,
  rgba(255,255,255,0.18) 303deg, rgba(255,255,255,0.18) 317deg,
  white 330deg, white 360deg)`
const DEGREE_MARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

/** One wedge of the scope when it is read by domain: [from, to) in compass degrees. */
export interface RadarSector { key: string; label: string; count: number; from: number; to: number }
/** The severity bands, outer edge first — where the band labels sit (see SEVERITY_RADIUS_RANGE). */
const BAND_LABELS: { sev: SignalSeverity; r: number }[] = [{ sev: 'critical', r: 0.25 }, { sev: 'high', r: 0.45 }, { sev: 'medium', r: 0.66 }, { sev: 'low', r: 0.84 }]
const BAND_EDGES = [0.34, 0.56, 0.76]

function wedgePath(from: number, to: number, r0: number, r1: number) {
  const p = (a: number, r: number) => { const t = (a * Math.PI) / 180; return `${50 + r * 46 * Math.sin(t)} ${50 - r * 46 * Math.cos(t)}` }
  const large = to - from > 180 ? 1 : 0
  return `M ${p(from, r0)} L ${p(from, r1)} A ${r1 * 46} ${r1 * 46} 0 ${large} 1 ${p(to, r1)} L ${p(to, r0)} A ${r0 * 46} ${r0 * 46} 0 ${large} 0 ${p(from, r0)} Z`
}

function polarToPercent(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180
  const x = 50 + radius * 46 * Math.sin(rad)
  const y = 50 - radius * 46 * Math.cos(rad)
  return { x, y }
}

export function RadarDisplay({
  signals, dimmed, onOpenDetail, hideCallout, sectors, activeSector, onSector,
}: {
  /** read the scope by domain: labelled wedges and labelled severity bands replace the compass degrees */
  sectors?: RadarSector[]
  activeSector?: string | null
  onSector?: (key: string) => void
  /** the details are shown elsewhere (the cockpit's signal list): no floating callout */
  hideCallout?: boolean
  signals: RadarSignal[]
  /** true while a rescan is in progress — dims signals so the "scanning" state reads clearly. */
  dimmed?: boolean
  onOpenDetail?: (signal: RadarSignal) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<RadarSignal | null>(null)

  const points = useMemo(() => signals.map((s) => ({ signal: s, ...polarToPercent(s.angle, s.radius) })), [signals])
  const selectedPoint = selected ? points.find((p) => p.signal.id === selected.id) : null

  return (
    <div className="radar-scope relative mx-auto aspect-square w-full max-w-[620px]">
      {/* Static rings, spokes and degree labels */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          {/* Spokes glow faintly right at the center and fade almost fully out toward the rim —
              a thin console crosshair, not a bright beam. */}
          <radialGradient id="radar-spoke-fade" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="46">
            <stop offset="0%" stopColor={RADAR_RING_GREEN} stopOpacity="0.55" />
            <stop offset="35%" stopColor={RADAR_RING_GREEN} stopOpacity="0.22" />
            <stop offset="100%" stopColor={RADAR_RING_GREEN} stopOpacity="0.05" />
          </radialGradient>
        </defs>
        {/* Outer accent pair: green + a clearly distinct blue, with a modest visible gap between
            them — the radar's own "housing" edge. */}
        {[
          { r: RINGS[0], stroke: RADAR_RING_GREEN },
          { r: RINGS[1], stroke: RADAR_RING_BLUE },
        ].map(({ r, stroke }) => (
          <circle
            key={r} cx="50" cy="50" r={r * 46} fill="none"
            stroke={stroke} strokeWidth={0.3}
            style={{ filter: `drop-shadow(0 0 1.5px ${stroke})` }}
          />
        ))}
        {/* Inner grid: thin, faint, and unevenly faded around the circumference. */}
        <g style={{ maskImage: RADAR_GRID_FADE_MASK, WebkitMaskImage: RADAR_GRID_FADE_MASK }}>
          {RINGS.slice(2).map((r) => (
            <circle key={r} cx="50" cy="50" r={r * 46} fill="none" stroke="var(--radar-grid)" strokeWidth={0.15} />
          ))}
        </g>
        <g style={{ filter: `drop-shadow(0 0 0.5px ${RADAR_RING_GREEN})` }}>
          {(sectors ? sectors.map((x) => x.from) : DEGREE_MARKS).map((deg) => {
            const rad = (deg * Math.PI) / 180
            const x2 = 50 + 46 * Math.sin(rad)
            const y2 = 50 - 46 * Math.cos(rad)
            return <line key={deg} x1="50" y1="50" x2={x2} y2={y2} stroke={sectors ? 'var(--radar-grid-text)' : 'url(#radar-spoke-fade)'} strokeOpacity={sectors ? 0.35 : 1} strokeWidth={sectors ? 0.22 : 0.15} />
          })}
        </g>
        {sectors && <>
          {/* the chosen domain's wedge */}
          {sectors.filter((x) => x.key === activeSector).map((x) => <path key={x.key} d={wedgePath(x.from, x.to, 0.06, 0.92)} fill={RADAR_RING_GREEN} fillOpacity="0.1" stroke={RADAR_RING_GREEN} strokeOpacity="0.5" strokeWidth="0.25" />)}
          {/* severity band edges */}
          {BAND_EDGES.map((r) => <circle key={r} cx="50" cy="50" r={r * 46} fill="none" stroke="var(--radar-grid-text)" strokeOpacity="0.28" strokeWidth="0.18" strokeDasharray="0.8 1.2" />)}
        </>}
      </svg>
      {sectors && BAND_LABELS.map((b) => {
        const { x, y } = polarToPercent(sectors[0]?.from ?? 0, b.r)
        return <span key={b.sev} className="radar-band-label" style={{ left: `${x}%`, top: `${y}%`, color: SEVERITY_COLOR[b.sev] }}>{SEVERITY_LABEL_FA[b.sev]}</span>
      })}

      {/* Domain labels on the rim: what each wedge holds, and how many — a click reads that domain alone */}
      {sectors?.map((x) => {
        const { x: lx, y: ly } = polarToPercent((x.from + x.to) / 2, 1.075)
        const on = activeSector === x.key
        return (
          <button key={x.key} type="button" className={`radar-sector-label${on ? ' is-on' : ''}`} style={{ left: `${lx}%`, top: `${ly}%` }}
            onClick={() => onSector?.(x.key)} aria-pressed={on} aria-label={`${x.label}: ${x.count} مورد`}>
            {x.label}<i>{x.count.toLocaleString('fa-IR')}</i>
          </button>
        )
      })}
      {/* Degree labels, HTML so text stays crisp at any zoom */}
      {!sectors && DEGREE_MARKS.map((deg) => {
        const { x, y } = polarToPercent(deg, 1.06)
        return (
          <span
            key={deg}
            className="num absolute -translate-x-1/2 -translate-y-1/2 text-[11px]"
            style={{ left: `${x}%`, top: `${y}%`, color: 'var(--radar-grid-text)' }}
          >
            {deg}
          </span>
        )
      })}

      {/* Rotating sweep */}
      <div
        className="radar-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        style={{ animationDuration: `${SWEEP_SECONDS}s`, opacity: dimmed ? 0.25 : 1 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(from 0deg, color-mix(in srgb, ${RADAR_RING_GREEN_BRIGHT} 85%, transparent), color-mix(in srgb, ${RADAR_RING_GREEN} 45%, transparent) 14deg, transparent 34deg, transparent 360deg)`,
            filter: 'brightness(1.25) saturate(1.2)',
          }}
        />
      </div>

      {/* Center pulse */}
      <div className="radar-center-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: RADAR_RING_GREEN_BRIGHT }} />

      {/* Signals */}
      {points.map(({ signal, x, y }) => {
        const Icon = CATEGORY_ICON[signal.category]
        const color = SEVERITY_COLOR[signal.severity]
        const delay = (signal.angle / 360) * SWEEP_SECONDS
        const isHovered = hoveredId === signal.id
        return (
          <button
            key={signal.id}
            onMouseEnter={() => setHoveredId(signal.id)}
            onMouseLeave={() => setHoveredId((v) => (v === signal.id ? null : v))}
            onClick={() => {
              setSelected((v) => (v?.id === signal.id ? null : signal))
              onOpenDetail?.(signal)
            }}
            className="radar-signal absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-transform duration-200 hover:scale-125"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              borderColor: color,
              background: `color-mix(in srgb, ${color} 22%, var(--radar-bg))`,
              boxShadow: isHovered ? `0 0 0 4px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
              opacity: dimmed ? 0.3 : 1,
              // @ts-expect-error -- custom properties consumed by the .radar-signal pulse keyframe
              '--pulse-color': color,
              animationDuration: `${SWEEP_SECONDS}s`,
              animationDelay: `${delay}s`,
              zIndex: isHovered || selected?.id === signal.id ? 20 : 10,
            }}
            aria-label={`${SIGNAL_CATEGORY_LABEL_FA[signal.category]}: ${signal.title}`}
          >
            <Icon size={12} style={{ color }} />

            {isHovered && selected?.id !== signal.id && (
              <span
                dir="rtl"
                className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-bold"
                style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
              >
                {signal.title} · {signal.subject}
              </span>
            )}
          </button>
        )
      })}

      {/* Detail callout for the selected signal */}
      {!hideCallout && selected && selectedPoint && (
        <div
          dir="rtl"
          className="radar-callout absolute z-30 w-60 max-w-[85vw] rounded-2xl border p-3.5 text-right"
          style={{
            left: `${Math.min(78, Math.max(4, selectedPoint.x))}%`,
            top: `${Math.min(70, Math.max(4, selectedPoint.y))}%`,
            transform: selectedPoint.x > 55 ? 'translateX(-100%)' : undefined,
            borderColor: SEVERITY_COLOR[selected.severity],
            background: 'color-mix(in srgb, var(--bg-panel-solid) 92%, transparent)',
            boxShadow: `0 0 24px color-mix(in srgb, ${SEVERITY_COLOR[selected.severity]} 25%, transparent)`,
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: `color-mix(in srgb, ${SEVERITY_COLOR[selected.severity]} 18%, transparent)`, color: SEVERITY_COLOR[selected.severity] }}
            >
              {SIGNAL_CATEGORY_LABEL_FA[selected.category]} · {SEVERITY_LABEL_FA[selected.severity]}
            </span>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-primary">
              <X size={14} />
            </button>
          </div>
          <p className="text-[13px] font-extrabold">{selected.title}</p>
          <p className="mt-0.5 text-[11px] text-secondary">{selected.subject} · {selected.detail}</p>
          {(selected.category === 'issue' || selected.category === 'risk') && <MissionOriginChip recordId={selected.id} className="mt-1.5" />}
          <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[10.5px] leading-5" style={{ borderColor: 'var(--border-soft)' }}>
            <p><span className="text-muted">علت ریشه‌ای: </span>{selected.rootCause}</p>
            <p><span className="text-muted">تاثیر: </span>{selected.impact}</p>
            <p className="font-bold" style={{ color: 'var(--radar-green)' }}>
              اقدام پیشنهادی: {selected.recommendedAction}
            </p>
          </div>
        </div>
      )}

      {/* Very small severity legend, tucked in a corner — the marker's distance from center is
          what actually encodes severity (see the radius bands in radarTypes.ts), this is just a
          reminder of what each color means. */}
      {!hideCallout && <div
        dir="rtl"
        className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-0.5 rounded-md border px-1.5 py-1"
        style={{ borderColor: 'var(--radar-grid)', background: 'color-mix(in srgb, var(--radar-bg) 75%, transparent)' }}
      >
        {LEGEND_SEVERITIES.map((sev) => (
          <span key={sev} className="flex items-center gap-1 text-[7px] font-bold" style={{ color: SEVERITY_COLOR[sev] }}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />
            {SEVERITY_LABEL_FA[sev]}
          </span>
        ))}
      </div>}
    </div>
  )
}
