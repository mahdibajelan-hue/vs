import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Clock, Pause, Play, ShieldAlert, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ISSUE_COLOR, ORBIT_ZONES, SEVERITY_COLOR, SEVERITY_LABEL, lerp, radiusFracForScore,
  type EventBeacon, type IssueUniverseNode, type RiskUniverseNode, type UniverseSeverity,
} from './universeTypes'

export type UniverseSelection = { type: 'risk' | 'issue'; id: string } | null

/** Percentage-space ellipse the whole field is laid out on — 0,0 is the container's top-left,
 * 50,50 its center. Matches the 0-100 viewBox convention RadarDisplay.tsx already uses elsewhere
 * in Project Radar, so both the decorative SVG orbit rings and the absolutely-positioned HTML
 * nodes share one coordinate system. */
const ORBIT_RX = 42
const ORBIT_RY = 26
/** Used to make the pairwise-repulsion pass below treat the elliptical field as if it were a
 * circle — otherwise nodes would crowd more tightly along the short axis than the long one. */
const ASPECT = ORBIT_RX / ORBIT_RY
/** Keeps nodes (and their labels) clear of the Project Core badge at the center. */
const CORE_CLEARANCE = 15

/** Deterministic per-node angle: index spacing plus a small hash-based jitter so nodes don't sit
 * in a perfectly mechanical ring, without needing any randomness at render time. */
function angleFor(id: string, index: number, total: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const jitter = (h % 10) - 5
  return ((index / Math.max(1, total)) * 360 + jitter) * (Math.PI / 180)
}

/** (angle, score-radius) -> offset from center, in percent-of-container units. */
function idealOffset(angleRad: number, radiusFrac: number): { dx: number; dy: number } {
  return { dx: Math.cos(angleRad) * ORBIT_RX * radiusFrac, dy: Math.sin(angleRad) * ORBIT_RY * radiusFrac }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
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

function iconForRisk(risk: RiskUniverseNode): LucideIcon {
  if (risk.severity === 'critical') return AlertTriangle
  if (risk.trend === 'down') return TrendingDown
  if (risk.category === 'HSE' || risk.category === 'Regulatory') return ShieldAlert
  if (risk.category === 'Procurement' || risk.category === 'Construction') return Clock
  return Activity
}

interface PlanetProps {
  left: number
  top: number
  sizePx: number
  color: string
  Icon: LucideIcon
  isSelected: boolean
  reducedMotion: boolean
  onSelect: () => void
  code: string
  title: string
  badgeText: string
  sideText: string
}

/** One glowing "planet" node: a radial-gradient icon sphere with a blurred pulsing halo, plus a
 * glassmorphism label chip riding beside it — flips to the node's left once it's far enough right
 * that the chip would otherwise run past the field's edge. */
function Planet({ left, top, sizePx, color, Icon, isSelected, reducedMotion, onSelect, code, title, badgeText, sideText }: PlanetProps) {
  const flip = left > 62
  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-3"
      style={{ left: `${left}%`, top: `${top}%`, flexDirection: flip ? 'row-reverse' : 'row' }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
    >
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: sizePx, height: sizePx }}>
        {!reducedMotion && (
          <div
            className="absolute animate-pulse rounded-full opacity-50"
            style={{ width: sizePx * 1.15, height: sizePx * 1.15, backgroundColor: color, filter: 'blur(6px)' }}
          />
        )}
        <div
          className="relative flex items-center justify-center rounded-full text-white transition-transform duration-300 hover:scale-110"
          style={{
            width: sizePx, height: sizePx,
            background: `radial-gradient(circle at 30% 30%, #ffffff 0%, ${color} 60%, #000000 100%)`,
            boxShadow: isSelected
              ? `0 0 0 2px white, 0 0 22px ${color}, inset 0 0 8px rgba(255,255,255,0.6)`
              : `0 0 18px ${color}, inset 0 0 8px rgba(255,255,255,0.6)`,
          }}
        >
          <Icon size={Math.max(11, sizePx * 0.4)} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
        </div>
      </div>
      <div
        className="flex flex-col rounded-lg border px-2.5 py-1.5 shadow-xl backdrop-blur-md"
        style={{ background: 'rgba(15, 23, 42, 0.8)', borderColor: isSelected ? color : 'rgba(51,65,85,0.6)' }}
      >
        <div className="flex items-center gap-2">
          <span className="num text-[11px] font-bold text-slate-200">{code}</span>
          <span
            className="rounded px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wider"
            style={{ background: `${color}25`, color, border: `1px solid ${color}40` }}
          >
            {badgeText}
          </span>
          <span className="num text-[9px] text-slate-400">{sideText}</span>
        </div>
        <span className="max-w-[130px] truncate text-[10px] font-medium text-slate-300">{title}</span>
      </div>
    </div>
  )
}

