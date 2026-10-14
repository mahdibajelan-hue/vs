/**
 * Item-quality checks for a multiple-choice question — the kind of flaws that let a candidate find the answer without
 * knowing the subject. Live data (2026-10): in 95 % of the bank the correct option was the longest one (about three times
 * the length of the wrong ones) and the wrong options were short, absolute ("only", "without checking") or off-topic,
 * which is why almost everybody scored 90–100 %. Pure functions, no database access.
 */
export type McqFlawKind = 'LONGEST_CORRECT' | 'LENGTH_SPREAD' | 'ABSOLUTE_WORDS' | 'STEM_ECHO' | 'ALL_OR_NONE' | 'TOO_SHORT_DISTRACTOR' | 'DUPLICATE'
export interface McqFlaw { kind: McqFlawKind; penalty: number; detail: string }
export interface McqQualityInput { stem: string; options: readonly string[]; correct: number }
export interface McqQuality { score: number; level: 'OK' | 'WARN' | 'BAD'; flaws: McqFlaw[] }

export const MCQ_FLAW_LABEL_FA: Record<McqFlawKind, string> = {
  LONGEST_CORRECT: 'گزینهٔ درست بلندترین گزینه است',
  LENGTH_SPREAD: 'اختلاف طول گزینه‌ها زیاد است',
  ABSOLUTE_WORDS: 'گزینه‌های غلط کلمات مطلق دارند (فقط، همیشه، بدون …)',
  STEM_ECHO: 'گزینهٔ درست بیش از بقیه کلمات صورت سؤال را تکرار می‌کند',
  ALL_OR_NONE: '«همهٔ موارد / هیچ‌کدام» در گزینه‌ها',
  TOO_SHORT_DISTRACTOR: 'گزینهٔ غلط خیلی کوتاه و کم‌محتواست',
  DUPLICATE: 'گزینه‌های تکراری',
}

const ABSOLUTE = /(^|[\s(«"])(فقط|صرفاً|همیشه|هرگز|هیچ‌گاه|هیچگاه|مطلقاً|کاملاً|تماماً|به‌هیچ‌وجه|بی‌درنگ|فوراً|هیچ|بدون|تمام|همهٔ|همه)(?=[\s)»".،:؛]|$)/u
const ALL_NONE = /(همهٔ|همه)\s*(موارد|گزینه)|هیچ\s*کدام|هیچ‌کدام|هر\s*(سه|دو)\s*مورد/u
const words = (s: string) => s.replace(/[()«»"'.,،؛:؟?!\-–—/]/g, ' ').split(/\s+/).filter((w) => w.length >= 3)
const len = (s: string) => s.trim().length

export function mcqQuality(q: McqQualityInput): McqQuality {
  const flaws: McqFlaw[] = []
  const opts = q.options.map((o) => o.trim())
  const correct = opts[q.correct] ?? ''
  const wrong = opts.filter((_, i) => i !== q.correct)
  if (!correct || wrong.length < 2) return { score: 0, level: 'BAD', flaws: [] }
  const wl = wrong.map(len), cl = len(correct), maxW = Math.max(...wl)

  // the cue that matters: the right answer is visibly longer than EVERY wrong one (more than 10 %)
  if (cl > maxW * 1.1) flaws.push({ kind: 'LONGEST_CORRECT', penalty: cl > maxW * 1.8 ? 40 : cl > maxW * 1.3 ? 25 : 15, detail: `${cl} نویسه در برابر بلندترین گزینهٔ غلط ${maxW}` })
  const all = [cl, ...wl], ratio = Math.max(...all) / Math.max(1, Math.min(...all))
  if (ratio > 2.5) flaws.push({ kind: 'LENGTH_SPREAD', penalty: ratio > 4 ? 20 : 10, detail: `نسبت بلندترین به کوتاه‌ترین ${ratio.toFixed(1)}` })

  const absWrong = wrong.filter((o) => ABSOLUTE.test(o)).length
  if (absWrong >= 1 && !ABSOLUTE.test(correct)) flaws.push({ kind: 'ABSOLUTE_WORDS', penalty: absWrong >= 2 ? 25 : 10, detail: `${absWrong} گزینهٔ غلط` })

  const sw = new Set(words(q.stem))
  const overlap = (o: string) => words(o).filter((w) => sw.has(w)).length
  const oc = overlap(correct), ow = Math.max(...wrong.map(overlap))
  if (oc >= 3 && oc >= ow + 2) flaws.push({ kind: 'STEM_ECHO', penalty: 10, detail: `${oc} کلمهٔ مشترک با صورت سؤال` })

  if (opts.some((o) => ALL_NONE.test(o))) flaws.push({ kind: 'ALL_OR_NONE', penalty: 10, detail: '' })
  const shortW = wl.filter((l, i) => l < 14 && !(words(wrong[i]).length >= 3)).length
  if (shortW >= 2) flaws.push({ kind: 'TOO_SHORT_DISTRACTOR', penalty: 15, detail: `${shortW} گزینهٔ کوتاه‌تر از ۱۴ نویسه` })
  if (new Set(opts).size < opts.length) flaws.push({ kind: 'DUPLICATE', penalty: 40, detail: '' })

  const score = Math.max(0, 100 - flaws.reduce((s, f) => s + f.penalty, 0))
  return { score, level: score >= 80 ? 'OK' : score >= 55 ? 'WARN' : 'BAD', flaws }
}

/** Share of questions in which the correct option is visibly (>10 %) longer than every wrong option — about 25 % or less for a healthy four-option bank. */
export function longestCorrectShare(qs: McqQualityInput[]): number {
  if (!qs.length) return 0
  return qs.filter((q) => { const l = q.options.map((o) => o.trim().length), c = l[q.correct], w = Math.max(...l.filter((_, i) => i !== q.correct)); return c > w * 1.1 }).length / qs.length
}

export interface BankHealth { total: number; ok: number; warn: number; bad: number; longestShare: number; avgScore: number }
export function bankHealth(qs: McqQualityInput[]): BankHealth {
  const r = qs.map(mcqQuality)
  return { total: qs.length, ok: r.filter((x) => x.level === 'OK').length, warn: r.filter((x) => x.level === 'WARN').length, bad: r.filter((x) => x.level === 'BAD').length, longestShare: longestCorrectShare(qs), avgScore: r.length ? r.reduce((s, x) => s + x.score, 0) / r.length : 0 }
}
