import { useMemo } from 'react'
import type { ActivitySchedule, IsoLine } from '../../types'
import { ACTIVITY_KINDS, ACTIVITY_LABEL_FA } from '../../types'
import {
  computeActivityStatus,
  ACTIVITY_STATUS_COLOR,
  ACTIVITY_STATUS_LABEL_FA,
  type ActivityStatus,
  daysBetween,
  addDaysIso,
  todayIso,
  computeProjectSchedule,
} from '../../lib/schedule'
import { isoToJalali, jalaliToIso, JALALI_MONTHS } from '../../lib/jalali'
import type { Project } from '../../types'

const DAY_WIDTH = 26
const ROW_HEIGHT = 34
const MONTH_ROW_HEIGHT = 22
const DAY_ROW_HEIGHT = 22

function actualRange(a: ActivitySchedule, today: string): { start: string; end: string } | null {
  if (a.actualStart && a.actualEnd) return { start: a.actualStart, end: a.actualEnd }
  if (a.actualStart) return { start: a.actualStart, end: a.percentComplete >= 100 ? a.actualStart : today }
  if (a.percentComplete > 0 && a.plannedStart) return { start: a.plannedStart, end: a.percentComplete >= 100 ? a.plannedEnd : today }
  return null
}

function monthTicks(startIso: string, endIso: string): { iso: string; label: string }[] {
  const startJ = isoToJalali(startIso)
  const endJ = isoToJalali(endIso)
  if (!startJ || !endJ) return []
  const ticks: { iso: string; label: string }[] = []
  let jy = startJ.jy
  let jm = startJ.jm
  let guard = 0
  while ((jy < endJ.jy || (jy === endJ.jy && jm <= endJ.jm)) && guard < 120) {
    guard += 1
    ticks.push({ iso: jalaliToIso(jy, jm, 1), label: `${JALALI_MONTHS[jm - 1]} ${jy}` })
    jm += 1
    if (jm > 12) {
      jm = 1
      jy += 1
    }
  }
  return ticks
}

function dayTicks(startIso: string, endIso: string): { iso: string; label: string; isMonthStart: boolean }[] {
  const total = daysBetween(startIso, endIso)
  const ticks: { iso: string; label: string; isMonthStart: boolean }[] = []
  for (let i = 0; i <= total; i++) {
    const iso = addDaysIso(startIso, i)
    const j = isoToJalali(iso)
    if (!j) continue
    ticks.push({ iso, label: String(j.jd), isMonthStart: j.jd === 1 })
  }
  return ticks
}

const LEGEND_STATUSES: ActivityStatus[] = ['not_started', 'in_progress', 'completed', 'delayed']

function GanttLegend() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-secondary">
      {LEGEND_STATUSES.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACTIVITY_STATUS_COLOR[s] }} />
          {ACTIVITY_STATUS_LABEL_FA[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-0 border-r-2 border-dashed" style={{ borderColor: '#38bdf8' }} />
        امروز
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-0 border-r-2 border-dashed" style={{ borderColor: '#e74c3c' }} />
        پیش‌بینی پایان با تاخیر
      </span>
    </div>
  )
}

interface GanttChartProps {
  project: Project
  lines: IsoLine[]
  schedules: ActivitySchedule[]
}

