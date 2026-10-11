/**
 * Reading an online multiple-choice score: the raw percentage alone says little when most candidates score 80–100.
 * This adds what an examiner needs next to it — a difficulty-weighted score, a guessing-corrected score, the
 * position within the cohort and the warning signs of an unreliable sitting (too fast, ceiling score).
 */
export interface McqTestFacts {
  total: number
  answered: number
  correct: number
  timeSpentSeconds: number | null
  difficulty: { difficulty: number; total: number; correct: number }[]
}
export interface Cohort { scores: number[] }
export type McqFlag = 'FAST' | 'CEILING' | 'EASY_ONLY' | 'THIN_COHORT' | 'UNANSWERED'

export interface McqInsight {
  raw: number
  /** correct answers weighted by difficulty (1, 1.5, 2) — a hard item is worth more than an easy one */
  weighted: number
  /** formula-scoring correction for guessing with four options: (right − wrong ÷ 3) ÷ questions */
  guessCorrected: number
  secondsPerQuestion: number | null
  percentile: number | null
  zScore: number | null
  cohortSize: number
  cohortMean: number | null
  hardShare: number
  flags: McqFlag[]
  advice: string[]
}

export const DIFFICULTY_WEIGHT: Record<number, number> = { 1: 1, 2: 1.5, 3: 2 }
const OPTIONS = 4

export function mcqInsight(t: McqTestFacts, cohort: Cohort): McqInsight {
  const raw = t.total ? (t.correct / t.total) * 100 : 0
  let wNum = 0, wDen = 0, hard = 0
  for (const d of t.difficulty) { const w = DIFFICULTY_WEIGHT[d.difficulty] ?? 1; wNum += w * d.correct; wDen += w * d.total; if (d.difficulty >= 3) hard += d.total }
  const weighted = wDen ? (wNum / wDen) * 100 : raw
  const wrong = Math.max(0, t.answered - t.correct)
  const guessCorrected = t.total ? Math.max(0, ((t.correct - wrong / (OPTIONS - 1)) / t.total) * 100) : 0
  const spq = t.timeSpentSeconds != null && t.answered ? t.timeSpentSeconds / t.answered : null
  const others = cohort.scores.filter((s) => Number.isFinite(s))
  const n = others.length
  const mean = n ? others.reduce((a, b) => a + b, 0) / n : null
  const sd = n > 1 && mean != null ? Math.sqrt(others.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null
  const percentile = n >= 5 ? Math.round(((others.filter((s) => s < raw).length + 0.5 * others.filter((s) => s === raw).length) / n) * 100) : null
  const flags: McqFlag[] = []
  if (spq != null && spq < 20) flags.push('FAST')
  if (raw >= 95) flags.push('CEILING')
  const hardShare = t.total ? hard / t.total : 0
  if (hardShare < 0.3) flags.push('EASY_ONLY')
  if (n < 5) flags.push('THIN_COHORT')
  if (t.total - t.answered > 0) flags.push('UNANSWERED')
  const advice: string[] = []
  if (flags.includes('CEILING')) advice.push('نمرهٔ سقفی آزمون تفکیک‌کننده نیست؛ برای اطمینان از تسلط، سؤال‌های دشوارتر یا مصاحبهٔ فنی تکمیلی در همان موضوع‌ها بپرسید.')
  if (flags.includes('FAST')) advice.push('میانگین زمان پاسخ کمتر از ۲۰ ثانیه است؛ احتمال حدس یا پاسخ شتاب‌زده بررسی شود.')
  if (flags.includes('EASY_ONLY')) advice.push('کمتر از ۳۰٪ سؤال‌ها دشوار بوده‌اند؛ درصد کل این آزمون برآورد خوش‌بینانه‌ای از توان فنی است.')
  if (raw >= 85 && percentile != null && percentile < 60) advice.push('نمرهٔ بالا در میان گروه مقایسه‌ای معمولی است؛ برتری واقعی را با درصد نسبی (جایگاه در گروه) بسنجید.')
  if (flags.includes('THIN_COHORT')) advice.push('گروه مقایسه‌ای هنوز کوچک است (کمتر از ۵ آزمون)؛ جایگاه نسبی نمایش داده نمی‌شود.')
  return { raw, weighted, guessCorrected, secondsPerQuestion: spq, percentile, zScore: sd && mean != null ? (raw - mean) / sd : null, cohortSize: n, cohortMean: mean, hardShare, flags, advice }
}
