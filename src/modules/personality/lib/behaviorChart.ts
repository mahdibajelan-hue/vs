import type { FingerprintDimensionRow } from './fingerprintModel'
import type { RoleAlignmentResult } from './roleAlignment'

/**
 * One picture for «ابعاد رفتاری حرفه‌ای» and «تطابق با الزامات شغل»: a radar of every behavioural
 * dimension grouped by family, the candidate's calibrated score against the job's required band, and a
 * written analysis built from the very same numbers — no second calculation, no AI.
 */
export interface RadarAxis {
  key: string
  labelFa: string
  short: string
  familyKey: string
  familyLabelFa: string
  tone: string
  score: number | null
  min: number | null
  prefMin: number | null
  prefMax: number | null
  isCritical: boolean
  status: FingerprintDimensionRow['status']
  confidence: FingerprintDimensionRow['confidence']
}

/** Short label for the chart rim: the first two words of the Persian label. */
export const shortLabel = (fa: string): string => fa.split(/\s+/).slice(0, 2).join(' ')

export function buildAxes(rows: FingerprintDimensionRow[]): RadarAxis[] {
  return [...rows]
    .sort((a, b) => a.familyKey.localeCompare(b.familyKey) || a.label.fa.localeCompare(b.label.fa, 'fa'))
    .map((d) => ({ key: d.key, labelFa: d.label.fa, short: shortLabel(d.label.fa), familyKey: d.familyKey, familyLabelFa: d.familyLabelFa, tone: d.tone, score: d.score, min: d.minThreshold, prefMin: d.preferredMin, prefMax: d.preferredMax, isCritical: d.isCritical, status: d.status, confidence: d.confidence }))
}

export interface FamilySummary { familyKey: string; familyLabelFa: string; tone: string; average: number | null; count: number; below: number }
export function familySummaries(axes: RadarAxis[]): FamilySummary[] {
  const by = new Map<string, RadarAxis[]>()
  for (const a of axes) by.set(a.familyKey, [...(by.get(a.familyKey) ?? []), a])
  return [...by].map(([familyKey, list]) => {
    const scored = list.filter((a) => a.score != null)
    return { familyKey, familyLabelFa: list[0].familyLabelFa, tone: list[0].tone, average: scored.length ? Math.round(scored.reduce((s, a) => s + (a.score as number), 0) / scored.length) : null, count: list.length, below: list.filter((a) => a.status === 'BELOW_MIN' || a.status === 'BELOW_PREFERRED').length }
  })
}

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')
const names = (xs: RadarAxis[]) => xs.map((a) => `«${a.labelFa}»`).join('، ')

export interface ProfileAnalysis { headline: string; paragraphs: { tone: 'good' | 'warn' | 'bad' | 'info'; text: string }[] }

