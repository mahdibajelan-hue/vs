import { mulberry32, percentile, runMonteCarlo, triangular, type McInput, type McResult, type Tri } from './monteCarlo'

/**
 * Portfolio-level quantitative analysis. Every project is simulated with its own network and inputs (same iteration count, independent seeds); iteration i of the
 * portfolio combines iteration i of every project:   programme finish = the latest project finish,   cost = the sum of project costs.
 * Without common drivers the projects are statistically independent. A common driver is ONE draw per iteration (probability, delay, cost) applied to every project it lists —
 * that is how a shared supplier, regulator, currency or weather risk makes the projects move together. A driver's delay is added to each listed project's finish in calendar days.
 */
export interface PortfolioItem { id: string; name: string; input: McInput }
export interface PortfolioDriver { id: string; title: string; probability: number; days: Tri; cost: Tri; projectIds: string[]; active: boolean }
export interface PortfolioTargets { finish?: string | null; cost?: number | null }
export interface PortfolioProject { id: string; name: string; deterministicFinish: string | null; finishP50: string | null; finishP80: string | null; finishP90: string | null; costBase: number | null; costP50: number | null; costP80: number | null; /** share of iterations in which this project sets the programme finish */ drivesFinish: number }
export interface PortfolioResult {
  ok: boolean; iterations: number; seed: number
  projects: PortfolioProject[]
  finish: Record<'det' | 'p10' | 'p50' | 'p80' | 'p90', string | null>
  cost: { base: number; p50: number; p80: number; p90: number } | null
  /** Σ(project P80 reserves) − portfolio P80 reserve: what pooling saves */
  diversification: number | null
  correlation: number
  histogram: { date: string; count: number }[]
  scatter: { date: string; cost: number }[]
  driverHits: { id: string; title: string; hitRate: number }[]
  pFinish: number | null; pCost: number | null; pJoint: number | null
  warnings: string[]
}

const iso = (epoch: number) => new Date(Math.round(epoch) * 86400000).toISOString().slice(0, 10)
const pearson = (x: number[], y: number[]): number => {
  const n = x.length; if (n < 3) return 0
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}

