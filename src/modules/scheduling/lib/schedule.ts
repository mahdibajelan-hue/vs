import { runCpm, type CpmDep, type CpmTask } from '../../lifecycle/lib/cpm'
import { WorkCalendar, DEFAULT_CALENDAR, type CalendarDef } from './calendar'
import type { SchActivity, SchRelation } from './types'
import { compile2, DayCal, dayOfIso, floats2, isoOfDay, run2, startFromFinish2, CONSTRAINT_TYPES, type ConsType, type Dep2, type Net2, type Task2 } from './engine2'

/**
 * Calendar-aware schedule computation (critical path method) on top of the shared CPM kernel.
 *  - 'plan'     : every activity with its ORIGINAL duration from the project start — the schedule as the logic alone would produce it;
 *  - 'forecast' : status at the data date — finished activities are fixed facts, running ones continue with their remaining duration from the data date,
 *                 and not-started ones start no earlier than the data date (the logic of the unfinished work decides the forecast completion).
 * Activities may run on their own calendars and carry SNET/SNLT/FNET/FNLT/MSO/MFO constraints — such networks use the calendar-day engine (engine2.ts); ALAP is applied (start moved to the latest day that delays no successor).
 */
export type ScheduleMode = 'plan' | 'forecast'
export interface ActivityResult {
  id: string; code: string
  /** the scheduled dates of the unfinished part (or the actual dates of finished work) */
  start: string | null; finish: string | null
  lateStart: string | null; lateFinish: string | null
  totalFloat: number | null; freeFloat: number | null
  critical: boolean; nearCritical: boolean
  status: 'complete' | 'in_progress' | 'not_started'
  /** in plan mode: the file's planned dates differ from what the logic gives */
  fileMismatch: boolean
}
export interface ScheduleResult {
  mode: ScheduleMode
  ok: boolean
  cycle: string[] | null
  byId: Map<string, ActivityResult>
  projectStart: string | null
  projectFinish: string | null
  /** project duration in working days from start to finish */
  duration: number
  criticalPath: string[]
  warnings: string[]
}

export interface ScheduleInput {
  activities: SchActivity[]
  relations: SchRelation[]
  calendar?: CalendarDef
  /** calendar id → definition; activities with a calendarId found here run on that calendar (others on `calendar`) */
  calendars?: Map<string, CalendarDef>
  dataDate?: string | null
  mode: ScheduleMode
  /** forecast: how started activities treat unfinished predecessors — 'retained' (remaining work still waits for them, the default) or 'override' (it continues from the data date regardless) */
  progressMode?: 'retained' | 'override'
  /** total float (working days) up to which an activity counts as near-critical */
  nearCriticalDays?: number
  /** activity id → ISO date before which it cannot start (e.g. the expected delivery of a material it needs) */
  startNoEarlier?: Map<string, string>
}

const isSchedulable = (a: SchActivity) => a.type === 'task' || a.type === 'milestone'
const statusOf = (a: SchActivity): ActivityResult['status'] => (a.actualFinish || (a.pctComplete != null && a.pctComplete >= 100) ? 'complete' : a.actualStart || (a.pctComplete ?? 0) > 0 ? 'in_progress' : 'not_started')

export interface Network {
  ok: boolean
  cycle: string[] | null
  acts: SchActivity[]
  byId: Map<string, SchActivity>
  cal: WorkCalendar
  forecast: boolean
  status: Map<string, ActivityResult['status']>
  tasks: CpmTask[]
  deps: CpmDep[]
  live: Set<string>
  warnings: string[]
}

