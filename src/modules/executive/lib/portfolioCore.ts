/**
 * Portfolio core — the rules the portfolio module decides with, in one pure file (council review 1405/08).
 *
 *  - Health, progress, SPI, CPI and EAC come from each project's own snapshot (the engine behind the project dashboard
 *    and the radar); the portfolio only aggregates. A project without a snapshot is 'unknown', never a guessed colour.
 *  - Priority = weighted average of five criteria (strategic contribution, financial value, expected benefit, risk,
 *    performance), each 0–100. A criterion without data is left out of that project's score and the remaining weights
 *    are re-normalised — no default 50s. Every project's per-criterion contribution is returned so the ranking is
 *    explainable. Mandatory projects (legal / committed) are listed apart, not ranked against the rest.
 *  - The decision queue lists what needs a portfolio decision: red/black health, poor SPI/CPI, no portfolio decision
 *    yet, a decision whose review date has passed, or a critical milestone / action running late.
 */

export type PfHealth = 'green' | 'yellow' | 'red' | 'black' | 'unknown'
export type PfRiskLevel = 'critical' | 'high' | 'medium' | 'low' | null
export type PfDecisionKind = 'continue' | 'accelerate' | 'replan' | 'hold' | 'terminate' | 'escalate'
export type PfCriterion = 'strategic' | 'value' | 'benefit' | 'risk' | 'performance'
export type PfWeights = Record<PfCriterion, number>

export const DEFAULT_WEIGHTS: PfWeights = { strategic: 30, value: 20, benefit: 15, risk: 15, performance: 20 }

export const CRITERION_FA: Record<PfCriterion, { label: string; hint: string }> = {
  strategic: { label: 'سهم راهبردی', hint: 'امتیاز ۱ تا ۵ که مسئول سبد برای سهم پروژه در اهداف سازمان ثبت می‌کند' },
  value: { label: 'ارزش مالی', hint: 'بودجهٔ پروژه نسبت به بزرگ‌ترین پروژهٔ سبد' },
  benefit: { label: 'منافع مورد انتظار', hint: 'امتیاز ۱ تا ۵ منافع پس از بهره‌برداری (درآمد، ظرفیت، امنیت تأمین)' },
  risk: { label: 'ریسک', hint: 'بالاترین سطح ریسک فعال پروژه؛ ریسک کمتر امتیاز بیشتر' },
  performance: { label: 'عملکرد', hint: 'امتیاز سلامت پروژه از موتور سلامت داشبورد پروژه' },
}

export const DECISION_FA: Record<PfDecisionKind, { label: string; color: string; hint: string }> = {
  continue: { label: 'ادامه', color: '#22c55e', hint: 'طبق برنامه ادامه یابد' },
  accelerate: { label: 'تسریع', color: '#0ea5e9', hint: 'منابع یا اولویت بیشتر' },
  replan: { label: 'بازبرنامه‌ریزی', color: '#f59e0b', hint: 'برنامه، بودجه یا دامنه بازنگری شود' },
  hold: { label: 'توقف موقت', color: '#a78bfa', hint: 'تا رفع شرط اعلام‌شده متوقف بماند' },
  terminate: { label: 'خاتمه', color: '#ef4444', hint: 'پروژه خاتمه یابد' },
  escalate: { label: 'ارجاع به سطح بالاتر', color: '#f97316', hint: 'تصمیم در اختیار هیئت‌مدیره / مجری طرح' },
}

export const HEALTH_FA: Record<PfHealth, { label: string; color: string }> = {
  green: { label: 'سالم', color: '#22c55e' },
  yellow: { label: 'نیازمند توجه', color: '#f5b31b' },
  red: { label: 'بحرانی', color: '#ef4444' },
  black: { label: 'گیت مسدود', color: '#94a3b8' },
  unknown: { label: 'بدون دادهٔ عملکرد', color: '#64748b' },
}

