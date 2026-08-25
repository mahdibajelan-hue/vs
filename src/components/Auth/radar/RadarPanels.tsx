import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, CircleAlert, Clock, RefreshCw, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  SEVERITY_COLOR, SEVERITY_LABEL_FA, toFa, faMoney,
  type ContractSummary, type EpcDimension, type RadarGate, type RadarLifecycleStage, type RadarSignal,
} from './radarTypes'

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
  pct, size = 56, stroke = 5, color, unit, sub,
}: {
  pct: number
  size?: number
  stroke?: number
  color: string
  /** Appended right after the number, inline (e.g. "٪"). */
  unit?: string
  /** Small caption line below the number (e.g. "READINESS"). */
  sub?: string
}) {
  const animated = useCountUp(pct)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(100, Math.max(0, animated)) / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-sm font-extrabold">{toFa(Math.round(animated))}{unit}</span>
        {sub && <span className="text-[8px] text-muted">{sub}</span>}
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

function PanelTitle({ text, hint, action }: { text: string; hint?: string; action?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[10px] font-bold tracking-wide text-muted">{text}</h3>
      {action ? (
        <span className="cursor-default text-[9px] font-bold" style={{ color: 'var(--radar-cyan)' }}>{action}</span>
      ) : hint ? (
        <span className="text-[9px] text-muted">{hint}</span>
      ) : null}
    </div>
  )
}

/** Ring + big highlighted number/delta + status caption, e.g. "78 /100 → 78 GOOD" for project
 * health or "64% → -8% BEHIND" for schedule performance — matches the four-card performance
 * strip from the reference layout (Project/Time/Cost/Quality Performance). */
export function PerformanceRingCard({
  title, titleEn, pct, ringUnit, ringSub, color, bigValue, bigValueColor, caption, captionColor,
}: {
  title: string
  titleEn: string
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
    <Panel>
      <PanelTitle text={title} hint={titleEn} />
      <div className="flex items-center gap-3">
        <RingGauge pct={pct} color={color} size={60} stroke={6} unit={ringUnit} sub={ringSub} />
        <div className="min-w-0">
          <p className="num text-2xl font-extrabold leading-tight" style={{ color: bigValueColor }}>{bigValue}</p>
          {caption && <p className="text-[10px] font-bold tracking-wide" style={{ color: captionColor }}>{caption}</p>}
        </div>
      </div>
    </Panel>
  )
}

/** Icon-circle + big number + severity-count pill, stacked vertically beside the radar — matches
 * the reference's Active Risks / Open Issues / Delayed Activities / Pending Changes / Upcoming
 * Milestones column. */
export function SignalStatCard({
  icon: Icon, label, labelEn, value, badge, badgeColor, color,
}: {
  icon: LucideIcon
  label: string
  labelEn: string
  value: number
  badge?: string
  badgeColor?: string
  color: string
}) {
  const animated = useCountUp(value, 600)
  return (
    <div className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-bold tracking-wide text-muted">{label}</p>
        <div className="flex items-center gap-2">
          <span className="num text-xl font-extrabold leading-none" style={{ color }}>{toFa(Math.round(animated))}</span>
          {badge && (
            <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold" style={{ borderColor: `color-mix(in srgb, ${badgeColor} 55%, transparent)`, color: badgeColor }}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <span className="eyebrow-en shrink-0 text-[8px] text-muted" dir="ltr">{labelEn}</span>
    </div>
  )
}

export function LifecyclePanel({
  stages, overallPct, floating,
}: {
  stages: RadarLifecycleStage[]
  overallPct: number
  /** Renders borderless/transparent so it blends directly into the radar's own dark scope
   * surface instead of reading as a separate boxed panel next to it. */
  floating?: boolean
}) {
  const current = stages.find((s) => s.state === 'current')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const body = (
    <>
      <PanelTitle text="مسیر چرخه عمر پروژه" hint="LIFECYCLE" />
      <div className="mb-4 flex items-center gap-3">
        <RingGauge pct={overallPct} color="var(--radar-green)" size={64} stroke={6} />
        <div>
          <p className="text-xs font-extrabold">{current?.label ?? '—'}</p>
          <p className="eyebrow-en text-[9px]" dir="ltr">{current?.labelEn}</p>
        </div>
      </div>

      {/* Vertical timeline: one continuous rail with a dot per stage; hovering a stage floats its
          mock date next to the dot, matching the request for a date-on-hover interaction. */}
      <ol className="relative">
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
                {s.state === 'done' ? (
                  <CheckCircle2 size={11} style={{ color: 'var(--radar-green)' }} />
                ) : s.state === 'current' ? (
                  <Circle size={11} className="animate-pulse" style={{ color: 'var(--radar-amber)' }} fill="var(--radar-amber)" />
                ) : (
                  <Circle size={11} className="text-muted" style={{ background: 'var(--bg-panel-solid)', borderRadius: '999px' }} />
                )}
              </span>
              <span className={`cursor-default text-[11px] ${s.state === 'current' ? 'font-extrabold' : s.state === 'upcoming' ? 'text-muted' : 'text-secondary'}`}>
                {s.label}
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
    </>
  )

  return floating ? <div className="p-1">{body}</div> : <Panel>{body}</Panel>
}

export function NextGatePanel({ gate, stages }: { gate: RadarGate; stages: RadarLifecycleStage[] }) {
  return (
    <Panel>
      <PanelTitle text="گیت بعدی" hint="NEXT GATE" />
      <p className="mb-3 text-sm font-extrabold">{gate.name}</p>
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5">
          <GateStatBox label="پیش‌نیاز" value={gate.prerequisites} />
          <GateStatBox label="تایید شده" value={gate.passed} color="var(--radar-green)" />
          <GateStatBox label="در انتظار" value={gate.pending} color="var(--radar-amber)" />
          <GateStatBox label="رد شده" value={gate.failed} color="#ef4444" />
        </div>
        <RingGauge pct={gate.readinessPct} color="var(--radar-green)" size={68} stroke={6} unit="٪" sub="آمادگی" />
      </div>
      <GateStageStepper stages={stages} />
    </Panel>
  )
}

function GateStatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border px-1.5 py-2 text-center" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="num text-lg font-extrabold leading-tight" style={{ color }}>{toFa(value)}</p>
      <p className="mt-0.5 truncate text-[8px] font-bold tracking-wide text-muted">{label}</p>
    </div>
  )
}

/** Horizontal stage roadmap under the gate stats — same done/current/upcoming semantics as the
 * vertical LifecyclePanel timeline, rendered as a connected dot-and-line strip. */
function GateStageStepper({ stages }: { stages: RadarLifecycleStage[] }) {
  return (
    <div className="relative mt-5">
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
  )
}

export function CriticalSignalsPanel({ signals, onSelect }: { signals: RadarSignal[]; onSelect?: (s: RadarSignal) => void }) {
  const top5 = [...signals]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.radius - b.radius)
    .slice(0, 5)
  return (
    <Panel>
      <PanelTitle text="۵ سیگنال بحرانی برتر" hint="TOP 5 CRITICAL SIGNALS" />
      <ul className="space-y-1.5">
        {top5.map((s, i) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect?.(s)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-right transition-colors hover:bg-white/5"
            >
              <span className="num w-4 shrink-0 text-[10px] text-muted">{toFa(i + 1)}</span>
              {(() => {
                const Icon = signalIcon(s)
                return <Icon size={13} className="shrink-0" style={{ color: SEVERITY_COLOR[s.severity] }} />
              })()}
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{s.title}</span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: `color-mix(in srgb, ${SEVERITY_COLOR[s.severity]} 18%, transparent)`, color: SEVERITY_COLOR[s.severity] }}
              >
                {SEVERITY_LABEL_FA[s.severity]}
              </span>
              <span className="num shrink-0 text-[10px] text-muted">{s.detail}</span>
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
      <PanelTitle text="برج کنترل EPC" hint="سه بُعد یک مرحله، نه سه ماژول جدا" />
      <div className="space-y-3">
        {dims.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-bold">{d.label}</span>
              <span className="eyebrow-en text-muted" dir="ltr">{d.labelEn}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${d.pct}%`, background: 'linear-gradient(90deg, var(--radar-cyan), var(--radar-green))' }}
              />
            </div>
            <p className="num mt-1 text-left text-[10px] text-muted" dir="ltr">{toFa(d.pct)}٪</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function ContractPanel({ contract }: { contract: ContractSummary }) {
  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'ارزش قرارداد', value: `${contract.currency}${faMoney(contract.contractValue)}M` },
    { label: 'تغییرات تاییدشده', value: `${contract.currency}${faMoney(contract.approvedChanges)}M` },
    { label: 'ادعاها (Claims)', value: `${contract.currency}${faMoney(contract.claims)}M`, color: 'var(--radar-amber)' },
    { label: 'ادعای تمدید زمان', value: `${toFa(contract.eotClaimsDays)} روز`, color: 'var(--radar-amber)' },
    { label: 'پرداخت‌شده', value: `${contract.currency}${faMoney(contract.paid)}M`, color: 'var(--radar-green)' },
    { label: 'حسن انجام کار', value: `${contract.currency}${faMoney(contract.retention)}M` },
  ]
  return (
    <Panel>
      <PanelTitle text="خلاصه قرارداد" action="مشاهده جزئیات" />
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
          <RingGauge pct={contract.paidPct} color="var(--radar-cyan)" size={80} stroke={7} unit="٪" sub="پرداخت‌شده" />
        </div>
      </div>
    </Panel>
  )
}

export { Panel, PanelTitle, RingGauge }
