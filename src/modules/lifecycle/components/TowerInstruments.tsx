import { Fragment, useState } from 'react'
import { ChevronDown, HardHat, Lock, Ruler, ShieldCheck, ShieldQuestion, ShieldX, ShoppingCart } from 'lucide-react'
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

/** Engineering, procurement and execution run as one contracting package in an EPC delivery
 * model — the ladder folds them into a single "گیت EPC" row so the list reads as governance
 * checkpoints, not an inventory of every stage. Neither engineering nor procurement carries its
 * own gate in the default template (only execution's "تکمیل مکانیکی" does), so this row is the
 * only checkpoint that ever existed for the design/buy phase — not a re-labelling of one that was
 * already there. */
const EPC_STAGE_KEYS: StageKey[] = ['engineering', 'procurement', 'execution']

/** One glyph per phase in the seal's node track — a drafting tool, a cart, a hard hat, joined by
 * a brass wire. The point is to make "three phases, one gate" legible before anyone reads text. */
const EPC_NODE_ICON: Partial<Record<StageKey, React.ReactNode>> = {
  engineering: <Ruler size={8.5} />,
  procurement: <ShoppingCart size={8.5} />,
  execution: <HardHat size={8.5} />,
}

/**
 * Gates as a ladder — the EPC trio folded into one expandable row.
 *
 * A gate in this domain behaves like a valve: open or shut, never 40% open. So it gets a list
 * with a hard verdict per row and the blocker count that keeps it shut — not a progress bar,
 * which would imply the wrong physics. The EPC row states the worst of the three sub-phases and
 * expands in place to name which one; clicking a sub-row still goes to that phase's own checklist
 * and gate, same as every other row.
 */