export interface PfSnapshot {
  health: Exclude<PfHealth, 'unknown'> | null
  healthScore: number | null
  /** the dimension that set the verdict (Persian label), when not green */
  drivenBy: string | null
  /** why a gate is blocked, when the verdict is black */
  blockers?: string[]
  spi: number | null
  cpi: number | null
  /** EVM budget (EPC contracts); 0 when the project has no EPC contract */
  bacEvm: number
  eac: number | null
  /** lifecycle progress, % */
  actual: number
  planned: number
  /** current lifecycle phase, for the balance view */
  phase: { code: string; title: string } | null
  /** certified cost of the EPC contracts (finance), when the project has an EPC budget */
  ac?: number | null
  /** EPC planned / earned % at month ends (last 12 months, up to today) — the trend and the earned-schedule delay */
  trend?: { date: string; planned: number; earned: number | null }[]
}

export interface PfScore { strategic: number | null; benefit: number | null; mandatory: boolean; note: string; updatedAt: string | null; updatedBy: string | null }

export interface PfDecision {
  id: string
  projectId: string
  decision: PfDecisionKind
  rationale: string
  conditions: string
  reviewBy: string | null
  healthAtDecision: string | null
  priorityAtDecision: number | null
  voided: boolean
  voidReason: string
  decidedBy: string | null
  decidedAt: string
}

export interface PfProjectInput {
  id: string
  name: string
  code: string
  portfolioId: string | null
  programId: string | null
  /** budget from master data (contract value); used when the snapshot has no EVM budget */
  budget: number | null
  /** EAC recorded by hand in master data; used only when the snapshot has none */
  manualEac: number | null
  snapshot: PfSnapshot | null
  riskLevel: PfRiskLevel
  score: PfScore | null
  decisions: PfDecision[]
  /** milestones and actions from the lifecycle control tower (merged in from its former portfolio page) */
  delivery?: PfDelivery | null
}

export interface PfDelivery { milestonesDelayed: number; criticalMilestonesDelayed: number; overdueActions: number; criticalOverdueActions: number }

export interface PfContribution { criterion: PfCriterion; value: number | null; weight: number; points: number }

export interface PfProjectView {
  input: PfProjectInput
  health: PfHealth
  bac: number | null
  eac: number | null
  eacSource: 'evm' | 'manual' | null
  vac: number | null
  priority: number | null
  /** share of the total weight that had data for this project (0–1) */
  coverage: number
  contributions: PfContribution[]
  lastDecision: PfDecision | null
  rank: number | null
}

const RISK_POINTS: Record<Exclude<PfRiskLevel, null>, number> = { critical: 10, high: 35, medium: 65, low: 90 }

export function activeDecisions(list: PfDecision[]) {
  return list.filter((d) => !d.voided).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
}

/** criterion values (0–100, null = no data) for one project */
export function criterionValues(p: PfProjectInput, maxBac: number): Record<PfCriterion, number | null> {
  const scale5 = (v: number | null | undefined) => (v == null ? null : ((Math.min(5, Math.max(1, v)) - 1) / 4) * 100)
  const bac = budgetOf(p)
  return {
    strategic: scale5(p.score?.strategic),
    benefit: scale5(p.score?.benefit),
    value: bac != null && maxBac > 0 ? (bac / maxBac) * 100 : null,
    risk: p.riskLevel ? RISK_POINTS[p.riskLevel] : null,
    performance: p.snapshot?.healthScore ?? null,
  }
}

export function budgetOf(p: PfProjectInput): number | null {
  if (p.snapshot && p.snapshot.bacEvm > 0) return p.snapshot.bacEvm
  return p.budget != null && p.budget > 0 ? p.budget : null
}

