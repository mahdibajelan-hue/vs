/**
 * Adverse-impact monitoring: does the approval rate of one group fall well below that of the best-treated group?
 * The "four-fifths rule" flags a group whose approval rate is under 80 % of the highest group's rate. It is a prompt to
 * review the instrument, never a verdict — small groups are shown but not judged.
 */
export interface FairnessCandidate { age: number | null; hasDisability: boolean; approved: boolean; completed: boolean }
export interface FairnessGroup { key: string; label: string; n: number; approved: number; rate: number | null; ratio: number | null; flag: boolean; small: boolean }
export interface FairnessReport { dimension: string; groups: FairnessGroup[]; note: string }
export const MIN_GROUP_SIZE = 5
export const FOUR_FIFTHS = 0.8

export const ageBand = (age: number | null): string => (age == null ? 'نامشخص' : age < 30 ? 'زیر ۳۰ سال' : age < 40 ? '۳۰ تا ۳۹' : age < 50 ? '۴۰ تا ۴۹' : '۵۰ سال و بالاتر')

function report(dimension: string, rows: FairnessCandidate[], keyOf: (c: FairnessCandidate) => string): FairnessReport {
  const by = new Map<string, FairnessCandidate[]>()
  for (const r of rows) by.set(keyOf(r), [...(by.get(keyOf(r)) ?? []), r])
  const raw = [...by].map(([label, list]) => ({ label, n: list.length, approved: list.filter((c) => c.approved).length }))
  const rated = raw.filter((g) => g.n >= MIN_GROUP_SIZE && g.label !== 'نامشخص')
  const best = rated.length ? Math.max(...rated.map((g) => g.approved / g.n)) : null
  const groups = raw.map((g): FairnessGroup => {
    const small = g.n < MIN_GROUP_SIZE || g.label === 'نامشخص'
    const rate = g.n ? g.approved / g.n : null
    const ratio = !small && best ? (g.approved / g.n) / best : null
    return { key: g.label, label: g.label, n: g.n, approved: g.approved, rate, ratio, flag: ratio != null && best != null && best > 0 && ratio < FOUR_FIFTHS, small }
  }).sort((a, b) => b.n - a.n)
  const flagged = groups.filter((g) => g.flag)
  return { dimension, groups, note: flagged.length ? `نرخ تأیید ${flagged.map((g) => `«${g.label}»`).join('، ')} کمتر از ۸۰٪ نرخ بهترین گروه است؛ ابزار و معیارهای تصمیم از نظر سوگیری بازبینی شود.` : rated.length >= 2 ? 'اختلاف معناداری با قاعدهٔ چهارپنجم دیده نمی‌شود.' : 'گروه‌های کافی برای مقایسه وجود ندارد (دست‌کم ' + MIN_GROUP_SIZE + ' نفر در هر گروه).' }
}

export function fairnessReports(cs: FairnessCandidate[]): FairnessReport[] {
  const done = cs.filter((c) => c.completed)
  return [report('گروه سنی', done, (c) => ageBand(c.age)), report('وضعیت معلولیت', done, (c) => (c.hasDisability ? 'دارای معلولیت' : 'بدون معلولیت'))]
}
