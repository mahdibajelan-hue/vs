import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import {
  ISSUE_COLOR, ORBIT_ZONES, SEVERITY_COLOR, lerp, radiusFracForScore,
  type EventBeacon, type IssueUniverseNode, type RiskUniverseNode, type UniverseSeverity,
} from './universeTypes'

export type UniverseSelection = { type: 'risk' | 'issue'; id: string } | null

/** Deterministic per-node angle: index spacing plus a small hash-based jitter so nodes don't sit
 * in a perfectly mechanical ring, without needing any randomness at render time. `offset` lets
 * risks and issues interleave on the field instead of overlapping. */
function angleFor(id: string, index: number, total: number, offset = 0): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const jitter = (h % 24) - 12
  return (index / Math.max(1, total)) * 360 + jitter + offset
}

/** Solar-system-viewed-at-an-angle ellipse: squashed vertically so orbits read as depth, not a
 * flat dartboard. */
function orbitPoint(angleDeg: number, radiusFrac: number) {
  const rad = (angleDeg * Math.PI) / 180
  const x = 50 + radiusFrac * 46 * Math.cos(rad)
  const y = 50 + radiusFrac * 46 * 0.52 * Math.sin(rad)
  return { x, y }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

const TrendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const

interface UniverseCanvasProps {
  projectCode: string
  risks: RiskUniverseNode[]
  issues: IssueUniverseNode[]
  beacons: EventBeacon[]
  /** Timeline mode: plays back each risk's scoreHistory instead of its live criticality, and
   * hides issues/events per the brief ("Timeline shows how risks moved toward Core over time"). */
  timeline?: boolean
  hiddenSeverities: Set<UniverseSeverity>
  showIssues: boolean
  showEvents: boolean
  selected: UniverseSelection
  onSelect: (sel: UniverseSelection) => void
}

/**
 * The Universe canvas: Project Core at the exact center, risks and issues as physically-orbiting
 * objects (distance encodes score, size encodes exposure/impact, pulse speed encodes velocity),
 * and short-lived event beacons animating a traveling particle into whatever they just struck.
 * Shared between UNIVERSE (live) and TIMELINE (scrubbed history) modes.
 */
export function UniverseCanvas({
  projectCode, risks, issues, beacons, timeline,
  hiddenSeverities, showIssues, showEvents, selected, onSelect,
}: UniverseCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [zoom, setZoom] = useState(1)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  const historyLength = risks[0]?.scoreHistory.length ?? 1
  const activeIndex = historyIndex ?? historyLength - 1

  useEffect(() => {
    if (!timeline || !playing || reducedMotion) return
    const t = setInterval(() => {
      setHistoryIndex((v) => {
        const next = (v ?? historyLength - 1) + 1
        if (next >= historyLength) {
          setPlaying(false)
          return historyLength - 1
        }
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [timeline, playing, reducedMotion, historyLength])

  useEffect(() => {
    if (selected?.type === 'risk') setZoom(1.35)
  }, [selected])

  const visibleRisks = useMemo(() => risks.filter((r) => !hiddenSeverities.has(r.severity)), [risks, hiddenSeverities])
  const visibleIssues = useMemo(
    () => (timeline || !showIssues ? [] : issues.filter((i) => !hiddenSeverities.has(i.severity))),
    [issues, hiddenSeverities, showIssues, timeline],
  )

  const riskPoints = useMemo(
    () =>
      visibleRisks.map((r, i) => {
        const angle = angleFor(r.id, i, visibleRisks.length)
        const score = timeline ? r.scoreHistory[Math.min(activeIndex, r.scoreHistory.length - 1)] ?? r.criticality : r.criticality
        const radiusFrac = radiusFracForScore(score)
        return { risk: r, angle, score, radiusFrac, ...orbitPoint(angle, radiusFrac) }
      }),
    [visibleRisks, timeline, activeIndex],
  )
  const issuePoints = useMemo(
    () =>
      visibleIssues.map((iss, i) => {
        const angle = angleFor(iss.id, i, visibleIssues.length, 40)
        const radiusFrac = radiusFracForScore(iss.escalation)
        return { issue: iss, angle, radiusFrac, ...orbitPoint(angle, radiusFrac) }
      }),
    [visibleIssues],
  )

  const pointById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    riskPoints.forEach((p) => m.set(p.risk.id, p))
    issuePoints.forEach((p) => m.set(p.issue.id, p))
    return m
  }, [riskPoints, issuePoints])

  const selectedRiskPoint = selected?.type === 'risk' ? riskPoints.find((p) => p.risk.id === selected.id) : undefined
  const posTransition = reducedMotion ? 'none' : 'left 900ms cubic-bezier(.4,0,.2,1), top 900ms cubic-bezier(.4,0,.2,1)'

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0 m-auto aspect-square w-full max-w-[720px]"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: reducedMotion ? 'none' : 'transform 400ms ease' }}
        >
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {ORBIT_ZONES.map((z) => (
              <ellipse
                key={z.zone} cx="50" cy="50" rx={z.radiusFrac * 46} ry={z.radiusFrac * 46 * 0.52}
                fill="none" stroke="var(--radar-grid)" strokeWidth="0.18" strokeDasharray="1 1.6" opacity={0.55}
              />
            ))}
            {selectedRiskPoint && (
              <ellipse
                cx="50" cy="50" rx={selectedRiskPoint.radiusFrac * 46} ry={selectedRiskPoint.radiusFrac * 46 * 0.52}
                fill="none" stroke={SEVERITY_COLOR[selectedRiskPoint.risk.severity]} strokeWidth="0.4" opacity={0.85}
              />
            )}
            {!reducedMotion && !timeline && [0, 1].map((i) => (
              <circle
                key={i} cx="50" cy="50" r="9" fill="none" stroke="var(--radar-cyan)" strokeWidth="0.35"
                className="universe-shockwave-ring-inline"
                style={{ '--ring-r0': 9, '--ring-r1': 17, animationDuration: '3.6s', animationDelay: `${i * 1.8}s`, opacity: 0.35 } as CSSProperties}
              />
            ))}
            {!timeline && visibleRisks.map((r, i) => {
              if (r.trend === 'flat') return null
              const angle = angleFor(r.id, i, visibleRisks.length)
              const inward = r.trend === 'up'
              const cur = radiusFracForScore(r.criticality)
              const target = inward ? Math.max(0.1, cur - 0.1) : Math.min(0.94, cur + 0.1)
              const from = orbitPoint(angle, cur)
              const to = orbitPoint(angle, target)
              return (
                <line
                  key={`traj-${r.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={SEVERITY_COLOR[r.severity]} strokeWidth="0.3" strokeDasharray="0.7 0.9" opacity={0.4}
                />
              )
            })}
            {showEvents && !timeline && beacons.map((b) => {
              const to = pointById.get(b.toId)
              if (!to) return null
              const from = b.fromType === 'field'
                ? orbitPoint(b.fromAngleDeg ?? 0, 0.98)
                : (b.fromId ? pointById.get(b.fromId) : undefined) ?? to
              return (
                <g key={b.id} opacity={0.8}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={b.color} strokeWidth="0.28" strokeDasharray="1 1.1" opacity={0.45} />
                  {!reducedMotion && (
                    <circle r="0.9" fill={b.color}>
                      <animateMotion path={`M${from.x},${from.y} L${to.x},${to.y}`} dur="2.4s" begin={`${b.delay}s`} repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              )
            })}
          </svg>

          {ORBIT_ZONES.map((z) => {
            const p = orbitPoint(-92, z.radiusFrac)
            return (
              <span
                key={z.zone}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded text-[6.5px] font-bold tracking-widest text-muted"
                style={{ left: `${p.x}%`, top: `${p.y}%`, padding: '1px 4px', background: 'color-mix(in srgb, var(--bg-app) 65%, transparent)' }}
              >
                {z.label}
              </span>
            )
          })}

          {showEvents && !timeline && beacons.filter((b) => b.fromType === 'field').map((b) => {
            const p = orbitPoint(b.fromAngleDeg ?? 0, 0.98)
            return (
              <div
                key={`blip-${b.id}`}
                className={reducedMotion ? undefined : 'universe-beacon-blip'}
                title={b.label}
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 7, height: 7,
                  borderRadius: '50%', background: b.color, transform: 'translate(-50%,-50%)',
                  boxShadow: `0 0 8px 2px color-mix(in srgb, ${b.color} 60%, transparent)`,
                  animationDelay: `${b.delay}s`, opacity: reducedMotion ? 0.6 : undefined,
                }}
              />
            )
          })}

          {/* Project Core */}
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
            style={{
              width: '15%', height: '15%',
              background: 'radial-gradient(circle at 38% 32%, color-mix(in srgb, var(--radar-cyan) 50%, white 8%), color-mix(in srgb, var(--radar-cyan) 16%, #04070d) 72%)',
              boxShadow: '0 0 26px 5px color-mix(in srgb, var(--radar-cyan) 40%, transparent)',
              border: '1px solid color-mix(in srgb, var(--radar-cyan) 55%, transparent)',
              zIndex: 5,
            }}
          >
            <span className="text-center text-[6.5px] font-extrabold leading-tight tracking-wide text-white">PROJECT<br />CORE</span>
            <span className="num mt-0.5 text-[5.5px] font-bold text-muted">{projectCode}</span>
          </div>

          {riskPoints.map(({ risk, x, y }) => {
            const color = SEVERITY_COLOR[risk.severity]
            const sizePct = lerp(6, 11.5, risk.exposure / 100)
            const pulseDuration = lerp(2.8, 0.85, risk.velocity / 100)
            const Trend = TrendIcon[risk.trend]
            const isHovered = hoveredId === risk.id
            const isSelected = selected?.type === 'risk' && selected.id === risk.id
            return (
              <button
                key={risk.id}
                onMouseEnter={() => setHoveredId(risk.id)}
                onMouseLeave={() => setHoveredId((v) => (v === risk.id ? null : v))}
                onClick={() => onSelect(isSelected ? null : { type: 'risk', id: risk.id })}
                className="universe-node absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border transition-transform duration-200 hover:scale-110"
                style={{
                  left: `${x}%`, top: `${y}%`, width: `${sizePct}%`, aspectRatio: '1 / 1', transition: posTransition,
                  borderColor: color,
                  background: `color-mix(in srgb, ${color} ${isSelected ? 32 : 20}%, var(--radar-bg))`,
                  boxShadow: isHovered || isSelected ? `0 0 0 5px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
                  '--pulse-color': color,
                  animationDuration: `${pulseDuration}s`,
                  zIndex: isHovered || isSelected ? 20 : 10,
                } as CSSProperties}
                aria-label={`${risk.code}: ${risk.title}`}
              >
                <span className="num text-[7px] font-extrabold" style={{ color }}>{risk.code}</span>
                {isHovered && !isSelected && (
                  <span
                    className="pointer-events-none absolute bottom-full z-30 mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold"
                    style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
                  >
                    {risk.code} · {risk.title} · <span style={{ color }}>{risk.severity.toUpperCase()}</span> · Exposure {risk.exposure} <Trend size={10} className="inline" style={{ color }} />
                  </span>
                )}
              </button>
            )
          })}

          {issuePoints.map(({ issue, x, y }) => {
            const magnitude = lerp(3, 8, issue.escalation / 100)
            const speed = lerp(3.2, 1.1, issue.escalation / 100)
            const sizePct = lerp(4.5, 7.5, issue.escalation / 100)
            const isHovered = hoveredId === issue.id
            const isSelected = selected?.type === 'issue' && selected.id === issue.id
            return (
              <button
                key={issue.id}
                onMouseEnter={() => setHoveredId(issue.id)}
                onMouseLeave={() => setHoveredId((v) => (v === issue.id ? null : v))}
                onClick={() => onSelect(isSelected ? null : { type: 'issue', id: issue.id })}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${x}%`, top: `${y}%`, width: `${sizePct}%`, aspectRatio: '1 / 1', transition: posTransition, zIndex: isHovered || isSelected ? 20 : 8 }}
                aria-label={`${issue.code}: ${issue.title}`}
              >
                <svg viewBox="-10 -10 20 20" className="absolute inset-0 h-[300%] w-[300%] overflow-visible">
                  {!reducedMotion && [0, 1].map((i) => (
                    <circle
                      key={i} cx="0" cy="0" r="1" fill="none" stroke={ISSUE_COLOR} strokeWidth="0.5"
                      className="universe-shockwave-ring-inline"
                      style={{ '--ring-r0': 1, '--ring-r1': magnitude, animationDuration: `${speed}s`, animationDelay: `${i * (speed / 2)}s` } as CSSProperties}
                    />
                  ))}
                </svg>
                <div
                  className="relative flex h-full w-full items-center justify-center rounded-full border"
                  style={{
                    borderColor: ISSUE_COLOR,
                    background: `color-mix(in srgb, ${ISSUE_COLOR} ${isSelected ? 34 : 22}%, var(--radar-bg))`,
                    boxShadow: isHovered || isSelected ? `0 0 0 4px color-mix(in srgb, ${ISSUE_COLOR} 30%, transparent)` : undefined,
                  }}
                >
                  <span className="num text-[6px] font-extrabold" style={{ color: ISSUE_COLOR }}>{issue.code}</span>
                </div>
                {isHovered && !isSelected && (
                  <span
                    className="pointer-events-none absolute bottom-full z-30 mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold"
                    style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
                  >
                    {issue.code} · {issue.title} · <span style={{ color: ISSUE_COLOR }}>ISSUE</span> · Escalation {issue.escalation}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border-soft)' }} title="Zoom out">
            <ZoomOut size={12} />
          </button>
          <button onClick={() => setZoom(1)} className="num rounded-lg border px-2 py-1 text-[9px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.15) * 100) / 100))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border-soft)' }} title="Zoom in">
            <ZoomIn size={12} />
          </button>
        </div>

        {timeline && (
          <div className="flex flex-1 items-center gap-2">
            <button
              onClick={() => setPlaying((v) => !v)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
              style={{ borderColor: 'var(--border-soft)' }}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <input
              type="range" min={0} max={historyLength - 1} step={1} value={activeIndex}
              onChange={(e) => { setPlaying(false); setHistoryIndex(Number(e.target.value)) }}
              className="h-1 flex-1 accent-[var(--radar-cyan)]"
            />
            <span className="num shrink-0 text-[9px] font-bold text-muted">
              {activeIndex === historyLength - 1 ? 'NOW' : `T-${historyLength - 1 - activeIndex}`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
