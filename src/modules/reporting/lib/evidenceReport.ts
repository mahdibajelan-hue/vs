/**
 * Evidence-based management report (council review of the reporting module, 1405/08).
 *
 * Nine questions, answered only as far as the data allows:
 *  1 what happened · 2 what differs from plan / baseline · 3 which deviations matter · 4 what evidence points to causes
 *  5 which trends are forming · 6 what follows if nothing changes · 7 what should be done · 8 which decision is needed
 *  from whom · 9 did earlier actions work.
 *
 * Rules every section obeys:
 *  - every statement carries its evidence (source module, record, as-of date); a statement without evidence is not made
 *  - materiality comes from explicit thresholds (DEFAULT_THRESHOLDS), shown on the report
 *  - causes are "associated evidence", never asserted as proven; direct ones (a blocked gate) are labelled as such
 *  - a trend needs at least `trendMinPoints` dated points; a projection states its method and assumption and carries a
 *    confidence that falls with thin or stale data
 *  - recommendations are generated only from findings and name the record they act on — no generic advice
 *  - effectiveness of a past action is judged only from a measurement taken after it (a later risk assessment, the
 *    issue's closure); otherwise it is "not measurable" or "too early"
 * Pure: the loader gathers the rows, this file only reasons over them.
 */

import { formatJalali } from '../../../lib/jalali'

export type Materiality = 'material' | 'watch' | 'ok'
export type Confidence = 'high' | 'medium' | 'low'
export type Direction = 'improving' | 'worsening' | 'flat' | 'insufficient'

export interface Evidence { source: string; ref?: string; asOf: string | null; value?: string }

export interface Finding {
  id: string
  kind: 'schedule' | 'cost' | 'gate' | 'health' | 'risk' | 'issue' | 'action' | 'delay' | 'decision'
  title: string
  statement: string
  materiality: Materiality
  /** numeric basis, when the finding is a measured deviation */
  actual?: number | null
  reference?: number | null
  evidence: Evidence[]
}

export interface Cause { findingIds: string[]; text: string; strength: 'direct' | 'associated'; evidence: Evidence[] }
export interface TrendPoint { date: string; value: number }
export interface Trend { id: string; label: string; unit: string; points: TrendPoint[]; direction: Direction; slopePerMonth: number | null; statement: string; betterWhen: 'up' | 'down' }
export interface Projection { id: string; label: string; value: string; method: string; assumption: string; confidence: Confidence; evidence: Evidence[] }
export interface Recommendation { id: string; findingIds: string[]; text: string; owner: string | null; urgency: 'now' | 'soon' }
export interface DecisionNeed { id: string; title: string; level: 'project' | 'gate' | 'portfolio'; owner: string | null; dueBy: string | null; overdue: boolean; evidence: Evidence[] }
export interface ActionEffect { id: string; title: string; target: string; verdict: 'effective' | 'not_effective' | 'too_early' | 'unmeasurable'; statement: string; evidence: Evidence[] }
export interface QualityItem { source: string; available: boolean; lastUpdate: string | null; staleDays: number | null; note: string }
export interface Change { key: string; label: string; previous: string; current: string; direction: 'better' | 'worse' | 'same' }

export interface Thresholds {
  /** lifecycle progress behind plan, percentage points */
  gapWatch: number; gapMaterial: number
  /** SPI / CPI */
  idxWatch: number; idxMaterial: number
  /** VAC as % of BAC */
  vacMaterialPct: number
  /** days after which a source counts as stale */
  staleDays: number
  /** points needed to call a trend */
  trendMinPoints: number
  /** days after completion before an effect can be judged */
  effectWaitDays: number
}
export const DEFAULT_THRESHOLDS: Thresholds = { gapWatch: 3, gapMaterial: 8, idxWatch: 0.95, idxMaterial: 0.9, vacMaterialPct: 5, staleDays: 14, trendMinPoints: 3, effectWaitDays: 14 }

/* ── input ─────────────────────────────────────────────────────────── */

export interface RiskIn { id: string; title: string; status: string; score: number; level: 'critical' | 'high' | 'medium' | 'low'; owner: string | null; identifiedDate: string; assessments: { date: string; score: number; postAction?: boolean; actionIds?: string[] }[] }
export interface RiskActionIn { id: string; riskId: string; title: string; status: string; dueDate: string | null; completedAt: string | null; owner: string | null; effectStatus?: string | null; createdAt: string }
export interface IssueIn { id: string; title: string; status: string; priority: string; deadline: string | null; createdAt: string; closedAt: string | null; owner: string | null }
export interface ActionIn { id: string; title: string; status: string; priority: string; dueDate: string | null; owner: string | null; relatedRiskId: string | null; relatedIssueId: string | null; createdAt: string; updatedAt: string }
export interface DecisionIn { id: string; title: string; status: string; requiredBy: string | null; owner: string | null; createdAt: string }

