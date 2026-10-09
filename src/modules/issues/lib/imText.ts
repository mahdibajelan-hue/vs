import type { ImIssue } from '../types'

const AR_TO_FA: Record<string, string> = { 'ك': 'ک', 'ي': 'ی', 'ى': 'ی', 'ۀ': 'ه', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ؤ': 'و' }

/** Persian-aware normalisation: Arabic letter variants, digits, diacritics, ZWNJ/punctuation → plain lowercase tokens. */
export function normalizeFa(s: string): string {
  return (s ?? '')
    .replace(/[كيىۀةأإؤ]/g, (c) => AR_TO_FA[c] ?? c)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[‌‍]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

const STOP = new Set(['و', 'در', 'به', 'از', 'که', 'این', 'آن', 'با', 'را', 'برای', 'است', 'شد', 'شده', 'بود', 'یا', 'تا', 'هم', 'بر', 'the', 'a', 'of', 'to', 'in', 'is'])
export const tokens = (s: string): string[] => normalizeFa(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t))

function trigrams(s: string): Set<string> {
  const t = ' ' + normalizeFa(s) + ' '
  const out = new Set<string>()
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3))
  return out
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n / (a.size + b.size - n)
}

/** 0..1 similarity: blend of token Jaccard and character-trigram Jaccard (robust to Persian inflection and typos). */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b))
  return Math.round((0.5 * jaccard(ta, tb) + 0.5 * jaccard(trigrams(a), trigrams(b))) * 1000) / 1000
}

export interface DupMatch { issue: ImIssue; score: number; reasons: string[] }

/** Explainable duplicate suggestions — never merges anything; the UI asks a human to confirm. */
export function findSimilarIssues(candidate: { title: string; description?: string; projectId?: string | null; category?: string | null; location?: string }, pool: ImIssue[], opts: { threshold?: number; limit?: number; excludeId?: string } = {}): DupMatch[] {
  const th = opts.threshold ?? 0.34
  const text = candidate.title + ' ' + (candidate.description ?? '')
  const out: DupMatch[] = []
  for (const i of pool) {
    if (i.id === opts.excludeId) continue
    const titleSim = similarity(candidate.title, i.title)
    const fullSim = similarity(text, i.title + ' ' + i.description)
    let score = Math.max(titleSim, fullSim * 0.9)
    const reasons: string[] = []
    if (titleSim >= th) reasons.push(`عنوان مشابه (${Math.round(titleSim * 100)}٪)`)
    if (fullSim >= th) reasons.push(`شرح مشابه (${Math.round(fullSim * 100)}٪)`)
    if (candidate.projectId && i.projectId === candidate.projectId) { score += 0.04; reasons.push('همان پروژه') }
    if (candidate.category && i.category === candidate.category) { score += 0.03; reasons.push('همان دسته') }
    if (candidate.location && i.location && normalizeFa(candidate.location) === normalizeFa(i.location)) { score += 0.05; reasons.push('همان محل') }
    if (score >= th && reasons.some((r) => r.startsWith('عنوان') || r.startsWith('شرح'))) out.push({ issue: i, score: Math.min(1, Math.round(score * 1000) / 1000), reasons })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5)
}

/** Recurring-cause clustering: groups issues sharing the same normalised root-cause text or dominant tokens. */
export function clusterByCause(issues: ImIssue[], minSize = 2, threshold = 0.5): { label: string; issueIds: string[] }[] {
  const withCause = issues.filter((i) => (i.rootCauseSummary ?? '').trim().length > 2)
  const used = new Set<string>()
  const out: { label: string; issueIds: string[] }[] = []
  for (const a of withCause) {
    if (used.has(a.id)) continue
    const group = [a]
    for (const b of withCause) if (b.id !== a.id && !used.has(b.id) && similarity(a.rootCauseSummary!, b.rootCauseSummary!) >= threshold) group.push(b)
    if (group.length >= minSize) { group.forEach((g) => used.add(g.id)); out.push({ label: a.rootCauseSummary!.trim(), issueIds: group.map((g) => g.id) }) }
  }
  return out.sort((x, y) => y.issueIds.length - x.issueIds.length)
}
