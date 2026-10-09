import type { RmCategoryDef, RmRisk, RmRiskAction } from '../types'
import { RM_CATEGORY_LABEL_FA } from '../types'
import { analyzeActionEffects } from './riskEffect'
import { jaccard, riskText, tokenize } from './riskPortfolio'
import { isActiveRisk, type RiskState } from './riskState'
import { RISK_LEVEL_LABEL_FA } from './riskScore'
import type { RmRiskAssessment } from '../types'

/**
 * Local, explainable assistant used when no AI provider is configured (and as a safety layer around provider output).
 * Every result carries its reasons and a confidence; nothing here changes data — a person accepts or rejects proposals.
 */

const CAT_KEYWORDS: Record<string, string[]> = {
  engineering: ['نقشه', 'طراحی', 'مهندسی', 'محاسبات', 'مغایرت', 'مشخصات فنی', 'دیتاشیت'],
  procurement: ['خرید', 'تأمین', 'تامین', 'کالا', 'تجهیز', 'لوله', 'شیرآلات', 'حمل', 'تحویل', 'سفارش', 'گمرک', 'واردات'],
  contractor: ['پیمانکار', 'کارگاه', 'قرارداد', 'صورت وضعیت', 'ادعا', 'تضمین'],
  schedule: ['برنامه زمان‌بندی', 'زمان‌بندی', 'تاخیر', 'تأخیر', 'مسیر بحرانی', 'پیشرفت'],
  cost: ['بودجه', 'هزینه', 'نقدینگی', 'مالی', 'نرخ ارز', 'تورم'],
  land: ['زمین', 'حریم', 'تملک', 'معارض', 'مالک', 'تصرف', 'ماده ۹', 'ماده 9', 'آزادسازی'],
  permits: ['مجوز', 'پروانه', 'استعلام', 'شهرداری', 'منابع طبیعی', 'آب منطقه', 'هماهنگی بین‌دستگاهی'],
  construction: ['جوش', 'جوشکاری', 'پوشش', 'نصب', 'خوابانیدن', 'حفاری', 'خاک‌برداری', 'اجرا'],
  quality: ['کیفیت', 'عدم انطباق', 'بازرسی', 'آزمون', 'تست', 'نقص', 'هیدرواستاتیک'],
  hse: ['ایمنی', 'حادثه', 'نشتی', 'نشت', 'آتش', 'سقوط', 'بهداشت', 'محیط زیست', 'آلودگی'],
  logistics: ['لجستیک', 'حمل‌ونقل', 'ترابری', 'انبار', 'جاده'],
  hr: ['نیروی انسانی', 'ظرفیت', 'کمبود نیرو', 'تخصص', 'استعفا'],
  stakeholders: ['ذی‌نفع', 'تصمیم', 'تأیید', 'تایید', 'کارفرما', 'مدیریت'],
  commissioning: ['راه‌اندازی', 'پیش‌راه‌اندازی', 'تحویل موقت', 'تست نهایی'],
  legal: ['حقوقی', 'قانونی', 'دعوا', 'داوری', 'ابلاغیه', 'تحریم'],
}
const THREAT_CUES = ['ممکن است', 'احتمال', 'خطر', 'ریسک', 'تهدید', 'نگرانی', 'مانع', 'عدم', 'کمبود', 'تأخیر', 'تاخیر', 'توقف', 'نشت', 'معارض', 'مشکل', 'تحریم', 'افزایش قیمت', 'عقب', 'بدون', 'ناکافی', 'محدودیت']
const PROB_CUES: [number, string[]][] = [[5, ['حتماً', 'قطعاً', 'قطعا', 'رخ داده', 'اتفاق افتاده']], [4, ['به‌احتمال زیاد', 'احتمال زیاد', 'به احتمال زیاد', 'معمولاً', 'تکرار']], [2, ['ممکن است', 'شاید', 'احتمال کم']]]
const IMPACT_CUES: [number, string[]][] = [[5, ['فوت', 'حادثه مرگ', 'توقف پروژه', 'انفجار', 'آتش‌سوزی', 'آلودگی گسترده']], [4, ['توقف', 'نشت', 'ازکارافتادگی', 'جریمه سنگین', 'عدم تحویل']], [3, ['تأخیر', 'تاخیر', 'افزایش هزینه', 'کار مجدد']], [2, ['جزئی', 'اصلاح']]]

