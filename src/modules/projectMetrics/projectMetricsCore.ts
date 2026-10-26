/**
 * Project dashboard metrics — one place. Every figure is derived from the same engines the modules use, so the dashboard,
 * the radar, the lifecycle (Stage-Gate) and each module show the same numbers:
 *  - progress: the Stage-Gate engine (sgProgress) over the project's master plan; its EPC phase from the engineering /
 *    material / execution modules (epcAt), planned and actual alike
 *  - money: the finance module's own indicators (budget / contract value, certified amounts)
 *  - risks, delays: the risk register and the execution stoppage register
 * Pure: the caller passes rows and the module computations in.
 */
import { sgProgress } from '../stagegate/sgProgress'
import type { EpcProgress } from '../epc/epcProgress'
import type { LifecycleInputs } from './lifecycleInputs'

export interface PhaseMetric {
  code: string; title: string; engine: string; weight: number
  actual: number; planned: number
  start: string | null; finish: string | null
  state: 'done' | 'current' | 'upcoming'
}
export interface CurvePoint { date: string; planned: number; earned: number | null; cost: number | null }
export interface WeekPoint { from: string; planned: number; earned: number }
export interface Slice { key: string; label: string; value: number }
/** Earned value of the EPC scope only: BAC = the EPC contracts' current value, progress = the EPC phase (engineering /
 * procurement / construction modules, value-weighted), AC = what has been certified on the EPC contracts. */
export interface Evm {
  bac: number; bacSource: 'epc_contracts' | 'module_values' | 'none'
  pv: number; ev: number; ac: number
  spi: number | null; cpi: number | null; tcpi: number | null
  eac: number | null; etc: number | null; vac: number | null; cv: number; sv: number
}
export interface ProjectMetrics {
  asOf: string
  /** the EPC phase's planned / earned progress — the basis of every EVM figure */
  planned: number; earned: number; costPct: number | null
  /** the whole lifecycle (all phases, weighted) — the figure the radar, the picker and Stage-Gate show */
  lifecycle: { actual: number; planned: number }
  phases: PhaseMetric[]
  current: PhaseMetric | null
  epc: EpcProgress
  epcWindow: { start: string; finish: string } | null
  evm: Evm
  curve: CurvePoint[]
  weekly: WeekPoint[]
  costBreakdown: Slice[]
  wbs: Slice[]
  risks: Slice[]
  delays: Slice[]
}

export interface MetricsInput {
  lc: LifecycleInputs
  /** the EPC modules' progress at a date (today and history) */
  epcAt: (date: string) => EpcProgress
  epcWindow: { start: string; finish: string } | null
  finance: {
    /** current value of the live EPC contracts (finance module) */
    epcContractsValue: number
    /** certified amounts on the EPC contracts, dated */
    epcCertificates: { date: string; amount: number }[]
    /** certified amount per contract category (label) */
    byCategory: Slice[]
  }
  /** active risks by level key (critical / high / medium / low) */
  risks: Slice[]
  /** stoppage hours by category label */
  delays: Slice[]
  today: string
}

const DAY = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const ms = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()

/** months ends between two dates (inclusive of the last month), at most `cap` points (coarser steps on long spans) */
export function monthTicks(from: string, to: string, cap = 60): string[] {
  const out: string[] = []
  const a = new Date(`${from.slice(0, 7)}-01T00:00:00Z`), end = ms(to)
  const months = Math.max(1, Math.round((end - a.getTime()) / (30.44 * DAY)) + 1)
  const step = Math.max(1, Math.ceil(months / cap))
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); ; m += step) {
    const last = Date.UTC(y, m + 1, 0)
    if (last >= end) { out.push(iso(end)); break }
    out.push(iso(last))
  }
  return out
}

