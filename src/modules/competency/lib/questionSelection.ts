import type { CompQuestionBankItem } from '../types'

/**
 * Random Question Engine (spec section 8): picking questions for an assessment isn't pure uniform
 * randomness over a category+difficulty pool — it should also account for Topic (subCategory),
 * Previous Usage, and Question Similarity, so e.g. a welding inspector's 8 Technical questions
 * don't all happen to land on "WPS" and a candidate never sees two near-duplicate questions.
 */

const PERSIAN_STOPWORDS = new Set([
  'و',
  'در',
  'به',
  'از',
  'که',
  'را',
  'با',
  'این',
  'آن',
  'یک',
  'برای',
  'یا',
  'تا',
  'چه',
  'چگونه',
  'است',
  'هر',
  'می',
  'شود',
  'کنید',
  'دارید',
])

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[،.؟!؛:()«»"'\-–—]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !PERSIAN_STOPWORDS.has(w))
  return new Set(words)
}

/** Jaccard similarity of the two questions' word sets — a cheap, explainable, dependency-free
 * heuristic (no embeddings/AI call available at this layer) for "these two questions are basically
 * asking the same thing." 0 = no shared words, 1 = identical word sets. */
export function questionTextSimilarity(a: string, b: string): number {
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const w of setA) if (setB.has(w)) shared += 1
  const union = setA.size + setB.size - shared
  return union === 0 ? 0 : shared / union
}

const SIMILARITY_THRESHOLD = 0.55

/**
 * Picks `count` questions from `pool`, preferring (in order): questions not yet too similar to
 * anything already picked (in this cell or earlier cells of the same assessment, via
 * `alreadyPickedTexts`), lower usage_count (spec's "Previous Usage" control), and spreading picks
 * across subCategory ("Topic") instead of exhausting one topic before touching another.
 *
 * Mutates nothing — returns the picked subset; the caller is responsible for merging
 * `alreadyPickedTexts` across cells if it wants cross-category similarity checking too.
 */
export function pickDiverseQuestions(pool: CompQuestionBankItem[], count: number, alreadyPickedTexts: string[]): CompQuestionBankItem[] {
  if (count <= 0 || pool.length === 0) return []
  if (pool.length <= count) return [...pool]

  // Group by topic (subCategory) so a round-robin draw naturally spreads across topics instead of
  // randomly clustering on whichever topic happens to have the most rows in the bank.
  const byTopic = new Map<string, CompQuestionBankItem[]>()
  for (const q of pool) {
    const key = q.subCategory || '—'
    const list = byTopic.get(key) ?? []
    list.push(q)
    byTopic.set(key, list)
  }
  // Within each topic, prefer least-used first (stable ordering), with a random shuffle inside
  // equal-usage ties so repeated generations don't always draw the exact same question first.
  for (const list of byTopic.values()) {
    list.sort((a, b) => a.usageCount - b.usageCount || Math.random() - 0.5)
  }
  const topics = [...byTopic.keys()].sort(() => Math.random() - 0.5)

  const picked: CompQuestionBankItem[] = []
  const pickedTexts = [...alreadyPickedTexts]
  const deferred: CompQuestionBankItem[] = [] // candidates skipped only for being too similar — used as a last-resort fallback

  let topicIndex = 0
  let guard = 0
  const maxGuard = pool.length * 4 // hard stop so a pathological pool can never spin this forever
  while (picked.length < count && guard < maxGuard) {
    guard += 1
    const topic = topics[topicIndex % topics.length]
    topicIndex += 1
    const queue = byTopic.get(topic)
    if (!queue || queue.length === 0) {
      if (topics.every((t) => (byTopic.get(t)?.length ?? 0) === 0)) break
      continue
    }
    const candidate = queue.shift()!
    const tooSimilar = pickedTexts.some((t) => questionTextSimilarity(t, candidate.questionText) >= SIMILARITY_THRESHOLD)
    if (tooSimilar) {
      deferred.push(candidate)
      continue
    }
    picked.push(candidate)
    pickedTexts.push(candidate.questionText)
  }

  // Every remaining candidate in the pool was "too similar" to something already picked — better
  // to fill the quota than to under-deliver the designed mix by a question or two.
  for (const candidate of deferred) {
    if (picked.length >= count) break
    picked.push(candidate)
  }

  return picked
}