export interface RiskCandidate { title: string; riskEvent: string; cause: string; consequence: string; category: string; probability: number; impact: number; confidence: number; reasons: string[]; source: 'rules' | 'ai' }

const norm = (s: string) => s.replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/\s+/g, ' ').trim()

export function guessCategory(text: string, valid: string[] = Object.keys(RM_CATEGORY_LABEL_FA)): { category: string; matched: string[] } {
  const t = norm(text)
  let best = { category: 'other', matched: [] as string[] }
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    if (!valid.includes(cat)) continue
    const matched = kws.filter((k) => t.includes(norm(k)))
    if (matched.length > best.matched.length) best = { category: cat, matched }
  }
  return best
}

/** Splits free text (minutes, visit notes) into sentences and keeps those that describe a threat; probability/impact come from wording cues. */
export function extractRiskCandidates(text: string, valid: string[] = Object.keys(RM_CATEGORY_LABEL_FA)): RiskCandidate[] {
  const parts = text.split(/[\n.؟!؛]+/).map(norm).filter((s) => s.length >= 12)
  const out: RiskCandidate[] = []
  const seen = new Set<string>()
  for (const s of parts) {
    const cues = THREAT_CUES.filter((c) => s.includes(c))
    if (cues.length === 0) continue
    const key = [...tokenize(s)].sort().join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    const p = PROB_CUES.find(([, ws]) => ws.some((w) => s.includes(w)))?.[0] ?? 3
    const i = IMPACT_CUES.find(([, ws]) => ws.some((w) => s.includes(w)))?.[0] ?? 3
    const cat = guessCategory(s, valid)
    const because = s.match(/(?:به‌دلیل|به دلیل|بخاطر|به خاطر|چون)\s+(.{6,80})/)?.[1] ?? ''
    out.push({
      title: s.length > 90 ? s.slice(0, 87) + '…' : s, riskEvent: s, cause: because, consequence: '', category: cat.category, probability: p, impact: i,
      confidence: Math.min(0.85, 0.3 + cues.length * 0.15 + (cat.matched.length ? 0.1 : 0)),
      reasons: [`عبارت‌های هشدار: ${cues.slice(0, 4).join('، ')}`, cat.matched.length ? `دسته از واژه‌ها: ${cat.matched.slice(0, 3).join('، ')}` : 'دسته مشخص نشد', 'احتمال و اثر حدسی از لحن متن است؛ باید با ارزیابی واقعی جایگزین شود'], source: 'rules',
    })
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 25)
}

export interface QueryCtx { risks: RmRisk[]; states: Map<string, RiskState>; categories: Pick<RmCategoryDef, 'key' | 'labelFa'>[]; projects: { id: string; name: string }[]; userIdByName: (name: string) => string | null }
export interface QueryAnswer { ids: string[]; explanation: string[]; understood: boolean }