/** The unfinished-work network (tasks with durations and start bounds, relations) shared by the date computation and the Monte Carlo engine. */
export function buildNetwork(inp: ScheduleInput): Network {
  const warnings: string[] = []
  const acts = inp.activities.filter(isSchedulable)
  const calDef = inp.calendar ?? DEFAULT_CALENDAR
  const dates = acts.flatMap((a) => [a.plannedStart, a.plannedFinish, a.actualStart, a.actualFinish, a.constraintDate]).filter((x): x is string => !!x)
  if (inp.dataDate) dates.push(inp.dataDate)
  for (const d of inp.startNoEarlier?.values() ?? []) dates.push(d)
  const anchor = dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : new Date().toISOString().slice(0, 10)
  const cal = new WorkCalendar(calDef, anchor)
  const forecast = inp.mode === 'forecast' && !!inp.dataDate
  if (inp.mode === 'forecast' && !inp.dataDate) warnings.push('تاریخ وضعیت (Data Date) نامشخص است؛ پیش‌بینی بر اساس برنامه کامل انجام شد.')
  const dataIdx = forecast ? cal.idxOnOrAfter(inp.dataDate!) : 0
  const starts = acts.map((a) => a.plannedStart).filter((x): x is string => !!x)
  const startIdx = starts.length ? cal.idxOnOrAfter(starts.reduce((m, d) => (d < m ? d : m))) : 0
  const byId = new Map(acts.map((a) => [a.id, a]))
  const status = new Map(acts.map((a) => [a.id, forecast ? statusOf(a) : ('not_started' as const)]))

  const tasks: CpmTask[] = []
  const notBefore = new Map<string, number>()
  for (const a of acts) {
    const st = status.get(a.id)!
    if (forecast && st === 'complete') continue
    let dur = a.origDuration
    if (forecast) {
      if (a.remDuration != null) dur = a.remDuration
      else if (st === 'in_progress') dur = Math.max(0, Math.round(a.origDuration * (1 - (a.pctComplete ?? 0) / 100) * 100) / 100)
    }
    if (a.type === 'milestone') dur = 0
    let nb = forecast ? dataIdx : startIdx
    if (a.constraintDate && a.constraintType === 'SNET') nb = Math.max(nb, cal.idxOnOrAfter(a.constraintDate))
    else if (a.constraintType && a.constraintType !== 'ALAP') warnings.push(`قید «${a.constraintType}» فعالیت ${a.code} در محاسبات اعمال نشد (فقط SNET = «شروع نه زودتر از» پشتیبانی می‌شود).`)
    const sne = inp.startNoEarlier?.get(a.id)
    if (sne) nb = Math.max(nb, cal.idxOnOrAfter(sne))
    notBefore.set(a.id, nb)
    tasks.push({ id: a.id, duration: dur })
  }
  const live = new Set(tasks.map((t) => t.id))
  const durOf = new Map(tasks.map((t) => [t.id, t.duration]))
  const deps: CpmDep[] = []
  const boundOf = (rel: SchRelation, pred: SchActivity, succDur: number): number | null => {
    const ps = pred.actualStart ? cal.idxOnOrAfter(pred.actualStart) : null
    const pf = pred.actualFinish ? cal.idxOnOrBefore(pred.actualFinish) : null
    if (rel.type === 'FS' && pf != null) return pf + 1 + rel.lag
    if (rel.type === 'SS' && ps != null) return ps + rel.lag
    if (rel.type === 'FF' && pf != null) return pf + rel.lag - succDur + 1
    if (rel.type === 'SF' && ps != null) return ps + rel.lag - succDur + 1
    return null
  }
  let missingActual = 0
  for (const r of inp.relations) {
    const pred = byId.get(r.predId), succ = byId.get(r.succId)
    if (!pred || !succ || !live.has(r.succId)) continue
    if (live.has(r.predId)) {
      if (forecast && inp.progressMode === 'override' && status.get(r.succId) === 'in_progress') continue
      if (forecast && status.get(r.predId) === 'in_progress' && (r.type === 'SS' || r.type === 'SF') && pred.actualStart) {
        const b = boundOf(r, pred, durOf.get(r.succId) ?? 0); if (b != null) notBefore.set(r.succId, Math.max(notBefore.get(r.succId) ?? 0, b))
        continue
      }
      deps.push({ from: r.predId, to: r.succId, type: r.type, lag: r.lag })
    } else if (forecast) {
      const b = boundOf(r, pred, durOf.get(r.succId) ?? 0)
      if (b == null) missingActual++
      else notBefore.set(r.succId, Math.max(notBefore.get(r.succId) ?? 0, b))
    }
  }
  if (missingActual) warnings.push(`${missingActual} رابطه به فعالیت تمام‌شده‌ای وصل است که تاریخ واقعی کافی ندارد؛ در محاسبه نادیده گرفته شد.`)
  for (const t of tasks) t.notBefore = notBefore.get(t.id)
  return { ok: true, cycle: null, acts, byId, cal, forecast, status, tasks, deps, live, warnings }
}

