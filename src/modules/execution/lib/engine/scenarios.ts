import { addDays, workingDays } from '../periods'
import { capacity, type Constraint } from './productivity'
import { clamp, normCdf } from './stats'

export interface ActivityState {
  activityId: string
  title: string
  unit: string
  remainingQty: number
  plannedEnd: string | null
  /** current crew rate (units/day) with its spread; null spread = unknown */
  rate: number
  rateSd: number | null
  composition: Record<string, number>
  elasticity: Record<string, number>
  /** external limits on the daily output (free front length, inspection capacity, material on hand …) */
  constraints: Constraint[]
  /** blocking prerequisites (not ready): while any exists the activity cannot progress regardless of resources */
  blockers: string[]
  /** how many fronts the activity can run on now (1 = a single front) */
  frontsAvailable: number
}

export interface ScenarioParams {
  today: string
  workDays: number[]
  /** base shift length in hours and the efficiency of an added shift / overtime hours relative to the day shift */
  shiftHours: number
  extraShiftEfficiency: number
  /** cost per crew-day and per resource unit-day, when known — otherwise cost is reported as null */
  crewDayCost?: number
  unitDayCost?: Record<string, number>
  /** upper bound of added crews / units tried */
  maxExtraCrews: number
  maxExtraUnits: number
}
export const DEFAULT_SCENARIO_PARAMS = (today: string, workDays: number[]): ScenarioParams => ({ today, workDays, shiftHours: 10, extraShiftEfficiency: 0.8, maxExtraCrews: 3, maxExtraUnits: 4 })

export type ScenarioKind = 'baseline' | 'add_crew' | 'add_units' | 'extra_shift' | 'parallel_front' | 'remove_blocker' | 'combined'
export interface Scenario {
  id: string
  kind: ScenarioKind
  label: string
  /** resulting daily output */
  ratePerDay: number
  daysNeeded: number | null
  finish: string | null
  /** days gained (+) / lost (−) against the planned end; null without a planned end */
  slackDays: number | null
  /** probability (0–1) of finishing by the planned end under a normal approximation of the daily output; null without spread/plan */
  onTimeProb: number | null
  added: { key: string; units: number }[]
  extraCrews: number
  cost: number | null
  effective: boolean
  /** why the scenario is not effective or what limits it */
  limits: string[]
  basis: 'observed' | 'assumed' | 'mixed'
}

function finishFor(a: ActivityState, rate: number, p: ScenarioParams): { days: number | null; finish: string | null } {
  if (a.remainingQty <= 0) return { days: 0, finish: p.today }
  if (rate <= 0) return { days: null, finish: null }
  const days = Math.ceil(a.remainingQty / rate)
  // count `days` working days forward from tomorrow
  let n = 0, d = p.today
  for (let g = 0; n < days && g < 4000; g++) { d = addDays(d, 1); if (p.workDays.includes(((new Date(`${d}T00:00:00Z`).getUTCDay()) + 1) % 7)) n++ }
  return { days, finish: d }
}
function onTime(a: ActivityState, rate: number, p: ScenarioParams): number | null {
  if (!a.plannedEnd || a.rateSd == null || rate <= 0) return null
  const wd = workingDays(addDays(p.today, 1), a.plannedEnd, p.workDays).length
  if (wd <= 0) return a.remainingQty <= 0 ? 1 : 0
  const sdScaled = a.rateSd * (rate / Math.max(a.rate, 1e-9))
  const mu = rate * wd, sd = Math.max(sdScaled * Math.sqrt(wd), 1e-9)
  return clamp(1 - normCdf((a.remainingQty - mu) / sd), 0, 1)
}
function slack(plannedEnd: string | null, finish: string | null): number | null {
  if (!plannedEnd || !finish) return null
  return Math.round((new Date(`${plannedEnd}T00:00:00Z`).getTime() - new Date(`${finish}T00:00:00Z`).getTime()) / 86400000)
}