/** Natural-language question about the risks the user can see → a filtered list with the reading of the question shown. */
export function answerRiskQuestion(question: string, ctx: QueryCtx): QueryAnswer {
  const q = norm(question)
  const exp: string[] = []
  let list = ctx.risks.filter(isActiveRisk)
  const st = (r: RmRisk) => ctx.states.get(r.id)!
  const apply = (label: string, fn: (r: RmRisk) => boolean) => { list = list.filter(fn); exp.push(label) }
  if (/بحرانی/.test(q)) apply('سطح بحرانی', (r) => st(r).level === 'critical')
  else if (/(سطح )?زیاد|بالا/.test(q) && /سطح|ریسک/.test(q)) apply('سطح زیاد یا بحرانی', (r) => st(r).level === 'high' || st(r).level === 'critical')
  if (/بدون مالک/.test(q)) apply('بدون مالک', (r) => !r.ownerId)
  if (/بدون برنامه|برنامهٔ پاسخ ندار|بدون اقدام/.test(q)) apply('بدون برنامهٔ پاسخ', (r) => !st(r).hasPlan)
  if (/خارج از تحمل|فراتر از تحمل/.test(q)) apply('باقیمانده خارج از تحمل', (r) => st(r).outsideTolerance)
  if (/بازنگری/.test(q) && /(معوق|عقب|گذشته)/.test(q)) apply('بازنگری عقب‌افتاده', (r) => st(r).reviewOverdue)
  else if (/(معوق|عقب‌افتاده|تأخیر|تاخیر)/.test(q) && /اقدام/.test(q)) apply('دارای اقدام معوق', (r) => st(r).overdueActions > 0)
  if (/(وخامت|بدتر|افزایش)/.test(q) && /روند|ریسک/.test(q)) apply('روند رو به وخامت', (r) => st(r).trend === 'worsening')
  if (/kri|شاخص هشدار|شاخص‌های هشدار/i.test(q)) apply('شاخص هشدار در هشدار/بحرانی', (r) => st(r).kriWorst === 'warn' || st(r).kriWorst === 'critical')
  if (/مسدود/.test(q)) apply('اقدام مسدود', (r) => st(r).blockedActions > 0)
  if (/ارزیابی قدیمی|بدون ارزیابی/.test(q)) apply('ارزیابی قدیمی یا ندارد', (r) => st(r).stale || st(r).assessmentCount === 0)
  for (const c of ctx.categories) if (q.includes(norm(c.labelFa)) || q.includes(norm(c.labelFa.split(/\s|،| و /)[0] ?? '###'))) { if (c.labelFa.length >= 3) { apply(`دستهٔ «${c.labelFa}»`, (r) => r.category === c.key || r.subcategory === c.key); break } }
  for (const p of ctx.projects) if (q.includes(norm(p.name).slice(0, 14)) && norm(p.name).length >= 6) { apply(`پروژهٔ «${p.name}»`, (r) => r.projectId === p.id); break }
  const mine = /(من|خودم)/.test(q) && /(مالک|ریسک‌های من)/.test(q)
  if (mine) exp.push('ریسک‌های من (در این نسخه با فیلتر مالک در ثبت‌نامه انجام می‌شود)')
  const understood = exp.length > 0
  if (!understood) { const toks = [...tokenize(q)]; if (toks.length) { list = list.filter((r) => toks.some((t) => riskText(r).includes(t))); exp.push(`جستجوی متنی: ${toks.slice(0, 4).join('، ')}`) } }
  return { ids: list.map((r) => r.id), explanation: exp, understood }
}

export interface ProjectSummary { lines: string[]; limitations: string[]; confidence: 'low' | 'medium' | 'high' }
/** Factual status summary generated from the data (no invented content); lists what the data cannot tell. */
export function summarizeStatus(risks: RmRisk[], states: Map<string, RiskState>, actions: RmRiskAction[], title: string): ProjectSummary {
  const act = risks.filter(isActiveRisk)
  const st = (r: RmRisk) => states.get(r.id)!
  const lv = (l: string) => act.filter((r) => st(r).level === l).length
  const top = [...act].sort((a, b) => st(b).current - st(a).current).slice(0, 3)
  const lines = [`${title}: ${act.length} ریسک فعال — ${lv('critical')} بحرانی، ${lv('high')} زیاد، ${lv('medium')} متوسط، ${lv('low')} کم.`]
  if (top.length) lines.push(`بالاترین امتیازها: ${top.map((r) => `${r.code} (${st(r).current})`).join('، ')}.`)
  const out = act.filter((r) => st(r).outsideTolerance).length
  if (out) lines.push(`${out} ریسک باقیمانده‌شان خارج از آستانهٔ تحمل است.`)
  const noGap = act.filter((r) => !st(r).hasOwner || !st(r).hasPlan).length
  if (noGap) lines.push(`${noGap} ریسک مالک یا برنامهٔ پاسخ کافی ندارد.`)
  const od = actions.filter((a) => a.status !== 'completed' && a.status !== 'cancelled' && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10)).length
  if (od) lines.push(`${od} اقدام کاهشی از سررسید گذشته است.`)
  const worse = act.filter((r) => st(r).trend === 'worsening').length
  if (worse) lines.push(`روند ${worse} ریسک رو به وخامت است.`)
  const stale = act.filter((r) => st(r).stale || st(r).assessmentCount === 0)
  const limitations: string[] = []
  if (stale.length) limitations.push(`${stale.length} ریسک ارزیابی ندارد یا ارزیابی‌اش قدیمی است؛ نتیجه برای آن‌ها قابل‌اتکا نیست.`)
  if (act.length < 8) limitations.push('تعداد ریسک‌های فعال کم است؛ نسبت‌ها ناپایدارند.')
  const assessed = act.filter((r) => st(r).assessmentCount > 0).length
  return { lines, limitations, confidence: act.length >= 8 && assessed / Math.max(1, act.length) >= 0.7 ? 'high' : assessed / Math.max(1, act.length) >= 0.4 ? 'medium' : 'low' }
}

