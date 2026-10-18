import type { CalendarDef } from './calendar'
import type { RelType } from './types'

/**
 * Calendar-day CPM: every activity can run on its OWN work calendar and carry any of the usual date constraints.
 * The time axis is the epoch day number; each calendar maps working-day indices ↔ day numbers. Durations and lags are working days of the
 * activity's (lag: the predecessor's) calendar, exactly as in Primavera P6's default behaviour. Single-calendar networks with only
 * «start no earlier than» keep using the lighter index kernel (see schedule.ts); the two agree on those networks (tested).
 */
const MS = 86400000
export const dayOfIso = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS)
export const isoOfDay = (d: number): string => new Date(d * MS).toISOString().slice(0, 10)
const weekdayOfDay = (d: number): number => (((d + 5) % 7) + 7) % 7 // 0 = Saturday … 6 = Friday (epoch day 0 was a Thursday)

export class DayCal {
  private days: number[] = []
  private cursor: number
  private week: Set<number>
  private hol: Set<number>
  readonly def: CalendarDef
  readonly base: number
  constructor(def: CalendarDef, base: number) {
    this.def = def; this.base = base
    this.week = new Set(def.workDays.length ? def.workDays : [0, 1, 2, 3, 4])
    this.hol = new Set(def.holidays.map(dayOfIso))
    this.cursor = base
  }
  isWork(d: number): boolean { return this.week.has(weekdayOfDay(d)) && !this.hol.has(d) }
  private extendTo(n: number, until = -Infinity) {
    let guard = 0
    while ((this.days.length < n || this.cursor <= until) && guard++ < 400000) { if (this.isWork(this.cursor)) this.days.push(this.cursor); this.cursor++ }
  }
  /** day number of the i-th working day (i ≥ 0) */
  dayOf(i: number): number { const k = Math.max(0, Math.round(i)); this.extendTo(k + 1); return this.days[k] }
  /** index of the first working day on or after d (days before the base map to 0) */
  idxAfter(d: number): number {
    if (d <= this.base) return 0
    this.extendTo(0, d)
    let lo = 0, hi = this.days.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.days[m] < d) lo = m + 1; else hi = m }
    if (lo >= this.days.length) { this.extendTo(this.days.length + 1); return this.days.length - 1 }
    return lo
  }
  /** index of the last working day on or before d (days before the base map to 0) */
  idxBefore(d: number): number {
    if (d <= this.base) return 0
    const a = this.idxAfter(d)
    return this.days[a] === d ? a : Math.max(0, a - 1)
  }
  nextWork(d: number): number { return this.dayOf(this.idxAfter(d)) }
  prevWork(d: number): number { return this.dayOf(this.idxBefore(d)) }
  /** the working day n working days after (n < 0: before) the working day nearest to d */
  shift(d: number, n: number): number { return this.dayOf(this.idxAfter(d) + n) }
}

export type ConsType = 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO'
export const CONSTRAINT_TYPES: ConsType[] = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO']
export const CONSTRAINT_LABEL_FA: Record<ConsType, string> = {
  SNET: 'شروع نه زودتر از', SNLT: 'شروع نه دیرتر از', FNET: 'پایان نه زودتر از', FNLT: 'پایان نه دیرتر از', MSO: 'باید شروع شود در', MFO: 'باید پایان یابد در',
}
export interface Task2 { id: string; dur: number; cal: DayCal; /** earliest start (day number) */ lower: number | null; cons: { type: ConsType; day: number } | null }
export interface Dep2 { from: string; to: string; type: RelType; lag: number }
export interface Net2 {
  tasks: Task2[]; deps: Dep2[]; def: DayCal
  order: number[]; cycle: string[] | null
  inc: { p: number; type: RelType; lag: number }[][]
  out: { s: number; type: RelType; lag: number }[][]
}
export interface Run2 { es: number[]; ef: number[]; ls: number[]; lf: number[]; finish: number }

export function compile2(tasks: Task2[], deps: Dep2[], def: DayCal): Net2 {
  const idx = new Map(tasks.map((t, i) => [t.id, i]))
  const n = tasks.length
  const inc: Net2['inc'] = Array.from({ length: n }, () => []), out: Net2['out'] = Array.from({ length: n }, () => [])
  const indeg = new Array<number>(n).fill(0)
  for (const d of deps) {
    const p = idx.get(d.from), s = idx.get(d.to); if (p == null || s == null || p === s) continue
    inc[s].push({ p, type: d.type, lag: d.lag }); out[p].push({ s, type: d.type, lag: d.lag }); indeg[s]++
  }
  const queue: number[] = []; for (let i = 0; i < n; i++) if (!indeg[i]) queue.push(i)
  const order: number[] = []
  for (let h = 0; h < queue.length; h++) { const v = queue[h]; order.push(v); for (const e of out[v]) if (--indeg[e.s] === 0) queue.push(e.s) }
  const cycle = order.length === n ? null : tasks.filter((_, i) => !order.includes(i)).map((t) => t.id)
  return { tasks, deps, def, order, cycle, inc, out }
}