export interface EvidenceInput {
  today: string
  project: string
  metrics: {
    asOf: string
    lifecycle: { actual: number; planned: number }
    /** EPC earned-value reading; spi / cpi null when not measured */
    evm: { bac: number; spi: number | null; cpi: number | null; eac: number | null; vac: number | null } | null
    /** dated planned / earned progress of the EPC scope */
    curve: { date: string; planned: number; earned: number | null }[]
    planFinish: string | null
    health: { status: 'green' | 'yellow' | 'red' | 'black'; drivenBy: string | null; blockers: string[]; dims: { key?: string; label: string; status: string; explanation: string; assessed: boolean }[] } | null
    /** stoppage hours by category */
    delays: { label: string; value: number }[]
  } | null
  risks: RiskIn[] | null
  riskActions: RiskActionIn[]
  issues: IssueIn[] | null
  actions: ActionIn[]
  decisions: DecisionIn[]
  portfolio: { decision: string | null; reviewBy: string | null } | null
  /** latest record date per source, for freshness */
  sourceDates: { source: string; date: string | null; available: boolean }[]
  previous: { reportNumber: string; issuedAt: string; facts: Facts } | null
  thresholds?: Thresholds
}

/** the frozen numbers a report keeps so the next one can say what changed */
export interface Facts {
  lifecycleActual: number | null; lifecyclePlanned: number | null; gap: number | null
  spi: number | null; cpi: number | null; health: string | null
  criticalRisks: number | null; openCriticalIssues: number | null; overdueActions: number | null; pendingDecisions: number | null
}

export interface EvidenceReport {
  asOf: string
  project: string
  confidence: Confidence
  headline: string[]
  facts: Facts
  statusLines: { label: string; value: string; evidence: Evidence }[]
  findings: Finding[]
  causes: Cause[]
  trends: Trend[]
  projections: Projection[]
  recommendations: Recommendation[]
  decisions: DecisionNeed[]
  effects: ActionEffect[]
  quality: QualityItem[]
  changes: Change[] | null
  previousRef: string | null
  thresholds: Thresholds
}

/* ── helpers ───────────────────────────────────────────────────────── */

const DAY = 86400000
const t = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime()
export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY)
const r1 = (n: number) => Math.round(n * 10) / 10
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (d: string) => formatJalali(d.slice(0, 10)) || d
/** compact money: rial contract values run into the trillions */
export function money(n: number) {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  return a >= 1e12 ? `${s}${fa(a / 1e12, 1)} هزار میلیارد` : a >= 1e9 ? `${s}${fa(a / 1e9, 1)} میلیارد` : a >= 1e6 ? `${s}${fa(a / 1e6, 1)} میلیون` : `${s}${fa(a)}`
}
const OPEN_ISSUE = new Set(['open', 'in_progress', 'pending_approval'])
const DONE_ACTION = new Set(['completed', 'done', 'closed', 'cancelled'])
const ACTIVE_RISK = new Set(['open', 'monitoring', 'escalated'])
const PENDING_DECISION = new Set(['pending', 'in_review'])

/** least-squares slope of value per 30 days */
export function slopePerMonth(points: TrendPoint[]): number | null {
  if (points.length < 2) return null
  const xs = points.map((p) => t(p.date) / (30 * DAY)), ys = points.map((p) => p.value)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  return den === 0 ? null : xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den
}

export function trendOf(id: string, label: string, unit: string, points: TrendPoint[], betterWhen: 'up' | 'down', minPoints: number, flatBand: number): Trend {
  const pts = [...points].sort((a, b) => a.date.localeCompare(b.date))
  if (pts.length < minPoints) return { id, label, unit, points: pts, direction: 'insufficient', slopePerMonth: null, betterWhen, statement: `برای روند دست‌کم ${fa(minPoints)} نقطهٔ تاریخ‌دار لازم است؛ ${fa(pts.length)} نقطه موجود است.` }
  const s = slopePerMonth(pts) ?? 0
  const dir: Direction = Math.abs(s) < flatBand ? 'flat' : (s > 0) === (betterWhen === 'up') ? 'improving' : 'worsening'
  const word = dir === 'flat' ? 'تقریباً ثابت' : dir === 'improving' ? 'رو به بهبود' : 'رو به بدتر شدن'
  return { id, label, unit, points: pts, direction: dir, slopePerMonth: r1(s), betterWhen, statement: `${label} ${word} است (${s >= 0 ? '+' : '−'}${fa(Math.abs(s), 1)} ${unit} در ماه، بر پایهٔ ${fa(pts.length)} نقطه از ${jd(pts[0].date)} تا ${jd(pts[pts.length - 1].date)}).` }
}

/** open count of dated items at each of the given dates */
function openAt(items: { createdAt: string; closedAt: string | null }[], dates: string[]): TrendPoint[] {
  return dates.map((d) => ({ date: d, value: items.filter((i) => i.createdAt.slice(0, 10) <= d && (!i.closedAt || i.closedAt.slice(0, 10) > d)).length }))
}

