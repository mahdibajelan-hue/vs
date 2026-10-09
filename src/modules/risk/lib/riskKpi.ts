import type { RmControl, RmKri, RmKriEvent, RmRisk, RmRiskAction, RmRiskAssessment } from '../types'
import { analyzeActionEffects, summarizeEffects } from './riskEffect'
import { addDays, dayDiff, isActiveRisk, scoreAt, type RiskState } from './riskState'
import { todayIso } from './riskScore'

export interface KpiCtx {
  risks: RmRisk[]
  states: Map<string, RiskState>
  assessments: RmRiskAssessment[]
  actions: RmRiskAction[]
  controls: RmControl[]
  kris: RmKri[]
  kriEvents: RmKriEvent[]
  /** ids of active risks that have a similar risk in another project (computed by riskPortfolio.repeatedRiskIds); undefined = not computed */
  repeatedRiskIds?: Set<string>
  today?: string
}

export type KpiTone = 'ok' | 'warn' | 'bad' | 'na'
export interface KpiResult {
  id: string
  label: string
  value: number | null
  unit: '%' | '#' | 'روز' | 'امتیاز'
  good: 'low' | 'high'
  num: number | null
  den: number | null
  formula: string
  source: string
  note: string
  tone: KpiTone
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)

function tone(value: number | null, good: 'low' | 'high', warnAt: number, badAt: number): KpiTone {
  if (value === null) return 'na'
  if (good === 'low') return value >= badAt ? 'bad' : value >= warnAt ? 'warn' : 'ok'
  return value <= badAt ? 'bad' : value <= warnAt ? 'warn' : 'ok'
}