/** Compensation scenarios for a late activity, all computed from rate, elasticity and constraints — no generative model. Blocked activities return one non-effective baseline explaining the blockers. */
export function compensationScenarios(a: ActivityState, p: ScenarioParams, basis: 'observed' | 'assumed' = 'assumed'): Scenario[] {
  const mk = (id: string, kind: ScenarioKind, label: string, rate: number, o: Partial<Scenario> = {}): Scenario => {
    const f = finishFor(a, rate, p)
    return { id, kind, label, ratePerDay: rate, daysNeeded: f.days, finish: f.finish, slackDays: slack(a.plannedEnd, f.finish), onTimeProb: onTime(a, rate, p), added: [], extraCrews: 0, cost: null, effective: true, limits: [], basis, ...o }
  }
  const base = mk('base', 'baseline', 'ادامهٔ روند فعلی', a.blockers.length ? 0 : a.rate)
  if (a.blockers.length) {
    base.effective = false
    base.limits = [`فعالیت به‌علت پیش‌نیازهای آماده‌نشده قابل پیشرفت نیست: ${a.blockers.join('، ')}؛ افزودن منابع بدون رفع آن‌ها اثری ندارد.`]
    return [base, mk('unblock', 'remove_blocker', 'رفع موانع پیش‌نیاز و ادامهٔ روند فعلی', a.rate, { limits: ['اثر این سناریو به رفع واقعی موانع وابسته است و تاریخ رفع مانع ورودی مدل نیست.'] })]
  }
  const out: Scenario[] = [base]
  const costOf = (crews: number, units: Record<string, number>, days: number | null): number | null => {
    if (days == null) return null
    let c = 0, known = false
    if (p.crewDayCost != null) { c += crews * p.crewDayCost * days; known = true }
    for (const [k, n] of Object.entries(units)) if (p.unitDayCost?.[k] != null) { c += n * p.unitDayCost[k] * days; known = true }
    return known ? c : null
  }
  // 1. additional crews of the same composition (needs a front for each)
  for (let k = 1; k <= p.maxExtraCrews; k++) {
    const limits: string[] = []
    let rate = a.rate * (1 + k)
    for (const c of a.constraints) if (c.maxPerDay < rate) { rate = c.maxPerDay; limits.push(`سقف «${c.label}» (${Math.round(c.maxPerDay * 100) / 100} ${a.unit}/روز) خروجی را محدود می‌کند.`) }
    const fronts = a.frontsAvailable
    let eff = true
    if (k + 1 > fronts) { rate = Math.min(rate, a.rate * fronts); limits.push(`جبهه‌ٔ آزاد برای ${k + 1} اکیپ وجود ندارد (جبهه‌های در دسترس: ${fronts}).`); eff = rate > a.rate }
    const f = finishFor(a, rate, p)
    out.push(mk(`crew${k}`, 'add_crew', `افزودن ${k} اکیپ هم‌ترکیب`, rate, { extraCrews: k, limits, effective: eff, cost: costOf(k, {}, f.days) }))
  }
  // 2. add one unit of a resource (one at a time, up to maxExtraUnits) — elasticity based
  for (const key of Object.keys(a.composition)) {
    if ((a.composition[key] ?? 0) <= 0) continue
    for (let u = 1; u <= p.maxExtraUnits; u += u < 2 ? 1 : 2) {
      const r = capacity({ baseRate: a.rate, baseComposition: a.composition, newComposition: { ...a.composition, [key]: a.composition[key] + u }, elasticity: a.elasticity, constraints: a.constraints })
      const f = finishFor(a, r.rate, p)
      out.push(mk(`add:${key}:${u}`, 'add_units', `افزودن ${u} واحد «${key}» به اکیپ`, r.rate, { added: [{ key, units: u }], limits: r.limitedBy ? [`سقف «${r.limitedBy.label}» خروجی را محدود می‌کند.`] : [], effective: r.rate > a.rate * 1.005, cost: costOf(0, { [key]: u }, f.days) }))
    }
  }
  // 3. extra shift (efficiency-adjusted)
  {
    const gain = a.rate * p.extraShiftEfficiency
    let rate = a.rate + gain
    const limits: string[] = []
    for (const c of a.constraints) if (c.maxPerDay < rate) { rate = c.maxPerDay; limits.push(`سقف «${c.label}» خروجی را محدود می‌کند.`) }
    const f = finishFor(a, rate, p)
    out.push(mk('shift2', 'extra_shift', `شیفت دوم (بازده ${Math.round(p.extraShiftEfficiency * 100)}٪ شیفت روز)`, rate, { limits, effective: rate > a.rate * 1.005, cost: costOf(1, {}, f.days) }))
  }
  // 4. parallel front (a second front with the same crew split is only effective if fronts are free)
  if (a.frontsAvailable > 1) {
    const rate = a.rate * Math.min(a.frontsAvailable, 2)
    const f = finishFor(a, rate, p)
    out.push(mk('front2', 'parallel_front', 'اجرای هم‌زمان روی جبهه‌ٔ دوم با اکیپ جدید', Math.min(rate, ...a.constraints.map((c) => c.maxPerDay)), { extraCrews: 1, cost: costOf(1, {}, f.days) }))
  }
  // 5. best combination: one extra crew + second shift, capped
  {
    let rate = a.rate * 2 + a.rate * 2 * p.extraShiftEfficiency
    const limits: string[] = []
    if (a.frontsAvailable < 2) { rate = a.rate + a.rate * p.extraShiftEfficiency; limits.push('فقط یک جبهه آماده است؛ اکیپ دوم در ترکیب لحاظ نشد.') }
    for (const c of a.constraints) if (c.maxPerDay < rate) { rate = c.maxPerDay; limits.push(`سقف «${c.label}» خروجی را محدود می‌کند.`) }
    const f = finishFor(a, rate, p)
    out.push(mk('combo', 'combined', 'ترکیب اکیپ اضافه و شیفت دوم', rate, { extraCrews: a.frontsAvailable < 2 ? 0 : 1, limits, effective: rate > a.rate * 1.005, cost: costOf(a.frontsAvailable < 2 ? 1 : 2, {}, f.days) }))
  }
  return out
}

