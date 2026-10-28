/**
 * Analysis center (reporting phase 4): deviations by domain, root-cause candidates, early warnings, cross-project
 * comparison and corrective-action suggestions — all over the facts the owning modules already hold.
 *
 * Rules shared by every function here:
 *  - one definition per indicator (DEFINITIONS), shown on the page next to the figure
 *  - a figure that has no source record is "not recorded", never zero
 *  - a cause is labelled by its basis: 'direct' (the record itself states it — a blocked gate, an approved change's
 *    days, the arithmetic share of a discipline in the gap), 'associated' (it co-occurs with the deviation — stoppages,
 *    overdue issues of the same area) or 'hypothesis' (a pattern worth checking, too thin to lean on)
 *  - warnings are 'rule' (a threshold crossed) or 'statistical' (a fitted trend projected forward, only with enough
 *    dated points); a machine-learnt forecast is not produced — there is no history long enough to validate one
 *  - suggestions are proposals: they name the record they act on, and nothing is written until a person registers it
 * Pure: the loader gathers the facts; nothing here touches a store or the network.
 */
import type { Confidence, Direction, EvidenceInput, EvidenceReport, Thresholds } from './evidenceReport'
import { DEFAULT_THRESHOLDS, RESPONSIBILITY_FA, daysBetween } from './evidenceReport'
import { formatJalali } from '../../../lib/jalali'

/* ── input ─────────────────────────────────────────────────────────── */

export type DisciplineKey = 'engineering' | 'procurement' | 'construction'
export interface IssueFact { id: string; title: string; status: string; priority: string; category: string | null; due: string | null; createdAt: string; closedAt: string | null; owner: string | null }
export interface ChangeFact { id: string; number: string; title: string; status: string; submittedAt: string | null; approvedCost: number | null; proposedCost: number | null; approvedDays: number | null; proposedDays: number | null }

export interface ProjectFacts {
  id: string
  name: string
  program: { id: string; name: string } | null
  portfolio: { id: string; name: string } | null
  location: string
  projectType: string
  contractType: string
  contractor: string | null
  contractValue: number | null
  manager: string | null
  phase: { code: string; title: string } | null
  /** engineering / procurement / construction progress and the project's own weights */
  disciplines: { key: DisciplineKey; actual: number; planned: number | null; weight: number }[]
  issues: IssueFact[] | null
  changes: ChangeFact[] | null
  /** the evidence report's input and output for the same project — the single source of every other figure */
  input: EvidenceInput
  report: EvidenceReport
}

/* ── shared vocabulary ─────────────────────────────────────────────── */

export type Domain = 'schedule' | 'cost' | 'engineering' | 'procurement' | 'construction' | 'contract' | 'risk' | 'issues' | 'execution' | 'decisions'
export const DOMAIN_FA: Record<Domain, string> = {
  schedule: 'زمان و پیشرفت', cost: 'هزینه', engineering: 'مهندسی و مدارک', procurement: 'تأمین کالا', construction: 'اجرا',
  contract: 'قرارداد و تغییرات', risk: 'ریسک', issues: 'مسائل باز', execution: 'توقفات اجرا', decisions: 'تصمیم و اقدام',
}
export const DISCIPLINE_FA: Record<DisciplineKey, string> = { engineering: 'مهندسی', procurement: 'تأمین کالا', construction: 'اجرا' }

/** one definition per indicator — the page shows these, every function below uses exactly these */
export const DEFINITIONS: Record<string, { label: string; formula: string; source: string }> = {
  gap: { label: 'فاصلهٔ پیشرفت از برنامه', formula: 'پیشرفت واقعی − پیشرفت برنامه‌ای کل چرخهٔ عمر (واحد درصد)', source: 'موتور شاخص پروژه (چرخهٔ عمر)' },
  spi: { label: 'SPI', formula: 'ارزش کسب‌شده ÷ ارزش برنامه‌ای دامنهٔ EPC', source: 'موتور شاخص پروژه (EVM)' },
  cpi: { label: 'CPI', formula: 'ارزش کسب‌شده ÷ هزینهٔ تأییدشده (صورت‌وضعیت‌های EPC)', source: 'موتور شاخص پروژه (EVM) + مالی' },
  vac: { label: 'انحراف در پایان (VAC)', formula: '(BAC − EAC) ÷ BAC', source: 'موتور شاخص پروژه (EVM)' },
  disc: { label: 'فاصلهٔ رشته', formula: 'پیشرفت واقعی − برنامه‌ای همان رشته (واحد درصد)', source: 'ماژول‌های مهندسی، تأمین کالا و اجرا' },
  share: { label: 'سهم رشته در فاصلهٔ EPC', formula: 'وزن رشته × فاصلهٔ رشته ÷ مجموع وزن‌ها', source: 'وزن‌های EPC همان پروژه' },
  changes: { label: 'تغییرات تصویب‌شده', formula: 'جمع مبلغ تصویب‌شدهٔ درخواست‌های تغییر ÷ مبلغ قرارداد', source: 'مدیریت تغییرات + داده پایه' },
  criticalRisks: { label: 'ریسک بحرانی و بالا', formula: 'ریسک‌های فعال با سطح فعلی بحرانی یا بالا', source: 'ثبت ریسک' },
  overdueIssues: { label: 'مسائل مهمِ معوق', formula: 'مسائل باز بحرانی/بالا که مهلت رفعشان گذشته', source: 'مدیریت مسائل' },
  stoppage: { label: 'ساعت توقف دوره', formula: 'جمع ساعت توقف گزارش‌های روزانهٔ غیرپیش‌نویس در دورهٔ گزارش', source: 'گزارش روزانهٔ اجرا' },
  decisions: { label: 'تصمیم و اقدام معوق', formula: 'تصمیم‌های در انتظار با موعد گذشته + اقدام‌های باز با سررسید گذشته', source: 'مرکز تصمیم و اقدامات' },
}