export function runPortfolio(items: PortfolioItem[], drivers: PortfolioDriver[], o: { iterations?: number; seed?: number; targets?: PortfolioTargets } = {}): PortfolioResult {
  const iterations = Math.max(100, Math.min(20000, Math.round(o.iterations ?? 2000))), seed = o.seed ?? 12345
  const warnings: string[] = []
  const blank: PortfolioResult = { ok: false, iterations, seed, projects: [], finish: { det: null, p10: null, p50: null, p80: null, p90: null }, cost: null, diversification: null, correlation: 0, histogram: [], scatter: [], driverHits: [], pFinish: null, pCost: null, pJoint: null, warnings }
  const runs: { item: PortfolioItem; res: McResult }[] = []
  items.forEach((item, k) => {
    const res = runMonteCarlo({ ...item.input, iterations, seed: seed + k * 7919, keepSamples: true })
    if (!res.ok || !res.samples) warnings.push(`پروژهٔ «${item.name}» تحلیل نشد: ${res.warnings[0] ?? 'ورودی ناکافی'}`)
    else runs.push({ item, res })
  })
  if (!runs.length) { warnings.push('هیچ پروژه‌ای قابل تحلیل نبود.'); return blank }
  const act = drivers.filter((d) => d.active && d.probability > 0 && d.projectIds.some((p) => runs.some((r) => r.item.id === p)))
  const rnd = mulberry32((seed ^ 0x9e3779b1) >>> 0)
  const idx = new Map(runs.map((r, k) => [r.item.id, k]))
  const fin = new Array<number>(iterations), cst = new Array<number>(iterations), lead = new Array<number>(runs.length).fill(0), hit = new Map<string, number>()
  for (let it = 0; it < iterations; it++) {
    const f = runs.map((r) => r.res.samples!.finishEpoch[it]), extraDays = new Array<number>(runs.length).fill(0)
    let cost = 0
    for (const r of runs) cost += r.res.samples!.cost[it]
    for (const d of act) {
      if (rnd() >= d.probability) continue
      const days = triangular(rnd(), d.days.min, d.days.likely, d.days.max)
      cost += triangular(rnd(), d.cost.min, d.cost.likely, d.cost.max)
      for (const p of d.projectIds) { const k = idx.get(p); if (k != null) extraDays[k] += days }
      hit.set(d.id, (hit.get(d.id) ?? 0) + 1)
    }
    let best = -Infinity, who = 0
    for (let k = 0; k < runs.length; k++) { const x = f[k] + extraDays[k]; if (x > best) { best = x; who = k } }
    fin[it] = best; cst[it] = cost; lead[who]++
  }
  const fs = [...fin].sort((a, b) => a - b), cs = [...cst].sort((a, b) => a - b)
  const baseCost = runs.reduce((s, r) => s + (r.res.cost?.base ?? 0), 0)
  const det = Math.max(...runs.map((r) => Date.parse(r.res.deterministicFinish!) / 86400000))
  const hasCost = cs.some((x) => x > 0)
  const lo = fs[0], hi = fs[fs.length - 1], bins = Math.min(24, Math.max(1, Math.round(hi - lo) + 1)), step = (hi - lo + 1e-9) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const f of fin) counts[Math.min(bins - 1, Math.floor((f - lo) / step))]++
  const stride = Math.max(1, Math.floor(iterations / 150)), scatter: { date: string; cost: number }[] = []
  for (let i = 0; i < iterations; i += stride) scatter.push({ date: iso(fin[i]), cost: cst[i] })
  const tf = o.targets?.finish ? Date.parse(o.targets.finish) / 86400000 : null, tc = o.targets?.cost && o.targets.cost > 0 ? o.targets.cost : null
  const cnt = (f: (i: number) => boolean) => { let c = 0; for (let i = 0; i < iterations; i++) if (f(i)) c++; return c / iterations }
  const sumReserve = runs.reduce((s, r) => s + (r.res.cost ? r.res.cost.reserveP80 : 0), 0)
  const p80c = percentile(cs, 0.8)
  return {
    ok: true, iterations, seed, warnings,
    projects: runs.map((r, k) => ({ id: r.item.id, name: r.item.name, deterministicFinish: r.res.deterministicFinish, finishP50: r.res.finish.p50, finishP80: r.res.finish.p80, finishP90: r.res.finish.p90, costBase: r.res.cost?.base ?? null, costP50: r.res.cost?.p50 ?? null, costP80: r.res.cost?.p80 ?? null, drivesFinish: lead[k] / iterations })),
    finish: { det: iso(det), p10: iso(Math.ceil(percentile(fs, 0.1))), p50: iso(Math.ceil(percentile(fs, 0.5))), p80: iso(Math.ceil(percentile(fs, 0.8))), p90: iso(Math.ceil(percentile(fs, 0.9))) },
    cost: hasCost ? { base: baseCost, p50: percentile(cs, 0.5), p80: p80c, p90: percentile(cs, 0.9) } : null,
    diversification: hasCost ? sumReserve - (p80c - baseCost) : null,
    correlation: hasCost ? pearson(fin, cst) : 0,
    histogram: counts.map((c, i) => ({ date: iso(Math.ceil(lo + (i + 1) * step - 1e-9)), count: c })),
    scatter: hasCost ? scatter : [],
    driverHits: act.map((d) => ({ id: d.id, title: d.title, hitRate: (hit.get(d.id) ?? 0) / iterations })),
    pFinish: tf != null ? cnt((i) => fin[i] <= tf) : null, pCost: tc != null && hasCost ? cnt((i) => cst[i] <= tc) : null, pJoint: tf != null && tc != null && hasCost ? cnt((i) => fin[i] <= tf && cst[i] <= tc) : null,
  }
}
