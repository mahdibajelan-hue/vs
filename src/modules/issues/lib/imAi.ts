import { IM_PRIORITY_LABEL_FA, type ImIssue, type ImIssuePriority } from '../types'
import { IM_CATEGORY_FA, IM_STAGE_LABEL_FA } from './imModel'
import { EMPTY_FILTER, type IssueFilter } from './imRegister'
import { normalizeFa } from './imText'

/**
 * Local, explainable «assistant» used when no AI provider is configured (and as a sanity layer around provider answers).
 * Every output carries its reasons so a human can accept or reject it — nothing here changes data by itself.
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  engineering: ['نقشه', 'طراحی', 'مهندسی', 'محاسبات', 'مغایرت', 'ریوژن', 'بازنگری', 'مشخصات فنی', 'دیتاشیت'],
  document_approval: ['تایید مدرک', 'تأیید مدرک', 'مدارک', 'مکاتبه', 'نامه', 'تایید نقشه', 'ارسال مدرک', 'ایرادات مدرک'],
  procurement: ['خرید', 'تامین', 'تأمین', 'کالا', 'تجهیز', 'پمپ', 'شیرآلات', 'حمل', 'تحویل', 'سفارش', 'ال سی', 'گمرک'],
  contractor: ['پیمانکار', 'کارگاه', 'نیروی انسانی', 'ماشین‌آلات', 'ماشین آلات', 'عملکرد', 'مدیریت اجرا'],
  contract_commercial: ['قرارداد', 'صورت وضعیت', 'پرداخت', 'ادعا', 'ابلاغیه', 'الحاقیه', 'تغییر دستور', 'تضمین'],
  land_right_of_way: ['زمین', 'حریم', 'تملک', 'معارض', 'مالک', 'تصرف', 'ماده ۹', 'ماده 9', 'راه دسترسی'],
  permits: ['مجوز', 'پروانه', 'استعلام', 'شهرداری', 'محیط زیست', 'منابع طبیعی', 'آب منطقه'],
  hse: ['ایمنی', 'حادثه', 'ایمن', 'محیط‌زیست', 'نشتی', 'آتش', 'سقوط', 'بهداشت', 'تجهیزات حفاظتی'],
  quality: ['کیفیت', 'عدم انطباق', 'بازرسی', 'آزمون', 'تست', 'جوش', 'ncr', 'نقص'],
  finance: ['بودجه', 'نقدینگی', 'مالی', 'هزینه', 'اعتبار', 'تامین مالی', 'تأمین مالی', 'نرخ ارز'],
  interface: ['تداخل', 'هماهنگی', 'رابط', 'اینترفیس', 'بین پیمانکاران', 'ذی‌نفعان'],
}

export interface CategoryGuess { category: string; score: number; matched: string[] }

export function guessCategory(text: string): CategoryGuess | null {
  const t = normalizeFa(text)
  let best: CategoryGuess | null = null
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = kws.filter((k) => t.includes(normalizeFa(k)))
    if (matched.length && (!best || matched.length > best.matched.length)) best = { category: cat, score: matched.length, matched }
  }
  return best
}

const SEVERITY_CUES: [ImIssuePriority, string[]][] = [
  ['critical', ['توقف کامل', 'خطر جانی', 'حادثه', 'فوری', 'بحرانی', 'مسیر بحرانی', 'توقف پروژه', 'تعطیلی']],
  ['high', ['تاخیر جدی', 'تأخیر جدی', 'تاخیر', 'تأخیر', 'مانع', 'عدم تایید', 'توقف', 'ریسک بالا', 'ضرر']],
  ['low', ['جزئی', 'پیشنهاد', 'بهبود', 'کم‌اهمیت', 'ملاحظه']],
]
export function guessSeverity(text: string): { severity: ImIssuePriority; reasons: string[] } {
  const t = normalizeFa(text)
  for (const [lvl, cues] of SEVERITY_CUES) {
    const hit = cues.filter((c) => t.includes(normalizeFa(c)))
    if (hit.length) return { severity: lvl, reasons: [`عبارت‌های نشانگر: ${hit.slice(0, 3).join('، ')}`] }
  }
  return { severity: 'medium', reasons: ['نشانهٔ مشخصی یافت نشد؛ مقدار پیش‌فرض'] }
}

export interface AiSuggestion { category: string | null; categoryLabel: string | null; severity: ImIssuePriority; reasons: string[]; source: 'rules' | 'ai' }
export function suggestFromText(title: string, description = ''): AiSuggestion {
  const text = title + ' ' + description
  const c = guessCategory(text)
  const s = guessSeverity(text)
  return {
    category: c?.category ?? null, categoryLabel: c ? IM_CATEGORY_FA[c.category] : null, severity: s.severity,
    reasons: [...(c ? [`دسته «${IM_CATEGORY_FA[c.category]}» به‌دلیل: ${c.matched.slice(0, 4).join('، ')}`] : ['دسته تشخیص داده نشد']), ...s.reasons], source: 'rules',
  }
}

// ── natural-language query → structured filter (never SQL; the result is an ordinary IssueFilter the user can see and edit)
const STAGE_WORDS: [IssueFilter['stage'], string[]][] = [['closed', ['بسته', 'بسته‌شده', 'بسته شده']], ['in_progress', ['در حال اجرا', 'در حال رفع']], ['resolution_review', ['منتظر تایید', 'منتظر تأیید']], ['all', ['همه', 'تمام']]]
const SEV_WORDS: [ImIssuePriority, string[]][] = [['critical', ['بحرانی']], ['high', ['بالا', 'مهم']], ['low', ['کم']]]

export function parseNlQuery(q: string, ctx: { projects: { id: string; name: string }[]; users: { userId: string; name: string }[]; meId?: string }): { filter: Partial<IssueFilter>; explanation: string[] } {
  const t = normalizeFa(q)
  const f: Partial<IssueFilter> = {}
  const why: string[] = []
  for (const [st, ws] of STAGE_WORDS) if (ws.some((w) => t.includes(normalizeFa(w)))) { f.stage = st; why.push(`مرحله: ${st === 'all' ? 'همه' : IM_STAGE_LABEL_FA[st as keyof typeof IM_STAGE_LABEL_FA] ?? st}`); break }
  for (const [lv, ws] of SEV_WORDS) if (ws.some((w) => t.split(' ').includes(normalizeFa(w)))) { f.severity = lv; why.push(`شدت: ${IM_PRIORITY_LABEL_FA[lv]}`); break }
  if (/(تاخیر|تأخیر|عقب|دیرکرد|معوق|گذشته از)/.test(q) || t.includes('تاخیر')) { f.overdueOnly = true; why.push('فقط تأخیردار') }
  if (/(مسدود|متوقف|منتظر تصمیم)/.test(q)) { f.blockedOnly = true; why.push('فقط مسدود') }
  if (ctx.meId && t.split(' ').some((w) => w === 'من' || w === 'خودم')) { f.userId = ctx.meId; why.push('مسائل من') }
  const proj = ctx.projects.find((p) => normalizeFa(p.name).length > 2 && t.includes(normalizeFa(p.name)))
  if (proj) { f.projectId = proj.id; why.push(`پروژه: ${proj.name}`) }
  for (const u of ctx.users) { const n = normalizeFa(u.name); if (n.length > 3 && t.includes(n)) { f.userId = u.userId; why.push(`فرد: ${u.name}`); break } }
  const cat = guessCategory(q)
  if (cat) { f.category = cat.category; why.push(`دسته: ${IM_CATEGORY_FA[cat.category]}`) }
  if (!Object.keys(f).length) { f.q = q; why.push('جستجوی متنی') }
  return { filter: { ...EMPTY_FILTER, stage: 'active', ...f }, explanation: why }
}

// ── extraction of candidate issues from free text (meeting minutes, visit notes)
const CUES = ['مشکل', 'مانع', 'تاخیر', 'تأخیر', 'عدم', 'نقص', 'مغایرت', 'خطر', 'ایراد', 'نیاز به', 'باید', 'پیگیری', 'اقدام']
export interface Candidate { title: string; description: string; category: string | null; severity: ImIssuePriority; cues: string[] }

export function extractCandidates(text: string, maxItems = 20): Candidate[] {
  const lines = text.split(/\r?\n|[.؛!؟?]\s+/).map((l) => l.replace(/^[\s\-–•*\d.)(]+/, '').trim()).filter((l) => l.length >= 12)
  const out: Candidate[] = []
  for (const l of lines) {
    const t = normalizeFa(l)
    const cues = CUES.filter((c) => t.includes(normalizeFa(c)))
    if (!cues.length) continue
    const sug = suggestFromText(l)
    out.push({ title: l.length > 90 ? l.slice(0, 87) + '…' : l, description: l, category: sug.category, severity: sug.severity, cues })
    if (out.length >= maxItems) break
  }
  return out
}

// ── summary of one issue without a model: deterministic and factual
export function summarizeIssue(i: ImIssue, ctx: { openTasks: number; blockedTasks: number; pendingExt: number; today: string; daysOverdue: number; stageLabel: string }): string {
  const parts = [`«${i.title}» — مرحلهٔ ${ctx.stageLabel}.`]
  parts.push(ctx.daysOverdue > 0 ? `${ctx.daysOverdue} روز از سررسید گذشته است.` : 'در مهلت است.')
  if ((i.extensionCount ?? 0) > 0) parts.push(`${i.extensionCount} بار تمدید شده است.`)
  if (ctx.openTasks) parts.push(`${ctx.openTasks} اقدام باز دارد${ctx.blockedTasks ? ` که ${ctx.blockedTasks} مورد مسدود است` : ''}.`)
  if (ctx.pendingExt) parts.push(`${ctx.pendingExt} درخواست تمدید منتظر تصمیم است.`)
  if (i.rootCauseSummary) parts.push(`علت ریشه‌ای: ${i.rootCauseSummary}${i.rootCauseConfirmed ? ' (تأییدشده)' : ' (تأییدنشده)'}.`)
  return parts.join(' ')
}
