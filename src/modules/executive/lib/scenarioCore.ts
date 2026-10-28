/**
 * Portfolio scenarios — "what if project X is deferred or stopped, against an annual budget ceiling" (council item).
 *
 *  - Each project's remaining spend = (EAC, else budget) × (1 − actual progress). It is laid over the months ahead
 *    following the project's own baseline cash plan when one exists, otherwise evenly up to its forecast finish
 *    date. The source of every profile is returned so the page can say which numbers are assumed.
 *  - A scenario changes projects only by deferring (shifting the profile N months) or terminating (remaining spend
 *    stops; an optional termination cost, as % of the remaining, is booked in the first month).
 *  - Caps are per Jalali year; a year without a cap is not constrained.
 *  - autoFit funds projects in portfolio order (mandatory first, then by rank) and defers each one, in 3-month steps,
 *    until every capped year holds. It never terminates a project on its own — that stays a human decision.
 *
 * Months are absolute indices: jy × 12 + (jm − 1).
 */

export type ScAction = 'base' | 'defer' | 'terminate'
export interface ScChoice { action: ScAction; deferMonths: number }
export type ScProfileSource = 'cash_plan' | 'linear' | 'overdue' | 'none'

export interface ScProject {
  id: string
  name: string
  rank: number | null
  priority: number | null
  mandatory: boolean
  /** spend still to come, in the portfolio currency */
  remaining: number
  /** monthly amounts starting at `startMonth`; sums to `remaining` */
  profile: number[]
  startMonth: number
  source: ScProfileSource
  /** progress came from the project's snapshot (false = assumed 0) */
  progressKnown: boolean
}

export interface ScScenario {
  caps: Record<number, number>
  choices: Record<string, ScChoice>
  terminationPct: number
}

export const monthIndex = (jy: number, jm: number) => jy * 12 + (jm - 1)
export const yearOf = (m: number) => Math.floor(m / 12)

/** months between now and finish (inclusive of the current month), at least 1 */
export function monthsUntil(now: number, finish: number | null) {
  return finish == null ? null : Math.max(1, finish - now + 1)
}

/**
 * Build a project's remaining-spend profile.
 * @param cashPlan monthly baseline amounts keyed by month index (any months, past ones are ignored)
 * @param finishMonth forecast / revised / planned finish month, or null
 */
export function buildProfile(args: {
  id: string; name: string; rank: number | null; priority: number | null; mandatory: boolean
  costAtCompletion: number | null; progressPct: number | null; now: number
  cashPlan?: Map<number, number>; finishMonth: number | null
  /** months to spread an overdue or undated project over */
  fallbackMonths?: number
}): ScProject {
  const { now } = args
  const progress = args.progressPct == null ? 0 : Math.min(100, Math.max(0, args.progressPct))
  const remaining = args.costAtCompletion != null && args.costAtCompletion > 0 ? args.costAtCompletion * (1 - progress / 100) : 0
  const base = { id: args.id, name: args.name, rank: args.rank, priority: args.priority, mandatory: args.mandatory, remaining, startMonth: now, progressKnown: args.progressPct != null }
  if (remaining <= 0) return { ...base, profile: [], source: 'none' }

  const future = [...(args.cashPlan ?? new Map()).entries()].filter(([m, v]) => m >= now && v > 0).sort((a, b) => a[0] - b[0])
  const planSum = future.reduce((a, [, v]) => a + v, 0)
  if (planSum > 0) {
    const last = future[future.length - 1][0]
    const profile = new Array(last - now + 1).fill(0)
    for (const [m, v] of future) profile[m - now] = (v / planSum) * remaining
    return { ...base, profile, source: 'cash_plan' }
  }

  const fallback = args.fallbackMonths ?? 12
  const span = args.finishMonth != null && args.finishMonth >= now ? monthsUntil(now, args.finishMonth)! : fallback
  return { ...base, profile: new Array(span).fill(remaining / span), source: args.finishMonth != null && args.finishMonth >= now ? 'linear' : 'overdue' }
}

/** the monthly spend of one project under a choice */
export function applyChoice(p: ScProject, choice: ScChoice | undefined, terminationPct: number): Map<number, number> {
  const out = new Map<number, number>()
  const c = choice ?? { action: 'base', deferMonths: 0 }
  if (c.action === 'terminate') {
    const cost = (p.remaining * Math.max(0, terminationPct)) / 100
    if (cost > 0) out.set(p.startMonth, cost)
    return out
  }
  const shift = c.action === 'defer' ? Math.max(0, Math.round(c.deferMonths)) : 0
  p.profile.forEach((v, i) => { if (v) out.set(p.startMonth + i + shift, (out.get(p.startMonth + i + shift) ?? 0) + v) })
  return out
}

export interface ScYear { jy: number; demand: number; cap: number | null; gap: number | null; byProject: Map<string, number> }

export interface ScResult {
  years: ScYear[]
  totalSpend: number
  baseSpend: number
  /** baseSpend − totalSpend (positive = money released by the scenario) */
  released: number
  overCapYears: number[]
  terminated: string[]
  deferred: string[]
  /** priority-weighted remaining value kept going: Σ priority×remaining of non-terminated / Σ over all, 0–1 */
  valueKept: number | null
  /** months each project's finish moves */
  finishShift: Map<string, number>
}

