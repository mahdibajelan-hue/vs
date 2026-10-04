import type { ObjectiveDraft } from '../repo/types'
import { normalizeFa, wordCount } from './fa'

const VERBS = ['دریافت', 'بررسی', 'تایید', 'بازدید', 'پیگیری', 'تعیین', 'ارزیابی', 'مشاهده', 'هماهنگی', 'رفع', 'اخذ', 'امضا', 'تحویل', 'ثبت', 'مذاکره', 'بازرسی', 'کنترل', 'مستندسازی', 'تهیه', 'نهایی', 'راستی', 'احراز', 'اطمینان', 'تسریع', 'شناسایی', 'برگزاری']

export interface ObjectiveCheck {
  /** 0-100 */
  score: number
  specific: boolean
  measurable: boolean
  trackable: boolean
  tips: string[]
}

/** Gentle SMART lint for an objective: specific action, measurable criterion, mapped to a topic. */
export function checkObjective(o: Pick<ObjectiveDraft, 'title' | 'measure' | 'topicKey'>): ObjectiveCheck {
  const title = normalizeFa(o.title)
  const measure = normalizeFa(o.measure)
  const hasVerb = VERBS.some((v) => title.startsWith(v) || title.includes(` ${v}`))
  const specific = wordCount(title) >= 4 && hasVerb
  const measurable = measure.length >= 6 && (/\d/.test(measure) || /(مکتوب|صورتجلسه|نامه|امضا|گزارش|تایید|تحویل|برنامه|مدرک|عکس|فهرست|تاریخ)/.test(measure))
  const trackable = !!o.topicKey
  const tips: string[] = []
  if (!hasVerb) tips.push('با یک فعل عملیاتی شروع کنید (مثلاً «دریافت…»، «بررسی…»، «تأیید…»).')
  else if (wordCount(title) < 4) tips.push('هدف را مشخص‌تر بنویسید: چه چیزی، از چه کسی/کجا؟')
  if (!measurable) tips.push('معیار تحقق بنویسید: چه خروجی ملموسی نشان می‌دهد هدف محقق شد؟ (سند، تاریخ، عدد)')
  if (!trackable) tips.push('موضوع مرتبط را انتخاب کنید تا در گزارش‌گیری حتماً پرسیده شود.')
  const score = (specific ? 40 : hasVerb ? 20 : 0) + (measurable ? 40 : measure.length >= 3 ? 15 : 0) + (trackable ? 20 : 0)
  return { score, specific, measurable, trackable, tips }
}

/** Measure suggestions per topic, offered as one-tap chips. */
export const MEASURE_SUGGESTIONS: Record<string, string[]> = {
  procurement: ['برنامه تحویل مکتوب با تاریخ مشخص از سازنده', 'وضعیت ارسال هر قلم کلیدی در صورتجلسه ثبت شود'],
  engineering: ['فهرست مدارک معوق با تاریخ تأیید هر یک', 'پاسخ مکتوب مشاور/کارفرما به مدارک معلق'],
  construction: ['درصد پیشرفت هر فعالیت مصوب با عکس از کارگاه', 'فهرست موانع اجرایی با مسئول رفع'],
  hse: ['فهرست موارد عدم‌رعایت با عکس و اقدام اصلاحی', 'تأیید برگزاری جلسه ایمنی در کارگاه'],
  quality: ['فهرست NCRهای باز با وضعیت رفع', 'تأیید بازرسی‌های معوق با امضای ناظر'],
  progress: ['درصد پیشرفت واقعی در برابر برنامه برای هر بخش', 'فهرست فعالیت‌های مسیر بحرانی و وضعیت آنها'],
  decisions: ['صورتجلسه امضاشده با تعهدات هر طرف و موعد', 'تصمیمات جلسه به‌صورت مکتوب ابلاغ شود'],
  '': ['گزارش مکتوب با یافته‌ها، مسئول و موعد هر اقدام'],
}