const finishOf = (t: Task2, es: number, dur: number): number => (dur > 0 ? t.cal.dayOf(t.cal.idxAfter(es) + dur - 1) : es)
const startFromFinish = (t: Task2, f: number, dur: number): number => (dur > 0 ? t.cal.dayOf(Math.max(0, t.cal.idxBefore(f) - dur + 1)) : t.cal.prevWork(f))

/** earliest start the relation imposes on its successor (before snapping to the successor's calendar) */
function startBound(p: Task2, durP: number, esP: number, efP: number, type: RelType, lag: number, s: Task2, durS: number): number {
  if (type === 'FS') return durP > 0 ? p.cal.shift(efP, lag) + 1 : p.cal.shift(esP, lag)
  if (type === 'SS') return p.cal.shift(esP, lag)
  const f = p.cal.shift(type === 'FF' ? efP : esP, lag)
  return durS > 0 ? startFromFinish(s, f, durS) : f
}

export function run2(net: Net2, durs?: ArrayLike<number>): Run2 {
  const { tasks, order, inc, out } = net, n = tasks.length
  const dur = (i: number) => (durs ? durs[i] : tasks[i].dur)
  const es = new Array<number>(n).fill(0), ef = new Array<number>(n).fill(0), ls = new Array<number>(n).fill(0), lf = new Array<number>(n).fill(0)
  for (const i of order) {
    const t = tasks[i], d = dur(i)
    let lo = t.lower ?? -Infinity
    if (t.cons) {
      if (t.cons.type === 'SNET' || t.cons.type === 'MSO') lo = Math.max(lo, t.cons.day)
      else if (t.cons.type === 'FNET' || t.cons.type === 'MFO') lo = Math.max(lo, startFromFinish(t, t.cons.day, d))
    }
    for (const e of inc[i]) lo = Math.max(lo, startBound(tasks[e.p], dur(e.p), es[e.p], ef[e.p], e.type, e.lag, t, d))
    es[i] = t.cal.nextWork(Number.isFinite(lo) ? lo : t.cal.dayOf(0))
    ef[i] = finishOf(t, es[i], d)
  }
  let finish = -Infinity; for (let i = 0; i < n; i++) finish = Math.max(finish, ef[i])
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k], t = tasks[i], d = dur(i)
    let lfC = finish, lsC = Infinity
    if (t.cons) {
      if (t.cons.type === 'SNLT' || t.cons.type === 'MSO') lsC = Math.min(lsC, t.cons.day)
      if (t.cons.type === 'FNLT' || t.cons.type === 'MFO') lfC = Math.min(lfC, t.cons.day)
    }
    for (const e of out[i]) {
      const s = e.s
      if (e.type === 'FS') { const m = t.cal.prevWork(d > 0 ? ls[s] - 1 : ls[s]); lfC = Math.min(lfC, t.cal.dayOf(t.cal.idxBefore(m) - e.lag)) }
      else if (e.type === 'SS') { const m = t.cal.prevWork(ls[s]); lsC = Math.min(lsC, t.cal.dayOf(t.cal.idxBefore(m) - e.lag)) }
      else if (e.type === 'FF') { const m = t.cal.prevWork(lf[s]); lfC = Math.min(lfC, t.cal.dayOf(t.cal.idxBefore(m) - e.lag)) }
      else { const m = t.cal.prevWork(lf[s]); lsC = Math.min(lsC, t.cal.dayOf(t.cal.idxBefore(m) - e.lag)) }
    }
    if (d > 0) { ls[i] = Math.min(lsC, startFromFinish(t, lfC, d)); lf[i] = finishOf(t, ls[i], d) }
    else { ls[i] = lf[i] = t.cal.prevWork(Math.min(lsC, lfC)) }
  }
  return { es, ef, ls, lf, finish }
}

/** total / free float in working days of the project's default calendar */
export function floats2(net: Net2, r: Run2, durs?: ArrayLike<number>): { total: number[]; free: number[] } {
  const { tasks, out, def } = net, n = tasks.length
  const dur = (i: number) => (durs ? durs[i] : tasks[i].dur)
  const w = (d: number) => def.idxAfter(d)
  const total = new Array<number>(n), free = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    total[i] = w(r.ls[i]) - w(r.es[i])
    let ff = Infinity
    for (const e of out[i]) {
      const t = tasks[i], s = tasks[e.s]
      if (e.type === 'FS' || e.type === 'SS') ff = Math.min(ff, w(r.es[e.s]) - w(startBound(t, dur(i), r.es[i], r.ef[i], e.type, e.lag, s, dur(e.s))))
      else ff = Math.min(ff, w(r.ef[e.s]) - w(t.cal.shift(e.type === 'FF' ? r.ef[i] : r.es[i], e.lag)))
    }
    if (!Number.isFinite(ff)) ff = w(r.finish) - w(r.ef[i])
    free[i] = Math.max(0, ff)
  }
  return { total, free }
}

export { startBound as startBound2, startFromFinish as startFromFinish2, finishOf as finishOf2 }
