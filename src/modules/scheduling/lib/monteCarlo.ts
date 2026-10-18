import { runCpm, type CpmTask } from '../../lifecycle/lib/cpm'
import { buildNetwork, buildNetwork2, needsAdvanced, type ScheduleInput } from './schedule'
import { isoOfDay, dayOfIso, run2 } from './engine2'

/**
 * Quantitative schedule (and cost) risk analysis — Monte Carlo on the REAL network of unfinished work.
 *  - duration uncertainty per activity: triangular(min, likely, max) working days (inputs stored in sch_duration_risk);
 *  - risk events: each occurs with its probability; if it occurs, a triangular delay (days) is added to every activity it is attached to, and a triangular cost is added to the cost;
 *  - the network is re-solved by CPM in every iteration (logic, lags, constraints, calendar are the same as the deterministic forecast);
 *  - seeded generator → the same inputs and seed always give the same result.
 * Nothing is invented: with no uncertainty inputs the result says so and equals the deterministic forecast. Cost = remaining budget + triggered event costs (no cost-time coupling).
 */
export interface Tri { min: number; likely: number; max: number }
export interface DurationRisk { uid: string; min: number; likely: number; max: number }
export interface RiskEvent { id: string; title: string; probability: number; days: Tri; cost: Tri; activityUids: string[]; active: boolean }
/** Cost–time coupling and targets (all optional; zero values reproduce the plain model where cost does not depend on time). */
export interface CostParams {
  /** share (0–1) of an activity's budget that scales with its duration (labour, equipment hire) */
  variableShare: number
  /** overhead per working day of the project duration (rial); applied to the difference from the deterministic finish */
  indirectPerDay: number
  targetFinish?: string | null
  targetCost?: number | null
}
export const NO_COST_PARAMS: CostParams = { variableShare: 0, indirectPerDay: 0, targetFinish: null, targetCost: null }
export interface McInput {
  schedule: ScheduleInput
  durationRisks: DurationRisk[]
  events: RiskEvent[]
  iterations?: number
  seed?: number
  costParams?: CostParams
  /** keep every iteration's finish (epoch day) and cost — needed to combine projects into a portfolio */
  keepSamples?: boolean
}
export interface McSensitivity { uid: string; code: string; name: string; /** Pearson correlation of the sampled duration with the project finish */ correlation: number; /** share of iterations in which the activity was critical */ criticalityIndex: number }
export interface McResult {
  ok: boolean
  iterations: number
  seed: number
  deterministicFinish: string | null
  /** percentile → finish date */
  finish: Record<'p10' | 'p50' | 'p80' | 'p90', string | null>
  /** reserve in calendar days on top of the deterministic finish to reach each confidence */
  reserveDays: Record<'p50' | 'p80' | 'p90', number | null>
  histogram: { date: string; count: number }[]
  cost: { base: number; p50: number; p80: number; p90: number; reserveP80: number } | null
  sensitivity: McSensitivity[]
  eventHits: { id: string; title: string; hitRate: number }[]
  /** cost–time relationship of the sampled outcomes (null without cost) */
  costTime: { correlation: number; scatter: { date: string; cost: number }[]; pFinish: number | null; pCost: number | null; pJoint: number | null; params: CostParams } | null
  samples?: { finishEpoch: number[]; cost: number[] }
  warnings: string[]
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** inverse-CDF sample of a triangular distribution */
export function triangular(u: number, min: number, likely: number, max: number): number {
  if (max <= min) return min
  const c = (likely - min) / (max - min)
  return u < c ? min + Math.sqrt(u * (max - min) * (likely - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - likely))
}
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
const corr = (x: number[], y: number[]): number => {
  const n = x.length; if (n < 3) return 0
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}


interface Engine {
  ids: string[]; durs: number[]; integer: boolean
  run: (d: number[]) => { finish: number; critical: boolean[] }
  dateOf: (finish: number) => string
  unitOfDate: (iso: string) => number
  /** working days (project calendar) — the unit of the indirect cost */
  wd: (finish: number) => number
  actsById: Map<string, import('./types').SchActivity>
  status: Map<string, string>
  warnings: string[]
  cycle: boolean
}

function makeEngine(sched: ScheduleInput): Engine | null {
  if (needsAdvanced(sched)) {
    const n2 = buildNetwork2(sched)
    if (!n2.net.tasks.length) return null
    const net = n2.net, pos = net.tasks
    const crit = (r: ReturnType<typeof run2>, d: number[]) => pos.map((_, i) => net.def.idxAfter(r.ls[i]) - net.def.idxAfter(r.es[i]) <= 0 && d[i] >= 0)
    return {
      ids: pos.map((t) => t.id), durs: pos.map((t) => t.dur), integer: true, cycle: !!net.cycle,
      run: (d) => { const r = run2(net, d); return { finish: r.finish, critical: crit(r, d) } },
      dateOf: isoOfDay, unitOfDate: dayOfIso, wd: (f) => net.def.idxAfter(f),
      actsById: n2.byId, status: n2.status, warnings: [...n2.warnings, 'تحلیل با تقویم‌های اختصاصی و قیدهای تاریخ انجام شد؛ مدت‌ها به روز کاری گرد می‌شوند.'],
    }
  }
  const net = buildNetwork(sched)
  if (!net.tasks.length) return null
  const cal = net.cal
  const probe = runCpm(net.tasks, net.deps)
  return {
    ids: net.tasks.map((t) => t.id), durs: net.tasks.map((t) => t.duration), integer: false, cycle: !!probe.cycle,
    run: (d) => {
      const tasks: CpmTask[] = net.tasks.map((t, i) => ({ ...t, duration: d[i] }))
      const out = runCpm(tasks, net.deps)
      return { finish: out.finish, critical: tasks.map((t) => out.tasks.get(t.id)?.critical ?? false) }
    },
    dateOf: (f) => cal.dateOf(Math.max(0, f - 1)), unitOfDate: (iso) => cal.idxOnOrBefore(iso) + 1, wd: (f) => f,
    actsById: net.byId, status: net.status, warnings: net.warnings,
  }
}

export function runMonteCarlo(inp: McInput): McResult {
  const iterations = Math.max(100, Math.min(20000, Math.round(inp.iterations ?? 2000)))
  const seed = inp.seed ?? 12345
  const cp = { ...NO_COST_PARAMS, ...(inp.costParams ?? {}) }
  const warnings: string[] = []
  const blank: McResult = { ok: false, iterations, seed, deterministicFinish: null, finish: { p10: null, p50: null, p80: null, p90: null }, reserveDays: { p50: null, p80: null, p90: null }, histogram: [], cost: null, sensitivity: [], eventHits: [], costTime: null, warnings }
  const eng = makeEngine(inp.schedule)
  if (!eng) { warnings.push('فعالیت باز برای تحلیل وجود ندارد.'); return blank }
  if (eng.cycle) { warnings.push('شبکهٔ فعالیت‌ها چرخهٔ منطقی دارد؛ تحلیل کمی ممکن نیست.'); return blank }
  const n = eng.ids.length, round = (x: number) => (eng.integer ? Math.max(0, Math.round(x)) : x)
  const base = eng.run(eng.durs)
  warnings.push(...eng.warnings)
  const acts = [...eng.actsById.values()]
  const uidOfId = new Map(acts.map((a) => [a.id, a.uid]))
  const idByUid = new Map(acts.map((a) => [a.uid, a.id]))
  const posOf = new Map(eng.ids.map((id, i) => [id, i]))
  const risks = inp.durationRisks.filter((d) => idByUid.has(d.uid) && posOf.has(idByUid.get(d.uid)!) && (d.max > d.min || d.likely > 0))
  const events = inp.events.filter((e) => e.active && e.probability > 0 && e.activityUids.some((u) => posOf.has(idByUid.get(u) ?? '')))
  const skippedRisks = inp.durationRisks.length - risks.length
  if (skippedRisks > 0) warnings.push(`${skippedRisks} ورودی عدم‌قطعیت مدت به فعالیت‌های تمام‌شده یا خارج از این نسخه اشاره دارد و نادیده گرفته شد.`)
  if (!risks.length && !events.length) warnings.push('هیچ عدم‌قطعیت مدت یا رویداد ریسکی تعریف نشده است؛ نتیجه با پیش‌بینی قطعی یکسان است.')

  const rnd = mulberry32(seed)
  const riskPos = risks.map((r) => ({ i: posOf.get(idByUid.get(r.uid)!)!, r }))
  const eventPos = events.map((e) => ({ e, ids: e.activityUids.map((u) => posOf.get(idByUid.get(u) ?? '')).filter((x): x is number => x != null) }))
  // budget still to be spent per task (the share of it that depends on duration follows the sampled duration)
  const budget = eng.ids.map((id) => { const a = eng.actsById.get(id)!; return a.budgetCost * (eng.status.get(id) === 'in_progress' ? 1 - (a.pctComplete ?? 0) / 100 : 1) })
  const baseCost = budget.reduce((s, x) => s + x, 0)
  const hasCost = baseCost > 0 || events.some((e) => e.cost.max > 0) || cp.indirectPerDay > 0
  const v = Math.min(1, Math.max(0, cp.variableShare))
  const detWd = eng.wd(base.finish)

  const finishes: number[] = [], costs: number[] = []
  const sampleDur = new Map<number, number[]>(), critCount = new Array<number>(n).fill(0), hits = new Map<string, number>()
  for (const { i } of riskPos) sampleDur.set(i, [])
  const dur = new Array<number>(n)
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) dur[i] = eng.durs[i]
    for (const { i, r } of riskPos) { const d = triangular(rnd(), r.min, r.likely, r.max); dur[i] = d; sampleDur.get(i)!.push(d) }
    let extra = 0
    for (const { e, ids } of eventPos) {
      if (rnd() < e.probability) {
        const days = triangular(rnd(), e.days.min, e.days.likely, e.days.max)
        for (const i of ids) dur[i] += days
        extra += triangular(rnd(), e.cost.min, e.cost.likely, e.cost.max)
        hits.set(e.id, (hits.get(e.id) ?? 0) + 1)
      }
    }
    if (eng.integer) for (let i = 0; i < n; i++) dur[i] = round(dur[i])
    const out = eng.run(dur)
    finishes.push(out.finish)
    if (hasCost) {
      let cost = extra
      for (let i = 0; i < n; i++) if (budget[i]) cost += budget[i] * (v > 0 && eng.durs[i] > 0 ? 1 - v + v * (dur[i] / eng.durs[i]) : 1)
      cost += cp.indirectPerDay * (eng.wd(out.finish) - detWd)
      costs.push(cost)
    }
    for (let i = 0; i < n; i++) if (out.critical[i]) critCount[i]++
  }
  const sorted = [...finishes].sort((a, b) => a - b)
  const at = (p: number) => Math.ceil(percentile(sorted, p) - 1e-9)
  const detUnit = Math.ceil(base.finish - 1e-9)
  const detDate = eng.dateOf(detUnit)
  const dateOf = (p: number) => eng.dateOf(at(p))
  const calDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
  const res: McResult = {
    ok: true, iterations, seed, deterministicFinish: detDate,
    finish: { p10: dateOf(0.1), p50: dateOf(0.5), p80: dateOf(0.8), p90: dateOf(0.9) },
    reserveDays: { p50: calDays(detDate, dateOf(0.5)), p80: calDays(detDate, dateOf(0.8)), p90: calDays(detDate, dateOf(0.9)) },
    histogram: [], cost: null, sensitivity: [], eventHits: [], costTime: null, warnings,
  }
  const lo = sorted[0], hi = sorted[sorted.length - 1], bins = Math.min(24, Math.max(1, Math.round(hi - lo) + 1))
  const step = (hi - lo + 1e-9) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const f of finishes) counts[Math.min(bins - 1, Math.floor((f - lo) / step))]++
  res.histogram = counts.map((c, i) => ({ date: eng.dateOf(Math.ceil(lo + (i + 1) * step - 1e-9)), count: c }))
  if (hasCost) {
    const cs = [...costs].sort((a, b) => a - b)
    res.cost = { base: baseCost, p50: percentile(cs, 0.5), p80: percentile(cs, 0.8), p90: percentile(cs, 0.9), reserveP80: percentile(cs, 0.8) - baseCost }
    const tf = cp.targetFinish ? eng.unitOfDate(cp.targetFinish) : null, tc = cp.targetCost != null && cp.targetCost > 0 ? cp.targetCost : null
    const cnt = (f: (i: number) => boolean) => { let c = 0; for (let i = 0; i < iterations; i++) if (f(i)) c++; return c / iterations }
    const stride = Math.max(1, Math.floor(iterations / 150)), scatter: { date: string; cost: number }[] = []
    for (let i = 0; i < iterations; i += stride) scatter.push({ date: eng.dateOf(Math.ceil(finishes[i] - 1e-9)), cost: costs[i] })
    res.costTime = {
      correlation: corr(finishes, costs), scatter, params: cp,
      pFinish: tf != null ? cnt((i) => finishes[i] <= tf) : null, pCost: tc != null ? cnt((i) => costs[i] <= tc) : null,
      pJoint: tf != null && tc != null ? cnt((i) => finishes[i] <= tf && costs[i] <= tc) : null,
    }
  } else warnings.push('بودجه یا هزینهٔ رویدادها تعریف نشده است؛ تحلیل هزینه انجام نشد.')
  const sens: McSensitivity[] = []
  for (const [i, samples] of sampleDur) { const a = eng.actsById.get(eng.ids[i])!; sens.push({ uid: uidOfId.get(a.id)!, code: a.code, name: a.name, correlation: corr(samples, finishes), criticalityIndex: critCount[i] / iterations }) }
  // activities without their own uncertainty still show their criticality
  for (let i = 0; i < n; i++) if (!sampleDur.has(i) && critCount[i] / iterations >= 0.3) { const a = eng.actsById.get(eng.ids[i])!; sens.push({ uid: uidOfId.get(a.id)!, code: a.code, name: a.name, correlation: 0, criticalityIndex: critCount[i] / iterations }) }
  res.sensitivity = sens.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation) || b.criticalityIndex - a.criticalityIndex).slice(0, 15)
  res.eventHits = events.map((e) => ({ id: e.id, title: e.title, hitRate: (hits.get(e.id) ?? 0) / iterations }))
  if (inp.keepSamples) {
    const memo = new Map<number, number>()
    res.samples = { finishEpoch: finishes.map((f) => { let e = memo.get(f); if (e == null) { e = Date.parse(eng.dateOf(Math.ceil(f - 1e-9))) / 86400000; memo.set(f, e) } return e }), cost: hasCost ? costs : new Array<number>(iterations).fill(0) }
  }
  return res
}
