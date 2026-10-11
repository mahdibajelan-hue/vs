/**
 * Inter-rater agreement for a panel — the standard reliability check of an assessment centre. A
 * panel average is only trustworthy when raters broadly agree; where they do not, the lead should
 * calibrate (discuss the evidence and re-score) before the number is used for a decision.
 * Scores are the 0–5 maturity scale of the technical rubric.
 */
export interface RaterSheet { raterId: string; name: string; scores: Record<string, number> }

export interface QuestionAgreement { key: string; raters: number; mean: number; sd: number; range: number; disagree: boolean }
export interface RaterBias { raterId: string; name: string; shared: number; mean: number; bias: number; flag: 'lenient' | 'harsh' | null; meanAbsDiff: number }
export type AgreementLevel = 'high' | 'moderate' | 'low' | 'insufficient'
export interface AgreementResult {
  level: AgreementLevel
  /** share of jointly-rated questions on which all raters are within one point */
  withinOne: number
  sharedQuestions: number
  questions: QuestionAgreement[]
  raters: RaterBias[]
  advice: string[]
}

/** a rater is called lenient/harsh when their average sits this far (in points) from the average of the others on the questions they share */
const fnum = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
export const BIAS_FLAG = 0.6
export const DISAGREE_RANGE = 2

export function raterAgreement(sheets: RaterSheet[]): AgreementResult {
  const valid = sheets.filter((s) => Object.keys(s.scores).length > 0)
  const keys = new Set<string>(); for (const s of valid) for (const k of Object.keys(s.scores)) keys.add(k)
  const questions: QuestionAgreement[] = []
  for (const key of keys) {
    const xs = valid.map((s) => s.scores[key]).filter((v): v is number => typeof v === 'number')
    if (xs.length < 2) continue
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
    const range = Math.max(...xs) - Math.min(...xs)
    questions.push({ key, raters: xs.length, mean, sd, range, disagree: range >= DISAGREE_RANGE })
  }
  const raters: RaterBias[] = valid.map((s) => {
    let n = 0, mine = 0, others = 0, abs = 0
    for (const q of questions) {
      const v = s.scores[q.key]; if (typeof v !== 'number') continue
      const o = (q.mean * q.raters - v) / (q.raters - 1)
      n++; mine += v; others += o; abs += Math.abs(v - o)
    }
    const bias = n ? (mine - others) / n : 0
    return { raterId: s.raterId, name: s.name, shared: n, mean: n ? mine / n : 0, bias, flag: n >= 3 && bias >= BIAS_FLAG ? 'lenient' : n >= 3 && bias <= -BIAS_FLAG ? 'harsh' : null, meanAbsDiff: n ? abs / n : 0 }
  })
  const shared = questions.length
  const withinOne = shared ? questions.filter((q) => q.range <= 1).length / shared : 0
  const outliers = raters.filter((r) => r.flag)
  const level: AgreementLevel = valid.length < 2 || shared < 3 ? 'insufficient' : withinOne >= 0.85 && outliers.length === 0 ? 'high' : withinOne >= 0.65 ? 'moderate' : 'low'
  const advice: string[] = []
  if (level === 'insufficient') advice.push('برای سنجش هم‌خوانی، دست‌کم دو داور باید حداقل سه سؤال مشترک را نمره داده باشند.')
  if (level === 'low') advice.push('هم‌خوانی داوران پایین است؛ پیش از تصمیم، جلسهٔ همسان‌سازی (Calibration) برگزار شود و شواهد سؤال‌های اختلافی دوباره بررسی شود.')
  if (level === 'moderate') advice.push('هم‌خوانی متوسط است؛ سؤال‌های دارای اختلاف دو نمره‌ای یا بیشتر را در جلسهٔ پنل مرور کنید.')
  for (const r of outliers) advice.push(`${r.name} نسبت به سایر داوران ${r.flag === 'lenient' ? 'سخاوتمندانه‌تر' : 'سخت‌گیرانه‌تر'} نمره داده است (اختلاف میانگین ${fnum(Math.abs(r.bias), 1)} نمره)؛ مبنای نمره‌دهی با راهنمای ۰ تا ۵ تطبیق داده شود.`)
  const worst = questions.filter((q) => q.disagree).sort((a, b) => b.range - a.range).slice(0, 3)
  if (worst.length && level !== 'insufficient') advice.push(`بیشترین اختلاف در ${fnum(worst.length)} سؤال است؛ این سؤال‌ها در جدول زیر علامت خورده‌اند.`)
  return { level, withinOne, sharedQuestions: shared, questions: questions.sort((a, b) => b.range - a.range || b.sd - a.sd), raters, advice }
}

export const AGREEMENT_META: Record<AgreementLevel, { label: string; color: string }> = {
  high: { label: 'هم‌خوانی بالا', color: '#34d399' },
  moderate: { label: 'هم‌خوانی متوسط', color: '#fbbf24' },
  low: { label: 'هم‌خوانی پایین', color: '#f87171' },
  insufficient: { label: 'دادهٔ ناکافی', color: '#94a3b8' },
}
