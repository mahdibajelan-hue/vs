import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line, OrbitControls, Stars } from '@react-three/drei'
import { Activity, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import {
  ISSUE_COLOR, ORBIT_ZONES, SEVERITY_COLOR, lerp, radiusFracForScore,
  type EventBeacon, type IssueUniverseNode, type RiskUniverseNode, type UniverseSeverity,
} from './universeTypes'

export type UniverseSelection = { type: 'risk' | 'issue'; id: string } | null

/** World-space radius (in three.js units) that radiusFrac 1.0 maps to. */
const ORBIT_SCALE = 6.2
/** Project Core's outermost glow shell — objects (and their labels) are kept clear of it too. */
const CORE_CLEARANCE = 1.55

/** Deterministic per-node angle: index spacing plus a small hash-based jitter so nodes don't sit
 * in a perfectly mechanical ring, without needing any randomness at render time. `offset` lets
 * risks and issues interleave on the field instead of overlapping. */
function angleFor(id: string, index: number, total: number, offset = 0): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const jitter = (h % 10) - 5
  return ((index / Math.max(1, total)) * 360 + jitter + offset) * (Math.PI / 180)
}

function orbitPoint(angleRad: number, radiusFrac: number): [number, number] {
  const r = radiusFrac * ORBIT_SCALE
  return [r * Math.cos(angleRad), r * Math.sin(angleRad)]
}

function circlePoints(radius: number, segments = 80): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2
    return [radius * Math.cos(a), 0, radius * Math.sin(a)] as [number, number, number]
  })
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

/** A glowing sphere built from a fully unlit, exact-color core plus 1-2 larger, additive-blended,
 * depth-unwritten shells — the standard lightweight way to fake neon bloom in three.js without a
 * full postprocessing pipeline. Using `meshBasicMaterial` (not `meshStandardMaterial`) for the
 * core means scene lights never wash the color out toward white — what you pass in `color` is
 * exactly what renders. */