/** The written reading of the chart. Every sentence is derived from the axes, the alignment and the validity factor shown next to it. */
export function analyseProfile(axes: RadarAxis[], alignment: RoleAlignmentResult, opts: { validityFactor?: number | null; hasJobProfile: boolean }): ProfileAnalysis {
  const scored = axes.filter((a) => a.score != null)
  const out: ProfileAnalysis['paragraphs'] = []
  if (scored.length === 0) return { headline: 'هنوز امتیاز رفتاری محاسبه نشده است.', paragraphs: [] }
  const mean = scored.reduce((s, a) => s + (a.score as number), 0) / scored.length
  const strong = scored.filter((a) => (a.score as number) >= 75 && a.confidence !== 'LOW').sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 4)
  const critGap = axes.filter((a) => a.isCritical && (a.status === 'BELOW_MIN' || a.status === 'BELOW_PREFERRED'))
  const belowMin = axes.filter((a) => a.status === 'BELOW_MIN')
  const nearPref = axes.filter((a) => a.status === 'BELOW_PREFERRED')
  const over = axes.filter((a) => a.status === 'ABOVE_PREFERRED')
  const thin = scored.filter((a) => a.confidence === 'LOW')
  const weakest = [...scored].sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 3).filter((a) => (a.score as number) < 50)
  const fams = familySummaries(axes).filter((f) => f.average != null)
  const topFam = [...fams].sort((a, b) => (b.average as number) - (a.average as number))[0]
  const lowFam = [...fams].sort((a, b) => (a.average as number) - (b.average as number))[0]

  if (opts.hasJobProfile && alignment.overallAlignmentPercent != null) {
    const p = alignment.overallAlignmentPercent
    out.push({ tone: critGap.length ? 'bad' : p >= 80 ? 'good' : p >= 60 ? 'info' : 'warn', text: `تطابق کلی با الزامات شغل ٪${fa(p)} است${critGap.length ? `، اما ${fa(critGap.length)} الزام حیاتی (${names(critGap)}) زیر بازهٔ موردنیاز است و پیش از تصمیم باید در مصاحبه بررسی شود` : belowMin.length ? `؛ ${fa(belowMin.length)} بُعد زیر حداقل الزام است` : '، بدون کمبود در ابعاد حیاتی'}.` })
  } else if (!opts.hasJobProfile) out.push({ tone: 'info', text: 'نیم‌رخ رفتاری این شغل تعریف نشده؛ نمودار فقط امتیاز داوطلب را نشان می‌دهد و تطابق شغلی قابل‌محاسبه نیست.' })
  if (strong.length) out.push({ tone: 'good', text: `قوی‌ترین ابعاد با شواهد کافی: ${names(strong)}${topFam ? `؛ در سطح خانواده، «${topFam.familyLabelFa}» با میانگین ${fa(topFam.average as number)} بالاترین است` : ''}.` })
  if (weakest.length && !critGap.length) out.push({ tone: 'warn', text: `کم‌امتیازترین ابعاد: ${names(weakest)}${lowFam && lowFam !== topFam ? ` (خانوادهٔ «${lowFam.familyLabelFa}» میانگین ${fa(lowFam.average as number)})` : ''}؛ نمونهٔ رفتاری واقعی در این موارد را در مصاحبه بخواهید.` })
  else if (nearPref.length) out.push({ tone: 'warn', text: `${names(nearPref.slice(0, 4))} کمی زیر بازهٔ ترجیحی شغل است.` })
  if (over.length) out.push({ tone: 'info', text: `${names(over.slice(0, 3))} بالاتر از بازهٔ ترجیحی شغل است؛ در نقش‌های دارای قواعد سخت می‌تواند به انعطاف‌ناپذیری یا ریسک‌پذیری زیاد تعبیر شود.` })
  if (thin.length >= Math.max(2, scored.length * 0.3)) out.push({ tone: 'warn', text: `${fa(thin.length)} از ${fa(scored.length)} بُعد فقط بر یک گویه استوارند؛ این امتیازها شواهد اولیه‌اند و با نمونهٔ رفتاری مصاحبه تأیید شوند.` })
  if (opts.validityFactor != null && opts.validityFactor < 0.95) out.push({ tone: 'warn', text: `به‌دلیل نشانه‌های اعتبار پاسخ (مطلوبیت اجتماعی یا پاسخ‌های حدی) امتیازها با ضریب ${fa(opts.validityFactor * 100)}٪ به میانه نزدیک شده‌اند؛ مقدارهای خام در جزئیات هر بُعد نمایش داده می‌شود.` })
  if (mean >= 80) out.push({ tone: 'warn', text: 'میانگین امتیازها غیرعادی بالاست؛ پروفایل «بی‌نقص» در خودگزارشی معمولاً نشانهٔ تمایل به ارائهٔ تصویر مطلوب است، نه تضمین رفتار واقعی.' })
  const headline = critGap.length ? 'پروفایل رفتاری با کمبود در الزام حیاتی' : alignment.overallAlignmentPercent != null && alignment.overallAlignmentPercent >= 80 ? 'پروفایل رفتاری منطبق با شغل' : alignment.overallAlignmentPercent != null && alignment.overallAlignmentPercent >= 60 ? 'پروفایل رفتاری نسبتاً منطبق' : 'پروفایل رفتاری نیازمند بررسی'
  return { headline, paragraphs: out }
}
