import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { GateStatus, ProjectGate, ProjectStage } from '../types'
import { faNum } from './ui'

/**
 * Six visual node states for a stage on the ring — distinct from the module's usual 4-value
 * HealthStatus, because a gate's position in its own approval workflow is a different axis from
 * project health. Mapped from GateStatus below; colours match the reference EPC lifecycle view
 * this replicates (green/purple/blue/amber/slate/red).
 */
type OrbitStatus = 'completed' | 'conditional' | 'ready' | 'active' | 'upcoming' | 'blocked'

const ORBIT_META: Record<OrbitStatus, { label: string; color: string; dark: string }> = {
  completed: { label: 'گیت گذشته‌شده', color: '#10b981', dark: '#065f46' },
  conditional: { label: 'عبور مشروط', color: '#a855f7', dark: '#6b21a8' },
  ready: { label: 'آماده بررسی گیت', color: '#3b82f6', dark: '#1e3a8a' },
  active: { label: 'در حال اجرا', color: '#f59e0b', dark: '#b45309' },
  upcoming: { label: 'پیش رو', color: '#64748b', dark: '#334155' },
  blocked: { label: 'مسدود', color: '#ef4444', dark: '#991b1b' },
}
const NEON_GREEN = '#39ff8a'
const PLANNED_COLOR = '#fb923c'

/**
 * GateStatus has no "conditional pass" of its own — the module instead records that as an
 * ordinary approval carrying an override reason (see overrideGate in the store). Treating an
 * overridden approval as the ring's "conditional" colour, and a rejection as "blocked", are both
 * deliberate choices to fit this six-state ring onto the module's actual five-state workflow
 * rather than inventing a seventh backend status.
 */
