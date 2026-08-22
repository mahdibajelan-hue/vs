import { useMemo } from 'react'
import { Check, Diamond, MapPin } from 'lucide-react'
import { deriveMilestoneStatus } from '../lib/milestones'
import {
  GATE_STATUS_LABEL_FA, MILESTONE_STATUS_LABEL_FA, STAGE_LABEL_EN, STAGE_LABEL_FA,
  type GateStatus, type Milestone, type ProjectGate, type ProjectStage, type StageKey,
} from '../types'
import { STATUS_COLOR, fa, faNum } from './ui'

/**
 * The project journey — "where is this project, right now?"
 *
 * Two readings of the same question, stacked, because managers ask it in two different senses:
 *
 *   1. The RAIL answers it in governance terms — which of the eleven stages the project occupies,
 *      how many gates it has already cleared, and which gate stands in front of it. Position on
 *      the rail is sequence, not time: the stages are equally spaced because they are steps in a
 *      procedure, and stretching them by duration would imply a precision the data does not have.
 *
 *   2. The RIBBON answers it in calendar terms — the baseline window, today's position inside it,
 *      the forecast overrun hatched past the baseline finish, and every milestone pinned where its
 *      date actually falls.
 *
 * The beacon on the current node is the one loud element on the page; everything else is quiet so
 * that it reads instantly.
 */