export function priorityOf(values: Record<PfCriterion, number | null>, weights: PfWeights) {
  const total = (Object.keys(weights) as PfCriterion[]).reduce((a, k) => a + Math.max(0, weights[k]), 0) || 1
  const avail = (Object.keys(weights) as PfCriterion[]).filter((k) => values[k] != null && weights[k] > 0)
  const wsum = avail.reduce((a, k) => a + weights[k], 0)
  const contributions: PfContribution[] = (Object.keys(weights) as PfCriterion[]).map((k) => ({
    criterion: k, value: values[k], weight: weights[k],
    points: values[k] != null && wsum > 0 ? ((values[k] as number) * weights[k]) / wsum : 0,
  }))
  return { priority: wsum > 0 ? Math.round(contributions.reduce((a, c) => a + c.points, 0)) : null, coverage: wsum / total, contributions }
}

export function buildViews(projects: PfProjectInput[], weights: PfWeights): PfProjectView[] {
  const maxBac = Math.max(0, ...projects.map((p) => budgetOf(p) ?? 0))
  const views = projects.map((p): PfProjectView => {
    const pr = priorityOf(criterionValues(p, maxBac), weights)
    const bac = budgetOf(p)
    const evmEac = p.snapshot?.eac != null && p.snapshot.bacEvm > 0 ? p.snapshot.eac : null
    const eac = evmEac ?? p.manualEac ?? null
    return {
      input: p,
      health: p.snapshot?.health ?? 'unknown',
      bac, eac, eacSource: evmEac != null ? 'evm' : p.manualEac != null ? 'manual' : null,
      vac: bac != null && eac != null ? bac - eac : null,
      priority: pr.priority, coverage: pr.coverage, contributions: pr.contributions,
      lastDecision: activeDecisions(p.decisions)[0] ?? null,
      rank: null,
    }
  })
  // rank the discretionary projects; mandatory ones are not competing for the same slots
  const ranked = views.filter((v) => !v.input.score?.mandatory && v.priority != null).sort((a, b) => (b.priority as number) - (a.priority as number))
  ranked.forEach((v, i) => { v.rank = i + 1 })
  return views
}

export type QueueReason = 'health' | 'performance' | 'delivery' | 'no_decision' | 'review_due' | 'on_hold'
export const QUEUE_REASON_FA: Record<QueueReason, string> = {
  health: 'سلامت بحرانی یا گیت مسدود',
  performance: 'انحراف عملکرد (SPI یا CPI پایین)',
  delivery: 'Milestone بحرانی تأخیرکرده یا اقدام بحرانی معوق',
  no_decision: 'هنوز تصمیم سبد ندارد',
  review_due: 'موعد بازبینی تصمیم گذشته',
  on_hold: 'در توقف موقت',
}

/** what needs a portfolio decision, most severe first */
export function decisionQueue(views: PfProjectView[], today: string) {
  const SEV: Record<QueueReason, number> = { health: 5, review_due: 4, performance: 3, delivery: 3, on_hold: 2, no_decision: 1 }
  return views
    .map((v) => {
      const reasons: QueueReason[] = []
      if (v.health === 'red' || v.health === 'black') reasons.push('health')
      const s = v.input.snapshot
      // only a full EVM reading counts (progress and certified cost) — the same rule as the portfolio's «دادهٔ EVM» count;
      // an SPI of 0 with no cost recorded usually means EPC progress was never entered, not a measured collapse
      if (s && s.bacEvm > 0 && s.spi != null && s.cpi != null && (s.spi < 0.9 || s.cpi < 0.9)) reasons.push('performance')
      const dl = v.input.delivery
      if (dl && (dl.criticalMilestonesDelayed > 0 || dl.criticalOverdueActions > 0)) reasons.push('delivery')
      const d = v.lastDecision
      if (!d) reasons.push('no_decision')
      else if (d.reviewBy && d.reviewBy < today) reasons.push('review_due')
      if (d?.decision === 'hold') reasons.push('on_hold')
      return { view: v, reasons, severity: reasons.reduce((a, r) => Math.max(a, SEV[r]), 0) }
    })
    .filter((x) => x.reasons.length > 0 && x.view.lastDecision?.decision !== 'terminate')
    .sort((a, b) => b.severity - a.severity || (b.view.bac ?? 0) - (a.view.bac ?? 0))
}