/** true when the calendar-day engine is needed: activities on different calendars, or date constraints beyond «start no earlier than» */
export function needsAdvanced(inp: ScheduleInput): boolean {
  const acts = inp.activities.filter(isSchedulable)
  if (acts.some((a) => CONSTRAINT_TYPES.includes(a.constraintType as ConsType) && a.constraintType !== 'SNET' && a.constraintDate)) return true
  if (acts.some((a) => a.constraintType === 'ALAP')) return true
  if (!inp.calendars?.size) return false
  const def = JSON.stringify(inp.calendar ?? DEFAULT_CALENDAR)
  return acts.some((a) => { const c = a.calendarId ? inp.calendars!.get(a.calendarId) : undefined; return !!c && JSON.stringify(c) !== def })
}

export interface Network2 { ok: boolean; acts: SchActivity[]; byId: Map<string, SchActivity>; net: Net2; forecast: boolean; status: Map<string, ActivityResult['status']>; tasks: Task2[]; live: Set<string>; warnings: string[]; base: number; calFor: (a: SchActivity) => DayCal }

/** Calendar-day counterpart of buildNetwork: per-activity calendars, all date constraints, same plan / forecast rules. */
export function buildNetwork2(inp: ScheduleInput): Network2 {
  const warnings: string[] = []
  const acts = inp.activities.filter(isSchedulable)
  const defDef = inp.calendar ?? DEFAULT_CALENDAR
  const dates = acts.flatMap((a) => [a.plannedStart, a.plannedFinish, a.actualStart, a.actualFinish, a.constraintDate]).filter((x): x is string => !!x)
  if (inp.dataDate) dates.push(inp.dataDate)
  for (const d of inp.startNoEarlier?.values() ?? []) dates.push(d)
  const anchor = dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : new Date().toISOString().slice(0, 10)
  const base = dayOfIso(anchor)
  const defCal = new DayCal(defDef, base)
  const cache = new Map<string, DayCal>()
  const calFor = (a: SchActivity): DayCal => {
    const def = a.calendarId ? inp.calendars?.get(a.calendarId) : undefined
    if (!def || JSON.stringify(def) === JSON.stringify(defDef)) return defCal
    let c = cache.get(a.calendarId!); if (!c) { c = new DayCal(def, base); cache.set(a.calendarId!, c) }
    return c
  }
  const forecast = inp.mode === 'forecast' && !!inp.dataDate
  if (inp.mode === 'forecast' && !inp.dataDate) warnings.push('تاریخ وضعیت (Data Date) نامشخص است؛ پیش‌بینی بر اساس برنامه کامل انجام شد.')
  const dataDay = forecast ? dayOfIso(inp.dataDate!) : base
  const starts = acts.map((a) => a.plannedStart).filter((x): x is string => !!x)
  const startDay = starts.length ? dayOfIso(starts.reduce((m, d) => (d < m ? d : m))) : base
  const byId = new Map(acts.map((a) => [a.id, a]))
  const status = new Map(acts.map((a) => [a.id, forecast ? statusOf(a) : ('not_started' as const)]))
  const tasks: Task2[] = [], lower = new Map<string, number>()
  for (const a of acts) {
    const st = status.get(a.id)!
    if (forecast && st === 'complete') continue
    let dur = a.origDuration
    if (forecast) {
      if (a.remDuration != null) dur = a.remDuration
      else if (st === 'in_progress') dur = Math.max(0, Math.round(a.origDuration * (1 - (a.pctComplete ?? 0) / 100) * 100) / 100)
    }
    if (a.type === 'milestone') dur = 0
    dur = dur > 0 ? Math.max(1, Math.round(dur)) : 0
    let cons: Task2['cons'] = null
    if (a.constraintDate && CONSTRAINT_TYPES.includes(a.constraintType as ConsType)) cons = { type: a.constraintType as ConsType, day: dayOfIso(a.constraintDate) }
    else if (a.constraintType && a.constraintType !== 'ALAP') warnings.push(`قید «${a.constraintType}» فعالیت ${a.code} شناخته نشد و اعمال نشد.`)
    let lo = forecast ? dataDay : startDay
    const sne = inp.startNoEarlier?.get(a.id); if (sne) lo = Math.max(lo, dayOfIso(sne))
    lower.set(a.id, lo)
    tasks.push({ id: a.id, dur, cal: calFor(a), lower: lo, cons, alap: a.constraintType === 'ALAP' })
  }
  const live = new Set(tasks.map((t) => t.id))
  const taskOf = new Map(tasks.map((t) => [t.id, t]))
  const deps: Dep2[] = []
  let missingActual = 0
  for (const r of inp.relations) {
    const pred = byId.get(r.predId), succ = byId.get(r.succId)
    if (!pred || !succ || !live.has(r.succId)) continue
    const raise = (day: number) => { const t = taskOf.get(r.succId)!; t.lower = Math.max(t.lower ?? -Infinity, day) }
    const pc = calFor(pred), st = taskOf.get(r.succId)!
    const actualBound = (): number | null => {
      const ps = pred.actualStart ? pc.nextWork(dayOfIso(pred.actualStart)) : null, pf = pred.actualFinish ? pc.prevWork(dayOfIso(pred.actualFinish)) : null
      if (r.type === 'FS' && pf != null) return pc.shift(pf, r.lag) + 1
      if (r.type === 'SS' && ps != null) return pc.shift(ps, r.lag)
      if ((r.type === 'FF' && pf != null) || (r.type === 'SF' && ps != null)) { const f = pc.shift(r.type === 'FF' ? pf! : ps!, r.lag); return st.dur > 0 ? startFromFinish2(st, f, st.dur) : f }
      return null
    }
    if (live.has(r.predId)) {
      if (forecast && inp.progressMode === 'override' && status.get(r.succId) === 'in_progress') continue
      if (forecast && status.get(r.predId) === 'in_progress' && (r.type === 'SS' || r.type === 'SF') && pred.actualStart) { const b = actualBound(); if (b != null) raise(b); continue }
      deps.push({ from: r.predId, to: r.succId, type: r.type, lag: r.lag })
    } else if (forecast) {
      const b = actualBound()
      if (b == null) missingActual++; else raise(b)
    }
  }
  if (missingActual) warnings.push(`${missingActual} رابطه به فعالیت تمام‌شده‌ای وصل است که تاریخ واقعی کافی ندارد؛ در محاسبه نادیده گرفته شد.`)
  const net = compile2(tasks, deps, defCal)
  return { ok: !net.cycle, acts, byId, net, forecast, status, tasks, live, warnings, base, calFor }
}