function ProjectCore({ projectCode }: { projectCode: string }) {
  return (
    <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center">
      <div className="absolute h-36 w-36 animate-ping rounded-full border border-cyan-500/30 opacity-25" />
      <div className="absolute h-44 w-44 rounded-full border border-blue-500/20" style={{ boxShadow: '0 0 50px rgba(6,182,212,0.3)' }} />
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 via-cyan-500 to-indigo-400 p-[2px]"
        style={{ boxShadow: '0 0 45px rgba(6,182,212,0.8)' }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#081226]">
          <span className="text-xs font-black tracking-widest text-white" style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' }}>PROJECT</span>
          <span className="text-xs font-black tracking-widest text-cyan-400" style={{ filter: 'drop-shadow(0 0 10px rgba(6,182,212,0.9))' }}>CORE</span>
          <span className="num mt-0.5 text-[8px] font-bold text-white/60">{projectCode}</span>
        </div>
      </div>
    </div>
  )
}

/** A short-lived signal: a dashed connector plus a small dot that slides along it once, looping
 * with the beacon's own stagger delay — the SVG-native `<animateMotion>` replaces what used to be
 * a per-frame three.js position update. */
function BeaconLine({
  from, to, color, delay, reducedMotion,
}: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; delay: number; reducedMotion: boolean }) {
  return (
    <g opacity={0.6}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={0.3} strokeDasharray="1.2 1" opacity={0.5} />
      {!reducedMotion && (
        <circle r={0.6} fill={color}>
          <animateMotion dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" path={`M ${from.x},${from.y} L ${to.x},${to.y}`} />
        </circle>
      )}
    </g>
  )
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
 * The Universe canvas — plain React + SVG + Tailwind (no three.js/WebGL). Project Core sits at
 * the center of an elliptical field; risks and issues are glowing "planet" nodes (distance from
 * Core encodes score, size encodes exposure/impact) riding faint orbit rings, and short-lived
 * event beacons animate a traveling dot into whatever they just struck. Shared between UNIVERSE
 * (live) and TIMELINE (scrubbed history) modes.
 */
export function UniverseCanvas({
  projectCode, risks, issues, beacons, timeline,
  hiddenSeverities, showIssues, showEvents, selected, onSelect,
}: UniverseCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()
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

  const visibleRisks = useMemo(() => risks.filter((r) => !hiddenSeverities.has(r.severity)), [risks, hiddenSeverities])
  const visibleIssues = useMemo(
    () => (timeline || !showIssues ? [] : issues.filter((i) => !hiddenSeverities.has(i.severity))),
    [issues, hiddenSeverities, showIssues, timeline],
  )
  const totalVisible = visibleRisks.length + visibleIssues.length

  /** Same 2D pairwise-repulsion + spring-back relaxation the old algorithm used: each node starts
   * at its score-accurate ellipse position, then nodes (and Project Core) closer than their
   * combined footprint get pushed apart, while a gentle spring pulls everything back toward its
   * ideal spot each step — nothing ever overlaps, yet a node's position still reads as "how close
   * to Core". The y-axis is scaled by the ellipse's aspect ratio during the relaxation so the
   * field behaves like a circle for this purpose, then unscaled once at the end. */
  const placedPoints = useMemo(() => {
    type Sim = { id: string; kind: 'risk' | 'issue'; x: number; y: number; idealX: number; idealY: number; effR: number }
    const sims: Sim[] = [
      ...visibleRisks.map((r, i) => {
        const angle = angleFor(r.id, i, totalVisible)
        const score = timeline ? r.scoreHistory[Math.min(activeIndex, r.scoreHistory.length - 1)] ?? r.criticality : r.criticality
        const { dx, dy } = idealOffset(angle, radiusFracForScore(score))
        const sizePx = lerp(30, 46, r.exposure / 100)
        const effR = sizePx * 0.09 + 13
        return { id: r.id, kind: 'risk' as const, x: dx, y: dy * ASPECT, idealX: dx, idealY: dy * ASPECT, effR }
      }),
      ...visibleIssues.map((iss, i) => {
        const angle = angleFor(iss.id, visibleRisks.length + i, totalVisible)
        const { dx, dy } = idealOffset(angle, radiusFracForScore(iss.escalation))
        const sizePx = lerp(26, 38, iss.escalation / 100)
        const effR = sizePx * 0.09 + 12
        return { id: iss.id, kind: 'issue' as const, x: dx, y: dy * ASPECT, idealX: dx, idealY: dy * ASPECT, effR }
      }),
    ]

    for (let iter = 0; iter < 120; iter++) {
      for (let i = 0; i < sims.length; i++) {
        for (let j = i + 1; j < sims.length; j++) {
          const a = sims[i]
          const b = sims[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.hypot(dx, dy)
          const minDist = a.effR + b.effR
          if (dist < minDist) {
            if (dist < 0.0001) { dx = 0.1 * (i - j || 1); dy = 0.1; dist = Math.hypot(dx, dy) }
            const push = (minDist - dist) / 2
            const ux = dx / dist
            const uy = dy / dist
            a.x -= ux * push; a.y -= uy * push
            b.x += ux * push; b.y += uy * push
          }
        }
      }
      for (const n of sims) {
        const dist = Math.hypot(n.x, n.y)
        const minDist = CORE_CLEARANCE + n.effR
        if (dist < minDist && dist > 0.0001) {
          const push = minDist - dist
          n.x += (n.x / dist) * push
          n.y += (n.y / dist) * push
        }
        n.x += (n.idealX - n.x) * 0.02
        n.y += (n.idealY - n.y) * 0.02
      }
    }
    return sims
  }, [visibleRisks, visibleIssues, totalVisible, timeline, activeIndex])

  const riskPlacements = useMemo(
    () => visibleRisks.map((r) => {
      const p = placedPoints.find((s) => s.kind === 'risk' && s.id === r.id)!
      return { risk: r, left: clamp(50 + p.x, 6, 94), top: clamp(50 + p.y / ASPECT, 10, 90) }
    }),
    [visibleRisks, placedPoints],
  )
  const issuePlacements = useMemo(
    () => visibleIssues.map((iss) => {
      const p = placedPoints.find((s) => s.kind === 'issue' && s.id === iss.id)!
      return { issue: iss, left: clamp(50 + p.x, 6, 94), top: clamp(50 + p.y / ASPECT, 10, 90) }
    }),
    [visibleIssues, placedPoints],
  )

  const pointById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    riskPlacements.forEach((p) => m.set(p.risk.id, { x: p.left, y: p.top }))
    issuePlacements.forEach((p) => m.set(p.issue.id, { x: p.left, y: p.top }))
    return m
  }, [riskPlacements, issuePlacements])

  const visibleBeacons = showEvents && !timeline ? beacons : []

  return (
    <div className="relative flex h-full min-h-[380px] flex-col gap-2">
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-800/60 shadow-2xl" style={{ background: '#070a12' }}>
        {/* Dot-grid texture + soft ambient glow — purely decorative background layers */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[90px]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[35%] w-[35%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-[50px]" />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="universe-orbit-a" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#eab308" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="universe-orbit-b" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <ellipse cx="50" cy="50" rx={ORBIT_RX} ry={ORBIT_RY} fill="none" stroke="#1e293b" strokeWidth="0.4" />
          <ellipse cx="50" cy="50" rx={ORBIT_RX} ry={ORBIT_RY} fill="none" stroke="url(#universe-orbit-a)" strokeWidth="0.3" strokeDasharray="1.5 1.5" opacity={0.6} />
          <ellipse cx="50" cy="50" rx={ORBIT_RX * 0.76} ry={ORBIT_RY * 0.76} fill="none" stroke="#1e293b" strokeWidth="0.4" />
          <ellipse cx="50" cy="50" rx={ORBIT_RX * 0.76} ry={ORBIT_RY * 0.76} fill="none" stroke="url(#universe-orbit-b)" strokeWidth="0.35" />
          <ellipse cx="50" cy="50" rx={ORBIT_RX * 0.48} ry={ORBIT_RY * 0.48} fill="none" stroke="#0284c7" strokeWidth="0.35" strokeDasharray="0.8 0.8" opacity={0.4} />

          {visibleBeacons.map((b) => {
            const to = pointById.get(b.toId)
            if (!to) return null
            const from = b.fromType === 'field'
              ? (() => {
                const rad = (b.fromAngleDeg ?? 0) * (Math.PI / 180)
                return { x: 50 + Math.cos(rad) * ORBIT_RX * 1.04, y: 50 + Math.sin(rad) * ORBIT_RY * 1.04 }
              })()
              : (b.fromId ? pointById.get(b.fromId) : undefined) ?? to
            return <BeaconLine key={b.id} from={from} to={to} color={b.color} delay={b.delay} reducedMotion={reducedMotion} />
          })}
        </svg>

        {/* Stacked along the top bearing (straight up from Core) rather than the horizontal axis
            where node angles most often land — keeps these purely-informational labels out of the
            way of the risk/issue nodes and their label chips. */}
        {!timeline && ORBIT_ZONES.map((z) => (
          <span
            key={z.zone}
            className="pointer-events-none absolute whitespace-nowrap rounded text-[6.5px] font-bold tracking-widest text-white/50"
            style={{
              left: '50%', top: `${50 - ORBIT_RY * z.radiusFrac}%`,
              transform: 'translate(-50%, -50%)', padding: '1px 4px', background: 'rgba(5,9,20,0.65)',
            }}
          >
            {z.label}
          </span>
        ))}

        <ProjectCore projectCode={projectCode} />

        {riskPlacements.map(({ risk, left, top }) => (
          <Planet
            key={risk.id}
            left={left} top={top}
            sizePx={lerp(30, 46, risk.exposure / 100)}
            color={SEVERITY_COLOR[risk.severity]}
            Icon={iconForRisk(risk)}
            isSelected={selected?.type === 'risk' && selected.id === risk.id}
            reducedMotion={reducedMotion}
            onSelect={() => onSelect(selected?.type === 'risk' && selected.id === risk.id ? null : { type: 'risk', id: risk.id })}
            code={risk.code}
            title={risk.title}
            badgeText={SEVERITY_LABEL[risk.severity]}
            sideText={risk.windowLabel}
          />
        ))}
        {issuePlacements.map(({ issue, left, top }) => (
          <Planet
            key={issue.id}
            left={left} top={top}
            sizePx={lerp(26, 38, issue.escalation / 100)}
            color={ISSUE_COLOR}
            Icon={Activity}
            isSelected={selected?.type === 'issue' && selected.id === issue.id}
            reducedMotion={reducedMotion}
            onSelect={() => onSelect(selected?.type === 'issue' && selected.id === issue.id ? null : { type: 'issue', id: issue.id })}
            code={issue.code}
            title={issue.title}
            badgeText="Issue"
            sideText={`${issue.agingDays}d`}
          />
        ))}
      </div>

      {timeline && (
        <div className="flex items-center gap-2">
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
  )
}