/** month-end dates going back `n` months from today, oldest first */
export function monthEnds(today: string, n: number): string[] {
  const out: string[] = []
  const d = new Date(`${today.slice(0, 10)}T00:00:00Z`)
  for (let i = n - 1; i >= 1; i--) {
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 0))
    out.push(e.toISOString().slice(0, 10))
  }
  out.push(today.slice(0, 10))
  return out
}

/* ── the report ────────────────────────────────────────────────────── */

export function buildEvidenceReport(inp: EvidenceInput): EvidenceReport {
  const th = inp.thresholds ?? DEFAULT_THRESHOLDS
  const today = inp.today.slice(0, 10)
  const m = inp.metrics
  const findings: Finding[] = []
  const causes: Cause[] = []
  const recs: Recommendation[] = []
  const statusLines: EvidenceReport['statusLines'] = []
  const pm = (asOf: string | null, ref?: string, value?: string): Evidence => ({ source: 'داشبورد پروژه (موتور شاخص‌ها)', asOf, ref, value })

  /* 1 · what happened — status with sources */
  if (m) {
    statusLines.push({ label: 'پیشرفت چرخهٔ عمر (واقعی / برنامه)', value: `${fa(m.lifecycle.actual, 1)}٪ / ${fa(m.lifecycle.planned, 1)}٪`, evidence: pm(m.asOf) })
    if (m.health) statusLines.push({ label: 'حکم سلامت', value: { green: 'سالم', yellow: 'نیازمند توجه', red: 'بحرانی', black: 'گیت مسدود' }[m.health.status], evidence: pm(m.asOf, m.health.drivenBy ?? undefined) })
    if (m.evm && m.evm.spi != null && m.evm.cpi != null) statusLines.push({ label: 'SPI / CPI (دامنهٔ EPC)', value: `${fa(m.evm.spi, 2)} / ${fa(m.evm.cpi, 2)}`, evidence: { source: 'ارزش کسب‌شده (قرارداد EPC و صورت‌وضعیت‌ها)', asOf: m.asOf } })
  }
  const activeRisks = (inp.risks ?? []).filter((r) => ACTIVE_RISK.has(r.status))
  if (inp.risks) statusLines.push({ label: 'ریسک‌های فعال (بحرانی / بالا)', value: `${fa(activeRisks.length)} (${fa(activeRisks.filter((r) => r.level === 'critical').length)} / ${fa(activeRisks.filter((r) => r.level === 'high').length)})`, evidence: { source: 'ثبت ریسک', asOf: today } })
  const openIssues = (inp.issues ?? []).filter((i) => OPEN_ISSUE.has(i.status))
  if (inp.issues) statusLines.push({ label: 'مسائل باز (معوق)', value: `${fa(openIssues.length)} (${fa(openIssues.filter((i) => i.deadline && i.deadline < today).length)})`, evidence: { source: 'مدیریت مسائل', asOf: today } })

  /* 2–3 · deviations and their materiality */
  if (m) {
    const gap = r1(m.lifecycle.planned - m.lifecycle.actual)
    if (m.lifecycle.planned > 0) {
      const mat: Materiality = gap >= th.gapMaterial ? 'material' : gap >= th.gapWatch ? 'watch' : 'ok'
      findings.push({ id: 'f-schedule', kind: 'schedule', title: 'پیشرفت در برابر برنامه', materiality: mat, actual: m.lifecycle.actual, reference: m.lifecycle.planned,
        statement: gap > 0 ? `پیشرفت واقعی ${fa(gap, 1)} واحد درصد از برنامه عقب است.` : `پیشرفت واقعی ${fa(-gap, 1)} واحد درصد جلوتر از برنامه یا برابر آن است.`,
        evidence: [pm(m.asOf, 'پیشرفت وزنی همهٔ مراحل چرخهٔ عمر', `${fa(m.lifecycle.actual, 1)}٪ در برابر ${fa(m.lifecycle.planned, 1)}٪`)] })
    }
    if (m.evm && m.evm.spi != null && m.evm.cpi != null) {
      const idx = (v: number): Materiality => (v < th.idxMaterial ? 'material' : v < th.idxWatch ? 'watch' : 'ok')
      const ev: Evidence = { source: 'ارزش کسب‌شده (قرارداد EPC و صورت‌وضعیت‌ها)', asOf: m.asOf }
      findings.push({ id: 'f-spi', kind: 'schedule', title: 'شاخص عملکرد زمانی EPC', materiality: idx(m.evm.spi), actual: m.evm.spi, reference: 1, statement: `SPI برابر ${fa(m.evm.spi, 2)} است${m.evm.spi < 1 ? `؛ به ازای هر واحد کار برنامه‌ریزی‌شده ${fa(m.evm.spi, 2)} واحد انجام شده` : ''}.`, evidence: [{ ...ev, value: `SPI ${fa(m.evm.spi, 2)}` }] })
      findings.push({ id: 'f-cpi', kind: 'cost', title: 'شاخص عملکرد هزینه EPC', materiality: idx(m.evm.cpi), actual: m.evm.cpi, reference: 1, statement: `CPI برابر ${fa(m.evm.cpi, 2)} است.`, evidence: [{ ...ev, value: `CPI ${fa(m.evm.cpi, 2)}` }] })
      if (m.evm.vac != null && m.evm.bac > 0 && m.evm.vac < 0) {
        const pct = (-m.evm.vac / m.evm.bac) * 100
        findings.push({ id: 'f-vac', kind: 'cost', title: 'بیش‌هزینهٔ پیش‌بینی‌شده', materiality: pct >= th.vacMaterialPct ? 'material' : 'watch', actual: m.evm.eac, reference: m.evm.bac, statement: `اگر کارایی هزینه همین بماند، هزینهٔ تمام‌شده ${fa(pct, 1)}٪ بیش از بودجه می‌شود.`, evidence: [{ ...ev, value: `VAC ${money(m.evm.vac)}` }] })
      }
    }
    if (m.health?.status === 'black' && m.health.blockers.length) {
      findings.push({ id: 'f-gate', kind: 'gate', title: 'گیت مسدود', materiality: 'material', statement: `عبور از گیت جاری مسدود است: ${m.health.blockers.slice(0, 3).join('؛ ')}.`, evidence: m.health.blockers.map((b) => pm(m.asOf, b)) })
      for (const b of m.health.blockers.slice(0, 3)) recs.push({ id: `r-gate-${recs.length}`, findingIds: ['f-gate'], text: `رفع «${b}» برای باز شدن گیت`, owner: null, urgency: 'now' })
    }
    // a dimension the EVM findings already state (schedule / cost) is not repeated
    const covered = new Set([...(findings.some((f) => f.id === 'f-spi') ? ['schedule'] : []), ...(findings.some((f) => f.id === 'f-cpi') ? ['cost'] : [])])
    for (const d of (m.health?.dims ?? []).filter((x) => x.assessed && (x.status === 'red' || x.status === 'black') && !(x.key && covered.has(x.key)))) {
      findings.push({ id: `f-dim-${d.label}`, kind: 'health', title: `سلامت ${d.label}`, materiality: 'material', statement: d.explanation, evidence: [pm(m.asOf, `بُعد ${d.label}`)] })
    }
    const delayH = m.delays.reduce((a, d) => a + d.value, 0)
    if (delayH > 0) findings.push({ id: 'f-delay', kind: 'delay', title: 'توقف‌های ثبت‌شدهٔ اجرا', materiality: 'watch', actual: delayH, statement: `${fa(delayH)} ساعت توقف در گزارش‌های اجرا ثبت شده است؛ بیشترین: ${[...m.delays].sort((a, b) => b.value - a.value).slice(0, 2).map((d) => `${d.label} (${fa(d.value)} ساعت)`).join('، ')}.`, evidence: m.delays.map((d) => ({ source: 'ثبت توقفات ماژول اجرا', asOf: m.asOf, ref: d.label, value: `${fa(d.value)} ساعت` })) })
  }

  const critRisks = activeRisks.filter((r) => r.level === 'critical')
  if (critRisks.length) {
    findings.push({ id: 'f-risk', kind: 'risk', title: 'ریسک‌های بحرانی فعال', materiality: 'material', actual: critRisks.length, statement: `${fa(critRisks.length)} ریسک بحرانی فعال است.`, evidence: critRisks.map((r) => ({ source: 'ثبت ریسک', ref: r.title, asOf: r.assessments.map((a) => a.date).sort().pop() ?? r.identifiedDate, value: `امتیاز ${fa(r.score)}` })) })
    for (const r of critRisks) {
      const hasOpenAction = inp.riskActions.some((a) => a.riskId === r.id && !DONE_ACTION.has(a.status)) || inp.actions.some((a) => a.relatedRiskId === r.id && !DONE_ACTION.has(a.status))
      if (!hasOpenAction) recs.push({ id: `r-risk-${r.id}`, findingIds: ['f-risk'], text: `تعریف اقدام پاسخ برای ریسک «${r.title}» — ریسک بحرانی بدون اقدام باز`, owner: r.owner, urgency: 'now' })
    }
  }

  const overdueIssues = openIssues.filter((i) => i.deadline && i.deadline < today && (i.priority === 'critical' || i.priority === 'high'))
  if (overdueIssues.length) {
    findings.push({ id: 'f-issue', kind: 'issue', title: 'مسائل مهمِ معوق', materiality: overdueIssues.some((i) => i.priority === 'critical') ? 'material' : 'watch', actual: overdueIssues.length,
      statement: `${fa(overdueIssues.length)} مسئلهٔ با اولویت بالا یا بحرانی از مهلت گذشته است.`, evidence: overdueIssues.map((i) => ({ source: 'مدیریت مسائل', ref: i.title, asOf: i.deadline, value: `${fa(daysBetween(i.deadline as string, today))} روز تأخیر` })) })
    for (const i of overdueIssues.slice(0, 5)) recs.push({ id: `r-issue-${i.id}`, findingIds: ['f-issue'], text: `تعیین تکلیف مسئلهٔ «${i.title}» — ${fa(daysBetween(i.deadline as string, today))} روز از مهلت گذشته`, owner: i.owner, urgency: i.priority === 'critical' ? 'now' : 'soon' })
  }

  const overdueActs = [
    ...inp.actions.filter((a) => !DONE_ACTION.has(a.status) && a.dueDate && a.dueDate < today).map((a) => ({ id: a.id, title: a.title, due: a.dueDate as string, owner: a.owner, high: a.priority === 'critical' || a.priority === 'high', src: 'اقدامات مدیریتی' })),
    ...inp.riskActions.filter((a) => !DONE_ACTION.has(a.status) && a.dueDate && a.dueDate < today).map((a) => ({ id: a.id, title: a.title, due: a.dueDate as string, owner: a.owner, high: critRisks.some((r) => r.id === a.riskId), src: 'اقدامات پاسخ ریسک' })),
  ]
  if (overdueActs.length) {
    findings.push({ id: 'f-actions', kind: 'action', title: 'اقدام‌های عقب‌افتاده', materiality: overdueActs.some((a) => a.high) ? 'material' : 'watch', actual: overdueActs.length, statement: `${fa(overdueActs.length)} اقدام از مهلت گذشته است${overdueActs.some((a) => a.high) ? '، از جمله اقدام‌های با اولویت بالا یا مربوط به ریسک بحرانی' : ''}.`, evidence: overdueActs.slice(0, 8).map((a) => ({ source: a.src, ref: a.title, asOf: a.due, value: `${fa(daysBetween(a.due, today))} روز تأخیر` })) })
    for (const a of overdueActs.filter((x) => x.high).slice(0, 4)) recs.push({ id: `r-act-${a.id}`, findingIds: ['f-actions'], text: `پیگیری اقدام «${a.title}» یا ثبت مهلت جدید با دلیل`, owner: a.owner, urgency: 'soon' })
  }

  /* 8 · decisions needed */
  const decisions: DecisionNeed[] = inp.decisions.filter((d) => PENDING_DECISION.has(d.status)).map((d) => ({
    id: d.id, title: d.title, level: 'project' as const, owner: d.owner, dueBy: d.requiredBy, overdue: !!d.requiredBy && d.requiredBy < today,
    evidence: [{ source: 'مرکز تصمیم', ref: d.title, asOf: d.createdAt.slice(0, 10) }],
  }))
  const overdueDec = decisions.filter((d) => d.overdue)
  if (overdueDec.length) {
    findings.push({ id: 'f-decision', kind: 'decision', title: 'تصمیم‌های معوق', materiality: 'material', actual: overdueDec.length, statement: `${fa(overdueDec.length)} تصمیم از موعد لازم گذشته و هنوز گرفته نشده است.`, evidence: overdueDec.map((d) => ({ source: 'مرکز تصمیم', ref: d.title, asOf: d.dueBy })) })
    for (const d of overdueDec) recs.push({ id: `r-dec-${d.id}`, findingIds: ['f-decision'], text: `اخذ تصمیم «${d.title}»`, owner: d.owner, urgency: 'now' })
  }
  if (m?.health?.status === 'black') decisions.unshift({ id: 'd-gate', title: 'تصمیم گیت: رفع موانع، عبور مشروط یا توقف', level: 'gate', owner: null, dueBy: null, overdue: false, evidence: m.health.blockers.map((b) => pm(m.asOf, b)) })
  const reviewDue = inp.portfolio?.reviewBy && inp.portfolio.reviewBy < today
  if (m && (m.health?.status === 'red' || m.health?.status === 'black') && (!inp.portfolio?.decision || reviewDue)) {
    decisions.unshift({ id: 'd-portfolio', title: inp.portfolio?.decision ? 'بازبینی تصمیم سبد (موعد گذشته)' : 'تصمیم سبد: ادامه، بازبرنامه‌ریزی، توقف موقت یا ارجاع', level: 'portfolio', owner: 'حاکم سبد', dueBy: inp.portfolio?.reviewBy ?? null, overdue: !!reviewDue, evidence: [pm(m.asOf, 'حکم سلامت بحرانی یا گیت مسدود')] })
  }

  /* 4 · causes: evidence associated with the material schedule / cost findings */
  const material = findings.filter((f) => f.materiality === 'material')
  const perf = findings.filter((f) => (f.kind === 'schedule' || f.kind === 'cost') && f.materiality !== 'ok')
  if (perf.length) {
    // one list of evidence for all time / cost deviations — the same stoppage explains SPI and the progress gap alike
    const ids = perf.map((f) => f.id)
    if (m?.health?.status === 'black' && m.health.blockers.length) causes.push({ findingIds: ids, strength: 'direct', text: `گیت مسدود است و کار مرحلهٔ بعد شروع نمی‌شود: ${m.health.blockers[0]}`, evidence: [pm(m.asOf, m.health.blockers[0])] })
    for (const d of (m ? [...m.delays].sort((a, b) => b.value - a.value).filter((x) => x.value > 0).slice(0, 2) : [])) causes.push({ findingIds: ids, strength: 'associated', text: `توقف اجرا با علت «${d.label}» (${fa(d.value)} ساعت) ثبت شده است`, evidence: [{ source: 'ثبت توقفات ماژول اجرا', ref: d.label, asOf: m?.asOf ?? null }] })
    for (const d of (m?.health?.dims ?? []).filter((x) => x.assessed && (x.status === 'red' || x.status === 'black') && x.key !== 'schedule' && x.key !== 'cost').slice(0, 2)) causes.push({ findingIds: ids, strength: 'associated', text: `${d.label}: ${d.explanation}`, evidence: [pm(m?.asOf ?? null, `بُعد ${d.label}`)] })
    if (overdueIssues.length) causes.push({ findingIds: ids, strength: 'associated', text: `${fa(overdueIssues.length)} مسئلهٔ مهمِ معوق باز است`, evidence: overdueIssues.slice(0, 3).map((i) => ({ source: 'مدیریت مسائل', ref: i.title, asOf: i.deadline })) })
    if (!causes.length && perf.some((f) => f.materiality === 'material')) recs.push({ id: 'r-cause', findingIds: ids, text: `ثبت علت انحراف «${perf.find((f) => f.materiality === 'material')!.title}» — در داده‌های سامانه شاهدی برای علت آن نیست`, owner: null, urgency: 'soon' })
  }

  /* 5 · trends from dated records */
  const trends: Trend[] = []
  if (m) {
    const pts = m.curve.filter((p) => p.earned != null && p.date <= today).slice(-6).map((p) => ({ date: p.date, value: r1(p.planned - (p.earned as number)) }))
    trends.push(trendOf('t-gap', 'فاصلهٔ پیشرفت EPC از برنامه', 'واحد درصد', pts, 'down', th.trendMinPoints, 0.5))
  }
  const months = monthEnds(today, 6)
  if (inp.risks) {
    const exposure = months.map((d) => ({ date: d, value: inp.risks!.filter((r) => r.identifiedDate <= d && ACTIVE_RISK.has(r.status)).reduce((a, r) => { const s = r.assessments.filter((x) => x.date <= d).sort((x, y) => x.date.localeCompare(y.date)).pop(); return a + (s ? s.score : r.score) }, 0) }))
    const informative = inp.risks.some((r) => r.identifiedDate <= months[0]) || inp.risks.some((r) => r.assessments.length)
    trends.push(trendOf('t-risk', 'مجموع امتیاز ریسک‌های فعال', 'امتیاز', informative ? exposure : [], 'down', th.trendMinPoints, 1))
  }
  if (inp.issues) trends.push(trendOf('t-issues', 'مسائل باز', 'مسئله', inp.issues.length ? openAt(inp.issues, months) : [], 'down', th.trendMinPoints, 0.5))

  /* 6 · projections, each with method and assumption */
  const projections: Projection[] = []
  const fresh = (d: string | null) => d != null && daysBetween(d, today) <= th.staleDays
  if (m) {
    const earned = m.curve.filter((p) => p.earned != null && p.date <= today)
    const last = earned[earned.length - 1]
    const back = earned.filter((p) => last && daysBetween(p.date, last.date) >= 85).pop()
    if (last && back && (last.earned as number) < 100) {
      const months3 = daysBetween(back.date, last.date) / 30
      const rate = ((last.earned as number) - (back.earned as number)) / months3
      const conf: Confidence = earned.length >= 6 && fresh(last.date) ? 'medium' : 'low'
      const ev = [pm(last.date, 'منحنی پیشرفت EPC', `${fa(back.earned as number, 1)}٪ → ${fa(last.earned as number, 1)}٪`)]
      if (rate <= 0.05) projections.push({ id: 'p-finish', label: 'تاریخ تکمیل دامنهٔ EPC', value: 'با نرخ فعلی تکمیل نمی‌شود', method: 'نرخ پیشرفت سه ماه اخیر', assumption: 'نرخ پیشرفت سه ماه اخیر ادامه یابد', confidence: conf, evidence: ev })
      else {
        const left = (100 - (last.earned as number)) / rate
        const finish = new Date(t(last.date) + left * 30 * DAY).toISOString().slice(0, 10)
        const slip = m.planFinish ? daysBetween(m.planFinish, finish) : null
        projections.push({ id: 'p-finish', label: 'تاریخ تکمیل دامنهٔ EPC', value: `${finish}${slip != null ? ` (${slip > 0 ? `${fa(slip)} روز بعد از` : `${fa(-slip)} روز پیش از`} پایان برنامه)` : ''}`, method: `نرخ پیشرفت سه ماه اخیر: ${fa(rate, 1)} واحد درصد در ماه`, assumption: 'نرخ پیشرفت سه ماه اخیر بدون تغییر ادامه یابد', confidence: conf, evidence: ev })
      }
    }
    if (m.evm && m.evm.cpi != null && m.evm.eac != null) projections.push({ id: 'p-eac', label: 'هزینهٔ تمام‌شدهٔ EPC', value: `${money(m.evm.eac)} (بودجه ${money(m.evm.bac)})`, method: 'بودجه ÷ CPI', assumption: 'کارایی هزینهٔ تاکنون تا پایان پروژه ثابت بماند', confidence: fresh(m.asOf) ? 'medium' : 'low', evidence: [{ source: 'ارزش کسب‌شده (قرارداد EPC و صورت‌وضعیت‌ها)', asOf: m.asOf, value: `CPI ${fa(m.evm.cpi, 2)}` }] })
  }

  /* 9 · effectiveness of earlier actions — judged only from a later measurement */
  const effects: ActionEffect[] = []
  for (const a of inp.riskActions.filter((x) => x.completedAt)) {
    const risk = (inp.risks ?? []).find((r) => r.id === a.riskId)
    if (!risk) continue
    const done = (a.completedAt as string).slice(0, 10)
    const before = risk.assessments.filter((x) => x.date <= done).sort((x, y) => x.date.localeCompare(y.date)).pop()?.score ?? null
    const after = risk.assessments.filter((x) => x.date > done || x.actionIds?.includes(a.id)).sort((x, y) => x.date.localeCompare(y.date)).pop()?.score ?? null
    const ev: Evidence[] = [{ source: 'اقدامات پاسخ ریسک', ref: a.title, asOf: done }]
    if (after != null && before != null) {
      const ok = after < before
      effects.push({ id: a.id, title: a.title, target: risk.title, verdict: ok ? 'effective' : 'not_effective', statement: ok ? `امتیاز ریسک پس از اقدام از ${fa(before)} به ${fa(after)} رسید.` : `امتیاز ریسک پس از اقدام کاهش نیافت (${fa(before)} → ${fa(after)}).`, evidence: [...ev, { source: 'ارزیابی ریسک', ref: risk.title, asOf: risk.assessments.map((x) => x.date).sort().pop() ?? null }] })
    } else if (daysBetween(done, today) < th.effectWaitDays) effects.push({ id: a.id, title: a.title, target: risk.title, verdict: 'too_early', statement: `اقدام ${fa(daysBetween(done, today))} روز پیش تکمیل شده؛ هنوز زود است.`, evidence: ev })
    else effects.push({ id: a.id, title: a.title, target: risk.title, verdict: 'unmeasurable', statement: 'پس از تکمیل اقدام، ریسک دوباره ارزیابی نشده است؛ اثر قابل سنجش نیست.', evidence: ev })
  }
  for (const a of inp.actions.filter((x) => x.status === 'completed' && x.relatedIssueId)) {
    const issue = (inp.issues ?? []).find((i) => i.id === a.relatedIssueId)
    if (!issue) continue
    const ev: Evidence[] = [{ source: 'اقدامات مدیریتی', ref: a.title, asOf: a.updatedAt.slice(0, 10) }]
    if (!OPEN_ISSUE.has(issue.status)) effects.push({ id: a.id, title: a.title, target: issue.title, verdict: 'effective', statement: 'مسئلهٔ مرتبط پس از اقدام بسته شده است.', evidence: [...ev, { source: 'مدیریت مسائل', ref: issue.title, asOf: issue.closedAt?.slice(0, 10) ?? null }] })
    else effects.push({ id: a.id, title: a.title, target: issue.title, verdict: daysBetween(a.updatedAt, today) < th.effectWaitDays ? 'too_early' : 'not_effective', statement: 'اقدام تکمیل شده ولی مسئلهٔ مرتبط هنوز باز است.', evidence: ev })
  }
  if (effects.some((e) => e.verdict === 'unmeasurable')) recs.push({ id: 'r-reassess', findingIds: [], text: `ارزیابی دوبارهٔ ${fa(effects.filter((e) => e.verdict === 'unmeasurable').length)} ریسک پس از اقدام‌های تکمیل‌شده تا اثرشان سنجیده شود`, owner: null, urgency: 'soon' })

  /* data quality */
  const quality: QualityItem[] = inp.sourceDates.map((s) => {
    const stale = s.date ? daysBetween(s.date, today) : null
    return { source: s.source, available: s.available, lastUpdate: s.date, staleDays: stale,
      note: !s.available ? 'به پروژه متصل نیست یا داده‌ای ندارد' : stale == null ? 'تاریخ آخرین ثبت معلوم نیست' : stale > th.staleDays ? `${fa(stale)} روز از آخرین ثبت گذشته — کهنه` : 'به‌روز' }
  })
  const usable = quality.filter((q) => q.available)
  const freshShare = usable.length ? usable.filter((q) => q.staleDays != null && q.staleDays <= th.staleDays).length / usable.length : 0
  const confidence: Confidence = !m || usable.length < 2 ? 'low' : freshShare >= 0.75 ? 'high' : freshShare >= 0.4 ? 'medium' : 'low'

  /* frozen facts and the change since the previous issued report */
  const facts: Facts = {
    lifecycleActual: m ? r1(m.lifecycle.actual) : null, lifecyclePlanned: m ? r1(m.lifecycle.planned) : null, gap: m ? r1(m.lifecycle.planned - m.lifecycle.actual) : null,
    spi: m?.evm?.spi != null && m.evm.cpi != null ? m.evm.spi : null, cpi: m?.evm?.cpi ?? null, health: m?.health?.status ?? null,
    criticalRisks: inp.risks ? critRisks.length : null, openCriticalIssues: inp.issues ? openIssues.filter((i) => i.priority === 'critical').length : null,
    overdueActions: overdueActs.length, pendingDecisions: inp.decisions.filter((d) => PENDING_DECISION.has(d.status)).length,
  }
  const changes = inp.previous ? compareFacts(inp.previous.facts, facts) : null

  const order: Record<Materiality, number> = { material: 0, watch: 1, ok: 2 }
  findings.sort((a, b) => order[a.materiality] - order[b.materiality])
  const headline = [
    ...material.slice(0, 4).map((f) => f.statement),
    ...(decisions.length ? [`${fa(decisions.length)} تصمیم لازم است${overdueDec.length ? `؛ ${fa(overdueDec.length)} تصمیم از موعد گذشته` : ''}.`] : []),
  ]
  if (!headline.length) headline.push(m ? 'انحراف مهمی بر پایهٔ آستانه‌های تعیین‌شده دیده نشد.' : 'شاخص‌های پروژه در دسترس نیست؛ گزارش فقط بر پایهٔ ثبت ریسک، مسائل و اقدام‌ها است.')

  return {
    asOf: today, project: inp.project, confidence, headline, facts, statusLines, findings, causes, trends, projections,
    recommendations: dedupe(recs), decisions, effects, quality, changes, previousRef: inp.previous ? inp.previous.reportNumber : null, thresholds: th,
  }
}