function GlowSphere({ radius, color, shells }: { radius: number; color: string; shells: { scale: number; opacity: number }[] }) {
  return (
    <>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {shells.map((s, i) => (
        <mesh key={i} scale={s.scale}>
          <sphereGeometry args={[radius, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={s.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

function LabelChip({ code, title, color, badgeText, sideText }: { code: string; title: string; color: string; badgeText: string; sideText: string }) {
  return (
    <div
      className="pointer-events-none absolute whitespace-nowrap rounded px-1 py-0.5"
      style={{
        left: 0, top: '50%', transform: 'translate(14px, -50%)', maxWidth: 112,
        background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <p className="overflow-hidden text-ellipsis text-[7.5px] font-extrabold leading-tight" style={{ color }}>
        {code} <span className="font-semibold text-white/70">{title}</span>
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="rounded px-1 py-[1px] text-[5.5px] font-extrabold uppercase" style={{ background: `color-mix(in srgb, ${color} 30%, transparent)`, color }}>
          {badgeText}
        </span>
        <span className="num text-[6px] text-white/50">{sideText}</span>
      </div>
    </div>
  )
}

function ProjectCoreMesh({ projectCode, reducedMotion }: { projectCode: string; reducedMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ring.current && !reducedMotion) ring.current.rotation.z += delta * 0.15
  })
  return (
    <group>
      <GlowSphere
        radius={0.8} color="#38bdf8"
        shells={[{ scale: 1.4, opacity: 0.3 }, { scale: 1.9, opacity: 0.13 }]}
      />
      <mesh scale={0.45}>
        <sphereGeometry args={[0.8, 24, 24]} />
        <meshBasicMaterial color="#d6f6ff" toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.15, 0.25, 0]}>
        <torusGeometry args={[CORE_CLEARANCE, 0.012, 8, 100]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color="#38bdf8" intensity={2.5} distance={9} decay={2} />
      <Html center style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-[7px] font-extrabold tracking-wide text-white" style={{ textShadow: '0 0 6px rgba(0,0,0,0.65)' }}>PROJECT CORE</span>
          <span className="num text-[6px] font-bold text-white/80">{projectCode}</span>
        </div>
      </Html>
    </group>
  )
}

function RiskPlanet({
  risk, position, isSelected, reducedMotion, pulseSpeed, sizePct, onSelect,
}: {
  risk: RiskUniverseNode
  position: [number, number, number]
  isSelected: boolean
  reducedMotion: boolean
  pulseSpeed: number
  sizePct: number
  onSelect: () => void
}) {
  const color = SEVERITY_COLOR[risk.severity]
  const coreR = 0.13 + sizePct * 0.012
  const glowRef = useRef<THREE.Mesh>(null)
  const phase = useRef(Math.random() * Math.PI * 2)
  const [hovered, setHovered] = useState(false)
  useFrame((state) => {
    if (!glowRef.current) return
    const s = reducedMotion ? 1.5 : 1.5 + Math.sin(state.clock.elapsedTime * pulseSpeed + phase.current) * 0.22
    glowRef.current.scale.setScalar(s)
  })
  return (
    <group position={position}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[coreR, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected || hovered ? 2.8 : 1.7} toneMapped={false} transparent opacity={0.92} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[coreR, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.42 : 0.24} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={2.4}>
        <sphereGeometry args={[coreR, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Html center style={{ pointerEvents: 'none' }}>
        <div className="relative flex flex-col items-center">
          <Activity size={Math.max(9, coreR * 34)} color="white" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.75))' }} />
          <LabelChip code={risk.code} title={risk.title} color={color} badgeText={risk.severity} sideText={risk.windowLabel} />
        </div>
      </Html>
    </group>
  )
}

function IssuePlanet({
  issue, position, isSelected, reducedMotion, sizePct, speed, onSelect,
}: {
  issue: IssueUniverseNode
  position: [number, number, number]
  isSelected: boolean
  reducedMotion: boolean
  sizePct: number
  speed: number
  onSelect: () => void
}) {
  const color = ISSUE_COLOR
  const coreR = 0.1 + sizePct * 0.01
  const [hovered, setHovered] = useState(false)
  const ring1 = useRef<THREE.Mesh>(null)
  const ring2 = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.elapsedTime
    ;[ring1, ring2].forEach((ref, i) => {
      const mesh = ref.current
      if (!mesh) return
      const p = ((t / speed + i * 0.5) % 1)
      const s = 0.4 + p * 3.2
      mesh.scale.setScalar(s)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 0.55 * (1 - p))
    })
  })
  return (
    <group position={position}>
      <mesh ref={ring1} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[coreR * 1.4, coreR * 1.7, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[coreR * 1.4, coreR * 1.7, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[coreR, 28, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected || hovered ? 2.4 : 1.6} toneMapped={false} transparent opacity={0.92} />
      </mesh>
      <mesh scale={1.9}>
        <sphereGeometry args={[coreR, 18, 18]} />
        <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.36 : 0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Html center style={{ pointerEvents: 'none' }}>
        <div className="relative flex flex-col items-center">
          <Activity size={Math.max(8, coreR * 40)} color="white" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.75))' }} />
          <LabelChip code={issue.code} title={issue.title} color={color} badgeText="Issue" sideText={`${issue.agingDays}d`} />
        </div>
      </Html>
    </group>
  )
}

/** A short-lived signal — a small emissive sphere sliding along a thin connector line from its
 * source to whatever it just struck, looping with the beacon's own stagger delay. */
function BeaconStream({ from, to, color, delay, reducedMotion }: { from: [number, number, number]; to: [number, number, number]; color: string; delay: number; reducedMotion: boolean }) {
  const dot = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!dot.current || reducedMotion) return
    const dur = 2.4
    const t = Math.max(0, ((state.clock.elapsedTime - delay) % dur) / dur)
    dot.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    )
    const mat = dot.current.material as THREE.MeshBasicMaterial
    mat.opacity = t < 0.05 || t > 0.95 ? 0 : 0.9
  })
  return (
    <>
      <Line points={[from, to]} color={color} transparent opacity={0.35} lineWidth={1} dashed dashSize={0.12} gapSize={0.1} />
      {!reducedMotion && (
        <mesh ref={dot} position={from}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  )
}

function Scene({
  projectCode, riskPoints, issuePoints, beacons, showEvents, timeline, reducedMotion, selected, onSelect,
}: {
  projectCode: string
  riskPoints: { risk: RiskUniverseNode; radiusFrac: number; pos: [number, number, number] }[]
  issuePoints: { issue: IssueUniverseNode; radiusFrac: number; pos: [number, number, number] }[]
  beacons: EventBeacon[]
  showEvents: boolean
  timeline?: boolean
  reducedMotion: boolean
  selected: UniverseSelection
  onSelect: (sel: UniverseSelection) => void
}) {
  const pointById = useMemo(() => {
    const m = new Map<string, [number, number, number]>()
    riskPoints.forEach((p) => m.set(p.risk.id, p.pos))
    issuePoints.forEach((p) => m.set(p.issue.id, p.pos))
    return m
  }, [riskPoints, issuePoints])

  return (
    <>
      <color attach="background" args={['#050914']} />
      <ambientLight intensity={0.5} />
      <Stars radius={38} depth={26} count={1400} factor={1.8} saturation={0} fade speed={reducedMotion ? 0 : 0.3} />

      {ORBIT_ZONES.map((z) => {
        const [x, , zc] = [z.radiusFrac * ORBIT_SCALE, 0, 0]
        return (
          <Html key={z.zone} position={[x, 0.05, zc]} center style={{ pointerEvents: 'none' }}>
            <span
              className="whitespace-nowrap rounded text-[6.5px] font-bold tracking-widest text-white/50"
              style={{ padding: '1px 4px', background: 'rgba(5,9,20,0.65)' }}
            >
              {z.label}
            </span>
          </Html>
        )
      })}

      {riskPoints.map(({ risk, radiusFrac }) => (
        <Line
          key={`orbit-${risk.id}`}
          points={circlePoints(radiusFrac * ORBIT_SCALE)}
          color={SEVERITY_COLOR[risk.severity]}
          transparent
          opacity={selected?.type === 'risk' && selected.id === risk.id ? 0.85 : 0.35}
          lineWidth={selected?.type === 'risk' && selected.id === risk.id ? 1.6 : 0.8}
        />
      ))}
      {issuePoints.map(({ issue, radiusFrac }) => (
        <Line
          key={`orbit-${issue.id}`}
          points={circlePoints(radiusFrac * ORBIT_SCALE)}
          color={ISSUE_COLOR}
          transparent
          opacity={selected?.type === 'issue' && selected.id === issue.id ? 0.85 : 0.35}
          lineWidth={selected?.type === 'issue' && selected.id === issue.id ? 1.6 : 0.8}
        />
      ))}

      {!timeline && riskPoints.map(({ risk, pos }) => {
        if (risk.trend === 'flat') return null
        const dist = Math.hypot(pos[0], pos[2]) || 1
        const ux = pos[0] / dist
        const uz = pos[2] / dist
        const len = risk.trend === 'up' ? -0.8 : 0.8
        const to: [number, number, number] = [pos[0] + ux * len, pos[1], pos[2] + uz * len]
        return <Line key={`traj-${risk.id}`} points={[pos, to]} color={SEVERITY_COLOR[risk.severity]} transparent opacity={0.5} lineWidth={1.2} dashed dashSize={0.08} gapSize={0.06} />
      })}

      {showEvents && !timeline && beacons.map((b) => {
        const to = pointById.get(b.toId)
        if (!to) return null
        const from = b.fromType === 'field'
          ? (() => {
            const rad = (b.fromAngleDeg ?? 0) * (Math.PI / 180)
            return [ORBIT_SCALE * 0.98 * Math.cos(rad), 0, ORBIT_SCALE * 0.98 * Math.sin(rad)] as [number, number, number]
          })()
          : (b.fromId ? pointById.get(b.fromId) : undefined) ?? to
        return <BeaconStream key={b.id} from={from} to={to} color={b.color} delay={b.delay} reducedMotion={reducedMotion} />
      })}

      <ProjectCoreMesh projectCode={projectCode} reducedMotion={reducedMotion} />

      {riskPoints.map(({ risk, pos }) => (
        <RiskPlanet
          key={risk.id}
          risk={risk}
          position={pos}
          isSelected={selected?.type === 'risk' && selected.id === risk.id}
          reducedMotion={reducedMotion}
          pulseSpeed={lerp(1.1, 3.4, risk.velocity / 100)}
          sizePct={lerp(6.5, 12, risk.exposure / 100)}
          onSelect={() => onSelect(selected?.type === 'risk' && selected.id === risk.id ? null : { type: 'risk', id: risk.id })}
        />
      ))}
      {issuePoints.map(({ issue, pos }) => (
        <IssuePlanet
          key={issue.id}
          issue={issue}
          position={pos}
          isSelected={selected?.type === 'issue' && selected.id === issue.id}
          reducedMotion={reducedMotion}
          sizePct={lerp(4.5, 7.5, issue.escalation / 100)}
          speed={lerp(3.2, 1.1, issue.escalation / 100)}
          onSelect={() => onSelect(selected?.type === 'issue' && selected.id === issue.id ? null : { type: 'issue', id: issue.id })}
        />
      ))}
    </>
  )
}

/**
 * The Universe canvas — a real WebGL scene (React Three Fiber). Project Core sits at the origin,
 * risks and issues are physically-orbiting glowing spheres (distance encodes score, size encodes
 * exposure/impact, pulse speed encodes velocity) each riding its own tinted orbit ring, and
 * short-lived event beacons animate a traveling particle into whatever they just struck. Shared
 * between UNIVERSE (live) and TIMELINE (scrubbed history) modes.
 */
export function UniverseCanvas({
  projectCode, risks, issues, beacons, timeline,
  hiddenSeverities, showIssues, showEvents, selected, onSelect,
}: UniverseCanvasProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [fov, setFov] = useState(42)
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
    if (selected?.type === 'risk') setFov(32)
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

  /** Real 2D (XZ-plane) collision resolution. Each node starts at its score-accurate (angle,
   * radius) position, then a short pairwise-repulsion relaxation pushes any two nodes — or a
   * node and Project Core — that are closer than their combined footprint (sphere + label
   * clearance) apart, while a gentle spring pulls everything back toward its ideal spot each
   * step. The net effect: nothing ever overlaps, yet a node's position still reads as "how close
   * to Core" — it just isn't pinned to the exact spot a pure radius formula would have put it. */
  const placedPoints = useMemo(() => {
    type Sim = { id: string; kind: 'risk' | 'issue'; x: number; z: number; idealX: number; idealZ: number; idealRadius: number; effR: number }
    const sims: Sim[] = [
      ...visibleRisks.map((r, i) => {
        const angle = angleFor(r.id, i, totalVisible)
        const score = timeline ? r.scoreHistory[Math.min(activeIndex, r.scoreHistory.length - 1)] ?? r.criticality : r.criticality
        const idealRadius = radiusFracForScore(score)
        const [x, z] = orbitPoint(angle, idealRadius)
        const sizePct = lerp(6.5, 12, r.exposure / 100)
        const effR = (0.13 + sizePct * 0.012) * 2.4 + 1.1
        return { id: r.id, kind: 'risk' as const, x, z, idealX: x, idealZ: z, idealRadius, effR }
      }),
      ...visibleIssues.map((iss, i) => {
        const angle = angleFor(iss.id, visibleRisks.length + i, totalVisible)
        const idealRadius = radiusFracForScore(iss.escalation)
        const [x, z] = orbitPoint(angle, idealRadius)
        const sizePct = lerp(4.5, 7.5, iss.escalation / 100)
        const effR = (0.1 + sizePct * 0.01) * 1.9 + 1.1
        return { id: iss.id, kind: 'issue' as const, x, z, idealX: x, idealZ: z, idealRadius, effR }
      }),
    ]

    for (let iter = 0; iter < 140; iter++) {
      for (let i = 0; i < sims.length; i++) {
        for (let j = i + 1; j < sims.length; j++) {
          const a = sims[i]
          const b = sims[j]
          let dx = b.x - a.x
          let dz = b.z - a.z
          let dist = Math.hypot(dx, dz)
          const minDist = a.effR + b.effR
          if (dist < minDist) {
            if (dist < 0.0001) {
              dx = 0.01 * (i - j || 1)
              dz = 0.01
              dist = Math.hypot(dx, dz)
            }
            const push = (minDist - dist) / 2
            const ux = dx / dist
            const uz = dz / dist
            a.x -= ux * push
            a.z -= uz * push
            b.x += ux * push
            b.z += uz * push
          }
        }
      }
      for (const n of sims) {
        const dist = Math.hypot(n.x, n.z)
        const minDist = CORE_CLEARANCE + n.effR
        if (dist < minDist && dist > 0.0001) {
          const push = minDist - dist
          n.x += (n.x / dist) * push
          n.z += (n.z / dist) * push
        }
        n.x += (n.idealX - n.x) * 0.02
        n.z += (n.idealZ - n.z) * 0.02
      }
    }
    return sims
  }, [visibleRisks, visibleIssues, totalVisible, timeline, activeIndex])

  const riskPoints = useMemo(
    () =>
      visibleRisks.map((r) => {
        const p = placedPoints.find((s) => s.kind === 'risk' && s.id === r.id)!
        return { risk: r, radiusFrac: p.idealRadius, pos: [p.x, 0, p.z] as [number, number, number] }
      }),
    [visibleRisks, placedPoints],
  )
  const issuePoints = useMemo(
    () =>
      visibleIssues.map((iss) => {
        const p = placedPoints.find((s) => s.kind === 'issue' && s.id === iss.id)!
        return { issue: iss, radiusFrac: p.idealRadius, pos: [p.x, 0, p.z] as [number, number, number] }
      }),
    [visibleIssues, placedPoints],
  )

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden rounded-xl">
        <Canvas camera={{ position: [0, 8.5, 11.5], fov }} dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}>
          <Scene
            projectCode={projectCode}
            riskPoints={riskPoints}
            issuePoints={issuePoints}
            beacons={beacons}
            showEvents={showEvents}
            timeline={timeline}
            reducedMotion={reducedMotion}
            selected={selected}
            onSelect={onSelect}
          />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={6}
            maxDistance={20}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setFov((f) => Math.min(58, f + 6))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border-soft)' }} title="Zoom out">
            <ZoomOut size={12} />
          </button>
          <button onClick={() => setFov(42)} className="num rounded-lg border px-2 py-1 text-[9px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>{Math.round((42 / fov) * 100)}%</button>
          <button onClick={() => setFov((f) => Math.max(22, f - 6))} className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border-soft)' }} title="Zoom in">
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