export function computeAdvanced(inp: ScheduleInput): ScheduleResult {
  const n2 = buildNetwork2(inp)
  const { acts, status, net, forecast, live, warnings } = n2
  const empty: ScheduleResult = { mode: inp.mode, ok: false, cycle: null, byId: new Map(), projectStart: null, projectFinish: null, duration: 0, criticalPath: [], warnings }
  if (!acts.length) return empty
  const near = inp.nearCriticalDays ?? 10
  const doneRes = (a: SchActivity): ActivityResult => ({ id: a.id, code: a.code, start: a.actualStart, finish: a.actualFinish, lateStart: a.actualStart, lateFinish: a.actualFinish, totalFloat: null, freeFloat: null, critical: false, nearCritical: false, status: status.get(a.id)!, fileMismatch: false })
  if (!net.tasks.length) {
    const m = new Map<string, ActivityResult>(acts.map((a) => [a.id, { ...doneRes(a), status: 'complete' as const }]))
    return { ...empty, ok: true, byId: m, projectFinish: acts.map((a) => a.actualFinish).filter((x): x is string => !!x).sort().pop() ?? null, projectStart: acts.map((a) => a.actualStart).filter((x): x is string => !!x).sort()[0] ?? null }
  }
  if (net.cycle) return { ...empty, cycle: net.cycle.map((id) => n2.byId.get(id)?.code ?? id), warnings: [...warnings, 'شبکه فعالیت‌ها دارای چرخهٔ منطقی است؛ محاسبه انجام نشد.'] }
  const r = run2(net), fl = floats2(net, r)
  const pos = new Map(net.tasks.map((t, i) => [t.id, i]))
  const byResult = new Map<string, ActivityResult>()
  for (const a of acts) {
    if (!live.has(a.id)) { byResult.set(a.id, doneRes(a)); continue }
    const i = pos.get(a.id)!, st = status.get(a.id)!
    const s0 = isoOfDay(r.es[i]), f0 = isoOfDay(r.ef[i])
    const start = forecast && st === 'in_progress' && a.actualStart ? a.actualStart : s0
    const mismatch = !forecast && ((a.plannedStart != null && a.plannedStart !== s0) || (a.plannedFinish != null && a.plannedFinish !== f0))
    const tf = fl.total[i]
    if (tf < 0 && net.tasks[i].cons) warnings.push(`قید فعالیت ${a.code} (${net.tasks[i].cons!.type}) با منطق شبکه رعایت‌شدنی نیست؛ شناوری ${tf} روز.`)
    byResult.set(a.id, { id: a.id, code: a.code, start, finish: f0, lateStart: isoOfDay(r.ls[i]), lateFinish: isoOfDay(r.lf[i]), totalFloat: tf, freeFloat: fl.free[i], critical: tf <= 0, nearCritical: tf > 0 && tf <= near, status: st, fileMismatch: mismatch })
  }
  const vals = [...byResult.values()]
  const projectStart = vals.map((x) => x.start).filter((x): x is string => !!x).sort()[0] ?? null
  const projectFinish = vals.map((x) => x.finish).filter((x): x is string => !!x).sort().pop() ?? null
  const critical = vals.filter((x) => x.critical).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || (a.finish ?? '').localeCompare(b.finish ?? ''))
  const dur = projectStart && projectFinish ? net.def.idxBefore(dayOfIso(projectFinish)) - net.def.idxAfter(dayOfIso(projectStart)) + 1 : 0
  return { mode: inp.mode, ok: true, cycle: null, byId: byResult, projectStart, projectFinish, duration: dur, criticalPath: critical.map((x) => x.id), warnings }
}

