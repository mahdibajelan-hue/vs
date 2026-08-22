import { Lock, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react'
import type { StageReadiness } from '../lib/readiness'
import {
  GATE_STATUS_LABEL_FA, HEALTH_DIMENSION_LABEL_FA, HEALTH_STATUS_LABEL_FA, STAGE_LABEL_FA,
  type GateStatus, type HealthDimension, type HealthStatus, type ProjectGate, type StageKey,
} from '../types'
import { STATUS_COLOR, STATUS_TEXT_COLOR, faNum } from './ui'

/* ------------------------------------------------------------------ gauge */

/**
 * Overall health as a single arc, with the driving dimension named underneath.
 *
 * A ring rather than a bar because the score is a standing verdict, not progress toward
 * something — nothing here is filling up. The arc stops at 270° so the gap reads as a dial
 * rather than a pie.
 */
export function HealthGauge({
  score, status, drivenBy, isOverridden,
}: {
  score: number
  status: HealthStatus
  drivenBy: HealthDimension | null
  isOverridden: boolean
}) {
  const R = 52
  const CIRC = 2 * Math.PI * R
  const SWEEP = 0.75 // 270°
  const track = CIRC * SWEEP
  const filled = track * (Math.max(0, Math.min(100, score)) / 100)

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="relative" dir="ltr">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img"
          aria-label={`سلامت کلی ${score} از ۱۰۰ — ${HEALTH_STATUS_LABEL_FA[status]}`}>
          <g transform="rotate(135 66 66)">
            <circle
              cx="66" cy="66" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
              stroke="rgba(148,163,184,0.16)" strokeDasharray={`${track} ${CIRC}`}
            />
            <circle
              className="plc-gauge-arc"
              cx="66" cy="66" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
              stroke={STATUS_COLOR[status]}
              strokeDasharray={`${filled} ${CIRC}`}
              style={{ filter: `drop-shadow(0 0 7px ${STATUS_COLOR[status]}66)` }}
            />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" dir="rtl">
          <span className="plc-figure" style={{ color: STATUS_TEXT_COLOR[status] }}>{faNum(score)}</span>
          <span className="mt-0.5 text-[9px] text-muted">از ۱۰۰</span>
        </div>
      </div>

      <span
        className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white"
        style={{ background: STATUS_COLOR[status] }}
      >
        {HEALTH_STATUS_LABEL_FA[status]}
      </span>

      <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
        {isOverridden
          ? 'تعیین‌شده به‌صورت دستی'
          : drivenBy
            ? <>تعیین‌شده توسط بُعد «<b className="text-secondary">{HEALTH_DIMENSION_LABEL_FA[drivenBy]}</b>»<br />بدترین بُعد، نه میانگین</>
            // `black` outranks every dimension score, so it can reach here with no driver named —
            // saying "all dimensions healthy" under a Blocked dial would be flatly wrong.
            : status === 'black'
              ? 'گیت مسدود، وضعیت را تعیین کرده است'
              : 'همه ابعاد در محدوده سالم'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ gate ladder */

const GATE_TONE: Record<GateStatus, string> = {
  approved: STATUS_TEXT_COLOR.green,
  ready: '#38bdf8',
  in_progress: STATUS_TEXT_COLOR.yellow,
  not_started: '#94a3b8',
  rejected: STATUS_TEXT_COLOR.red,
  blocked: STATUS_TEXT_COLOR.red,
}

function GateGlyph({ status, color }: { status: GateStatus; color: string }) {
  const p = { size: 13, style: { color } }
  if (status === 'approved') return <ShieldCheck {...p} />
  if (status === 'blocked' || status === 'rejected') return <ShieldX {...p} />
  if (status === 'ready') return <ShieldCheck {...p} />
  return <ShieldQuestion {...p} />
}

/**
 * The five gates as a ladder.
 *
 * A gate in this domain behaves like a valve: open or shut, never 40% open. So it gets a list
 * with a hard verdict per row and the blocker count that keeps it shut — not a progress bar,
 * which would imply the wrong physics.
 */
export function GateLadder({
  gates, gateStatuses, readiness, currentStageKey, onOpenStage,
}: {
  gates: ProjectGate[]
  gateStatuses: Map<string, GateStatus>
  readiness: StageReadiness[]
  currentStageKey: string
  onOpenStage: (stageKey: string) => void
}) {
  if (gates.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted">گیتی برای این پروژه تعریف نشده است</p>
  }

  return (
    <ul className="space-y-1">
      {gates.map((gate) => {
        const status = gateStatuses.get(gate.stageKey) ?? gate.status
        const tone = GATE_TONE[status]
        const r = readiness.find((x) => x.stageKey === gate.stageKey)
        const blockers = r?.blockers.length ?? 0
        const isCurrent = gate.stageKey === currentStageKey

        return (
          <li key={gate.id}>
            <button
              onClick={() => onOpenStage(gate.stageKey)}
              className="plc-gate-row flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-right"
              style={{
                borderColor: isCurrent ? 'rgba(56,189,248,0.4)' : 'var(--border-soft)',
                background: isCurrent ? 'rgba(56,189,248,0.06)' : undefined,
              }}
            >
              <GateGlyph status={status} color={tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold">{gate.name}</span>
                <span className="block truncate text-[9px] text-muted">
                  {STAGE_LABEL_FA[gate.stageKey as StageKey] ?? gate.stageKey}
                </span>
              </span>
              <span className="shrink-0 text-left">
                <span className="block text-[10px] font-extrabold" style={{ color: tone }}>
                  {GATE_STATUS_LABEL_FA[status]}
                </span>
                {blockers > 0 && (
                  <span className="flex items-center justify-end gap-0.5 text-[9px]" style={{ color: STATUS_TEXT_COLOR.red }}>
                    <Lock size={8} /> {faNum(blockers)} مانع
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ----------------------------------------------------------------- waffle */

/**
 * Mandatory-checklist completion as a 10×10 waffle instead of another donut.
 *
 * A waffle shows the count, not just the ratio — a manager can see "eleven items left" by
 * looking, which a percentage hides. Overdue items get their own colour so the grid says
 * what is late, not merely what is unfinished.
 */
export function ReadinessWaffle({ readiness }: { readiness: StageReadiness | null }) {
  if (!readiness || readiness.mandatoryTotal === 0) {
    return <p className="py-8 text-center text-[11px] text-muted">بند الزامی برای مرحله جاری ثبت نشده است</p>
  }

  const total = readiness.mandatoryTotal
  const done = readiness.mandatoryDone
  const overdue = Math.min(readiness.overdueCount, total - done)
  const remaining = total - done - overdue

  // 100 cells stand for the whole; each cell is one percentage point of the mandatory set.
  const cells = 100
  const doneCells = Math.round((done / total) * cells)
  const overdueCells = Math.round((overdue / total) * cells)
  const bucket = (i: number) =>
    i < doneCells ? 'done' : i < doneCells + overdueCells ? 'overdue' : 'todo'

  const COLOR = {
    done: STATUS_COLOR.green,
    overdue: STATUS_COLOR.red,
    todo: 'rgba(148,163,184,0.18)',
  } as const

  return (
    <div>
      <div className="mb-2.5 flex items-end justify-between gap-2">
        <div>
          <span className="plc-figure">{faNum(done)}</span>
          <span className="mr-1 text-[11px] text-muted">از {faNum(total)} بند الزامی</span>
        </div>
        <span className="text-[11px] font-extrabold" style={{ color: readiness.isReady ? STATUS_TEXT_COLOR.green : STATUS_TEXT_COLOR.yellow }}>
          {faNum(readiness.percent)}٪
        </span>
      </div>

      {/* Capped: at full tile width a 10×10 grid renders ~40px blocks, which turns a quiet
          proportion read into a hundred shouting squares. */}
      <div className="plc-waffle max-w-[190px]" dir="ltr" role="img"
        aria-label={`${done} از ${total} بند الزامی تکمیل شده، ${overdue} بند دارای تأخیر`}>
        {Array.from({ length: cells }, (_, i) => {
          const b = bucket(i)
          return (
            <span
              key={i}
              className="plc-waffle-cell"
              style={{ background: COLOR[b], animationDelay: `${i * 4}ms` }}
            />
          )
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted">
        <Swatch color={COLOR.done} label={`تکمیل‌شده (${faNum(done)})`} />
        {overdue > 0 && <Swatch color={COLOR.overdue} label={`دارای تأخیر (${faNum(overdue)})`} />}
        <Swatch color={COLOR.todo} label={`باقی‌مانده (${faNum(remaining)})`} />
      </div>
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  )
}