export function GateLadder({
  gates, gateStatuses, readiness, currentStageKey, stageOrder, onOpenStage,
}: {
  gates: ProjectGate[]
  gateStatuses: Map<string, GateStatus>
  readiness: StageReadiness[]
  currentStageKey: string
  /** Full stage sequence (all 11 keys) — used only to place the synthetic EPC row at the right
   * position among the real gates, and to know which of the three EPC phases actually exist for
   * this project's template. */
  stageOrder: string[]
  onOpenStage: (stageKey: string) => void
}) {
  const [epcOpen, setEpcOpen] = useState(() => EPC_STAGE_KEYS.includes(currentStageKey as StageKey))

  const epcPresentKeys = EPC_STAGE_KEYS.filter((k) => stageOrder.includes(k))
  const otherGates = gates.filter((g) => !EPC_STAGE_KEYS.includes(g.stageKey as StageKey))

  if (gates.length === 0 && epcPresentKeys.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted">گیتی برای این پروژه تعریف نشده است</p>
  }

  type Row = { sortIndex: number; render: () => React.ReactNode }
  const rows: Row[] = otherGates.map((gate) => ({
    sortIndex: stageOrder.indexOf(gate.stageKey),
    render: () => <GateRow key={gate.id} gate={gate} status={gateStatuses.get(gate.stageKey) ?? gate.status}
      blockers={readiness.find((r) => r.stageKey === gate.stageKey)?.blockers.length ?? 0}
      isCurrent={gate.stageKey === currentStageKey} onOpenStage={onOpenStage} />,
  }))

  if (epcPresentKeys.length > 0) {
    const epcReadiness = readiness.filter((r) => epcPresentKeys.includes(r.stageKey as StageKey))
    const epcGates = gates.filter((g) => epcPresentKeys.includes(g.stageKey as StageKey))
    const epcBlockers = epcReadiness.reduce((n, r) => n + r.blockers.length, 0)
    const epcAnyBlocked = epcGates.some((g) => {
      const s = gateStatuses.get(g.stageKey) ?? g.status
      return s === 'blocked' || s === 'rejected'
    })
    const epcAllApproved = epcGates.length > 0 && epcGates.every((g) => (gateStatuses.get(g.stageKey) ?? g.status) === 'approved')
    const epcStatus: GateStatus =
      epcAnyBlocked ? 'blocked'
      : epcBlockers > 0 ? 'in_progress'
      : epcAllApproved ? 'approved'
      : epcReadiness.length > 0 && epcReadiness.every((r) => r.isReady) ? 'ready'
      : epcReadiness.some((r) => r.percent > 0) ? 'in_progress'
      : 'not_started'
    const epcTone = GATE_TONE[epcStatus]
    const epcIsCurrent = EPC_STAGE_KEYS.includes(currentStageKey as StageKey)

    rows.push({
      sortIndex: Math.min(...epcPresentKeys.map((k) => stageOrder.indexOf(k)).filter((i) => i >= 0)),
      render: () => (
        <li key="epc">
          <button
            onClick={() => setEpcOpen((v) => !v)}
            className="plc-gate-row plc-epc-row flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-right"
            style={{
              borderColor: epcIsCurrent
                ? 'color-mix(in srgb, var(--plc-amber) 55%, transparent)'
                : 'color-mix(in srgb, var(--plc-amber) 32%, var(--border-soft))',
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--plc-amber) ' + (epcIsCurrent ? '18%' : '10%') + ', transparent), transparent 65%)',
            }}
          >
            <span className="plc-epc-track" dir="ltr" style={{ width: epcPresentKeys.length * 15 + (epcPresentKeys.length - 1) * 5 }}>
              {epcPresentKeys.map((k, i) => (
                <Fragment key={k}>
                  <span className="plc-epc-node">{EPC_NODE_ICON[k]}</span>
                  {i < epcPresentKeys.length - 1 && <span className="plc-epc-wire" />}
                </Fragment>
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[11px] font-bold">گیت EPC</span>
                <span className="plc-epc-badge">یکپارچه</span>
              </span>
              <span className="mt-0.5 block truncate text-[9px] text-muted">
                {epcPresentKeys.map((k) => STAGE_LABEL_FA[k]).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 text-left">
              <span className="block text-[10px] font-extrabold" style={{ color: epcTone }}>
                {GATE_STATUS_LABEL_FA[epcStatus]}
              </span>
              {epcBlockers > 0 && (
                <span className="flex items-center justify-end gap-0.5 text-[9px]" style={{ color: STATUS_TEXT_COLOR.red }}>
                  <Lock size={8} /> {faNum(epcBlockers)} مانع
                </span>
              )}
            </span>
            <ChevronDown size={13} className="shrink-0 transition-transform" style={{ color: 'var(--plc-amber)', transform: epcOpen ? 'rotate(180deg)' : undefined }} />
          </button>

          {epcOpen && (
            <ul className="mt-1 space-y-1 border-e-2 pe-0 ps-3" style={{ borderColor: 'color-mix(in srgb, var(--plc-amber) 35%, transparent)', marginInlineEnd: 6 }}>
              {epcPresentKeys.map((k) => {
                const g = epcGates.find((gate) => gate.stageKey === k)
                const r = epcReadiness.find((x) => x.stageKey === k)
                const status: GateStatus = g
                  ? gateStatuses.get(g.stageKey) ?? g.status
                  : r?.isReady ? 'ready' : r && r.percent > 0 ? 'in_progress' : 'not_started'
                return (
                  <SubGateRow
                    key={k}
                    stageKey={k}
                    gateName={g?.name ?? null}
                    status={status}
                    blockers={r?.blockers.length ?? 0}
                    isCurrent={k === currentStageKey}
                    onOpenStage={onOpenStage}
                  />
                )
              })}
            </ul>
          )}
        </li>
      ),
    })
  }

  return <ul className="space-y-1">{rows.sort((a, b) => a.sortIndex - b.sortIndex).map((r) => r.render())}</ul>
}

function GateRow({ gate, status, blockers, isCurrent, onOpenStage }: {
  gate: ProjectGate
  status: GateStatus
  blockers: number
  isCurrent: boolean
  onOpenStage: (stageKey: string) => void
}) {
  const tone = GATE_TONE[status]
  return (
    <li>
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
}

/** A sub-phase row inside the expanded EPC group. Same information as a full gate row, quieter
 * styling, and it opens the real StageGatePage for that phase — the EPC row is a lens onto the
 * three real stages, never a fourth record of its own. */
function SubGateRow({ stageKey, gateName, status, blockers, isCurrent, onOpenStage }: {
  stageKey: string
  gateName: string | null
  status: GateStatus
  blockers: number
  isCurrent: boolean
  onOpenStage: (stageKey: string) => void
}) {
  const tone = GATE_TONE[status]
  return (
    <li>
      <button
        onClick={() => onOpenStage(stageKey)}
        className="plc-gate-row flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-right"
        style={{
          borderColor: isCurrent ? 'color-mix(in srgb, var(--plc-amber) 40%, transparent)' : 'var(--border-soft)',
          background: isCurrent ? 'color-mix(in srgb, var(--plc-amber) 8%, transparent)' : 'rgba(255,255,255,0.015)',
        }}
      >
        <GateGlyph status={status} color={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-bold">
            {STAGE_LABEL_FA[stageKey as StageKey] ?? stageKey}
          </span>
          {gateName && <span className="block truncate text-[9px] text-muted">{gateName}</span>}
        </span>
        <span className="shrink-0 text-left">
          <span className="block text-[9px] font-extrabold" style={{ color: tone }}>
            {GATE_STATUS_LABEL_FA[status]}
          </span>
          {blockers > 0 && (
            <span className="flex items-center justify-end gap-0.5 text-[8px]" style={{ color: STATUS_TEXT_COLOR.red }}>
              <Lock size={7} /> {faNum(blockers)}
            </span>
          )}
        </span>
      </button>
    </li>
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