export interface MitigationProposal { description: string; fromRisk: string; fromRiskCode: string; evidence: string; support: number }
/** Proposes actions from VERIFIED-effective actions of similar risks (same text neighbourhood). Basis and strength are shown; a person decides. */
export function proposeMitigations(target: RmRisk, risks: RmRisk[], assessments: RmRiskAssessment[], actions: RmRiskAction[], limit = 6): { items: MitigationProposal[]; basis: string } {
  const tk = tokenize(riskText(target))
  const similar = risks.filter((r) => r.id !== target.id).map((r) => ({ r, s: jaccard(tk, tokenize(riskText(r))) })).filter((x) => x.s >= 0.25).sort((a, b) => b.s - a.s).slice(0, 12)
  const items: MitigationProposal[] = []
  for (const { r } of similar) {
    for (const e of analyzeActionEffects(r, assessments, actions)) {
      if (e.verdict === 'effective' || e.verdict === 'partial' || e.verdict === 'score_reduced') {
        items.push({ description: e.action.description, fromRisk: r.title, fromRiskCode: r.code, evidence: e.verified ? `اثر تأییدشده: ${e.verdict === 'effective' ? 'مؤثر' : 'نسبی'}` : `امتیاز ${e.before} ← ${e.after} پس از اقدام (تأییدنشده)`, support: e.verified ? 2 : 1 })
      }
    }
  }
  const byText = new Map<string, MitigationProposal>()
  for (const it of items) { const k = [...tokenize(it.description)].sort().join(' '); const ex = byText.get(k); if (!ex || it.support > ex.support) byText.set(k, it) }
  const out = [...byText.values()].sort((a, b) => b.support - a.support).slice(0, limit)
  return { items: out, basis: similar.length ? `${similar.length} ریسک مشابه در دادههای سازمان بررسی شد؛ فقط اقدام‌هایی که پس از اجرا امتیاز را کم کرده‌اند یا اثرشان تأیید شده پیشنهاد می‌شوند.` : 'ریسک مشابهی با سابقهٔ اقدام در داده‌ها نبود؛ پیشنهادی ارائه نمی‌شود.' }
}

export interface RealizationSignal { level: 'low' | 'moderate' | 'elevated' | 'high'; points: number; factors: string[]; confidence: 'low' | 'medium'; note: string }
/** Transparent early-warning signal (NOT a probability): adds points for observable precursors. Low confidence when history is thin. */
export function realizationSignal(risk: RmRisk, s: RiskState, krisCritical: number, krisWarn: number): RealizationSignal {
  const f: string[] = []
  let p = 0
  if (s.level === 'critical') { p += 3; f.push('امتیاز فعلی بحرانی است') } else if (s.level === 'high') { p += 2; f.push('امتیاز فعلی زیاد است') }
  if (s.trend === 'worsening') { p += 2; f.push('روند ارزیابی‌ها رو به وخامت است') }
  if (krisCritical) { p += 3; f.push(`${krisCritical} شاخص هشدار در وضعیت بحرانی`) } else if (krisWarn) { p += 1; f.push(`${krisWarn} شاخص هشدار در وضعیت هشدار`) }
  if (risk.timeToImpactDays !== null && risk.timeToImpactDays <= 14) { p += 2; f.push(`زمان تا وقوع احتمالی ${risk.timeToImpactDays} روز`) }
  if (s.overdueActions) { p += 1; f.push('اقدام کاهشی معوق دارد') }
  if (s.criticalControlProblems) { p += 2; f.push('کنترل حیاتی منقضی/آزمون‌نشده') }
  if (s.completedIneffective) { p += 1; f.push('اقدام تکمیل‌شدهٔ بی‌اثر') }
  const level = p >= 7 ? 'high' : p >= 4 ? 'elevated' : p >= 2 ? 'moderate' : 'low'
  const confidence = s.assessmentCount >= 3 ? 'medium' : 'low'
  return { level, points: p, factors: f, confidence, note: confidence === 'low' ? 'سابقهٔ ارزیابی کم است؛ این فقط نشانهٔ هشدار است، نه پیش‌بینی آماری.' : 'بر پایهٔ نشانه‌های قابل‌مشاهده؛ پیش‌بینی آماری نیست.' }
}
export const SIGNAL_LABEL_FA = { low: 'پایین', moderate: 'متوسط', elevated: 'بالا', high: 'بسیار بالا' } as const
export const levelFa = (l: keyof typeof RISK_LEVEL_LABEL_FA) => RISK_LEVEL_LABEL_FA[l]