export function computeSchedule(inp: ScheduleInput): ScheduleResult {
  if (needsAdvanced(inp)) return computeAdvanced(inp)
  const net = buildNetwork(inp)
  const warnings = net.warnings
  const empty: ScheduleResult = { mode: inp.mode, ok: false, cycle: null, byId: new Map(), projectStart: null, projectFinish: null, duration: 0, criticalPath: [], warnings }
  const { acts, cal, forecast, status, tasks, deps, live, byId } = net
  if (!acts.length) return empty
  const near = inp.nearCriticalDays ?? 10

  if (!tasks.length) {
    const m = new Map<string, ActivityResult>()
    for (const a of acts) m.set(a.id, { id: a.id, code: a.code, start: a.actualStart, finish: a.actualFinish, lateStart: a.actualStart, lateFinish: a.actualFinish, totalFloat: null, freeFloat: null, critical: false, nearCritical: false, status: 'complete', fileMismatch: false })
    const fin = acts.map((a) => a.actualFinish).filter((x): x is string => !!x).sort().pop() ?? null
    return { ...empty, ok: true, byId: m, projectFinish: fin, projectStart: acts.map((a) => a.actualStart).filter((x): x is string => !!x).sort()[0] ?? null }
  }
  const out = runCpm(tasks, deps)
  if (out.cycle) return { ...empty, cycle: out.cycle.map((id) => byId.get(id)?.code ?? id), warnings: [...warnings, 'شبکه فعالیت‌ها دارای چرخهٔ منطقی است؛ محاسبه انجام نشد.'] }

  const outgoing = new Map<string, CpmDep[]>()
  for (const d of deps) outgoing.set(d.from, [...(outgoing.get(d.from) ?? []), d])
  const res = out.tasks
  const durOf = new Map(tasks.map((t) => [t.id, t.duration]))
  const finishDate = (idx: number, dur: number) => (dur > 0 ? cal.dateOf(idx + dur - 1) : cal.dateOf(idx))
  const byResult = new Map<string, ActivityResult>()
  for (const a of acts) {
    const st = status.get(a.id)!
    if (!live.has(a.id)) {
      byResult.set(a.id, { id: a.id, code: a.code, start: a.actualStart, finish: a.actualFinish, lateStart: a.actualStart, lateFinish: a.actualFinish, totalFloat: null, freeFloat: null, critical: false, nearCritical: false, status: st, fileMismatch: false })
      continue
    }
    const r = res.get(a.id)!, dur = durOf.get(a.id)!
    let ff = Infinity
    for (const d of outgoing.get(a.id) ?? []) {
      const s = res.get(d.to)!
      const g = d.type === 'FS' ? s.es - d.lag - r.ef : d.type === 'SS' ? s.es - d.lag - r.es : d.type === 'FF' ? s.ef - d.lag - r.ef : s.ef - d.lag - r.es
      ff = Math.min(ff, g)
    }
    if (!Number.isFinite(ff)) ff = out.finish - r.ef
    const s0 = cal.dateOf(r.es), f0 = finishDate(r.es, dur)
    const start = forecast && st === 'in_progress' && a.actualStart ? a.actualStart : s0
    const mismatch = !forecast && ((a.plannedStart != null && a.plannedStart !== s0) || (a.plannedFinish != null && a.plannedFinish !== f0))
    byResult.set(a.id, { id: a.id, code: a.code, start, finish: f0, lateStart: cal.dateOf(r.ls), lateFinish: finishDate(r.ls, dur), totalFloat: r.float, freeFloat: Math.max(0, ff), critical: r.float <= 0, nearCritical: r.float > 0 && r.float <= near, status: st, fileMismatch: mismatch })
  }
  const vals = [...byResult.values()]
  const projectStart = vals.map((x) => x.start).filter((x): x is string => !!x).sort()[0] ?? null
  const projectFinish = vals.map((x) => x.finish).filter((x): x is string => !!x).sort().pop() ?? null
  const critical = vals.filter((x) => x.critical).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || (a.finish ?? '').localeCompare(b.finish ?? ''))
  return { mode: inp.mode, ok: true, cycle: null, byId: byResult, projectStart, projectFinish, duration: projectStart && projectFinish ? cal.idxOnOrBefore(projectFinish) - cal.idxOnOrAfter(projectStart) + 1 : 0, criticalPath: critical.map((x) => x.id), warnings }
}

/** the project calendar of a version: its default calendar, else the first one, else the standard week */
/** id → definition of every calendar of a version (for activities that run on their own calendar) */
export function calendarMap(cals: { id: string; workDays: number[]; holidays: string[]; hoursPerDay: number }[]): Map<string, CalendarDef> {
  return new Map(cals.map((c) => [c.id, { workDays: c.workDays, holidays: c.holidays, hoursPerDay: c.hoursPerDay }]))
}
export function pickCalendar(cals: { workDays: number[]; holidays: string[]; hoursPerDay: number; isDefault: boolean }[]): CalendarDef {
  const c = cals.find((x) => x.isDefault) ?? cals[0]
  return c ? { workDays: c.workDays, holidays: c.holidays, hoursPerDay: c.hoursPerDay } : DEFAULT_CALENDAR
}
