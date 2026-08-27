import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Activity, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
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
  const jitter = (h % 10) - 5
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

/** A fixed, deterministic field of faint background stars — purely cosmetic, generated once with
 * a tiny linear-congruential PRNG so it never needs to depend on project data. */
function useStarfield(count = 70) {
  return useMemo(() => {
    let s = 42
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return (s % 10000) / 10000
    }
    return Array.from({ length: count }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.15 + rand() * 0.35,
      opacity: 0.15 + rand() * 0.55,
    }))
  }, [count])
}

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
 * each riding its own tinted orbit ellipse, and short-lived event beacons animating a traveling
 * particle into whatever they just struck. Shared between UNIVERSE (live) and TIMELINE (scrubbed
 * history) modes.
 */
export function UniverseCanvas({
  projectCode, risks, issues, beacons, timeline,
  hiddenSeverities, showIssues, showEvents, selected, onSelect,
}: UniverseCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()
  const stars = useStarfield()
  const [zoom, setZoom] = useState(1)
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

  /** Risks and issues share ONE angular ordering (not two independent rings) so every visible
   * object gets a guaranteed minimum angular gap from every other — a necessary starting point,
   * but not sufficient on its own: near the core the same angular gap covers far less physical
   * distance, so same-severity objects still pile up. */
  const totalVisible = visibleRisks.length + visibleIssues.length

  /** Real 2D collision resolution. Each node starts at its score-accurate (angle, radius)
   * position, then a short pairwise-repulsion relaxation pushes any two nodes — or a node and
   * Project Core — that are closer than their combined footprint (sphere + label clearance)
   * apart, while a gentle spring pulls everything back toward its ideal spot each step. The net
   * effect: nothing ever overlaps, yet a node's position still reads as "how close to Core" —
   * it just isn't pinned to the exact pixel a 1D radius formula would have put it at. */
  const CORE_RADIUS = 11
  const placedPoints = useMemo(() => {
    type Sim = { id: string; kind: 'risk' | 'issue'; x: number; y: number; idealX: number; idealY: number; angle: number; idealRadius: number; effR: number }
    const sims: Sim[] = [
      ...visibleRisks.map((r, i) => {
        const angle = angleFor(r.id, i, totalVisible)
        const score = timeline ? r.scoreHistory[Math.min(activeIndex, r.scoreHistory.length - 1)] ?? r.criticality : r.criticality
        const idealRadius = radiusFracForScore(score)
        const p = orbitPoint(angle, idealRadius)
        const sizePct = lerp(6.5, 12, r.exposure / 100)
        const effR = sizePct * 6 * 0.5 * 0.14 + 8.5
        return { id: r.id, kind: 'risk' as const, x: p.x, y: p.y, idealX: p.x, idealY: p.y, angle, idealRadius, effR }
      }),
      ...visibleIssues.map((iss, i) => {
        const angle = angleFor(iss.id, visibleRisks.length + i, totalVisible)
        const idealRadius = radiusFracForScore(iss.escalation)
        const p = orbitPoint(angle, idealRadius)
        const sizePct = lerp(4.5, 7.5, iss.escalation / 100)
        const effR = sizePct * 6 * 0.5 * 0.14 + 8.5
        return { id: iss.id, kind: 'issue' as const, x: p.x, y: p.y, idealX: p.x, idealY: p.y, angle, idealRadius, effR }
      }),
    ]

    for (let iter = 0; iter < 140; iter++) {
      for (let i = 0; i < sims.length; i++) {
        for (let j = i + 1; j < sims.length; j++) {
          const a = sims[i]
          const b = sims[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.hypot(dx, dy)
          const minDist = a.effR + b.effR
          if (dist < minDist) {
            if (dist < 0.0001) {
              dx = 0.01 * (i - j || 1)
              dy = 0.01
              dist = Math.hypot(dx, dy)
            }
            const push = (minDist - dist) / 2
            const ux = dx / dist
            const uy = dy / dist
            a.x -= ux * push
            a.y -= uy * push
            b.x += ux * push
            b.y += uy * push
          }
        }
      }
      for (const n of sims) {
        const dx = n.x - 50
        const dy = n.y - 50
        const dist = Math.hypot(dx, dy)
        const minDist = CORE_RADIUS + n.effR
        if (dist < minDist && dist > 0.0001) {
          const push = minDist - dist
          n.x += (dx / dist) * push
          n.y += (dy / dist) * push
        }
        n.x += (n.idealX - n.x) * 0.02
        n.y += (n.idealY - n.y) * 0.02
      }
    }
    return sims
  }, [visibleRisks, visibleIssues, totalVisible, timeline, activeIndex])

  const riskPoints = useMemo(
    () =>
      visibleRisks.map((r) => {
        const p = placedPoints.find((s) => s.kind === 'risk' && s.id === r.id)!
        return { risk: r, angle: p.angle, radiusFrac: p.idealRadius, x: p.x, y: p.y }
      }),
    [visibleRisks, placedPoints],
  )
  const issuePoints = useMemo(
    () =>
      visibleIssues.map((iss) => {
        const p = placedPoints.find((s) => s.kind === 'issue' && s.id === iss.id)!
        return { issue: iss, angle: p.angle, radiusFrac: p.idealRadius, x: p.x, y: p.y }
      }),
    [visibleIssues, placedPoints],
  )

  const pointById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    riskPoints.forEach((p) => m.set(p.risk.id, p))
    issuePoints.forEach((p) => m.set(p.issue.id, p))
    return m
  }, [riskPoints, issuePoints])

  const posTransition = reducedMotion ? 'none' : 'left 900ms cubic-bezier(.4,0,.2,1), top 900ms cubic-bezier(.4,0,.2,1)'
  /** Right when the node sits on the left half of the canvas, left otherwise — keeps every
   * always-on label pointing away from Project Core instead of running off the canvas edge. */
  const labelStyle = (x: number, y: number): CSSProperties =>
    x < 50
      ? { left: `${x}%`, top: `${y}%`, transform: 'translate(15px, -50%)', textAlign: 'left' }
      : { left: `${x}%`, top: `${y}%`, transform: 'translate(calc(-100% - 15px), -50%)', textAlign: 'right' }

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0 m-auto aspect-square w-full max-w-[720px]"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: reducedMotion ? 'none' : 'transform 400ms ease' }}
        >
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {stars.map((s, i) => (
              <circle key={`star-${i}`} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.opacity} />
            ))}

            {/* Each object rides its own tinted orbit ellipse — a spirograph of individual paths
                rather than a handful of shared rings, matching a real orbital field. */}
            {riskPoints.map(({ risk, radiusFrac }) => {
              const isSelected = selected?.type === 'risk' && selected.id === risk.id
              return (
                <ellipse
                  key={`orbit-${risk.id}`} cx="50" cy="50" rx={radiusFrac * 46} ry={radiusFrac * 46 * 0.52}
                  fill="none" stroke={SEVERITY_COLOR[risk.severity]}
                  strokeWidth={isSelected ? 0.45 : 0.22} opacity={isSelected ? 0.85 : 0.4}
                />
              )
            })}
            {issuePoints.map(({ issue, radiusFrac }) => {
              const isSelected = selected?.type === 'issue' && selected.id === issue.id
              return (
                <ellipse
                  key={`orbit-${issue.id}`} cx="50" cy="50" rx={radiusFrac * 46} ry={radiusFrac * 46 * 0.52}
                  fill="none" stroke={ISSUE_COLOR}
                  strokeWidth={isSelected ? 0.45 : 0.22} opacity={isSelected ? 0.85 : 0.4}
                />
              )
            })}

            {/* Core light rays — a restrained lens-flare accent, not a full starburst. */}
            {[20, 65, 140, 200].map((deg) => {
              const rad = (deg * Math.PI) / 180
              const len = 5.5
              return (
                <line
                  key={`ray-${deg}`}
                  x1={50 - Math.cos(rad) * 2} y1={50 - Math.sin(rad) * 2}
                  x2={50 + Math.cos(rad) * len} y2={50 + Math.sin(rad) * len}
                  stroke="white" strokeWidth="0.15" opacity={0.35} strokeLinecap="round"
                />
              )
            })}
            {!reducedMotion && !timeline && [0, 1].map((i) => (
              <circle
                key={i} cx="50" cy="50" r="10" fill="none" stroke="var(--radar-cyan)" strokeWidth="0.35"
                className="universe-shockwave-ring-inline"
                style={{ '--ring-r0': 10, '--ring-r1': 19, animationDuration: '3.6s', animationDelay: `${i * 1.8}s`, opacity: 0.3 } as CSSProperties}
              />
            ))}
            {!timeline && riskPoints.map(({ risk: r, x, y }) => {
              if (r.trend === 'flat') return null
              const dx = x - 50
              const dy = y - 50
              const dist = Math.hypot(dx, dy) || 1
              const len = r.trend === 'up' ? -6 : 6
              const to = { x: x + (dx / dist) * len, y: y + (dy / dist) * len }
              return (
                <line
                  key={`traj-${r.id}`} x1={x} y1={y} x2={to.x} y2={to.y}
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

          {/* Project Core — a bright glass-like sphere with a specular highlight, not a flat tint. */}
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
            style={{
              width: '21%', height: '21%',
              background: 'radial-gradient(circle at 34% 28%, #eafcff 0%, #8fe3ff 16%, #29a6e8 42%, #0a5c99 68%, #041b33 100%)',
              boxShadow: '0 0 3px 1px rgba(255,255,255,0.5), 0 0 34px 8px color-mix(in srgb, var(--radar-cyan) 55%, transparent), 0 0 70px 18px color-mix(in srgb, var(--radar-cyan) 25%, transparent)',
              border: '1px solid rgba(255,255,255,0.35)',
              zIndex: 5,
            }}
          >
            <span className="text-center text-[7.5px] font-extrabold leading-tight tracking-wide text-white" style={{ textShadow: '0 0 6px rgba(0,0,0,0.5)' }}>
              PROJECT<br />CORE
            </span>
            <span className="num mt-0.5 text-[6px] font-bold text-white/80">{projectCode}</span>
          </div>

          {riskPoints.map(({ risk, x, y }) => {
            const color = SEVERITY_COLOR[risk.severity]
            const sizePct = lerp(6.5, 12, risk.exposure / 100)
            const pulseDuration = lerp(2.8, 0.85, risk.velocity / 100)
            const isSelected = selected?.type === 'risk' && selected.id === risk.id
            return (
              <div key={risk.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, transition: posTransition, zIndex: isSelected ? 20 : 10 }}>
                <button
                  onClick={() => onSelect(isSelected ? null : { type: 'risk', id: risk.id })}
                  className="universe-node relative flex items-center justify-center rounded-full border transition-transform duration-200 hover:scale-110"
                  style={{
                    width: `${sizePct * 6}px`, height: `${sizePct * 6}px`,
                    borderColor: 'rgba(255,255,255,0.4)',
                    background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, white 55%, ${color}) 0%, ${color} 48%, color-mix(in srgb, ${color} 55%, black) 100%)`,
                    boxShadow: `0 0 ${isSelected ? 14 : 8}px ${isSelected ? 3 : 1.5}px color-mix(in srgb, ${color} 60%, transparent)`,
                    '--pulse-color': color,
                    animationDuration: `${pulseDuration}s`,
                  } as CSSProperties}
                  aria-label={`${risk.code}: ${risk.title}`}
                >
                  <Activity size={Math.max(8, sizePct * 0.95)} color="white" style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.65))' }} />
                </button>
                <div
                  className="pointer-events-none absolute whitespace-nowrap rounded px-1 py-0.5"
                  style={{
                    ...labelStyle(x, y), position: 'absolute', left: 0, top: '50%', maxWidth: 104,
                    background: 'color-mix(in srgb, var(--bg-app) 82%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--border-soft) 80%, transparent)',
                  }}
                >
                  <p className="overflow-hidden text-ellipsis text-[7.5px] font-extrabold leading-tight" style={{ color }}>
                    {risk.code} <span className="font-semibold text-secondary">{risk.title}</span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-1" style={{ justifyContent: x < 50 ? 'flex-start' : 'flex-end' }}>
                    <span className="rounded px-1 py-[1px] text-[5.5px] font-extrabold uppercase" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}>
                      {risk.severity}
                    </span>
                    <span className="num text-[6px] text-muted">{risk.windowLabel}</span>
                  </div>
                </div>
              </div>
            )
          })}

          {issuePoints.map(({ issue, x, y }) => {
            const magnitude = lerp(3, 8, issue.escalation / 100)
            const speed = lerp(3.2, 1.1, issue.escalation / 100)
            const sizePct = lerp(4.5, 7.5, issue.escalation / 100)
            const isSelected = selected?.type === 'issue' && selected.id === issue.id
            return (
              <div key={issue.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, transition: posTransition, zIndex: isSelected ? 20 : 8 }}>
                <button
                  onClick={() => onSelect(isSelected ? null : { type: 'issue', id: issue.id })}
                  className="relative flex items-center justify-center transition-transform duration-200 hover:scale-110"
                  style={{ width: `${sizePct * 6}px`, height: `${sizePct * 6}px` }}
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
                      borderColor: 'rgba(255,255,255,0.4)',
                      background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, white 55%, ${ISSUE_COLOR}) 0%, ${ISSUE_COLOR} 48%, color-mix(in srgb, ${ISSUE_COLOR} 55%, black) 100%)`,
                      boxShadow: `0 0 ${isSelected ? 12 : 7}px ${isSelected ? 2.5 : 1.2}px color-mix(in srgb, ${ISSUE_COLOR} 55%, transparent)`,
                    }}
                  >
                    <Activity size={Math.max(7, sizePct * 0.8)} color="white" style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.65))' }} />
                  </div>
                </button>
                <div
                  className="pointer-events-none absolute whitespace-nowrap rounded px-1 py-0.5"
                  style={{
                    ...labelStyle(x, y), position: 'absolute', left: 0, top: '50%', maxWidth: 104,
                    background: 'color-mix(in srgb, var(--bg-app) 82%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--border-soft) 80%, transparent)',
                  }}
                >
                  <p className="overflow-hidden text-ellipsis text-[7.5px] font-extrabold leading-tight" style={{ color: ISSUE_COLOR }}>
                    {issue.code} <span className="font-semibold text-secondary">{issue.title}</span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-1" style={{ justifyContent: x < 50 ? 'flex-start' : 'flex-end' }}>
                    <span className="rounded px-1 py-[1px] text-[5.5px] font-extrabold uppercase" style={{ background: `color-mix(in srgb, ${ISSUE_COLOR} 22%, transparent)`, color: ISSUE_COLOR }}>
                      Issue
                    </span>
                    <span className="num text-[6px] text-muted">{issue.agingDays}d</span>
                  </div>
                </div>
              </div>
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
