import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Clock, RefreshCw, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SEVERITY_COLOR, SEVERITY_LABEL_EN,
  type ContractSummary, type EpcDimension, type RadarGate, type RadarLifecycleStage, type RadarSignal,
} from './radarTypes'

function money(n: number): string {
  return n.toLocaleString('en-US')
}

/** Counts up from 0 to `value` once on mount/value-change — the one JS-driven animation in this
 * feature; everything else (sweep, pulse, glow) is pure CSS. */
function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) * (1 - t)
      setDisplay(from + (value - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}

function RingGauge({
  pct, size = 56, stroke = 5, color, unit, sub, center,
  innerPct, innerColor, innerStroke,
}: {
  pct: number
  size?: number
  stroke?: number
  color: string
  /** Appended right after the number, inline (e.g. "%"). */
  unit?: string
  /** Small caption line below the number (e.g. "READINESS"). */
  sub?: string
  /** Fully custom center content, overriding the default number/unit/sub display. */
  center?: ReactNode
  /** Optional second, smaller ring nested inside the main one — e.g. the current phase's own
   * progress drawn inside the overall master-plan progress ring. Omit for a plain single ring. */
  innerPct?: number
  innerColor?: string
  innerStroke?: number
}) {
  const animated = useCountUp(pct)
  const innerAnimated = useCountUp(innerPct ?? 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(100, Math.max(0, animated)) / 100)

  const hasInner = innerPct !== undefined
  const iStroke = innerStroke ?? Math.max(3, stroke - 2)
  const iR = Math.max(0, r - stroke / 2 - iStroke / 2 - 3)
  const iC = 2 * Math.PI * iR
  const iOffset = iC * (1 - Math.min(100, Math.max(0, innerAnimated)) / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
        {hasInner && (
          <>
            <circle cx={size / 2} cy={size / 2} r={iR} fill="none" stroke="var(--border-soft)" strokeWidth={iStroke} opacity={0.6} />
            <circle
              cx={size / 2} cy={size / 2} r={iR} fill="none" stroke={innerColor ?? color} strokeWidth={iStroke} strokeLinecap="round"
              strokeDasharray={iC} strokeDashoffset={iOffset} style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {center ?? (
          <>
            <span className="num text-sm font-extrabold">{Math.round(animated)}{unit}</span>
            {sub && <span className="text-[8px] font-bold tracking-wide text-muted">{sub}</span>}
          </>
        )}
      </div>
    </div>
  )
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-panel rounded-2xl border p-3.5 ${className}`} style={{ borderColor: 'var(--border-soft)' }}>
      {children}
    </div>
  )
}

function PanelTitle({ text, action }: { text: string; action?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h3 className="text-[11px] font-bold tracking-wide text-muted">{text}</h3>
      {action && <span className="cursor-default text-[9px] font-bold" style={{ color: 'var(--radar-cyan)' }}>{action}</span>}
    </div>
  )
}

/** Ring + big highlighted number/delta + status caption, e.g. "78 /100 → 78 GOOD" for project
 * health or "64% → -8% BEHIND" for schedule performance — matches the four-card performance
 * strip from the reference layout (Project/Time/Cost/Quality Performance). */
export function PerformanceRingCard({
  title, pct, ringUnit, ringSub, color, bigValue, bigValueColor, caption, captionColor,
}: {
  title: string
  pct: number
  ringUnit?: string
  ringSub?: string
  color: string
  bigValue: string
  bigValueColor: string
  caption?: string
  captionColor?: string
}) {
  return (
    <div className="p-1">
      <PanelTitle text={title} />
      <div className="flex items-center gap-4">
        <RingGauge pct={pct} color={color} size={64} stroke={6} unit={ringUnit} sub={ringSub} />
        <div className="min-w-0 flex-1">
          <p className="num text-lg font-extrabold leading-tight" style={{ color: bigValueColor, overflowWrap: 'break-word' }}>{bigValue}</p>
          {caption && <p className="mt-1.5 text-[10px] font-bold tracking-wide" style={{ color: captionColor }}>{caption}</p>}
        </div>
      </div>
    </div>
  )
}

/** Icon-circle + big number + severity-count pill, stacked vertically beside the radar — matches
 * the reference's Active Risks / Open Issues / Delayed Activities / Pending Changes / Upcoming
 * Milestones column. */
export function SignalStatCard({
  icon: Icon, label, value, badge, badgeColor, color,
}: {
  icon: LucideIcon
  label: string
  value: number
  badge?: string
  badgeColor?: string
  color: string
}) {
  const animated = useCountUp(value, 600)
  return (
    <div className="p-1.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          <Icon size={22} style={{ color }} />
        </div>
        <p className="truncate text-[9px] font-bold tracking-wide text-muted">{label}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="num text-xl font-extrabold leading-none" style={{ color }}>{Math.round(animated)}</span>
        {badge && (
          <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold" style={{ borderColor: `color-mix(in srgb, ${badgeColor} 55%, transparent)`, color: badgeColor }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

export function LifecyclePanel({ stages, overallPct }: { stages: RadarLifecycleStage[]; overallPct: number }) {
  const current = stages.find((s) => s.state === 'current')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col p-1">
      <PanelTitle text="LIFECYCLE PROGRESS" />
      <div className="mb-4 flex justify-center">
        {/* Outer ring: overall project progress averaged across every stage's own completion (the
            master-plan view). Inner ring: just the current stage's own progress — the two read
            together instead of the ring only ever being able to show one number. */}
        <RingGauge
          pct={overallPct} color="var(--radar-green)" size={100} stroke={6}
          innerPct={current?.progressPct} innerColor="var(--radar-amber)" innerStroke={4}
          center={
            <div className="flex flex-col items-center justify-center leading-none">
              <span className="text-[11px] font-extrabold">{current?.labelEn ?? '—'}</span>
              <span className="num mt-1 text-[15px] font-extrabold" style={{ color: 'var(--radar-green)' }}>{Math.round(overallPct)}%</span>
              <span className="mt-0.5 text-[6px] font-bold tracking-wide text-muted">OVERALL</span>
              {current && (
                <span className="num mt-1 flex items-center gap-0.5 text-[9px] font-extrabold" style={{ color: 'var(--radar-amber)' }}>
                  {Math.round(current.progressPct)}%
                  <span className="text-[5.5px] font-bold tracking-wide text-muted">PHASE</span>
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* Vertical timeline: one continuous rail with a dot per stage; hovering a stage floats its
          mock date next to the dot, matching the request for a date-on-hover interaction. */}
      <ol className="relative flex-1">
        <div className="absolute bottom-2 top-2 w-px" style={{ insetInlineStart: '5px', background: 'var(--border-soft)' }} />
        {stages.map((s) => {
          const isHovered = hoveredKey === s.key
          return (
            <li
              key={s.key}
              className="relative flex items-start gap-3 py-1.5"
              onMouseEnter={() => setHoveredKey(s.key)}
              onMouseLeave={() => setHoveredKey((v) => (v === s.key ? null : v))}
            >
              <span className="relative z-10 mt-0.5 shrink-0">
                {s.state === 'current' ? (
                  <CheckCircle2 size={12} className="animate-pulse" style={{ color: 'var(--radar-amber)' }} />
                ) : (
                  <CheckCircle2
                    size={12}
                    style={{ color: s.state === 'done' ? 'var(--radar-green)' : 'var(--border-soft)' }}
                  />
                )}
              </span>
              <span
                className={`cursor-default text-[11px] font-bold uppercase tracking-wide ${s.state === 'current' ? '' : s.state === 'upcoming' ? 'text-muted' : 'text-secondary'}`}
                style={{ color: s.state === 'current' ? 'var(--radar-amber)' : undefined }}
              >
                {s.labelEn}
              </span>

              {isHovered && (
                <span
                  className="radar-callout pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold shadow-xl"
                  style={{
                    insetInlineStart: 0, bottom: '100%', marginBottom: '4px',
                    borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)',
                  }}
                >
                  {s.dateFa}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function NextGatePanel({ gate, stages }: { gate: RadarGate; stages: RadarLifecycleStage[] }) {
  return (
    <Panel>
      <PanelTitle text="NEXT GATE" />
      <p className="mb-3 text-lg font-extrabold">{gate.nameEn}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <GateStatBox label="PREREQUISITES" value={gate.prerequisites} />
          <GateStatBox label="PASSED" value={gate.passed} color="var(--radar-green)" />
          <GateStatBox label="PENDING" value={gate.pending} color="var(--radar-amber)" />
          <GateStatBox label="FAILED" value={gate.failed} color="#ef4444" />
        </div>
        <RingGauge pct={gate.readinessPct} color="var(--radar-green)" size={72} stroke={6} unit="%" sub="READINESS" />
      </div>
      <GateStageStepper stages={stages} />
    </Panel>
  )
}

function GateStatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border px-1.5 py-2.5 text-center" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="num text-xl font-extrabold leading-tight" style={{ color }}>{value}</p>
      <p className="mt-1 truncate text-[7.5px] font-bold tracking-wide text-muted">{label}</p>
    </div>
  )
}

/** Horizontal stage roadmap under the gate stats — same done/current/upcoming semantics as the
 * vertical LifecyclePanel timeline, rendered as a connected dot-and-line strip. */
function GateStageStepper({ stages }: { stages: RadarLifecycleStage[] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <div className="relative" style={{ minWidth: `${stages.length * 46}px` }}>
        <div className="absolute inset-x-1 top-[7px] h-px" style={{ background: 'var(--border-soft)' }} />
        <div className="relative grid items-start" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((s) => (
            <div key={s.key} className="flex min-w-0 flex-col items-center gap-1.5 px-px">
              {s.state === 'done' ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: 'var(--radar-green)' }} />
              ) : s.state === 'current' ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <span className="absolute h-2.5 w-2.5 rounded-full" style={{ background: 'var(--radar-cyan)', boxShadow: '0 0 10px 3px color-mix(in srgb, var(--radar-cyan) 70%, transparent)' }} />
                  <span className="absolute h-4 w-4 rounded-full border" style={{ borderColor: 'var(--radar-cyan)' }} />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }} />
              )}
              <span
                className="block w-full text-center text-[6.5px] font-bold leading-[1.15] text-muted"
                dir="ltr"
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.01em',
                  overflowWrap: 'anywhere',
                  color: s.state === 'current' ? 'var(--radar-cyan)' : undefined,
                }}
              >
                {s.labelEn}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CriticalSignalsPanel({ signals, onSelect }: { signals: RadarSignal[]; onSelect?: (s: RadarSignal) => void }) {
  const top5 = [...signals]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.radius - b.radius)
    .slice(0, 5)
  return (
    <Panel>
      <PanelTitle text="TOP 5 CRITICAL SIGNALS" action="VIEW ALL" />
      <ul className="space-y-1.5">
        {top5.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect?.(s)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/5"
            >
              {(() => {
                const Icon = signalIcon(s)
                return <Icon size={13} className="shrink-0" style={{ color: SEVERITY_COLOR[s.severity] }} />
              })()}
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{s.titleEn}</span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: `color-mix(in srgb, ${SEVERITY_COLOR[s.severity]} 18%, transparent)`, color: SEVERITY_COLOR[s.severity] }}
              >
                {SEVERITY_LABEL_EN[s.severity]}
              </span>
              <span className="num shrink-0 text-[10px] text-muted">{s.detailEn}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function severityRank(s: RadarSignal['severity']): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s]
}
function signalIcon(s: RadarSignal): LucideIcon {
  return { risk: ShieldAlert, issue: CircleAlert, delay: Clock, change: RefreshCw, milestone: CheckCircle2, contract: CircleAlert, gate: AlertTriangle }[s.category]
}

export function EpcPanel({ dims }: { dims: EpcDimension[] }) {
  return (
    <Panel>
      <PanelTitle text="EPC COMMAND CENTER" />
      <div className="space-y-3">
        {dims.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-bold uppercase tracking-wide">{d.labelEn}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${d.pct}%`, background: 'linear-gradient(90deg, var(--radar-cyan), var(--radar-green))' }}
              />
            </div>
            <p className="num mt-1 text-right text-[10px] text-muted">{d.pct}%</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function ContractPanel({ contract }: { contract: ContractSummary }) {
  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'CONTRACT VALUE', value: `${contract.currency}${money(contract.contractValue)}M` },
    { label: 'APPROVED CHANGES', value: `${contract.currency}${money(contract.approvedChanges)}M` },
    { label: 'CLAIMS', value: `${contract.currency}${money(contract.claims)}M`, color: 'var(--radar-amber)' },
    { label: 'EOT CLAIMS', value: `${contract.eotClaimsDays} Days`, color: 'var(--radar-amber)' },
    { label: 'PAYMENTS', value: `${contract.currency}${money(contract.paid)}M`, color: 'var(--radar-green)' },
    { label: 'RETENTION', value: `${contract.currency}${money(contract.retention)}M` },
  ]
  return (
    <Panel>
      <PanelTitle text="CONTRACT SUMMARY" action="VIEW DETAILS" />
      <div className="flex items-start gap-3">
        <ul className="min-w-0 flex-1 space-y-1.5 text-[11px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between border-t pt-1.5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border-soft)' }}>
              <span className="text-muted">{r.label}</span>
              <span className="num font-bold" style={{ color: r.color }}>{r.value}</span>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
          <RingGauge pct={contract.paidPct} color="var(--radar-cyan)" size={84} stroke={7} unit="%" sub="PAID" />
        </div>
      </div>
    </Panel>
  )
}

export { Panel, PanelTitle, RingGauge }