/** The 13 management KPIs with their formula, source and honest handling of «no data» (null → «—», never 0). */
export function computeKpis(ctx: KpiCtx): KpiResult[] {
  const today = ctx.today ?? todayIso()
  const active = ctx.risks.filter(isActiveRisk)
  const st = (r: RmRisk) => ctx.states.get(r.id)!
  const out: KpiResult[] = []
  const push = (k: Omit<KpiResult, 'value' | 'tone'> & { value: number | null; tone?: KpiTone }, t?: [number, number]) => out.push({ ...k, tone: k.tone ?? (t ? tone(k.value, k.good, t[0], t[1]) : 'na') })

  const crit = active.filter((r) => st(r).level === 'critical')
  push({ id: 'critical_count', label: 'ریسک‌های بحرانی فعال', value: crit.length, unit: '#', good: 'low', num: crit.length, den: active.length, formula: 'تعداد ریسک‌های فعال با امتیاز فعلی ≥ آستانهٔ بحرانی سیاست', source: 'rm_risks + آخرین ارزیابی', note: active.length ? `${pct(crit.length, active.length)}٪ از ${active.length} ریسک فعال` : 'ریسک فعالی نیست' }, [1, 4])
  const gaps = active.filter((r) => !st(r).hasOwner || !st(r).hasPlan)
  push({ id: 'no_owner_plan', label: 'فاقد مالک یا برنامهٔ پاسخ', value: gaps.length, unit: '#', good: 'low', num: gaps.length, den: active.length, formula: 'ریسک فعال بدون مالک، یا (زیاد/بحرانی) بدون اقدام کاهشی/پذیرش رسمی', source: 'rm_risks + rm_risk_actions', note: active.length ? `${pct(gaps.length, active.length)}٪` : '' }, [1, 3])
  const settledDue = ctx.actions.filter((a) => a.status === 'completed' && a.dueDate)
  const onTime = settledDue.filter((a) => (a.completedAt ?? a.updatedAt).slice(0, 10) <= a.dueDate!)
  push({ id: 'actions_on_time', label: 'اقدامات کاهشی تکمیل‌شده در موعد', value: pct(onTime.length, settledDue.length), unit: '%', good: 'high', num: onTime.length, den: settledDue.length, formula: 'تکمیل در/قبل از سررسید ÷ همهٔ اقدامات تکمیل‌شدهٔ دارای سررسید', source: 'rm_risk_actions.completed_at', note: settledDue.length ? '' : 'اقدام تکمیل‌شدهٔ دارای سررسید وجود ندارد' }, [80, 60])
  const onSched = active.filter((r) => !st(r).reviewOverdue)
  push({ id: 'reviews_on_schedule', label: 'ریسک‌های بازنگری‌شده طبق برنامه', value: pct(onSched.length, active.length), unit: '%', good: 'high', num: onSched.length, den: active.length, formula: 'ریسک فعال با موعد بازنگری نگذشته ÷ ریسک فعال (موعد از سیاست و سطح)', source: 'rm_risk_state.review_due', note: '' }, [85, 65])

  const d30 = addDays(today, -30)
  const cohort = ctx.risks.filter((r) => scoreAt(r, ctx.assessments, d30) && scoreAt(r, ctx.assessments, today))
  const now = cohort.map((r) => scoreAt(r, ctx.assessments, today)!.current)
  const then = cohort.map((r) => scoreAt(r, ctx.assessments, d30)!.current)
  const trend = cohort.length ? (mean(now)! - mean(then)!) : null
  push({ id: 'exposure_trend', label: 'روند سطح مواجهه (۳۰ روز)', value: round1(trend), unit: 'امتیاز', good: 'low', num: null, den: cohort.length, formula: 'تغییر میانگین امتیاز فعلی همان گروه ثابت از ریسک‌ها نسبت به ۳۰ روز پیش (منفی = بهبود)', source: 'rm_risk_assessments', note: cohort.length ? `گروه ثابت ${cohort.length} ریسک؛ میانگین فقط برای روند، نه رتبه‌بندی` : 'ریسکی با سابقهٔ ۳۰ روزه نیست' }, [0.1, 1])

  const reductions = active.filter((r) => st(r).assessmentCount > 0 && st(r).inherent > 0).map((r) => ((st(r).inherent - st(r).residual) / st(r).inherent) * 100)
  push({ id: 'residual_reduction', label: 'کاهش ریسک باقیمانده نسبت به ذاتی (میانه)', value: round1(median(reductions)), unit: '%', good: 'high', num: null, den: reductions.length, formula: 'میانهٔ (ذاتی − باقیمانده) ÷ ذاتی برای ریسک‌های ارزیابی‌شده؛ میانه برای جلوگیری از جمع‌زدن امتیازهای ترتیبی', source: 'rm_risks.initial_* و ارزیابی‌ها', note: reductions.length ? `بر پایهٔ ${reductions.length} ریسک ارزیابی‌شده` : 'ارزیابی ثبت نشده' }, [30, 10])

  const ctlAssessed = ctx.controls.filter((c) => c.status !== 'inactive' && c.effectiveness !== 'not_tested')
  const ctlOk = ctlAssessed.filter((c) => c.effectiveness === 'effective')
  const ctlAll = ctx.controls.filter((c) => c.status !== 'inactive')
  push({ id: 'controls_effective', label: 'کنترل‌های ارزیابی‌شده و مؤثر', value: pct(ctlOk.length, ctlAssessed.length), unit: '%', good: 'high', num: ctlOk.length, den: ctlAssessed.length, formula: 'کنترل مؤثر ÷ کنترل‌های آزمون‌شده', source: 'rm_controls.effectiveness', note: ctlAll.length ? `${ctlAll.length - ctlAssessed.length} کنترل هنوز آزمون نشده` : 'کنترلی ثبت نشده' }, [75, 50])

  const kriBad = ctx.kris.filter((k) => k.active && (k.state === 'warn' || k.state === 'critical'))
  const since = addDays(today, -30)
  const crossings = ctx.kriEvents.filter((e) => (e.toState === 'warn' || e.toState === 'critical') && e.at.slice(0, 10) >= since).length
  push({ id: 'kri_breaches', label: 'KRIهای عبورکرده از آستانه', value: kriBad.length, unit: '#', good: 'low', num: kriBad.length, den: ctx.kris.filter((k) => k.active).length, formula: 'شاخص فعال در وضعیت هشدار یا بحرانی', source: 'rm_kris.state', note: `${crossings} عبور از آستانه در ۳۰ روز اخیر` }, [1, 3])

  const settled = ctx.actions.filter((a) => a.status === 'completed' || a.status === 'cancelled')
  const days = settled.map((a) => dayDiff(a.createdAt.slice(0, 10), (a.completedAt ?? a.updatedAt).slice(0, 10)))
  push({ id: 'avg_settle_days', label: 'میانگین زمان تعیین تکلیف اقدام', value: round1(mean(days)), unit: 'روز', good: 'low', num: null, den: settled.length, formula: 'میانگین فاصلهٔ ایجاد تا تکمیل/لغو اقدام', source: 'rm_risk_actions', note: settled.length ? '' : 'اقدام تعیین‌تکلیف‌شده‌ای نیست' }, [30, 60])

  const threats = ctx.risks.filter((r) => r.riskType === 'threat')
  const realized = threats.filter((r) => r.status === 'realized' || !!r.realizedAt)
  push({ id: 'realization_rate', label: 'نرخ تحقق و تبدیل به مسئله', value: pct(realized.length, threats.length), unit: '%', good: 'low', num: realized.length, den: threats.length, formula: 'تهدیدهای تحقق‌یافته ÷ همهٔ تهدیدهای ثبت‌شده', source: 'rm_risks.status = realized', note: '' }, [5, 15])

  if (ctx.repeatedRiskIds) {
    const rep = active.filter((r) => ctx.repeatedRiskIds!.has(r.id))
    push({ id: 'repeat_rate', label: 'تکرار ریسک‌های مشابه در پروژه‌ها', value: pct(rep.length, active.length), unit: '%', good: 'low', num: rep.length, den: active.length, formula: 'ریسک فعال با مشابه در پروژهٔ دیگر ÷ ریسک فعال (شباهت متنی؛ تأیید با انسان)', source: 'شباهت عنوان/علت/رویداد', note: '' }, [20, 40])
  } else push({ id: 'repeat_rate', label: 'تکرار ریسک‌های مشابه در پروژه‌ها', value: null, unit: '%', good: 'low', num: null, den: null, formula: 'نیازمند داده‌های چند پروژه (نمای پورتفولیو)', source: 'شباهت متنی', note: 'با انتخاب «همهٔ پروژه‌ها» محاسبه می‌شود' })

  const outTol = active.filter((r) => st(r).outsideTolerance)
  push({ id: 'outside_tolerance', label: 'ریسک‌های خارج از آستانهٔ تحمل', value: pct(outTol.length, active.length), unit: '%', good: 'low', num: outTol.length, den: active.length, formula: 'ریسک فعال با امتیاز باقیمانده بالاتر از «تحمل» ÷ ریسک فعال', source: 'rm_policy.tolerance_max', note: `${outTol.length} ریسک` }, [15, 35])

  const effects = ctx.risks.flatMap((r) => analyzeActionEffects(r, ctx.assessments, ctx.actions, today))
  const sum = summarizeEffects(effects)
  push({ id: 'response_effectiveness', label: 'اثربخشی برنامه‌های پاسخ (تأییدشده)', value: sum.effectivenessPct, unit: '%', good: 'high', num: sum.effective + sum.partial, den: sum.verified, formula: '(مؤثر + نیمی از «اثر نسبی») ÷ اقدامات با نتیجهٔ تأییدشده', source: 'rm_risk_actions.effect_status', note: sum.completed ? `${sum.verified} از ${sum.completed} اقدام تکمیل‌شده راستی‌آزمایی شده؛ ${sum.noReduction} بدون کاهش امتیاز` : 'اقدام تکمیل‌شده‌ای نیست' }, [70, 40])
  return out
}