export function projectMetrics(inp: MetricsInput): ProjectMetrics {
  const { lc, today } = inp
  const rows = new Map(lc.phaseRows.map((r) => [r.phase, r]))
  const epcNow = inp.epcAt(today)
  const prog = sgProgress({
    phases: lc.phases.map((p) => ({ code: p.code, engine: p.engine })),
    phaseRows: lc.phaseRows.map((r) => ({ phase: r.phase, plannedStart: r.plannedStart, plannedFinish: r.plannedFinish, manualPct: r.manualPct, weightPct: r.weightPct })),
    schedule: lc.schedule.map((x) => ({ id: x.id, phase: x.phase, parentId: x.parentId, weightPct: x.weightPct, manualPct: x.manualPct })),
    clientReport: lc.clientReport,
    epcLive: epcNow.overall,
  }, new Date(`${today}T00:00:00Z`))
  const n = lc.phases.length || 1
  const weightOf = (code: string) => { const w = rows.get(code)?.weightPct; return typeof w === 'number' ? w : 100 / n }
  const totalW = lc.phases.reduce((s, p) => s + weightOf(p.code), 0) || 1
  const firstOpen = lc.phases.find((p) => rows.get(p.code)?.gateStatus !== 'passed')
  const phases: PhaseMetric[] = lc.phases.map((p) => {
    const v = prog.phases.get(p.code)!
    const r = rows.get(p.code)
    const win = p.engine === 'epc' && inp.epcWindow ? inp.epcWindow : { start: r?.plannedStart ?? null, finish: r?.plannedFinish ?? null }
    return {
      code: p.code, title: p.title, engine: p.engine, weight: (weightOf(p.code) / totalW) * 100, actual: v.actual, planned: v.planned,
      start: win.start, finish: win.finish,
      state: r?.gateStatus === 'passed' ? 'done' : p.code === firstOpen?.code ? 'current' : 'upcoming',
    }
  })

  // EVM on the EPC scope
  const f = inp.finance
  const moduleValue = (epcNow.values?.e ?? 0) + (epcNow.values?.p ?? 0) + (epcNow.values?.c ?? 0)
  const bacSource: Evm['bacSource'] = f.epcContractsValue > 0 ? 'epc_contracts' : moduleValue > 0 ? 'module_values' : 'none'
  const bac = f.epcContractsValue > 0 ? f.epcContractsValue : moduleValue
  const certs = [...f.epcCertificates].sort((x, y) => x.date.localeCompare(y.date))
  const costTo = (t: string) => certs.reduce((s, c) => s + (c.date <= t ? c.amount : 0), 0)
  const ac = costTo(today)
  const earned = epcNow.overall?.actual ?? 0, planned = epcNow.overall?.planned ?? earned
  const ev = (bac * earned) / 100, pv = (bac * planned) / 100
  const spi = planned > 0 ? earned / planned : null
  const cpi = ac > 0 && bac > 0 ? ev / ac : null
  const eac = cpi && cpi > 0 ? bac / cpi : null
  const evm: Evm = {
    bac, bacSource, pv, ev, ac, spi, cpi,
    tcpi: bac - ac > 0 ? (bac - ev) / (bac - ac) : null,
    eac, etc: eac == null ? null : eac - ac, vac: eac == null ? null : bac - eac, cv: ev - ac, sv: ev - pv,
  }
  const at = (t: string) => {
    if (t === today) return { actual: earned, planned }
    const o = inp.epcAt(t).overall
    return { actual: o?.actual ?? 0, planned: o?.planned ?? o?.actual ?? 0 }
  }

  // S-curve of the EPC scope: from the modules' first planned date (or the first certificate) to their last
  const dates = [inp.epcWindow?.start, inp.epcWindow?.finish, certs[0]?.date, today].filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort()
  const curve: CurvePoint[] = []
  if (epcNow.overall && dates.length > 1) {
    for (const t of monthTicks(dates[0], dates[dates.length - 1])) {
      const past = t <= today
      const v = at(t)
      curve.push({ date: t, planned: v.planned, earned: past ? v.actual : null, cost: past && bac > 0 ? (costTo(t) / bac) * 100 : null })
    }
    // today itself is always a point, matching the headline figures exactly
    const i = curve.findIndex((c) => c.date >= today)
    const pt = { date: today, planned, earned, cost: bac > 0 ? (ac / bac) * 100 : null }
    if (i < 0) curve.push(pt); else if (curve[i].date === today) curve[i] = pt; else curve.splice(i, 0, pt)
  }

  // the last ten weeks: EPC progress gained in each week, planned vs earned
  const weekly: WeekPoint[] = []
  if (epcNow.overall) {
    let prev = at(iso(ms(today) - 70 * DAY))
    for (let k = 9; k >= 0; k--) {
      const end = iso(ms(today) - k * 7 * DAY)
      const v = at(end)
      weekly.push({ from: iso(ms(end) - 6 * DAY), planned: Math.max(0, v.planned - prev.planned), earned: Math.max(0, v.actual - prev.actual) })
      prev = v
    }
  }

  const epcSlices: Slice[] = ([['E', 'مهندسی', epcNow.eng, epcNow.weights.e], ['P', 'تدارکات', epcNow.proc, epcNow.weights.p], ['C', 'اجرا', epcNow.cons, epcNow.weights.c]] as const)
    .filter(([, , d]) => d).map(([key, label, , w]) => ({ key, label, value: w }))

  return {
    asOf: today, planned, earned, costPct: bac > 0 ? (ac / bac) * 100 : null,
    lifecycle: { actual: prog.overall.actual, planned: prog.overall.planned },
    phases, current: phases.find((p) => p.state === 'current') ?? null,
    epc: epcNow, epcWindow: inp.epcWindow, evm, curve, weekly,
    costBreakdown: f.byCategory.filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    wbs: epcSlices,
    risks: inp.risks,
    delays: inp.delays.filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
  }
}