function dedupe(list: Recommendation[]) {
  const seen = new Set<string>()
  return list.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true))).sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === 'now' ? -1 : 1))
}

const HEALTH_RANK: Record<string, number> = { green: 0, yellow: 1, red: 2, black: 3 }
const HEALTH_LABEL: Record<string, string> = { green: 'سالم', yellow: 'نیازمند توجه', red: 'بحرانی', black: 'گیت مسدود' }

export function compareFacts(prev: Facts, cur: Facts): Change[] {
  const out: Change[] = []
  const num = (key: keyof Facts, label: string, betterUp: boolean, digits = 1, unit = '') => {
    const a = prev[key] as number | null, b = cur[key] as number | null
    if (a == null || b == null) return
    const d = Math.round((b - a) * 100) / 100
    out.push({ key, label, previous: `${fa(a, digits)}${unit}`, current: `${fa(b, digits)}${unit}`, direction: d === 0 ? 'same' : (d > 0) === betterUp ? 'better' : 'worse' })
  }
  num('lifecycleActual', 'پیشرفت واقعی', true, 1, '٪')
  num('gap', 'فاصله از برنامه', false, 1, ' واحد درصد')
  num('spi', 'SPI', true, 2)
  num('cpi', 'CPI', true, 2)
  if (prev.health && cur.health) out.push({ key: 'health', label: 'حکم سلامت', previous: HEALTH_LABEL[prev.health] ?? prev.health, current: HEALTH_LABEL[cur.health] ?? cur.health, direction: HEALTH_RANK[cur.health] === HEALTH_RANK[prev.health] ? 'same' : HEALTH_RANK[cur.health] < HEALTH_RANK[prev.health] ? 'better' : 'worse' })
  num('criticalRisks', 'ریسک بحرانی فعال', false, 0)
  num('openCriticalIssues', 'مسئلهٔ بحرانی باز', false, 0)
  num('overdueActions', 'اقدام عقب‌افتاده', false, 0)
  num('pendingDecisions', 'تصمیم در انتظار', false, 0)
  return out
}