// ---------------------------------------------------------------- fair comparison between projects (size and lifecycle aware)
export type SizeBand = 'small' | 'medium' | 'large'
export const SIZE_BAND_LABEL_FA: Record<SizeBand, string> = { small: 'کوچک (< ۱۰ ریسک فعال)', medium: 'متوسط (۱۰ تا ۴۰)', large: 'بزرگ (> ۴۰)' }

export interface ProjectCompare {
  projectId: string
  active: number
  sizeBand: SizeBand
  phase: string
  group: string
  confidence: 'low' | 'ok'
  criticalShare: number | null
  outsideToleranceShare: number | null
  overdueReviewShare: number | null
  noPlanShare: number | null
  medianReduction: number | null
  actionsOnTime: number | null
  levelMix: { low: number; medium: number; high: number; critical: number }
}

/** Only RATES and shares are compared, and only inside the same size band and lifecycle phase — raw counts of different projects are never ranked. */
export function compareProjects(ctx: KpiCtx, projectIds: string[]): ProjectCompare[] {
  return projectIds.map((projectId) => {
    const rs = ctx.risks.filter((r) => r.projectId === projectId)
    const act = rs.filter(isActiveRisk)
    const st = (r: RmRisk) => ctx.states.get(r.id)!
    const phases = new Map<string, number>()
    for (const r of act) phases.set(r.projectPhase ?? 'unspecified', (phases.get(r.projectPhase ?? 'unspecified') ?? 0) + 1)
    const phase = [...phases.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unspecified'
    const sizeBand: SizeBand = act.length < 10 ? 'small' : act.length <= 40 ? 'medium' : 'large'
    const mix = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const r of act) mix[st(r).level]++
    const red = act.filter((r) => st(r).assessmentCount > 0 && st(r).inherent > 0).map((r) => ((st(r).inherent - st(r).residual) / st(r).inherent) * 100)
    const done = ctx.actions.filter((a) => rs.some((r) => r.id === a.riskId) && a.status === 'completed' && a.dueDate)
    return {
      projectId, active: act.length, sizeBand, phase, group: `${sizeBand}|${phase}`, confidence: act.length >= 8 ? 'ok' : 'low',
      criticalShare: pct(mix.critical, act.length), outsideToleranceShare: pct(act.filter((r) => st(r).outsideTolerance).length, act.length),
      overdueReviewShare: pct(act.filter((r) => st(r).reviewOverdue).length, act.length), noPlanShare: pct(act.filter((r) => !st(r).hasPlan || !st(r).hasOwner).length, act.length),
      medianReduction: round1(median(red)), actionsOnTime: pct(done.filter((a) => (a.completedAt ?? a.updatedAt).slice(0, 10) <= a.dueDate!).length, done.length), levelMix: mix,
    }
  })
}

/** Group a metric (e.g. response effectiveness) by owner / project / category … */
export function effectivenessBy(ctx: KpiCtx, keyOf: (r: RmRisk) => string): { key: string; completed: number; verified: number; effectivenessPct: number | null }[] {
  const by = new Map<string, ReturnType<typeof analyzeActionEffects>>()
  for (const r of ctx.risks) {
    const e = analyzeActionEffects(r, ctx.assessments, ctx.actions, ctx.today)
    by.set(keyOf(r), [...(by.get(keyOf(r)) ?? []), ...e])
  }
  return [...by.entries()].map(([key, e]) => { const s = summarizeEffects(e); return { key, completed: s.completed, verified: s.verified, effectivenessPct: s.effectivenessPct } }).filter((x) => x.completed > 0).sort((a, b) => (b.effectivenessPct ?? -1) - (a.effectivenessPct ?? -1))
}