export type Quadrant = 'on_track' | 'late_under' | 'early_over' | 'late_over'
export const QUADRANT_FA: Record<Quadrant, { label: string; color: string }> = {
  on_track: { label: 'جلوتر از برنامه، زیر بودجه', color: '#22c55e' },
  late_under: { label: 'عقب از برنامه، زیر بودجه', color: '#f5b31b' },
  early_over: { label: 'جلوتر از برنامه، بیش از بودجه', color: '#f97316' },
  late_over: { label: 'عقب از برنامه، بیش از بودجه', color: '#ef4444' },
}
/** SPI × CPI quadrant; 0.95 counts as on plan (the usual tolerance band) */
export function quadrantOf(spi: number, cpi: number, tolerance = 0.95): Quadrant {
  const onTime = spi >= tolerance, onCost = cpi >= tolerance
  return onTime && onCost ? 'on_track' : !onTime && onCost ? 'late_under' : onTime ? 'early_over' : 'late_over'
}

export interface PfRollup {
  count: number
  health: Record<PfHealth, number>
  bac: number
  eac: number
  vac: number
  /** projects whose EAC came from EVM / by hand / not at all */
  eacFrom: { evm: number; manual: number; none: number }
  /** BAC-weighted portfolio SPI / CPI over projects that have them */
  spi: number | null
  cpi: number | null
  evmCount: number
  scored: number
  decided: number
  mandatory: number
}

export function rollup(views: PfProjectView[]): PfRollup {
  const r: PfRollup = { count: views.length, health: { green: 0, yellow: 0, red: 0, black: 0, unknown: 0 }, bac: 0, eac: 0, vac: 0, eacFrom: { evm: 0, manual: 0, none: 0 }, spi: null, cpi: null, evmCount: 0, scored: 0, decided: 0, mandatory: 0 }
  let ws = 0, wsSpi = 0, wsCpi = 0
  for (const v of views) {
    r.health[v.health]++
    if (v.bac != null) r.bac += v.bac
    if (v.eac != null) r.eac += v.eac
    if (v.vac != null) r.vac += v.vac
    r.eacFrom[v.eacSource ?? 'none']++
    const s = v.input.snapshot
    if (s && s.spi != null && s.cpi != null && s.bacEvm > 0) { ws += s.bacEvm; wsSpi += s.spi * s.bacEvm; wsCpi += s.cpi * s.bacEvm; r.evmCount++ }
    if (v.input.score && (v.input.score.strategic != null || v.input.score.benefit != null)) r.scored++
    if (v.lastDecision) r.decided++
    if (v.input.score?.mandatory) r.mandatory++
  }
  if (ws > 0) { r.spi = wsSpi / ws; r.cpi = wsCpi / ws }
  return r
}

/** budget and project count by current lifecycle phase — the portfolio's balance across the life cycle */
export function balanceByPhase(views: PfProjectView[]) {
  const m = new Map<string, { code: string; title: string; count: number; bac: number }>()
  for (const v of views) {
    const ph = v.input.snapshot?.phase ?? { code: '—', title: 'نامشخص' }
    const row = m.get(ph.code) ?? { code: ph.code, title: ph.title, count: 0, bac: 0 }
    row.count++; row.bac += v.bac ?? 0
    m.set(ph.code, row)
  }
  return [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** weights entered as any positive numbers, shown as percentages */
export function normaliseWeights(w: PfWeights): PfWeights {
  const t = (Object.values(w) as number[]).reduce((a, b) => a + Math.max(0, b), 0) || 1
  return Object.fromEntries((Object.keys(w) as PfCriterion[]).map((k) => [k, Math.round((Math.max(0, w[k]) / t) * 100)])) as PfWeights
}
