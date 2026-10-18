import { runCpm, type CpmTask } from '../../lifecycle/lib/cpm'
import { buildNetwork, type ScheduleInput } from './schedule'

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
export interface McInput {
  schedule: ScheduleInput
  durationRisks: DurationRisk[]
  events: RiskEvent[]
  iterations?: number
  seed?: number
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

export function runMonteCarlo(inp: McInput): McResult {
  const iterations = Math.max(100, Math.min(20000, Math.round(inp.iterations ?? 2000)))
  const seed = inp.seed ?? 12345
  const warnings: string[] = []
  const blank: McResult = { ok: false, iterations, seed, deterministicFinish: null, finish: { p10: null, p50: null, p80: null, p90: null }, reserveDays: { p50: null, p80: null, p90: null }, histogram: [], cost: null, sensitivity: [], eventHits: [], warnings }
  const net = buildNetwork(inp.schedule)
  if (!net.tasks.length) { warnings.push('فعالیت باز برای تحلیل وجود ندارد.'); return blank }
  const base = runCpm(net.tasks, net.deps)
  if (base.cycle) { warnings.push('شبکهٔ فعالیت‌ها چرخهٔ منطقی دارد؛ تحلیل کمی ممکن نیست.'); return blank }
  warnings.push(...net.warnings)
  const uidOfId = new Map(net.acts.map((a) => [a.id, a.uid]))
  const idByUid = new Map(net.acts.map((a) => [a.uid, a.id]))
  const live = new Set(net.tasks.map((t) => t.id))
  const risks = inp.durationRisks.filter((d) => idByUid.has(d.uid) && live.has(idByUid.get(d.uid)!) && (d.max > d.min || d.likely > 0))
  const events = inp.events.filter((e) => e.active && e.probability > 0 && e.activityUids.some((u) => live.has(idByUid.get(u) ?? '')))
  const skippedRisks = inp.durationRisks.length - risks.length
  if (skippedRisks > 0) warnings.push(`${skippedRisks} ورودی عدم‌قطعیت مدت به فعالیت‌های تمام‌شده یا خارج از این نسخه اشاره دارد و نادیده گرفته شد.`)
  if (!risks.length && !events.length) warnings.push('هیچ عدم‌قطعیت مدت یا رویداد ریسکی تعریف نشده است؛ نتیجه با پیش‌بینی قطعی یکسان است.')

  const cal = net.cal
  const dateOfFinishIdx = (idx: number) => cal.dateOf(Math.max(0, idx - 1))
  const rnd = mulberry32(seed)
  const riskByTask = new Map(risks.map((r) => [idByUid.get(r.uid)!, r]))
  const eventTasks = events.map((e) => ({ e, ids: e.activityUids.map((u) => idByUid.get(u)).filter((x): x is string => !!x && live.has(x)) }))
  const baseCost = net.acts.filter((a) => live.has(a.id)).reduce((s, a) => s + a.budgetCost * (net.status.get(a.id) === 'in_progress' ? 1 - (a.pctComplete ?? 0) / 100 : 1), 0)
  const hasCost = baseCost > 0 || events.some((e) => e.cost.max > 0)

  const finishes: number[] = [], costs: number[] = []
  const sampleDur = new Map<string, number[]>(), critCount = new Map<string, number>(), hits = new Map<string, number>()
  for (const r of risks) sampleDur.set(idByUid.get(r.uid)!, [])
  const tasks: CpmTask[] = net.tasks.map((t) => ({ ...t }))
  const idx = new Map(tasks.map((t, i) => [t.id, i]))
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < tasks.length; i++) tasks[i].duration = net.tasks[i].duration
    for (const [id, r] of riskByTask) {
      // the triangular range replaces the point estimate (its likely value is the planner's most likely remaining duration)
      const d = triangular(rnd(), r.min, r.likely, r.max)
      tasks[idx.get(id)!].duration = d
      sampleDur.get(id)!.push(d)
    }
    let cost = baseCost
    for (const { e, ids } of eventTasks) {
      if (rnd() < e.probability) {
        const days = triangular(rnd(), e.days.min, e.days.likely, e.days.max)
        for (const id of ids) tasks[idx.get(id)!].duration += days
        cost += triangular(rnd(), e.cost.min, e.cost.likely, e.cost.max)
        hits.set(e.id, (hits.get(e.id) ?? 0) + 1)
      }
    }
    const out = runCpm(tasks, net.deps)
    finishes.push(out.finish)
    if (hasCost) costs.push(cost)
    for (const t of tasks) if (out.tasks.get(t.id)!.critical) critCount.set(t.id, (critCount.get(t.id) ?? 0) + 1)
  }
  const sorted = [...finishes].sort((a, b) => a - b)
  const at = (p: number) => Math.ceil(percentile(sorted, p) - 1e-9)
  const detIdx = Math.ceil(base.finish - 1e-9)
  const detDate = dateOfFinishIdx(detIdx)
  const dateOf = (p: number) => dateOfFinishIdx(at(p))
  const calDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
  const res: McResult = {
    ok: true, iterations, seed, deterministicFinish: detDate,
    finish: { p10: dateOf(0.1), p50: dateOf(0.5), p80: dateOf(0.8), p90: dateOf(0.9) },
    reserveDays: { p50: calDays(detDate, dateOf(0.5)), p80: calDays(detDate, dateOf(0.8)), p90: calDays(detDate, dateOf(0.9)) },
    histogram: [], cost: null, sensitivity: [], eventHits: [], warnings,
  }
  const lo = sorted[0], hi = sorted[sorted.length - 1], bins = Math.min(24, Math.max(1, Math.round(hi - lo) + 1))
  const step = (hi - lo + 1e-9) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const f of finishes) counts[Math.min(bins - 1, Math.floor((f - lo) / step))]++
  res.histogram = counts.map((c, i) => ({ date: dateOfFinishIdx(Math.ceil(lo + (i + 1) * step - 1e-9)), count: c }))
  if (hasCost) {
    const cs = [...costs].sort((a, b) => a - b)
    res.cost = { base: baseCost, p50: percentile(cs, 0.5), p80: percentile(cs, 0.8), p90: percentile(cs, 0.9), reserveP80: percentile(cs, 0.8) - baseCost }
  } else warnings.push('بودجه یا هزینهٔ رویدادها تعریف نشده است؛ تحلیل هزینه انجام نشد.')
  const acts = new Map(net.acts.map((a) => [a.id, a]))
  const sens: McSensitivity[] = []
  for (const [id, samples] of sampleDur) { const a = acts.get(id)!; sens.push({ uid: uidOfId.get(id)!, code: a.code, name: a.name, correlation: corr(samples, finishes), criticalityIndex: (critCount.get(id) ?? 0) / iterations }) }
  // activities without their own uncertainty still show their criticality
  for (const t of net.tasks) if (!sampleDur.has(t.id) && (critCount.get(t.id) ?? 0) / iterations >= 0.3) { const a = acts.get(t.id)!; sens.push({ uid: uidOfId.get(t.id)!, code: a.code, name: a.name, correlation: 0, criticalityIndex: (critCount.get(t.id) ?? 0) / iterations }) }
  res.sensitivity = sens.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation) || b.criticalityIndex - a.criticalityIndex).slice(0, 15)
  res.eventHits = events.map((e) => ({ id: e.id, title: e.title, hitRate: (hits.get(e.id) ?? 0) / iterations }))
  return res
}