export function evaluate(projects: ScProject[], sc: ScScenario): ScResult {
  const years = new Map<number, ScYear>()
  const touch = (jy: number) => years.get(jy) ?? (years.set(jy, { jy, demand: 0, cap: sc.caps[jy] ?? null, gap: null, byProject: new Map() }), years.get(jy)!)
  let totalSpend = 0, baseSpend = 0, vAll = 0, vKept = 0
  const terminated: string[] = [], deferred: string[] = []
  const finishShift = new Map<string, number>()
  for (const p of projects) {
    baseSpend += p.remaining
    const c = sc.choices[p.id]
    if (c?.action === 'terminate') terminated.push(p.id)
    else if (c?.action === 'defer' && c.deferMonths > 0) { deferred.push(p.id); finishShift.set(p.id, Math.round(c.deferMonths)) }
    for (const [m, v] of applyChoice(p, c, sc.terminationPct)) {
      const y = touch(yearOf(m))
      y.demand += v
      y.byProject.set(p.id, (y.byProject.get(p.id) ?? 0) + v)
      totalSpend += v
    }
    if (p.priority != null && p.remaining > 0) {
      vAll += p.priority * p.remaining
      if (c?.action !== 'terminate') vKept += p.priority * p.remaining
    }
  }
  for (const jy of Object.keys(sc.caps).map(Number)) touch(jy)
  const list = [...years.values()].sort((a, b) => a.jy - b.jy)
  for (const y of list) y.gap = y.cap != null && y.cap > 0 ? y.cap - y.demand : null
  return {
    years: list, totalSpend, baseSpend, released: baseSpend - totalSpend,
    overCapYears: list.filter((y) => y.gap != null && y.gap < -0.5).map((y) => y.jy),
    terminated, deferred, valueKept: vAll > 0 ? vKept / vAll : null, finishShift,
  }
}

/** portfolio funding order: mandatory first, then by rank, unranked last (largest remaining first among them) */
export function fundingOrder(projects: ScProject[]) {
  return [...projects].sort((a, b) =>
    (a.mandatory === b.mandatory ? 0 : a.mandatory ? -1 : 1)
    || (a.rank ?? 1e9) - (b.rank ?? 1e9)
    || b.remaining - a.remaining)
}

/**
 * Greedy fit under the caps: walk the funding order, keep terminated projects as chosen, and give every other project
 * the smallest deferral (0, 3, 6, … maxDefer months) that keeps all capped years within cap. Mandatory projects are
 * never deferred. Returns the choices and the projects that still could not fit (left at maxDefer).
 */
export function autoFit(projects: ScProject[], sc: ScScenario, maxDefer = 36, step = 3) {
  const used = new Map<number, number>()
  const capOf = (jy: number) => (sc.caps[jy] != null && sc.caps[jy] > 0 ? sc.caps[jy] : null)
  const fits = (spend: Map<number, number>) => {
    const add = new Map<number, number>()
    for (const [m, v] of spend) add.set(yearOf(m), (add.get(yearOf(m)) ?? 0) + v)
    for (const [jy, v] of add) { const cap = capOf(jy); if (cap != null && (used.get(jy) ?? 0) + v > cap + 0.5) return false }
    return true
  }
  const commit = (spend: Map<number, number>) => { for (const [m, v] of spend) used.set(yearOf(m), (used.get(yearOf(m)) ?? 0) + v) }

  const choices: Record<string, ScChoice> = {}
  const unfunded: string[] = []
  for (const p of fundingOrder(projects)) {
    const prev = sc.choices[p.id]
    if (prev?.action === 'terminate') { choices[p.id] = prev; commit(applyChoice(p, prev, sc.terminationPct)); continue }
    if (p.mandatory) { const c: ScChoice = { action: 'base', deferMonths: 0 }; choices[p.id] = c; commit(applyChoice(p, c, sc.terminationPct)); continue }
    let placed: ScChoice | null = null
    for (let d = 0; d <= maxDefer; d += step) {
      const c: ScChoice = d === 0 ? { action: 'base', deferMonths: 0 } : { action: 'defer', deferMonths: d }
      if (fits(applyChoice(p, c, sc.terminationPct))) { placed = c; break }
    }
    if (!placed) { placed = { action: 'defer', deferMonths: maxDefer }; unfunded.push(p.id) }
    choices[p.id] = placed
    commit(applyChoice(p, placed, sc.terminationPct))
  }
  return { choices, unfunded }
}

export const ACTION_FA: Record<ScAction, string> = { base: 'طبق برنامه', defer: 'تعویق', terminate: 'توقف کامل' }
export const SOURCE_FA: Record<ScProfileSource, string> = {
  cash_plan: 'برنامهٔ نقدی مبنا',
  linear: 'یکنواخت تا تاریخ پایان',
  overdue: 'تاریخ پایان گذشته — ۱۲ ماه یکنواخت',
  none: 'هزینهٔ باقی‌مانده ندارد',
}
