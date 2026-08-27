import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react'
import { SEVERITY_COLOR, SEVERITY_LABEL, type RiskUniverseNode } from './universeTypes'

const ORBIT_RINGS = [0.85, 0.6, 0.35]

/** Deterministic per-node angle: index spacing plus a small hash-based jitter so nodes don't sit
 * in a perfectly mechanical ring, without needing any randomness at render time. */
function angleFor(id: string, index: number, total: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const jitter = (h % 24) - 12
  return (index / total) * 360 + jitter
}

function polarToPercent(angleDeg: number, radiusFrac: number) {
  const rad = (angleDeg * Math.PI) / 180
  const x = 50 + radiusFrac * 46 * Math.sin(rad)
  const y = 50 - radiusFrac * 46 * Math.cos(rad)
  return { x, y }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t))
}

const TrendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const

/**
 * The Risk Universe: Project Core at the center, each risk a gravity object orbiting it —
 * distance encodes criticality (closer = more critical), size encodes exposure, pulse speed
 * encodes velocity, and a short dashed trajectory line hints at where the risk is heading next.
 */
export function RiskOrbitView({ risks }: { risks: RiskUniverseNode[] }) {
  const [selected, setSelected] = useState<RiskUniverseNode | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const points = useMemo(
    () =>
      risks.map((r, i) => {
        const angle = angleFor(r.id, i, risks.length)
        const radiusFrac = lerp(0.88, 0.16, r.criticality / 100)
        return { risk: r, angle, radiusFrac, ...polarToPercent(angle, radiusFrac) }
      }),
    [risks],
  )
  const selectedPoint = selected ? points.find((p) => p.risk.id === selected.id) : null

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {ORBIT_RINGS.map((r) => (
          <circle key={r} cx="50" cy="50" r={r * 46} fill="none" stroke="var(--radar-grid)" strokeWidth="0.2" strokeDasharray="1.2 1.4" />
        ))}
        {points.map(({ risk, angle, radiusFrac }) => {
          if (risk.trend === 'flat') return null
          const inward = risk.trend === 'up'
          const fromR = radiusFrac
          const toR = inward ? Math.max(0.08, radiusFrac - 0.09) : Math.min(0.92, radiusFrac + 0.09)
          const from = polarToPercent(angle, fromR)
          const to = polarToPercent(angle, toR)
          return (
            <line
              key={`traj-${risk.id}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={SEVERITY_COLOR[risk.severity]} strokeWidth="0.35" strokeDasharray="0.8 0.8" opacity={0.55}
              markerEnd="url(#universe-arrow)"
            />
          )
        })}
        <defs>
          <marker id="universe-arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="currentColor" opacity={0.6} />
          </marker>
        </defs>
      </svg>

      {/* Project Core */}
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
        style={{
          width: '18%', height: '18%',
          background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--radar-cyan) 55%, white 10%), color-mix(in srgb, var(--radar-cyan) 20%, var(--radar-bg)) 70%)',
          boxShadow: '0 0 30px 6px color-mix(in srgb, var(--radar-cyan) 45%, transparent)',
          border: '1px solid color-mix(in srgb, var(--radar-cyan) 60%, transparent)',
        }}
      >
        <span className="text-center text-[9px] font-extrabold leading-tight tracking-wide text-white">PROJECT<br />CORE</span>
      </div>

      {points.map(({ risk, x, y }) => {
        const color = SEVERITY_COLOR[risk.severity]
        const sizePct = lerp(6.5, 12, risk.exposure / 100)
        const pulseDuration = lerp(2.6, 0.8, risk.velocity / 100)
        const Trend = TrendIcon[risk.trend]
        const isHovered = hoveredId === risk.id
        return (
          <button
            key={risk.id}
            onMouseEnter={() => setHoveredId(risk.id)}
            onMouseLeave={() => setHoveredId((v) => (v === risk.id ? null : v))}
            onClick={() => setSelected((v) => (v?.id === risk.id ? null : risk))}
            className="universe-node absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border transition-transform duration-200 hover:scale-110"
            style={{
              left: `${x}%`, top: `${y}%`, width: `${sizePct}%`, aspectRatio: '1 / 1',
              borderColor: color,
              background: `color-mix(in srgb, ${color} 20%, var(--radar-bg))`,
              boxShadow: isHovered ? `0 0 0 5px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
              // @ts-expect-error -- custom property consumed by the .universe-node pulse keyframe
              '--pulse-color': color,
              animationDuration: `${pulseDuration}s`,
              zIndex: isHovered || selected?.id === risk.id ? 20 : 10,
            }}
            aria-label={`${risk.code}: ${risk.title}`}
          >
            <span className="num text-[8px] font-extrabold" style={{ color }}>{risk.code}</span>

            {isHovered && selected?.id !== risk.id && (
              <span
                className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold"
                style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
              >
                {risk.title} · {risk.windowLabel} <Trend size={10} className="inline" style={{ color }} />
              </span>
            )}
          </button>
        )
      })}

      {selected && selectedPoint && (
        <div
          className="radar-callout absolute z-30 w-64 max-w-[85vw] rounded-2xl border p-3.5"
          style={{
            left: `${Math.min(75, Math.max(4, selectedPoint.x))}%`,
            top: `${Math.min(68, Math.max(4, selectedPoint.y))}%`,
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
              {selected.code} · {SEVERITY_LABEL[selected.severity]}
            </span>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-primary">
              <X size={14} />
            </button>
          </div>
          <p className="text-[13px] font-extrabold">{selected.title}</p>
          <p className="mt-0.5 text-[11px] text-secondary">{selected.category} · {selected.windowLabel}</p>
          <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[10.5px] leading-5" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="flex items-center justify-between"><span className="text-muted">Exposure</span><span className="num font-bold">{selected.exposure}/100</span></p>
            <p className="flex items-center justify-between"><span className="text-muted">Criticality</span><span className="num font-bold">{selected.criticality}/100</span></p>
            <p className="flex items-center justify-between">
              <span className="text-muted">Velocity</span>
              <span className="num flex items-center gap-1 font-bold">
                {selected.velocity}/100 {(() => { const T = TrendIcon[selected.trend]; return <T size={11} /> })()}
              </span>
            </p>
            <p className="font-bold" style={{ color: 'var(--radar-green)' }}>
              Issue conversion forecast: {Math.round(selected.conversionProbability * 100)}%
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