export function ProjectJourneyTimeline({
  stages, gates, milestones, currentStageKey, gateStatuses, stageEnteredAt,
  baselineFinish, forecastFinish, onSelectStage,
}: {
  stages: ProjectStage[]
  gates: ProjectGate[]
  milestones: Milestone[]
  currentStageKey: string
  gateStatuses: Map<string, GateStatus>
  stageEnteredAt: string | null
  baselineFinish: string | null
  forecastFinish: string | null
  onSelectStage?: (stageKey: string) => void
}) {
  const ordered = useMemo(() => [...stages].sort((a, b) => a.sequence - b.sequence), [stages])
  const currentIndex = ordered.findIndex((s) => s.stageKey === currentStageKey)
  const total = ordered.length

  // The rail is filled to the CENTRE of the current node: the project has arrived here, it has
  // not passed through. Filling to the far edge would silently claim the stage is finished.
  const fillPct = total <= 1 ? 0 : currentIndex < 0 ? 0 : (currentIndex / (total - 1)) * 100

  const passedGates = ordered.filter(
    (s, i) => i < Math.max(currentIndex, 0) && (gateStatuses.get(s.stageKey) ?? 'not_started') === 'approved',
  ).length
  const totalGates = gates.length
  const daysInStage = stageEnteredAt ? daysSince(stageEnteredAt) : null
  const nextGate = currentIndex >= 0 ? gates.find((g) => g.stageKey === currentStageKey) : undefined
  const nextGateStatus = nextGate ? gateStatuses.get(nextGate.stageKey) ?? nextGate.status : null

  return (
    <div className="plc-hero rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--border-soft)' }}>
      {/* Headline */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted" dir="ltr">Project Journey</p>
          <h2 className="text-lg font-extrabold leading-tight">
            پروژه هم‌اکنون در مرحله{' '}
            <span className="text-sky-400">
              {ordered[currentIndex]?.nameFa || STAGE_LABEL_FA[currentStageKey as StageKey] || '—'}
            </span>{' '}
            است
          </h2>
          {/* Chips, not a run-on sentence: mixing Persian words with Latin-ordered digits in one
              line lets the bidi algorithm merge adjacent numbers into nonsense. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetaChip>گام {faNum(currentIndex + 1)} از {faNum(total)}</MetaChip>
            {daysInStage !== null && <MetaChip>{faNum(daysInStage)} روز در این مرحله</MetaChip>}
            {totalGates > 0 && <MetaChip>{faNum(passedGates)} از {faNum(totalGates)} گیت تصویب‌شده</MetaChip>}
          </div>
        </div>

        <div className="flex shrink-0 items-stretch overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border-soft)', background: 'rgba(255,255,255,0.02)' }}>
          <JourneyStat label="پیشرفت چرخه" value={`${faNum(Math.round(fillPct))}٪`} />
          {nextGate && (
            <JourneyStat
              label="گیت پیش‌رو"
              value={nextGate.name}
              divider
              tone={
                nextGateStatus === 'blocked' || nextGateStatus === 'rejected' ? STATUS_COLOR.red
                : nextGateStatus === 'ready' || nextGateStatus === 'approved' ? STATUS_COLOR.green
                : STATUS_COLOR.yellow
              }
              sub={nextGateStatus ? GATE_STATUS_LABEL_FA[nextGateStatus] : undefined}
            />
          )}
        </div>
      </div>

      {/* ── The rail ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-[840px] pb-1 pt-9">
          {/* track + fill sit behind the nodes, aligned to the node centres */}
          <div
            className="plc-rail-track absolute h-[3px] rounded-full"
            style={{ top: 'calc(2.25rem + 15px)', right: `${50 / total}%`, left: `${50 / total}%` }}
          />
          <div
            className="plc-rail-fill absolute h-[3px] overflow-hidden rounded-full"
            style={{
              top: 'calc(2.25rem + 15px)',
              right: `${50 / total}%`,
              width: `calc(${fillPct}% * ${(total - 1) / total})`,
            }}
          />

          <ol className="relative flex items-start">
            {ordered.map((stage, i) => {
              const isCurrent = i === currentIndex
              const isPast = currentIndex >= 0 && i < currentIndex
              const gate = gates.find((g) => g.stageKey === stage.stageKey)
              const gStatus = gate ? gateStatuses.get(gate.stageKey) ?? gate.status : null
              const stageMs = milestones.filter((m) => m.stageKey === stage.stageKey)

              return (
                <li
                  key={stage.stageKey}
                  className="plc-node-in relative flex flex-1 flex-col items-center px-1"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  {/* "you are here" beacon, tethered to the node below it */}
                  {isCurrent && (
                    <div className="pointer-events-none absolute -top-8 flex flex-col items-center">
                      <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-500 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-lg shadow-sky-500/30">
                        <MapPin size={9} /> اینجا هستیم
                      </span>
                      <span className="h-3 w-px bg-sky-400/60" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectStage?.(stage.stageKey)}
                    disabled={!onSelectStage}
                    title={`${STAGE_LABEL_FA[stage.stageKey as StageKey] ?? stage.stageKey} — ${STAGE_LABEL_EN[stage.stageKey as StageKey] ?? ''}`}
                    className="plc-node-btn group flex w-full flex-col items-center"
                    style={{ cursor: onSelectStage ? 'pointer' : 'default' }}
                  >
                    {/* node */}
                    <span className="relative flex h-[30px] w-[30px] items-center justify-center">
                      {isCurrent && (
                        <>
                          <span className="plc-beacon-ring absolute inset-0 rounded-full border-2 border-sky-400" />
                          <span className="plc-beacon-ring plc-beacon-ring-2 absolute inset-0 rounded-full border-2 border-sky-400" />
                        </>
                      )}
                      <span
                        className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-[10px] font-extrabold transition-colors"
                        style={
                          isCurrent
                            ? { borderColor: '#38bdf8', background: '#0ea5e9', color: '#fff', boxShadow: '0 0 0 4px rgba(56,189,248,0.16)' }
                            : isPast
                              ? { borderColor: 'rgba(56,189,248,0.55)', background: 'rgba(56,189,248,0.16)', color: '#7dd3fc' }
                              : { borderColor: 'var(--border-soft)', background: 'var(--bg-app)', color: 'var(--text-muted)' }
                        }
                      >
                        {isPast ? <Check size={13} strokeWidth={3} /> : faNum(i + 1)}
                      </span>
                    </span>

                    {/* gate marker — a diamond, the standard decision-point glyph */}
                    <span className="mt-1.5 flex h-3 items-center justify-center">
                      {gate ? (
                        <Diamond
                          size={11}
                          strokeWidth={2.5}
                          fill={gStatus === 'approved' ? STATUS_COLOR.green : 'transparent'}
                          style={{
                            color:
                              gStatus === 'approved' ? STATUS_COLOR.green
                              : gStatus === 'blocked' || gStatus === 'rejected' ? STATUS_COLOR.red
                              : gStatus === 'ready' ? '#38bdf8'
                              : STATUS_COLOR.yellow,
                          }}
                        />
                      ) : (
                        <span className="h-1 w-1 rounded-full" style={{ background: 'var(--border-soft)' }} />
                      )}
                    </span>

                    <span
                      className={`mt-1 line-clamp-2 text-center text-[10px] leading-tight ${
                        isCurrent ? 'font-extrabold text-primary' : isPast ? 'font-medium text-secondary' : 'text-muted'
                      }`}
                    >
                      {stage.nameFa || STAGE_LABEL_FA[stage.stageKey as StageKey] || stage.stageKey}
                    </span>

                    {/* milestone load per stage — density, not detail */}
                    {stageMs.length > 0 && (
                      <span className="mt-1.5 flex items-center gap-[3px]">
                        {stageMs.slice(0, 5).map((m) => {
                          const st = deriveMilestoneStatus(m)
                          return (
                            <span
                              key={m.id}
                              title={`${m.name} — ${MILESTONE_STATUS_LABEL_FA[st]}`}
                              className="h-[5px] w-[5px] rounded-full"
                              style={{
                                background:
                                  st === 'achieved' ? STATUS_COLOR.green
                                  : st === 'delayed' ? STATUS_COLOR.red
                                  : st === 'at_risk' ? STATUS_COLOR.yellow
                                  : st === 'blocked' ? STATUS_COLOR.black
                                  : 'rgba(148,163,184,0.55)',
                              }}
                            />
                          )
                        })}
                        {stageMs.length > 5 && <span className="text-[7px] text-muted">+{faNum(stageMs.length - 5)}</span>}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* legend — small, because the rail should be self-evident */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-muted">
        <LegendItem swatch={<Diamond size={9} fill={STATUS_COLOR.green} style={{ color: STATUS_COLOR.green }} />} label="گیت تصویب‌شده" />
        <LegendItem swatch={<Diamond size={9} style={{ color: STATUS_COLOR.yellow }} />} label="گیت باز" />
        <LegendItem swatch={<Diamond size={9} style={{ color: STATUS_COLOR.red }} />} label="گیت مسدود / رد‌شده" />
        <LegendItem swatch={<span className="h-[5px] w-[5px] rounded-full" style={{ background: 'rgba(148,163,184,0.55)' }} />} label="هر نقطه = یک Milestone در آن مرحله" />
      </div>

      {/* ── The calendar ribbon ──────────────────────────────────────── */}
      <ScheduleRibbon
        stages={ordered}
        milestones={milestones}
        baselineFinish={baselineFinish}
        forecastFinish={forecastFinish}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ ribbon */

/** Where the project sits in calendar time: baseline window, today, forecast overrun, milestones. */
function ScheduleRibbon({
  stages, milestones, baselineFinish, forecastFinish,
}: {
  stages: ProjectStage[]
  milestones: Milestone[]
  baselineFinish: string | null
  forecastFinish: string | null
}) {
  const model = useMemo(() => {
    const starts = [
      ...stages.map((s) => s.actualStart ?? s.plannedStart),
      ...milestones.map((m) => m.baselineDate),
    ].filter((d): d is string => !!d)
    const ends = [baselineFinish, forecastFinish, ...milestones.map((m) => m.forecastDate ?? m.baselineDate)]
      .filter((d): d is string => !!d)
    if (starts.length === 0 || ends.length === 0) return null

    const start = starts.sort()[0]
    const baseEnd = baselineFinish ?? ends.sort()[ends.length - 1]
    const end = ends.sort()[ends.length - 1]
    const span = Math.max(1, dayDiff(start, end))
    const pos = (d: string) => Math.min(100, Math.max(0, (dayDiff(start, d) / span) * 100))
    const today = new Date().toISOString().slice(0, 10)

    return {
      start, end, baseEnd, span, pos,
      todayPct: today < start ? 0 : today > end ? 100 : pos(today),
      baseEndPct: pos(baseEnd),
      insideWindow: today >= start && today <= end,
      overrunDays: forecastFinish && baselineFinish ? dayDiff(baselineFinish, forecastFinish) : 0,
    }
  }, [stages, milestones, baselineFinish, forecastFinish])

  if (!model) {
    return (
      <p className="mt-4 rounded-lg border border-dashed p-3 text-center text-[10px] text-muted"
        style={{ borderColor: 'var(--border-soft)' }}>
        برای رسم نوار زمانی، تاریخ Baseline مراحل یا Milestoneها باید ثبت شده باشد.
      </p>
    )
  }

  const pinned = milestones
    .filter((m) => m.forecastDate || m.baselineDate || m.actualDate)
    .map((m) => {
      const date = (m.actualDate ?? m.forecastDate ?? m.baselineDate) as string
      return { m, date, left: model.pos(date), status: deriveMilestoneStatus(m) }
    })
    .sort((a, b) => a.left - b.left)

  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold">نوار زمانی تقویمی</span>
        <span className="text-[10px] text-muted">
          {fa(model.start)} تا {fa(model.end)}
          {model.overrunDays > 0 && (
            <span style={{ color: STATUS_COLOR.red }}> · {faNum(model.overrunDays)} روز فراتر از Baseline</span>
          )}
        </span>
      </div>

      {/* LTR because a time axis runs left→right regardless of script direction.
          Fixed lanes, so the today flag, the bar, the milestone pins and the baseline tick
          can never land on top of each other however the dates fall. */}
      <div dir="ltr" className="relative" style={{ height: 84 }}>
        {/* lane 1 (0–20px): today flag */}
        {model.insideWindow && (
          <div className="absolute top-0 z-10 flex -translate-x-1/2 flex-col items-center" style={{ left: `${model.todayPct}%` }}>
            <span className="whitespace-nowrap rounded px-1 py-px text-[8px] font-extrabold text-white"
              style={{ background: STATUS_COLOR.yellow }}>
              امروز
            </span>
            <span className="plc-today-line w-px" style={{ height: 30, background: STATUS_COLOR.yellow }} />
          </div>
        )}

        {/* lane 2 (24–36px): the bar */}
        <div className="plc-ribbon-baseline absolute inset-x-0 overflow-hidden rounded-full"
          style={{ top: 24, height: 12 }}>
          <div
            className="plc-ribbon-elapsed absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
            style={{ width: `${model.todayPct}%` }}
          />
          {model.baseEndPct < 100 && (
            <div
              className="plc-ribbon-overrun absolute inset-y-0 rounded-r-full"
              style={{ left: `${model.baseEndPct}%`, right: 0 }}
              title="تأخیر پیش‌بینی‌شده نسبت به Baseline"
            />
          )}
        </div>

        {/* lane 3 (42–54px): milestone pins */}
        {pinned.map(({ m, date, left, status }) => (
          <div
            key={m.id}
            className="group absolute -translate-x-1/2"
            style={{ left: `${left}%`, top: 42 }}
            title={`${m.name} — ${MILESTONE_STATUS_LABEL_FA[status]} — ${fa(date)}`}
          >
            <span
              className="block h-2.5 w-2.5 rotate-45 rounded-[2px] border-2 transition-transform group-hover:scale-150"
              style={{
                background:
                  status === 'achieved' ? STATUS_COLOR.green
                  : status === 'delayed' ? STATUS_COLOR.red
                  : status === 'at_risk' ? STATUS_COLOR.yellow
                  : status === 'blocked' ? STATUS_COLOR.black
                  : 'rgba(148,163,184,0.75)',
                borderColor: m.isCritical ? 'rgba(255,255,255,0.85)' : 'transparent',
              }}
            />
          </div>
        ))}

        {/* lane 4 (58–84px): the baseline-finish tick */}
        {model.baseEndPct < 100 && (
          <div className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${model.baseEndPct}%`, top: 58 }}>
            <span className="w-px" style={{ height: 8, background: 'rgba(148,163,184,0.45)' }} />
            <span className="whitespace-nowrap text-[8px] text-muted">پایان Baseline · {fa(model.baseEnd)}</span>
          </div>
        )}
      </div>

      <p className="mt-1 text-[9px] text-muted">
        لوزی سفیدحاشیه = Milestone بحرانی · نوار هاشورخورده قرمز = تأخیر پیش‌بینی‌شده فراتر از Baseline
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------- bits */

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] text-secondary"
      style={{ borderColor: 'var(--border-soft)', background: 'rgba(255,255,255,0.02)' }}>
      {children}
    </span>
  )
}

function JourneyStat({ label, value, sub, tone, divider }: {
  label: string; value: string; sub?: string; tone?: string; divider?: boolean
}) {
  return (
    <div
      className="px-3 py-2"
      style={divider ? { borderInlineStartWidth: 1, borderInlineStartStyle: 'solid', borderColor: 'var(--border-soft)' } : undefined}
    >
      <div className="text-[9px] text-muted">{label}</div>
      <div className="plc-num max-w-[170px] truncate text-sm font-extrabold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[9px] text-muted">{sub}</div>}
    </div>
  )
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1">{swatch}{label}</span>
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

function daysSince(iso: string): number {
  return Math.max(0, dayDiff(iso.slice(0, 10), new Date().toISOString().slice(0, 10)))
}