/** Ranking: effective scenarios that finish on or before the plan first (cheapest, then fewest added resources), then by finish date. */
export function rankScenarios(list: Scenario[]): Scenario[] {
  const eff = list.filter((s) => s.effective && s.kind !== 'baseline')
  const ok = eff.filter((s) => s.slackDays != null && s.slackDays >= 0)
  const key = (s: Scenario) => [s.cost ?? Number.MAX_SAFE_INTEGER, s.extraCrews + s.added.reduce((t, x) => t + x.units, 0), s.finish ?? '9999']
  const cmp = (x: Scenario, y: Scenario) => { const a = key(x), b = key(y); return (a[0] as number) - (b[0] as number) || (a[1] as number) - (b[1] as number) || String(a[2]).localeCompare(String(b[2])) }
  const late = eff.filter((s) => !ok.includes(s)).sort((x, y) => String(x.finish ?? '9999').localeCompare(String(y.finish ?? '9999')))
  return [...ok.sort(cmp), ...late]
}

/** Resources needed to reach a daily target: smallest number of extra identical crews (or units of one resource) whose rate meets it, or the cap that makes it unreachable. */
export function resourcesForTarget(a: ActivityState, targetPerDay: number, maxCrews = 10): { reachable: boolean; extraCrews: number; ratePerDay: number; cap: Constraint | null } {
  const cap = a.constraints.reduce<Constraint | null>((m, c) => (m == null || c.maxPerDay < m.maxPerDay ? c : m), null)
  const ceiling = Math.min(cap?.maxPerDay ?? Infinity, a.rate * Math.min(a.frontsAvailable, maxCrews + 1))
  if (a.blockers.length) return { reachable: false, extraCrews: 0, ratePerDay: 0, cap }
  if (targetPerDay <= a.rate) return { reachable: true, extraCrews: 0, ratePerDay: a.rate, cap }
  if (targetPerDay > ceiling + 1e-9) return { reachable: false, extraCrews: Math.min(maxCrews, a.frontsAvailable - 1), ratePerDay: ceiling, cap: cap && cap.maxPerDay < a.rate * a.frontsAvailable ? cap : null }
  const k = Math.ceil(targetPerDay / a.rate) - 1
  return { reachable: true, extraCrews: k, ratePerDay: a.rate * (k + 1), cap }
}