function orbitStatus(gateStatus: GateStatus | undefined, gate: ProjectGate | undefined, progress: number): OrbitStatus {
  if (gateStatus === 'blocked' || gateStatus === 'rejected') return 'blocked'
  if (gateStatus === 'approved') return gate?.overrideBy ? 'conditional' : 'completed'
  if (gateStatus === 'ready') return 'ready'
  return progress > 0 ? 'active' : 'upcoming'
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Planned completion-by-today, linearly interpolated between the stage's own planned dates —
 * the closest equivalent this module has to the reference view's weighted-objectives planned
 * curve, since a stage here carries a single flat progress number rather than sub-item weights. */
function plannedPct(stage: ProjectStage, today: string): number {
  if (!stage.plannedStart || !stage.plannedFinish) return stage.status === 'completed' ? 100 : 0
  const start = Date.parse(stage.plannedStart)
  const finish = Date.parse(stage.plannedFinish)
  const now = Date.parse(today)
  if (finish <= start) return now >= finish ? 100 : 0
  return Math.max(0, Math.min(100, ((now - start) / (finish - start)) * 100))
}

const VB = 760
const CX = 380
const CY = 380
const CORE_R = 165
const PLANNED_R = 158
const ACTUAL_R = 149
const NODE_ORBIT_R = 270
const NODE_R = 42

function arcPath(a1: number, a2: number): string {
  const toXY = (a: number) => {
    const rad = (a * Math.PI) / 180
    return [CX + NODE_ORBIT_R * Math.cos(rad), CY + NODE_ORBIT_R * Math.sin(rad)]
  }
  const [x1, y1] = toXY(a1 + 3)
  const [x2, y2] = toXY(a2 - 3)
  const large = a2 - a1 > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${NODE_ORBIT_R} ${NODE_ORBIT_R} 0 ${large} 1 ${x2} ${y2}`
}

export function StageOrbit({ stages, gates, gateStatuses, currentStageKey, onSelectStage }: {
  stages: ProjectStage[]
  gates: ProjectGate[]
  gateStatuses: Map<string, GateStatus>
  currentStageKey: string
  onSelectStage: (stageKey: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const today = todayIso()
  const ordered = useMemo(() => stages.slice().sort((a, b) => a.sequence - b.sequence), [stages])
  const gateByStage = useMemo(() => new Map(gates.map((g) => [g.stageKey, g])), [gates])
  const n = ordered.length

  const nodes = useMemo(() => ordered.map((stage, i) => {
    const angle = -90 + (360 / n) * i
    const rad = (angle * Math.PI) / 180
    const gate = gateByStage.get(stage.stageKey)
    const status = orbitStatus(gateStatuses.get(stage.stageKey), gate, stage.progress)
    return {
      stage, index: i, angle,
      nx: CX + NODE_ORBIT_R * Math.cos(rad), ny: CY + NODE_ORBIT_R * Math.sin(rad),
      status, planned: plannedPct(stage, today),
    }
  }), [ordered, n, gateByStage, gateStatuses, today])

  if (n === 0) return null

  const overallActual = Math.round(ordered.reduce((s, x) => s + x.progress, 0) / n)
  const overallPlanned = Math.round(nodes.reduce((s, x) => s + x.planned, 0) / n)
  const variance = overallActual - overallPlanned
  const varianceLabel = variance < -5 ? 'عقب از برنامه' : variance > 2 ? 'جلوتر از برنامه' : 'مطابق برنامه'
  const varianceColor = variance < -5 ? '#f87171' : variance > 2 ? '#39ff8a' : '#93c5fd'
  const activeNode = nodes.find((x) => x.stage.stageKey === currentStageKey) ?? nodes.find((x) => x.status === 'active')

  const ringLen = (r: number) => 2 * Math.PI * r
  const ring = (r: number, pct: number, style: React.CSSProperties) => {
    const len = ringLen(r)
    const dash = (len * Math.max(0, Math.min(100, pct))) / 100
    return (
      <circle cx={CX} cy={CY} r={r} fill="none" strokeLinecap="round"
        strokeDasharray={`${dash} ${len - dash}`} transform={`rotate(-90 ${CX} ${CY})`} style={style} />
    )
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-6"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 10%, #123159 0%, #04070f 78%)', border: '1px solid rgba(255,255,255,.07)' }}
    >
      <div className="relative mx-auto" style={{ width: '100%', maxWidth: 600 }}>
        <svg viewBox={`0 0 ${VB} ${VB}`} className="h-auto w-full select-none" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="orbitCoreGrad" cx="50%" cy="35%" r="75%">
              <stop offset="0%" stopColor="#123159" /><stop offset="100%" stopColor="#08152c" />
            </radialGradient>
            <filter id="orbitNodeBlur" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" /></filter>
            {(Object.entries(ORBIT_META) as [OrbitStatus, typeof ORBIT_META[OrbitStatus]][]).map(([key, m]) => (
              <radialGradient key={key} id={`orbitGrad-${key}`} cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor={m.color} /><stop offset="100%" stopColor={m.dark} />
              </radialGradient>
            ))}
          </defs>

          <circle cx={CX} cy={CY} r={NODE_ORBIT_R} fill="none" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} strokeDasharray="2 6" />

          {nodes.map(({ stage, index, angle, status }) => {
            const nextAngle = -90 + (360 / n) * (index + 1)
            const midAngle = (angle + nextAngle) / 2
            const midRad = (midAngle * Math.PI) / 180
            const isPassed = status === 'completed'
            const segColor = isPassed ? NEON_GREEN : 'rgba(255,255,255,.28)'
            const midX = CX + NODE_ORBIT_R * Math.cos(midRad)
            const midY = CY + NODE_ORBIT_R * Math.sin(midRad)
            const tangentDeg = midAngle + 90
            return (
              <g key={`seg-${stage.id}`}>
                <path d={arcPath(angle, nextAngle)} fill="none" stroke={segColor} strokeOpacity={isPassed ? 0.85 : 0.5}
                  strokeWidth={2.5} strokeDasharray={isPassed ? '0' : '1 7'} strokeLinecap="round"
                  style={isPassed ? { filter: `drop-shadow(0 0 4px ${NEON_GREEN})` } : undefined} />
                <path d="M -4,-3 L 4,0 L -4,3 Z" fill={segColor} opacity={isPassed ? 0.95 : 0.55}
                  transform={`translate(${midX} ${midY}) rotate(${tangentDeg})`} />
              </g>
            )
          })}

          <circle cx={CX} cy={CY} r={CORE_R} fill="url(#orbitCoreGrad)" />
          {ring(PLANNED_R, overallPlanned, { stroke: PLANNED_COLOR, strokeWidth: 3.5, opacity: 0.7 })}
          {ring(ACTUAL_R, overallActual, {
            stroke: NEON_GREEN, strokeWidth: 4,
            filter: `drop-shadow(0 0 5px ${NEON_GREEN}) drop-shadow(0 0 12px ${NEON_GREEN}aa)`,
          })}

          {nodes.map(({ stage, nx, ny, status, planned }) => {
            const meta = ORBIT_META[status]
            const isSelected = selected === stage.stageKey
            const plannedR = NODE_R + 11
            const actualR = NODE_R + 6
            const plannedLen = ringLen(plannedR)
            const actualLen = ringLen(actualR)
            const plannedDash = (plannedLen * Math.max(0, Math.min(100, planned))) / 100
            const actualDash = (actualLen * Math.max(0, Math.min(100, stage.progress))) / 100
            return (
              <g key={stage.id} transform={`translate(${nx} ${ny})`} style={{ cursor: 'pointer' }}
                onClick={() => { setSelected(stage.stageKey); onSelectStage(stage.stageKey) }}>
                <circle r={NODE_R + 15} fill={meta.color} opacity={isSelected ? 0.28 : 0.14} filter="url(#orbitNodeBlur)" />
                <circle r={plannedR} fill="none" stroke="#020617" strokeOpacity={0.55} strokeWidth={3} />
                <circle r={actualR} fill="none" stroke="#020617" strokeOpacity={0.55} strokeWidth={3.5} />
                <circle r={plannedR} fill="none" stroke={PLANNED_COLOR} strokeWidth={2} strokeLinecap="round"
                  strokeDasharray={`${plannedDash} ${plannedLen - plannedDash}`} transform="rotate(-90)" opacity={0.95} />
                <circle r={actualR} fill="none" stroke={NEON_GREEN} strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray={`${actualDash} ${actualLen - actualDash}`} transform="rotate(-90)" opacity={0.95}
                  style={{ filter: `drop-shadow(0 0 3px ${NEON_GREEN})` }} />
                <circle r={NODE_R} fill={`url(#orbitGrad-${status})`} stroke={isSelected ? '#ffffff' : meta.color}
                  strokeWidth={isSelected ? 3 : 1.5} strokeOpacity={isSelected ? 0.95 : 0.5} />
                {status === 'completed' ? (
                  <foreignObject x={-11} y={-11} width={22} height={22}>
                    <CheckCircle2 size={22} color="#ffffff" />
                  </foreignObject>
                ) : (
                  <text textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={18} fontWeight={800}>
                    {faNum(stage.sequence + 1)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
          <div style={{ maxWidth: 230 }}>
            <p className="text-[11px] font-bold tracking-wide" style={{ color: '#93c5fd' }}>پیشرفت کلی پروژه</p>
            <p className="mt-1.5 text-5xl font-extrabold leading-none text-white">{faNum(overallActual)}<span className="text-xl">٪</span></p>
            <p className="mt-1 text-[11px]" style={{ color: '#cbd5e1' }}>واقعی</p>
            <p className="mt-2 text-xs" style={{ color: '#94a3b8' }}>برنامه‌ای: <b style={{ color: '#e2e8f0' }}>{faNum(overallPlanned)}٪</b></p>
            <p className="mt-1 text-xs font-bold" style={{ color: varianceColor }}>{variance >= 0 ? '+' : ''}{faNum(variance)}٪ — {varianceLabel}</p>
            {activeNode && (
              <p className="mt-2 border-t pt-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,.12)', color: '#93c5fd' }}>
                فاز جاری: <b style={{ color: '#fff' }}>{activeNode.stage.nameFa}</b>
              </p>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0">
          {nodes.map(({ stage, nx, ny, angle, status, planned }) => {
            const meta = ORBIT_META[status]
            const leftPct = (nx / VB) * 100
            const topPct = (ny / VB) * 100
            const rad = (angle * Math.PI) / 180
            const boxSize = NODE_R * 2
            const labelDist = NODE_R + 24
            const titleLeftPct = 50 + ((labelDist * Math.cos(rad)) / boxSize) * 100
            const titleTopPct = 50 + ((labelDist * Math.sin(rad)) / boxSize) * 100
            return (
              <div key={stage.id} className="absolute text-center" style={{
                right: `${100 - leftPct}%`, top: `${topPct}%`,
                width: NODE_R * 2, height: NODE_R * 2, transform: 'translate(50%, -50%)',
              }}>
                <div className="absolute text-center" style={{
                  right: `${100 - titleLeftPct}%`, top: `${titleTopPct}%`, transform: 'translate(50%, -50%)', width: 130, zIndex: 2,
                }}>
                  <span className="text-[10px] font-extrabold leading-tight" style={{ color: meta.color }}>{stage.nameFa}</span>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <span className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-extrabold" style={{ background: `${PLANNED_COLOR}26`, color: PLANNED_COLOR }} title="پیشرفت برنامه‌ای">
                      ب {faNum(Math.round(planned))}٪
                    </span>
                    <span className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-extrabold" style={{ background: `${NEON_GREEN}26`, color: NEON_GREEN }} title="پیشرفت واقعی">
                      و {faNum(Math.round(stage.progress))}٪
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
        {(Object.values(ORBIT_META)).map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  )
}
