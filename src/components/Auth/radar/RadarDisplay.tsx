import { useMemo, useState } from 'react'
import { AlertTriangle, CircleAlert, Clock, FileText, Flag, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SEVERITY_COLOR, SEVERITY_LABEL_FA, SIGNAL_CATEGORY_LABEL_FA, toFa,
  type RadarSignal, type SignalCategory,
} from './radarTypes'

const SWEEP_SECONDS = 8

const CATEGORY_ICON: Record<SignalCategory, LucideIcon> = {
  risk: AlertTriangle,
  issue: CircleAlert,
  delay: Clock,
  change: RefreshCw,
  milestone: Flag,
  contract: FileText,
  gate: ShieldCheck,
}

const RINGS = [1, 0.75, 0.5, 0.25]
const DEGREE_MARKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function polarToPercent(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180
  const x = 50 + radius * 46 * Math.sin(rad)
  const y = 50 - radius * 46 * Math.cos(rad)
  return { x, y }
}

export function RadarDisplay({
  signals, dimmed, onOpenDetail,
}: {
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
    <div className="radar-scope relative mx-auto aspect-square w-full max-w-[520px]">
      {/* Static rings, spokes and degree labels */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {RINGS.map((r) => (
          <circle key={r} cx="50" cy="50" r={r * 46} fill="none" stroke="var(--radar-grid)" strokeWidth="0.25" />
        ))}
        {DEGREE_MARKS.map((deg) => {
          const rad = (deg * Math.PI) / 180
          const x2 = 50 + 46 * Math.sin(rad)
          const y2 = 50 - 46 * Math.cos(rad)
          return <line key={deg} x1="50" y1="50" x2={x2} y2={y2} stroke="var(--radar-grid)" strokeWidth="0.2" />
        })}
      </svg>

      {/* Degree labels, HTML so text stays crisp at any zoom */}
      {DEGREE_MARKS.map((deg) => {
        const { x, y } = polarToPercent(deg, 1.06)
        return (
          <span
            key={deg}
            className="num absolute -translate-x-1/2 -translate-y-1/2 text-[9px]"
            style={{ left: `${x}%`, top: `${y}%`, color: 'var(--radar-grid-text)' }}
          >
            {toFa(deg)}
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
          style={{ background: 'conic-gradient(from 0deg, color-mix(in srgb, var(--radar-green) 38%, transparent), transparent 34deg, transparent 360deg)' }}
        />
      </div>

      {/* Center pulse */}
      <div className="radar-center-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'var(--radar-green)' }} />

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
                className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold"
                style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
              >
                {signal.title} · {signal.subject}
              </span>
            )}
          </button>
        )
      })}

      {/* Detail callout for the selected signal */}
      {selected && selectedPoint && (
        <div
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
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
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
          <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[10.5px] leading-5" style={{ borderColor: 'var(--border-soft)' }}>
            <p><span className="text-muted">علت ریشه‌ای: </span>{selected.rootCause}</p>
            <p><span className="text-muted">تاثیر: </span>{selected.impact}</p>
            <p className="font-bold" style={{ color: 'var(--radar-green)' }}>
              اقدام پیشنهادی: {selected.recommendedAction}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