export function GanttChart({ project, lines, schedules }: GanttChartProps) {
  const today = todayIso()
  const summary = useMemo(() => computeProjectSchedule(project, today), [project, today])

  const linesWithSchedule = lines.filter((l) => schedules.some((s) => s.lineId === l.id))

  const { rangeStart, rangeEnd } = useMemo(() => {
    const valid = schedules.filter((s) => s.plannedStart && s.plannedEnd)
    if (valid.length === 0) return { rangeStart: today, rangeEnd: addDaysIso(today, 30) }
    let start = valid[0].plannedStart
    let end = valid[0].plannedEnd
    for (const s of valid) {
      if (s.plannedStart < start) start = s.plannedStart
      if (s.plannedEnd > end) end = s.plannedEnd
      if (s.actualStart && s.actualStart < start) start = s.actualStart
      if (s.actualEnd && s.actualEnd > end) end = s.actualEnd
    }
    if (summary.forecastEnd && summary.forecastEnd > end) end = summary.forecastEnd
    if (today > end) end = today
    return { rangeStart: addDaysIso(start, -3), rangeEnd: addDaysIso(end, 3) }
  }, [schedules, summary.forecastEnd, today])

  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd))
  const totalWidth = totalDays * DAY_WIDTH
  const monthTickList = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd])
  const dayTickList = useMemo(() => dayTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd])
  const x = (iso: string) => daysBetween(rangeStart, iso) * DAY_WIDTH

  if (linesWithSchedule.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        هنوز برنامه زمان‌بندی برای هیچ خطی ثبت نشده — از لیست کنار صفحه یک خط را انتخاب کنید
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <GanttLegend />
      <div className="flex flex-1 min-h-0">
        <div className="w-44 shrink-0 border-l" style={{ borderColor: 'var(--border-soft)' }}>
          <div style={{ height: MONTH_ROW_HEIGHT + DAY_ROW_HEIGHT }} />
          {linesWithSchedule.map((line) => (
            <div key={line.id}>
              <div className="flex items-center px-2 text-xs font-bold truncate" style={{ height: ROW_HEIGHT }}>
                {line.svgElementId}
              </div>
              {ACTIVITY_KINDS.map((kind) => (
                <div key={kind} className="flex items-center px-4 text-[11px] text-secondary truncate" style={{ height: ROW_HEIGHT }}>
                  {ACTIVITY_LABEL_FA[kind]}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-x-auto">
          <div
            style={{
              width: totalWidth,
              position: 'relative',
              backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.07) 0, rgba(148,163,184,0.07) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`,
            }}
          >
            <div className="relative border-b" style={{ height: MONTH_ROW_HEIGHT, borderColor: 'var(--border-soft)' }}>
              {monthTickList.map((t, i) => {
                const nextIso = monthTickList[i + 1]?.iso ?? rangeEnd
                const width = Math.max(0, x(nextIso) - x(t.iso))
                return (
                  <div
                    key={t.iso}
                    className="absolute top-0 h-full border-r px-1.5 text-[10px] font-bold text-secondary flex items-center overflow-hidden"
                    style={{ right: totalWidth - x(t.iso), width, borderColor: 'var(--border-soft)' }}
                  >
                    {t.label}
                  </div>
                )
              })}
            </div>
            <div className="relative border-b" style={{ height: DAY_ROW_HEIGHT, borderColor: 'var(--border-soft)' }}>
              {dayTickList.map((d) => (
                <div
                  key={d.iso}
                  className="absolute top-0 flex h-full items-center justify-center text-[9px] text-muted num"
                  style={{ right: totalWidth - x(d.iso), width: DAY_WIDTH }}
                >
                  {d.label}
                </div>
              ))}
            </div>

            {linesWithSchedule.map((line) => (
              <div key={line.id}>
                <div className="relative" style={{ height: ROW_HEIGHT }} />
                {ACTIVITY_KINDS.map((kind) => {
                  const a = schedules.find((s) => s.lineId === line.id && s.activity === kind)
                  return (
                    <div key={kind} className="relative" style={{ height: ROW_HEIGHT }}>
                      {a && a.plannedStart && a.plannedEnd && (
                        <>
                          <div
                            className="absolute top-1/2 -translate-y-1/2 rounded-md border"
                            style={{
                              right: totalWidth - x(a.plannedStart),
                              width: Math.max(2, x(a.plannedEnd) - x(a.plannedStart)),
                              height: 10,
                              borderColor: 'var(--border-soft)',
                              background: 'rgba(148,163,184,0.08)',
                            }}
                          />
                          {(() => {
                            const range = actualRange(a, today)
                            if (!range) return null
                            const status = computeActivityStatus(a, today)
                            const color = ACTIVITY_STATUS_COLOR[status]
                            return (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 rounded-md"
                                title={`${ACTIVITY_LABEL_FA[kind]} — ${a.percentComplete}%`}
                                style={{
                                  right: totalWidth - x(range.start),
                                  width: Math.max(3, x(range.end) - x(range.start)),
                                  height: 14,
                                  background: color,
                                  opacity: 0.85,
                                }}
                              />
                            )
                          })()}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            <div
              className="absolute top-0 bottom-0 border-r border-dashed"
              style={{ right: totalWidth - x(today), borderColor: '#38bdf8', opacity: 0.6 }}
            />
            {summary.forecastEnd && summary.totalDelayDays > 0 && (
              <div
                className="absolute top-0 bottom-0 border-r border-dashed"
                style={{ right: totalWidth - x(summary.forecastEnd), borderColor: '#e74c3c', opacity: 0.6 }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