/** a date as managers read it: Jalali with Persian digits */
export const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[Number(x)]) : '—')
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fa(Math.abs(n), 1)}`
const isOpenIssue = (s: string) => s !== 'approved' && s !== 'rejected' && s !== 'closed'
const isOpenAction = (s: string) => s !== 'completed' && s !== 'cancelled'
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const th = (f: ProjectFacts): Thresholds => f.report.thresholds ?? DEFAULT_THRESHOLDS

/* ── 1 deviations ──────────────────────────────────────────────────── */

export type Severity = 'material' | 'watch' | 'ok' | 'none'
export interface Deviation {
  key: string
  projectId: string
  project: string
  domain: Domain
  metric: string
  /** the measured value as shown, and its numeric form for sorting */
  actual: string
  reference: string
  variance: number | null
  unit: string
  severity: Severity
  trend: Direction | null
  source: string
  asOf: string | null
  definition: string
  note: string
}

export function deviations(f: ProjectFacts): Deviation[] {
  const t = th(f), m = f.input.metrics, asOf = m?.asOf ?? null
  const out: Deviation[] = []
  const trend = (id: string) => f.report.trends.find((x) => x.id === id)?.direction ?? null
  const row = (d: Omit<Deviation, 'projectId' | 'project'>) => out.push({ ...d, projectId: f.id, project: f.name })
  const sevGap = (g: number) => (g <= -t.gapMaterial ? 'material' : g <= -t.gapWatch ? 'watch' : 'ok') as Severity
  const sevIdx = (v: number) => (v < t.idxMaterial ? 'material' : v < t.idxWatch ? 'watch' : 'ok') as Severity
  const none = (key: string, domain: Domain, metric: string, defKey: string, note: string) =>
    row({ key, domain, metric, actual: '—', reference: '—', variance: null, unit: '', severity: 'none', trend: null, source: DEFINITIONS[defKey].source, asOf: null, definition: DEFINITIONS[defKey].formula, note })

  // schedule — the lifecycle gap and the EPC SPI
  if (m) {
    const g = m.lifecycle.actual - m.lifecycle.planned
    row({ key: 'gap', domain: 'schedule', metric: DEFINITIONS.gap.label, actual: `${fa(m.lifecycle.actual, 1)}٪`, reference: `${fa(m.lifecycle.planned, 1)}٪`, variance: g, unit: 'واحد درصد', severity: sevGap(g), trend: trend('t-gap'), source: DEFINITIONS.gap.source, asOf, definition: DEFINITIONS.gap.formula, note: `آستانه: زرد از ${fa(t.gapWatch)} و قرمز از ${fa(t.gapMaterial)} واحد عقب‌تر` })
    if (m.evm?.spi != null) row({ key: 'spi', domain: 'schedule', metric: 'SPI دامنهٔ EPC', actual: fa(m.evm.spi, 2), reference: '۱٫۰۰', variance: m.evm.spi - 1, unit: 'نسبت', severity: sevIdx(m.evm.spi), trend: null, source: DEFINITIONS.spi.source, asOf, definition: DEFINITIONS.spi.formula, note: '' })
    else none('spi', 'schedule', 'SPI دامنهٔ EPC', 'spi', 'ارزش کسب‌شدهٔ EPC اندازه‌گیری نشده است')
  } else none('gap', 'schedule', DEFINITIONS.gap.label, 'gap', 'شاخص پروژه در دسترس نیست')

  // cost — CPI and VAC, only when the EPC contract has certified cost
  if (m?.evm && m.evm.cpi === 0) none('cpi', 'cost', 'CPI دامنهٔ EPC', 'cpi', 'ارزش کسب‌شده صفر است در حالی که هزینه ثبت شده (احتمالاً پیش‌پرداخت)؛ CPI قابل تفسیر نیست')
  else if (m?.evm && m.evm.cpi != null) {
    row({ key: 'cpi', domain: 'cost', metric: 'CPI دامنهٔ EPC', actual: fa(m.evm.cpi, 2), reference: '۱٫۰۰', variance: m.evm.cpi - 1, unit: 'نسبت', severity: sevIdx(m.evm.cpi), trend: null, source: DEFINITIONS.cpi.source, asOf, definition: DEFINITIONS.cpi.formula, note: '' })
    if (m.evm.vac != null && m.evm.bac > 0) {
      const pct = (m.evm.vac / m.evm.bac) * 100
      row({ key: 'vac', domain: 'cost', metric: DEFINITIONS.vac.label, actual: `${pp(pct)}٪`, reference: '۰٪', variance: pct, unit: 'درصد بودجه', severity: pct <= -t.vacMaterialPct ? 'material' : pct < 0 ? 'watch' : 'ok', trend: null, source: DEFINITIONS.vac.source, asOf, definition: DEFINITIONS.vac.formula, note: `آستانهٔ مهم: ${fa(t.vacMaterialPct)}٪ بیش‌هزینه` })
    }
  } else none('cpi', 'cost', 'CPI دامنهٔ EPC', 'cpi', 'هزینهٔ تأییدشدهٔ EPC (صورت‌وضعیت) یا ارزش کسب‌شده ثبت نشده است')

  // engineering / procurement / construction — each discipline against its own plan
  for (const k of ['engineering', 'procurement', 'construction'] as DisciplineKey[]) {
    const d = f.disciplines.find((x) => x.key === k)
    if (!d) { none(`disc-${k}`, k, `پیشرفت ${DISCIPLINE_FA[k]}`, 'disc', 'رشته در ماژول مربوط داده‌ای ندارد'); continue }
    if (d.planned == null) { row({ key: `disc-${k}`, domain: k, metric: `پیشرفت ${DISCIPLINE_FA[k]}`, actual: `${fa(d.actual, 1)}٪`, reference: 'برنامه ثبت نشده', variance: null, unit: 'واحد درصد', severity: 'none', trend: null, source: DEFINITIONS.disc.source, asOf, definition: DEFINITIONS.disc.formula, note: 'بدون برنامهٔ رشته، انحراف قابل محاسبه نیست' }); continue }
    const g = d.actual - d.planned
    row({ key: `disc-${k}`, domain: k, metric: `پیشرفت ${DISCIPLINE_FA[k]}`, actual: `${fa(d.actual, 1)}٪`, reference: `${fa(d.planned, 1)}٪`, variance: g, unit: 'واحد درصد', severity: sevGap(g), trend: null, source: DEFINITIONS.disc.source, asOf, definition: DEFINITIONS.disc.formula, note: '' })
  }

  // contract — approved changes against the contract value
  if (f.changes) {
    const approved = f.changes.filter((c) => c.approvedCost != null || c.approvedDays != null)
    const cost = approved.reduce((n, c) => n + (c.approvedCost ?? 0), 0), days = approved.reduce((n, c) => n + (c.approvedDays ?? 0), 0)
    const open = f.changes.filter((c) => ['submitted', 'evaluating', 'awaiting_approval', 'returned'].includes(c.status)).length
    const pct = f.contractValue && f.contractValue > 0 ? (cost / f.contractValue) * 100 : null
    row({ key: 'changes', domain: 'contract', metric: DEFINITIONS.changes.label, actual: pct == null ? `${fa(approved.length)} تغییر` : `${fa(pct, 1)}٪`, reference: f.contractValue ? 'مبلغ قرارداد' : 'مبلغ قرارداد ثبت نشده', variance: pct, unit: 'درصد قرارداد', severity: pct == null ? 'none' : pct >= 10 ? 'material' : pct >= 5 ? 'watch' : 'ok', trend: null, source: DEFINITIONS.changes.source, asOf: null, definition: DEFINITIONS.changes.formula, note: `${fa(open)} درخواست در جریان تصویب${days ? ` · ${fa(days)} روز اثر زمانی تصویب‌شده` : ''}` })
  } else none('changes', 'contract', DEFINITIONS.changes.label, 'changes', 'درخواست تغییری برای پروژه خوانده نشد')

  // risk
  if (f.input.risks) {
    const open = f.input.risks.filter((r) => r.status !== 'closed')
    const crit = open.filter((r) => r.level === 'critical').length, high = open.filter((r) => r.level === 'high').length
    row({ key: 'risk', domain: 'risk', metric: DEFINITIONS.criticalRisks.label, actual: `${fa(crit)} بحرانی · ${fa(high)} بالا`, reference: `${fa(open.length)} ریسک فعال`, variance: crit + high, unit: 'ریسک', severity: crit ? 'material' : high ? 'watch' : 'ok', trend: trend('t-risk'), source: DEFINITIONS.criticalRisks.source, asOf: null, definition: DEFINITIONS.criticalRisks.formula, note: '' })
  } else none('risk', 'risk', DEFINITIONS.criticalRisks.label, 'criticalRisks', 'ریسکی ثبت نشده — به معنای ریسک کم نیست')

  // issues
  if (f.issues) {
    const today = f.input.today
    const open = f.issues.filter((i) => isOpenIssue(i.status))
    const od = open.filter((i) => (i.priority === 'critical' || i.priority === 'high') && i.due && i.due.slice(0, 10) < today).length
    row({ key: 'issues', domain: 'issues', metric: DEFINITIONS.overdueIssues.label, actual: fa(od), reference: `${fa(open.length)} مسئلهٔ باز`, variance: od, unit: 'مسئله', severity: od >= 3 ? 'material' : od ? 'watch' : 'ok', trend: trend('t-issues'), source: DEFINITIONS.overdueIssues.source, asOf: null, definition: DEFINITIONS.overdueIssues.formula, note: '' })
  } else none('issues', 'issues', DEFINITIONS.overdueIssues.label, 'overdueIssues', 'مسئله‌ای ثبت نشده')

  // execution — stoppages in the period
  const pd = f.input.periodDelays
  if (pd) {
    const hours = pd.items.reduce((n, i) => n + i.hours, 0), crit = pd.items.filter((i) => i.critical).reduce((n, i) => n + i.hours, 0)
    row({ key: 'stoppage', domain: 'execution', metric: DEFINITIONS.stoppage.label, actual: `${fa(hours)} ساعت`, reference: `${fa(daysBetween(pd.from, pd.to))} روز دوره`, variance: hours, unit: 'ساعت', severity: crit >= 24 ? 'material' : hours > 0 ? 'watch' : 'ok', trend: null, source: DEFINITIONS.stoppage.source, asOf: pd.to, definition: DEFINITIONS.stoppage.formula, note: crit ? `${fa(crit)} ساعت روی فعالیت بحرانی` : '' })
  } else none('stoppage', 'execution', DEFINITIONS.stoppage.label, 'stoppage', 'گزارش روزانهٔ اجرایی در دسترس نیست')

  // decisions and actions
  const today = f.input.today
  const odDec = f.input.decisions.filter((d) => (d.status === 'pending' || d.status === 'in_review') && d.requiredBy && d.requiredBy.slice(0, 10) < today).length
  const odAct = f.input.actions.filter((a) => isOpenAction(a.status) && a.dueDate && a.dueDate.slice(0, 10) < today).length
  row({ key: 'decisions', domain: 'decisions', metric: DEFINITIONS.decisions.label, actual: `${fa(odDec)} تصمیم · ${fa(odAct)} اقدام`, reference: `${fa(f.input.decisions.filter((d) => d.status === 'pending' || d.status === 'in_review').length)} تصمیم در انتظار`, variance: odDec + odAct, unit: 'مورد', severity: odDec ? 'material' : odAct ? 'watch' : 'ok', trend: null, source: DEFINITIONS.decisions.source, asOf: null, definition: DEFINITIONS.decisions.formula, note: '' })
  return out
}

/* ── 2 root causes ─────────────────────────────────────────────────── */

export type CauseBasis = 'direct' | 'associated' | 'hypothesis'
export const BASIS_FA: Record<CauseBasis, string> = { direct: 'ثبت‌شده / محاسبه‌شده', associated: 'شاهد هم‌زمان (همبستگی)', hypothesis: 'فرضیه برای بررسی' }
export interface CauseCandidate {
  key: string
  projectId: string
  project: string
  effect: string
  effectDomain: Domain
  text: string
  basis: CauseBasis
  confidence: Confidence
  evidence: string[]
  /** what would confirm or rule it out — the reviewer's check */
  check: string
}

const AREA_WORDS: Record<DisciplineKey, RegExp> = {
  engineering: /مهندسی|مدرک|مدارک|نقشه|طراحی|engineering|design|document/i,
  procurement: /تأمین|تامین|خرید|کالا|سفارش|حمل|گمرک|فروشنده|تدارکات|procure|vendor|material|supply/i,
  construction: /اجرا|نصب|جوش|کارگاه|ماشین|نیرو|پیمانکار|construction|site|weld/i,
}

export function rootCauses(f: ProjectFacts): CauseCandidate[] {
  const out: CauseCandidate[] = []
  const t = th(f), m = f.input.metrics, today = f.input.today
  const stale = f.report.confidence === 'low'
  const lower = (c: Confidence): Confidence => (stale ? (c === 'high' ? 'medium' : 'low') : c)
  const add = (c: Omit<CauseCandidate, 'projectId' | 'project' | 'confidence'> & { confidence: Confidence }) => out.push({ ...c, confidence: lower(c.confidence), projectId: f.id, project: f.name })
  const gap = m ? m.lifecycle.actual - m.lifecycle.planned : null
  const behind = gap != null && gap <= -t.gapWatch

  // a blocked gate holds the schedule by definition
  for (const b of m?.health?.blockers ?? []) add({ key: `gate:${b.slice(0, 60)}`, effect: 'توقف ورود به مرحلهٔ بعد', effectDomain: 'schedule', text: `گیت مسدود: ${b}`, basis: 'direct', confidence: 'high', evidence: ['چرخهٔ عمر: شرط گیت برآورده نشده'], check: 'وضعیت شرط گیت در Stage-Gate' })

  // arithmetic share of each discipline in the EPC gap
  if (behind) {
    const ws = f.disciplines.filter((d) => d.planned != null)
    const W = ws.reduce((n, d) => n + d.weight, 0)
    if (W > 0) {
      const shares = ws.map((d) => ({ d, share: (d.weight * (d.actual - (d.planned as number))) / W })).filter((x) => x.share < -0.5).sort((a, b) => a.share - b.share)
      const total = shares.reduce((n, x) => n + x.share, 0)
      for (const x of shares.slice(0, 2)) {
        add({
          key: `share:${x.d.key}`, effect: `عقب‌ماندگی ${fa(Math.abs(gap as number), 1)} واحدی از برنامه`, effectDomain: 'schedule',
          text: `${DISCIPLINE_FA[x.d.key]} ${fa(Math.abs(x.share), 1)} واحد از فاصلهٔ وزنی EPC را می‌سازد${total < 0 ? ` (${fa((x.share / total) * 100)}٪ سهم)` : ''}`,
          basis: 'direct', confidence: 'medium',
          evidence: [`${DISCIPLINE_FA[x.d.key]}: واقعی ${fa(x.d.actual, 1)}٪ در برابر برنامه ${fa(x.d.planned as number, 1)}٪`, `وزن رشته: ${fa(x.d.weight, 2)}`],
          check: `علت عقب‌ماندگی خودِ ${DISCIPLINE_FA[x.d.key]} را باید در ماژول همان رشته دید؛ این فقط سهم آن را نشان می‌دهد`,
        })
      }
    }
  }

  // stoppages in the period — association with construction delay
  const pd = f.input.periodDelays
  if (pd?.items.length) {
    const by = new Map<string, { hours: number; days: Set<string>; resp: Map<string, number>; crit: number }>()
    for (const i of pd.items) {
      const e = by.get(i.label) ?? { hours: 0, days: new Set(), resp: new Map(), crit: 0 }
      e.hours += i.hours; e.days.add(i.date); e.resp.set(i.responsibility, (e.resp.get(i.responsibility) ?? 0) + i.hours); if (i.critical) e.crit += i.hours
      by.set(i.label, e)
    }
    const total = pd.items.reduce((n, i) => n + i.hours, 0)
    const cons = f.disciplines.find((d) => d.key === 'construction')
    const consBehind = !!cons && cons.planned != null && cons.actual - cons.planned <= -t.gapWatch
    for (const [label, e] of [...by].sort((a, b) => b[1].hours - a[1].hours).slice(0, 3)) {
      const share = e.hours / total
      const resp = [...e.resp].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      add({
        key: `stop:${label}`, effect: consBehind ? 'عقب‌ماندگی اجرا' : 'ساعت توقف اجرا', effectDomain: consBehind ? 'construction' : 'execution',
        text: `توقف «${label}»: ${fa(e.hours)} ساعت در ${fa(e.days.size)} روز (${fa(share * 100)}٪ توقفات دوره)، مسئولیت غالب: ${RESPONSIBILITY_FA[resp] ?? resp}`,
        basis: consBehind ? 'associated' : 'hypothesis', confidence: e.days.size >= 3 && share >= 0.3 ? 'medium' : 'low',
        evidence: [`گزارش روزانهٔ اجرا ${jd(pd.from)} تا ${jd(pd.to)}`, ...(e.crit ? [`${fa(e.crit)} ساعت روی فعالیت بحرانی`] : [])],
        check: 'آیا فعالیت‌های متوقف‌شده روی مسیر بحرانی بوده‌اند و کار جایگزین داشته‌اند؟',
      })
    }
  }

  // overdue important issues in the area of a lagging discipline
  if (f.issues) {
    for (const d of f.disciplines) {
      if (d.planned == null || d.actual - d.planned > -t.gapWatch) continue
      const hits = f.issues.filter((i) => isOpenIssue(i.status) && (i.priority === 'critical' || i.priority === 'high') && i.due && i.due.slice(0, 10) < today && AREA_WORDS[d.key].test(`${i.category ?? ''} ${i.title}`))
      if (!hits.length) continue
      add({
        key: `issues:${d.key}`, effect: `عقب‌ماندگی ${DISCIPLINE_FA[d.key]}`, effectDomain: d.key,
        text: `${fa(hits.length)} مسئلهٔ مهمِ معوق در حوزهٔ ${DISCIPLINE_FA[d.key]}: ${hits.slice(0, 3).map((i) => `«${i.title}»`).join('، ')}`,
        basis: 'associated', confidence: hits.length >= 2 ? 'medium' : 'low',
        evidence: hits.slice(0, 5).map((i) => `مسئله «${i.title}» — مهلت ${jd(i.due)}`),
        check: 'آیا این مسائل فعالیت‌های عقب‌افتادهٔ همان رشته را متوقف کرده‌اند؟ (تطبیق بر پایهٔ واژه‌های عنوان و دسته است)',
      })
    }
  }

  // approved schedule impact of changes — the delay is recorded on the change itself
  const days = (f.changes ?? []).reduce((n, c) => n + (c.approvedDays ?? 0), 0)
  if (days > 0 && behind) add({ key: 'changes:days', effect: 'جابه‌جایی تاریخ پایان', effectDomain: 'contract', text: `تغییرات تصویب‌شده ${fa(days)} روز اثر زمانی ثبت کرده‌اند`, basis: 'direct', confidence: 'medium', evidence: (f.changes ?? []).filter((c) => (c.approvedDays ?? 0) > 0).slice(0, 4).map((c) => `${c.number || 'تغییر'}: ${c.title} — ${fa(c.approvedDays ?? 0)} روز`), check: 'آیا برنامهٔ مبنا پس از تصویب تغییر بازنگری شده است؟ اگر نه، بخشی از فاصله ناشی از مبنای قدیمی است' })

  // risks whose assessed score rose — a hypothesis until the risk is linked to the deviation
  for (const r of (f.input.risks ?? []).filter((x) => x.status !== 'closed' && (x.level === 'critical' || x.level === 'high'))) {
    const a = [...r.assessments].sort((x, y) => x.date.localeCompare(y.date))
    if (a.length >= 2 && a[a.length - 1].score > a[a.length - 2].score && behind) {
      add({ key: `risk:${r.id}`, effect: 'عقب‌ماندگی پروژه', effectDomain: 'risk', text: `ریسک «${r.title}» در آخرین ارزیابی بالا رفته است (${fa(a[a.length - 2].score)} ← ${fa(a[a.length - 1].score)})`, basis: 'hypothesis', confidence: 'low', evidence: [`ثبت ریسک — ارزیابی ${jd(a[a.length - 1].date)}`], check: 'آیا این ریسک رخ داده و به مسئله تبدیل شده است؟' })
    }
  }

  // the evidence report's own causes that are not already covered
  for (const c of f.report.causes) {
    const k = `ev:${c.text.slice(0, 60)}`
    // already said: the same gate blocker, or the same stoppage category
    const blocker = (m?.health?.blockers ?? []).some((b) => c.text.includes(b))
    const stop = c.text.match(/«([^»]+)»/)?.[1]
    if (blocker || (stop && out.some((x) => x.key === `stop:${stop}`)) || out.some((x) => c.text.includes(x.text.slice(0, 20)))) continue
    add({ key: k, effect: 'یافتهٔ گزارش شواهدمحور', effectDomain: 'schedule', text: c.text, basis: c.strength === 'direct' ? 'direct' : 'associated', confidence: c.strength === 'direct' ? 'high' : 'low', evidence: c.evidence.map((e) => [e.source, e.ref, e.asOf].filter(Boolean).join(' · ')), check: 'تطبیق با گزارش شواهدمحور پروژه' })
  }
  const rank = { direct: 0, associated: 1, hypothesis: 2 }, cr = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => rank[a.basis] - rank[b.basis] || cr[a.confidence] - cr[b.confidence])
}

/* ── 3 early warnings ──────────────────────────────────────────────── */

export type WarningKind = 'rule' | 'statistical'
export const WARNING_KIND_FA: Record<WarningKind, string> = { rule: 'قاعده‌محور (آستانه)', statistical: 'آماری (روند)' }
export interface EarlyWarning {
  key: string
  projectId: string
  project: string
  kind: WarningKind
  severity: 'high' | 'medium'
  title: string
  reason: string
  evidence: string[]
  date: string
  confidence: Confidence
  suggestion: string
}

/** linear least-squares slope per month and the value it projects at a date */
export function projectLinear(points: { date: string; value: number }[], at: string): { slope: number; value: number } | null {
  if (points.length < 2) return null
  const x0 = new Date(`${points[0].date}T00:00:00Z`).getTime()
  const xs = points.map((p) => (new Date(`${p.date}T00:00:00Z`).getTime() - x0) / (30.44 * 86400000)), ys = points.map((p) => p.value)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  const sxx = xs.reduce((n, x) => n + (x - mx) ** 2, 0)
  if (sxx === 0) return null
  const slope = xs.reduce((n, x, i) => n + (x - mx) * (ys[i] - my), 0) / sxx
  const xa = (new Date(`${at}T00:00:00Z`).getTime() - x0) / (30.44 * 86400000)
  return { slope, value: my + slope * (xa - mx) }
}

export function earlyWarnings(f: ProjectFacts): EarlyWarning[] {
  const t = th(f), m = f.input.metrics, today = f.input.today
  const out: EarlyWarning[] = []
  const add = (w: Omit<EarlyWarning, 'projectId' | 'project' | 'date'> & { date?: string }) => out.push({ date: today, ...w, projectId: f.id, project: f.name })

  // rule: the gap is getting worse against the previous issued report
  const ch = f.report.changes?.find((c) => c.key === 'gap')
  if (ch?.direction === 'worse' && m && m.lifecycle.actual - m.lifecycle.planned <= -t.gapWatch) add({ key: 'r-gap-worse', kind: 'rule', severity: 'high', title: 'افزایش فاصله از برنامه', reason: `فاصله از ${ch.previous} در گزارش قبل به ${ch.current} رسیده و از آستانهٔ ${fa(t.gapWatch)} واحد گذشته است`, evidence: [`گزارش ${f.report.previousRef ?? 'قبلی'}`, 'موتور شاخص پروژه'], confidence: 'high', suggestion: 'بازبینی برنامهٔ جبرانی در جلسهٔ بعدی پروژه' })

  // rule: a discipline that feeds the next one is behind (procurement before construction, engineering before procurement)
  for (const [a, b] of [['engineering', 'procurement'], ['procurement', 'construction']] as [DisciplineKey, DisciplineKey][]) {
    const d = f.disciplines.find((x) => x.key === a), next = f.disciplines.find((x) => x.key === b)
    if (!d || d.planned == null || d.planned <= 0) continue
    const ratio = d.actual / d.planned
    if (ratio < t.idxMaterial && (!next || next.actual < 100)) add({ key: `r-feed-${a}`, kind: 'rule', severity: ratio < 0.8 ? 'high' : 'medium', title: `عقب‌ماندگی ${DISCIPLINE_FA[a]} پیش از ${DISCIPLINE_FA[b]}`, reason: `${DISCIPLINE_FA[a]} ${fa(ratio * 100)}٪ برنامه را انجام داده؛ ${DISCIPLINE_FA[b]} به خروجی آن وابسته است`, evidence: [`${DISCIPLINE_FA[a]}: ${fa(d.actual, 1)}٪ از ${fa(d.planned, 1)}٪`], confidence: 'medium', suggestion: `فهرست اقلام/مدارک بحرانی ${DISCIPLINE_FA[a]} که جلوی ${DISCIPLINE_FA[b]} را می‌گیرند تهیه شود` })
  }

  // rule: the issue backlog is growing — more opened than closed in 30 days
  if (f.issues?.length) {
    const opened = f.issues.filter((i) => daysBetween(i.createdAt.slice(0, 10), today) <= 30).length
    const closed = f.issues.filter((i) => i.closedAt && daysBetween(i.closedAt.slice(0, 10), today) <= 30).length
    if (opened >= 3 && closed < opened * 0.8) add({ key: 'r-issue-flow', kind: 'rule', severity: closed < opened * 0.5 ? 'high' : 'medium', title: 'انباشت مسائل', reason: `در ۳۰ روز اخیر ${fa(opened)} مسئلهٔ تازه و ${fa(closed)} مسئلهٔ بسته‌شده`, evidence: ['مدیریت مسائل'], confidence: 'high', suggestion: 'بازبینی ظرفیت پیگیری و اولویت مسائل باز' })
    const crit = f.issues.filter((i) => isOpenIssue(i.status) && i.priority === 'critical' && i.due && i.due.slice(0, 10) < today)
    if (crit.length) add({ key: 'r-issue-crit', kind: 'rule', severity: 'high', title: 'مسئلهٔ بحرانیِ معوق', reason: `${fa(crit.length)} مسئلهٔ بحرانی از مهلت رفع گذشته‌اند`, evidence: crit.slice(0, 4).map((i) => `«${i.title}» — مهلت ${jd(i.due)}`), confidence: 'high', suggestion: 'ارجاع مسائل بحرانی معوق به سطح مدیریت بالاتر' })
  }

  // rule: decisions past their date
  const od = f.input.decisions.filter((d) => (d.status === 'pending' || d.status === 'in_review') && d.requiredBy && d.requiredBy.slice(0, 10) < today)
  if (od.length) add({ key: 'r-decision', kind: 'rule', severity: 'high', title: 'تصمیم معوق', reason: `${fa(od.length)} تصمیم از موعد گذشته و هنوز گرفته نشده`, evidence: od.slice(0, 4).map((d) => `«${d.title}» — موعد ${jd(d.requiredBy)}${d.owner ? ` · ${d.owner}` : ''}`), confidence: 'high', suggestion: 'طرح تصمیم‌ها در جلسهٔ مدیریت با مرجع تصمیم' })

  // rule: the same stoppage cause on many days
  const pd = f.input.periodDelays
  if (pd) {
    const days = new Map<string, Set<string>>()
    for (const i of pd.items) days.set(i.label, (days.get(i.label) ?? new Set()).add(i.date))
    for (const [label, s] of days) if (s.size >= 3) add({ key: `r-stop-${label}`, kind: 'rule', severity: s.size >= 6 ? 'high' : 'medium', title: 'تکرار توقف با علت یکسان', reason: `توقف «${label}» در ${fa(s.size)} روز دوره تکرار شده`, evidence: [`گزارش روزانه ${jd(pd.from)} تا ${jd(pd.to)}`], confidence: 'high', suggestion: `رفع ریشه‌ای علت «${label}» به‌جای پیگیری روزانه` })
  }

  // rule: stale sources make every other reading weaker
  for (const q of f.report.quality.filter((x) => x.available && x.staleDays != null && x.staleDays > t.staleDays)) add({ key: `r-stale-${q.source}`, kind: 'rule', severity: 'medium', title: 'دادهٔ کهنه', reason: `${q.source}: ${fa(q.staleDays as number)} روز بدون به‌روزرسانی`, evidence: [q.note], confidence: 'high', suggestion: 'به‌روزرسانی داده در ماژول منبع پیش از تصمیم' })

  // statistical: the gap trend projected to the planned finish
  const tg = f.report.trends.find((x) => x.id === 't-gap')
  const finish = m?.planFinish
  if (tg && tg.direction === 'worsening' && tg.points.length >= t.trendMinPoints && finish && finish > today) {
    const p = projectLinear(tg.points, finish)
    // the trend's points are planned − earned of the EPC curve: positive = behind
    if (p && p.value >= t.gapMaterial) add({ key: 's-gap-finish', kind: 'statistical', severity: p.value >= 2 * t.gapMaterial ? 'high' : 'medium', title: 'پیش‌بینی فاصلهٔ بزرگ در پایان', reason: `اگر روند ${fa(tg.points.length)} نقطهٔ اخیر ادامه یابد، عقب‌ماندگی EPC در تاریخ پایان برنامه به حدود ${fa(Math.min(100, p.value), 0)} واحد درصد می‌رسد`, evidence: [`روش: برازش خطی کمترین مربعات روی ${fa(tg.points.length)} نقطهٔ ماهانه`, `شیب: ${fa(p.slope, 1)} واحد در ماه`, `فرض: ادامهٔ روند فعلی بدون اقدام جبرانی`], confidence: tg.points.length >= 6 ? 'medium' : 'low', suggestion: 'تهیهٔ برنامهٔ جبرانی با هدف تاریخ پایان' })
  }
  // statistical: risk exposure and open issues rising
  for (const id of ['t-risk', 't-issues']) {
    const tr = f.report.trends.find((x) => x.id === id)
    if (tr && tr.direction === 'worsening' && tr.slopePerMonth != null) add({ key: `s-${id}`, kind: 'statistical', severity: 'medium', title: `روند رو به بدتر: ${tr.label}`, reason: `${tr.label} در ${fa(tr.points.length)} ماه اخیر با شیب ${fa(tr.slopePerMonth, 1)} ${tr.unit} در ماه افزایش یافته`, evidence: [`روش: شیب خطی روی ${fa(tr.points.length)} نقطه`], confidence: tr.points.length >= 6 ? 'medium' : 'low', suggestion: id === 't-risk' ? 'بازبینی پاسخ ریسک‌های بالا' : 'بازبینی ورودی و خروجی مسائل' })
  }
  // statistical: the engine's own projections (EAC, finish), carried with their method
  for (const p of f.report.projections) add({ key: `s-proj-${p.id}`, kind: 'statistical', severity: 'medium', title: p.label, reason: `${p.value} — ${p.method}`, evidence: [p.assumption], confidence: p.confidence, suggestion: 'مقایسه با پیش‌بینی پیمانکار و بازبینی در گزارش بعد' })

  return out.sort((a, b) => (a.severity === b.severity ? (a.kind === b.kind ? 0 : a.kind === 'rule' ? -1 : 1) : a.severity === 'high' ? -1 : 1))
}

/* ── 4 cross-project ───────────────────────────────────────────────── */

export interface CompareRow {
  projectId: string
  project: string
  group: string
  gap: number | null
  spi: number | null
  cpi: number | null
  disc: Partial<Record<DisciplineKey, number | null>>
  criticalRisks: number | null
  overdueIssues: number | null
  stoppageHours: number | null
  material: number
  confidence: Confidence
  contractor: string | null
  contractType: string
  /** rank inside its peer group by gap (1 = furthest behind); null when the group has a single project with data */
  rankInGroup: number | null
  groupSize: number
}
export interface Pattern { key: string; kind: 'cause' | 'category' | 'contractor' | 'domain'; text: string; projects: string[]; basis: CauseBasis; escalate: boolean; note: string }

/** peers are projects in the same lifecycle phase — comparing a design-stage project with one in commissioning is misleading */
export function peerGroup(f: ProjectFacts) { return f.phase ? `مرحلهٔ ${f.phase.title}` : 'مرحلهٔ نامشخص' }

export function compareProjects(list: ProjectFacts[]): { rows: CompareRow[]; patterns: Pattern[] } {
  const rows: CompareRow[] = list.map((f) => {
    const m = f.input.metrics, dv = deviations(f)
    const disc: CompareRow['disc'] = {}
    for (const d of f.disciplines) disc[d.key] = d.planned == null ? null : d.actual - d.planned
    const today = f.input.today
    return {
      projectId: f.id, project: f.name, group: peerGroup(f),
      gap: m ? m.lifecycle.actual - m.lifecycle.planned : null, spi: m?.evm?.spi ?? null, cpi: m?.evm?.cpi ? m.evm.cpi : null, disc,
      criticalRisks: f.input.risks ? f.input.risks.filter((r) => r.status !== 'closed' && (r.level === 'critical' || r.level === 'high')).length : null,
      overdueIssues: f.issues ? f.issues.filter((i) => isOpenIssue(i.status) && (i.priority === 'critical' || i.priority === 'high') && i.due && i.due.slice(0, 10) < today).length : null,
      stoppageHours: f.input.periodDelays ? f.input.periodDelays.items.reduce((n, i) => n + i.hours, 0) : null,
      material: dv.filter((d) => d.severity === 'material').length, confidence: f.report.confidence,
      contractor: f.contractor, contractType: f.contractType, rankInGroup: null, groupSize: 0,
    }
  })
  const groups = new Map<string, CompareRow[]>()
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r])
  for (const g of groups.values()) {
    const withGap = g.filter((r) => r.gap != null).sort((a, b) => (a.gap as number) - (b.gap as number))
    for (const r of g) r.groupSize = g.length
    if (withGap.length >= 2) withGap.forEach((r, i) => { r.rankInGroup = i + 1 })
  }

  const patterns: Pattern[] = []
  // the same cause in several projects
  const causes = new Map<string, Set<string>>()
  for (const f of list) for (const c of rootCauses(f)) {
    const k = c.key.startsWith('stop:') ? `توقف «${c.key.slice(5)}»` : c.key.startsWith('share:') ? `سهم بزرگ ${DISCIPLINE_FA[c.key.slice(6) as DisciplineKey]} در فاصلهٔ زمانی` : c.key.startsWith('issues:') ? `مسائل معوق حوزهٔ ${DISCIPLINE_FA[c.key.slice(7) as DisciplineKey]}` : null
    if (k) causes.set(k, (causes.get(k) ?? new Set()).add(f.name))
  }
  for (const [k, s] of causes) if (s.size >= 2) patterns.push({ key: `c:${k}`, kind: 'cause', text: k, projects: [...s], basis: 'associated', escalate: s.size >= 3, note: 'علت تکرارشونده در چند پروژه' })
  // issue categories recurring across projects
  const cats = new Map<string, Set<string>>()
  for (const f of list) for (const i of f.issues ?? []) if (i.category && isOpenIssue(i.status)) cats.set(i.category, (cats.get(i.category) ?? new Set()).add(f.name))
  for (const [k, s] of cats) if (s.size >= 2) patterns.push({ key: `k:${k}`, kind: 'category', text: `مسائل باز دستهٔ «${k}»`, projects: [...s], basis: 'associated', escalate: s.size >= 3, note: 'دستهٔ مشترک مسائل باز' })
  // domains with material deviations in many projects
  const dom = new Map<Domain, Set<string>>()
  for (const f of list) for (const d of deviations(f)) if (d.severity === 'material') dom.set(d.domain, (dom.get(d.domain) ?? new Set()).add(f.name))
  for (const [k, s] of dom) if (s.size >= 2) patterns.push({ key: `d:${k}`, kind: 'domain', text: `انحراف مهم در «${DOMAIN_FA[k]}»`, projects: [...s], basis: 'direct', escalate: s.size >= Math.max(3, list.length / 3), note: 'فراوانی انحراف مهم در همین حوزه' })
  // contractor: only a correlation, and only with at least two projects each side
  const byC = new Map<string, number[]>()
  for (const r of rows) if (r.contractor && r.gap != null) byC.set(r.contractor, [...(byC.get(r.contractor) ?? []), r.gap])
  const allGaps = rows.filter((r) => r.gap != null).map((r) => r.gap as number)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  for (const [c, gs] of byC) {
    const others = allGaps.length - gs.length
    if (gs.length >= 2 && others >= 2) {
      const mine = avg(gs), rest = (allGaps.reduce((a, b) => a + b, 0) - gs.reduce((a, b) => a + b, 0)) / others
      if (mine - rest <= -5) patterns.push({ key: `p:${c}`, kind: 'contractor', text: `پروژه‌های «${c}» به‌طور میانگین ${fa(Math.abs(mine - rest), 1)} واحد بیشتر از بقیه عقب‌اند`, projects: rows.filter((r) => r.contractor === c).map((r) => r.project), basis: 'hypothesis', escalate: false, note: `همبستگی روی ${fa(gs.length)} پروژه؛ مرحله، دامنه و نوع قرارداد پروژه‌ها یکسان نیست و این به‌تنهایی دلیل عملکرد پیمانکار نیست` })
    }
  }
  return { rows, patterns: patterns.sort((a, b) => Number(b.escalate) - Number(a.escalate) || b.projects.length - a.projects.length) }
}

/* ── 5 corrective actions ──────────────────────────────────────────── */

export interface Suggestion {
  key: string
  projectId: string
  project: string
  problem: string
  evidence: string[]
  cause: string | null
  causeBasis: CauseBasis | null
  action: string
  priority: 'critical' | 'high' | 'medium'
  urgency: 'now' | 'soon'
  owner: string | null
  due: string
  consequence: string
  kpi: string
  origin: WarningKind
  /** an open action with the same target already exists — shown, not proposed again */
  existing: string | null
}

export function suggestions(f: ProjectFacts): Suggestion[] {
  const today = f.input.today, out: Suggestion[] = []
  const causes = rootCauses(f), warns = earlyWarnings(f)
  const openActs = f.input.actions.filter((a) => isOpenAction(a.status))
  const existing = (words: RegExp) => openActs.find((a) => words.test(a.title))?.title ?? null
  const add = (s: Omit<Suggestion, 'projectId' | 'project' | 'existing'> & { match?: RegExp }) => { const { match, ...r } = s; out.push({ ...r, projectId: f.id, project: f.name, existing: match ? existing(match) : null }) }
  const pm = f.manager

  for (const c of causes) {
    if (c.key.startsWith('gate:')) add({ key: `a-${c.key}`, problem: c.effect, evidence: c.evidence, cause: c.text, causeBasis: c.basis, action: `رفع شرط گیت یا ثبت تصمیم گیت: ${c.text.replace('گیت مسدود: ', '')}`, priority: 'critical', urgency: 'now', owner: pm, due: addDays(today, 7), consequence: 'پروژه وارد مرحلهٔ بعد نمی‌شود و تأخیر در همهٔ رشته‌های بعدی منتقل می‌شود', kpi: 'وضعیت گیت در Stage-Gate', origin: 'rule', match: /گیت/ })
    if (c.key.startsWith('share:')) {
      const k = c.key.slice(6) as DisciplineKey
      add({ key: `a-${c.key}`, problem: c.effect, evidence: c.evidence, cause: c.text, causeBasis: c.basis, action: `برنامهٔ جبرانی ${DISCIPLINE_FA[k]}: تعیین اقلام عقب‌افتادهٔ مسیر بحرانی، منابع اضافی و تاریخ‌های هدف`, priority: 'high', urgency: 'now', owner: pm, due: addDays(today, 14), consequence: 'ادامهٔ روند، فاصله از برنامه را در پایان پروژه بزرگ‌تر می‌کند', kpi: `نسبت پیشرفت ${DISCIPLINE_FA[k]} به برنامه ≥ ۹۵٪ در گزارش بعد`, origin: 'rule', match: AREA_WORDS[k] })
    }
    if (c.key.startsWith('stop:')) add({ key: `a-${c.key}`, problem: c.effect, evidence: c.evidence, cause: c.text, causeBasis: c.basis, action: `رفع علت توقف «${c.key.slice(5)}» با مسئول مشخص و پیگیری هفتگی`, priority: c.confidence === 'medium' ? 'high' : 'medium', urgency: 'soon', owner: pm, due: addDays(today, 10), consequence: 'ساعات توقف از ظرفیت اجرا کم می‌کند', kpi: `ساعت توقف «${c.key.slice(5)}» در دورهٔ بعد`, origin: 'rule', match: new RegExp(c.key.slice(5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    if (c.key.startsWith('issues:')) add({ key: `a-${c.key}`, problem: c.effect, evidence: c.evidence, cause: c.text, causeBasis: c.basis, action: 'جلسهٔ رفع مسائل مهمِ معوق با صاحبان مسائل و تعیین مهلت جدید یا ارجاع', priority: 'high', urgency: 'now', owner: pm, due: addDays(today, 7), consequence: 'مسائل باز فعالیت‌های رشته را متوقف نگه می‌دارند', kpi: 'تعداد مسائل مهمِ معوق همان حوزه', origin: 'rule', match: /مسائل|مسئله/ })
  }
  for (const w of warns) {
    if (w.key === 'r-decision') add({ key: 'a-decision', problem: w.title, evidence: w.evidence, cause: null, causeBasis: null, action: 'طرح تصمیم‌های معوق در جلسهٔ مدیریت با مرجع تصمیم و ثبت نتیجه', priority: 'critical', urgency: 'now', owner: null, due: addDays(today, 7), consequence: 'کار وابسته به تصمیم متوقف می‌ماند', kpi: 'تعداد تصمیم‌های معوق', origin: 'rule', match: /تصمیم/ })
    if (w.key === 'r-issue-flow') add({ key: 'a-issue-flow', problem: w.title, evidence: [w.reason], cause: null, causeBasis: null, action: 'بازبینی ظرفیت پیگیری مسائل و اولویت‌بندی موجودی', priority: 'medium', urgency: 'soon', owner: pm, due: addDays(today, 14), consequence: 'موجودی مسائل بزرگ می‌شود و مسائل مهم دیرتر دیده می‌شوند', kpi: 'نسبت رفع به ورود مسائل ≥ ۱', origin: 'rule' })
    if (w.key.startsWith('r-stale')) add({ key: `a-${w.key}`, problem: w.title, evidence: [w.reason], cause: null, causeBasis: null, action: w.suggestion, priority: 'medium', urgency: 'soon', owner: pm, due: addDays(today, 5), consequence: 'تحلیل و تصمیم بر پایهٔ دادهٔ قدیمی', kpi: 'روزهای بی‌به‌روزرسانی منبع', origin: 'rule' })
    if (w.key === 's-gap-finish') add({ key: 'a-recovery', problem: w.title, evidence: w.evidence, cause: null, causeBasis: null, action: 'تهیهٔ برنامهٔ جبرانی با هدف تاریخ پایان و بررسی گزینه‌های فشرده‌سازی', priority: 'high', urgency: 'soon', owner: pm, due: addDays(today, 21), consequence: w.reason, kpi: 'فاصلهٔ پیشرفت از برنامه در سه گزارش بعد', origin: 'statistical', match: /جبران/ })
  }
  const m = f.input.metrics
  if (m?.evm?.cpi != null && m.evm.cpi > 0 && m.evm.cpi < th(f).idxMaterial) add({ key: 'a-cost', problem: `CPI ${fa(m.evm.cpi, 2)}`, evidence: ['موتور شاخص پروژه (EVM)'], cause: null, causeBasis: null, action: 'بازبینی هزینه‌های تأییدشده و پیش‌بینی هزینهٔ تمام‌شده با واحد مالی', priority: 'high', urgency: 'soon', owner: pm, due: addDays(today, 14), consequence: 'بیش‌هزینه در پایان پروژه', kpi: 'CPI ≥ ۰٫۹۵', origin: 'rule', match: /هزینه|مالی/ })
  // the evidence report's own recommendations (they name records)
  for (const r of f.report.recommendations) if (!out.some((x) => x.action === r.text)) add({ key: `a-ev-${r.id}`, problem: 'یافتهٔ گزارش شواهدمحور', evidence: r.findingIds, cause: null, causeBasis: null, action: r.text, priority: r.urgency === 'now' ? 'high' : 'medium', urgency: r.urgency, owner: r.owner, due: addDays(today, r.urgency === 'now' ? 7 : 21), consequence: 'ادامهٔ انحراف ثبت‌شده در گزارش', kpi: 'وضعیت یافته در گزارش بعد', origin: 'rule' })
  // one proposal per action text: two lagging disciplines with overdue issues lead to the same meeting
  const seen = new Set<string>()
  const pr = { critical: 0, high: 1, medium: 2 }
  const merged = new Map<string, Suggestion>()
  for (const x of out) {
    if (seen.has(x.key)) continue
    seen.add(x.key)
    const m0 = merged.get(x.action)
    if (m0) { m0.evidence = [...m0.evidence, ...x.evidence]; if (x.cause && m0.cause && !m0.cause.includes(x.cause)) m0.cause = `${m0.cause}؛ ${x.cause}` } else merged.set(x.action, { ...x })
  }
  return [...merged.values()].sort((a, b) => pr[a.priority] - pr[b.priority])
}

/* ── 6 portfolio summary (home + executive report) ─────────────────── */

export interface Summary {
  projects: number
  withData: number
  material: Deviation[]
  critical: { projectId: string; project: string; material: number; reasons: string[] }[]
  warnings: EarlyWarning[]
  decisions: { projectId: string; project: string; title: string; dueBy: string | null; owner: string | null; overdue: boolean }[]
  patterns: Pattern[]
  lowConfidence: string[]
  asOf: string | null
}

export function summarise(list: ProjectFacts[]): Summary {
  const devs = list.flatMap(deviations)
  const material = devs.filter((d) => d.severity === 'material')
  const by = new Map<string, Deviation[]>()
  for (const d of material) by.set(d.projectId, [...(by.get(d.projectId) ?? []), d])
  const critical = [...by].map(([projectId, ds]) => ({ projectId, project: ds[0].project, material: ds.length, reasons: ds.map((d) => `${DOMAIN_FA[d.domain]}: ${d.metric} ${d.actual}`) })).sort((a, b) => b.material - a.material)
  const today = list[0]?.input.today ?? ''
  return {
    projects: list.length,
    withData: list.filter((f) => !!f.input.metrics).length,
    material: material.sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0)),
    critical,
    warnings: list.flatMap(earlyWarnings).filter((w) => w.severity === 'high'),
    decisions: list.flatMap((f) => f.input.decisions.filter((d) => d.status === 'pending' || d.status === 'in_review').map((d) => ({ projectId: f.id, project: f.name, title: d.title, dueBy: d.requiredBy, owner: d.owner, overdue: !!d.requiredBy && d.requiredBy.slice(0, 10) < today }))).sort((a, b) => Number(b.overdue) - Number(a.overdue)),
    patterns: compareProjects(list).patterns,
    lowConfidence: list.filter((f) => f.report.confidence === 'low').map((f) => f.name),
    asOf: list.map((f) => f.input.metrics?.asOf ?? null).filter((x): x is string => !!x).sort().pop() ?? null,
  }
}
