import { shuffle } from '../../../lib/utils'
import type { PersonalityQuestion, PersonalityQuestionMixCell } from '../types'

/**
 * Personality test item selection (docs/demo-test-report.md N-3 / N-5).
 *
 * A purely random draw per (type, complexity) cell could leave a dimension that the job's
 * behavioral profile or its competency model depends on without a single item, so its evidence
 * could never reach more than LOW confidence. Selection therefore runs in passes, all inside the
 * designed mix's total:
 *   1. coverage — for every required behavioral dimension (job profile requirements + the role's
 *      PERSONALITY_DIMENSION evidence sources, critical/heavier first) at least
 *      MIN_ITEMS_PER_DIMENSION items that measure it (items tied to it directly first, then choice
 *      items with an option keyed to it); likewise MIN_ITEMS_PER_TRAIT scale items per required
 *      trait and MIN_SJT_ITEMS_PER_DIMENSION SJT items per SJT evidence source. An item is taken
 *      from its own cell when that cell still has room, otherwise the slot is borrowed from the
 *      cell with the most room left (the total never changes);
 *   2. consistency — up to REVERSE_PAIRS_PER_TEST facet pairs (a reverse-keyed item plus a forward
 *      item of the same facet) so the engine can compute consistency/contradiction indices;
 *   3. fill — the rest of every cell with the diversity-aware random draw;
 *   4. validity scale — VALIDITY_ITEMS_PER_TEST social-desirability items, on top of the mix,
 *      spread through the scale-item block.
 */

export const MIN_ITEMS_PER_DIMENSION = 2
export const MIN_ITEMS_PER_TRAIT = 2
export const MIN_SJT_ITEMS_PER_DIMENSION = 1
export const REVERSE_PAIRS_PER_TEST = 3
export const VALIDITY_ITEMS_PER_TEST = 4

export interface PersonalityCoverageTargets {
  /** Behavioral dimensions in priority order. */
  dimensions: { id: string; key: string }[]
  /** Dimensions that are SJT evidence sources (need SJT items specifically). */
  sjtDimensionKeys: string[]
  traitIds: string[]
}

export interface PersonalitySelectionResult {
  ids: string[]
  /** Required dimension/trait keys the bank + mix could not cover to the minimum. */
  uncovered: string[]
  validityItemCount: number
}

const SCALE_TYPES = new Set(['LIKERT', 'FREQUENCY'])
const cellKey = (q: Pick<PersonalityQuestion, 'questionType' | 'complexity'>) => `${q.questionType}__${q.complexity}`

export function isValidityItem(q: Pick<PersonalityQuestion, 'validityScale'>): boolean {
  return q.validityScale != null
}

function tooSimilar(text: string, usedTexts: string[]): boolean {
  const words = new Set(text.split(/\s+/))
  return usedTexts.some((t) => {
    const tw = new Set(t.split(/\s+/))
    const overlap = [...words].filter((w) => tw.has(w)).length
    return overlap / Math.max(words.size, tw.size, 1) > 0.7
  })
}

export function selectPersonalityQuestions(
  bank: PersonalityQuestion[],
  mix: PersonalityQuestionMixCell[],
  targets: PersonalityCoverageTargets,
): PersonalitySelectionResult {
  const regular = bank.filter((q) => !isValidityItem(q))
  const validity = bank.filter((q) => q.validityScale === 'SOCIAL_DESIRABILITY' && q.questionType === 'LIKERT')

  const mixOrder = mix.filter((c) => c.count > 0).map((c) => `${c.questionType}__${c.complexity}`)
  const remaining = new Map<string, number>()
  for (const c of mix) if (c.count > 0) remaining.set(`${c.questionType}__${c.complexity}`, (remaining.get(`${c.questionType}__${c.complexity}`) ?? 0) + c.count)
  const totalRemaining = () => [...remaining.values()].reduce((s, v) => s + v, 0)
  const room = (q: PersonalityQuestion) => remaining.get(cellKey(q)) ?? 0
  const inMix = (q: PersonalityQuestion) => remaining.has(cellKey(q))

  const picked: PersonalityQuestion[] = []
  const pickedIds = new Set<string>()
  const take = (q: PersonalityQuestion, allowBorrow: boolean): boolean => {
    const key = cellKey(q)
    const own = remaining.get(key) ?? 0
    if (own > 0) {
      remaining.set(key, own - 1)
    } else {
      if (!allowBorrow) return false
      let best: [string, number] | null = null
      for (const entry of remaining) if (entry[1] > 0 && (!best || entry[1] > best[1])) best = entry
      if (!best) return false
      remaining.set(best[0], best[1] - 1)
    }
    picked.push(q)
    pickedIds.add(q.id)
    return true
  }

  const uncovered: string[] = []
  const cover = (label: string, min: number, measures: (q: PersonalityQuestion) => boolean, direct: (q: PersonalityQuestion) => boolean) => {
    let have = picked.filter(measures).length
    if (have >= min) return
    const candidates = shuffle(regular.filter((q) => inMix(q) && !pickedIds.has(q.id) && measures(q))).sort(
      (a, b) => Number(room(b) > 0) - Number(room(a) > 0) || Number(direct(b)) - Number(direct(a)),
    )
    for (const q of candidates) {
      if (have >= min || totalRemaining() === 0) break
      if (take(q, true)) have += 1
    }
    if (have < min) uncovered.push(label)
  }

  // 1. coverage
  for (const dim of targets.dimensions) {
    cover(
      dim.key,
      MIN_ITEMS_PER_DIMENSION,
      (q) => q.dimensionId === dim.id || q.options.some((o) => o.dimensionKey === dim.key),
      (q) => q.dimensionId === dim.id,
    )
  }
  for (const key of targets.sjtDimensionKeys) {
    cover(
      `SJT:${key}`,
      MIN_SJT_ITEMS_PER_DIMENSION,
      (q) => q.questionType === 'SJT' && q.options.some((o) => o.dimensionKey === key),
      () => true,
    )
  }
  for (const traitId of targets.traitIds) {
    cover(
      traitId,
      MIN_ITEMS_PER_TRAIT,
      (q) => q.traitId === traitId && SCALE_TYPES.has(q.questionType),
      () => true,
    )
  }

  // 2. reverse-keyed facet pairs (only inside cells that still have room — never borrowed)
  const byFacet = new Map<string, PersonalityQuestion[]>()
  for (const q of regular) {
    if (!q.facetId || !SCALE_TYPES.has(q.questionType) || !inMix(q)) continue
    byFacet.set(q.facetId, [...(byFacet.get(q.facetId) ?? []), q])
  }
  let pairs = 0
  for (const items of shuffle([...byFacet.values()])) {
    if (pairs >= REVERSE_PAIRS_PER_TEST) break
    const rev = shuffle(items.filter((q) => q.reverseScored))
    const fwd = shuffle(items.filter((q) => !q.reverseScored))
    if (rev.length === 0 || fwd.length === 0) continue
    const r = rev.find((q) => pickedIds.has(q.id)) ?? rev[0]
    const f = fwd.find((q) => pickedIds.has(q.id)) ?? fwd[0]
    const need = [r, f].filter((q) => !pickedIds.has(q.id))
    const fits = need.every((q) => room(q) >= need.filter((x) => cellKey(x) === cellKey(q)).length)
    if (!fits) continue
    for (const q of need) take(q, false)
    pairs += 1
  }

  // 3. fill every cell's remaining room with the diversity-aware random draw
  const usedTexts = picked.map((q) => q.questionText)
  for (const key of mixOrder) {
    const need = remaining.get(key) ?? 0
    if (need <= 0) continue
    const pool = shuffle(regular.filter((q) => cellKey(q) === key && !pickedIds.has(q.id)))
    const fresh: PersonalityQuestion[] = []
    for (const q of pool) {
      if (fresh.length >= need) break
      if (tooSimilar(q.questionText, usedTexts)) continue
      fresh.push(q)
      usedTexts.push(q.questionText)
    }
    // Diversity filtering left the cell short — top it up rather than under-fill the test.
    for (const q of pool) {
      if (fresh.length >= need) break
      if (!fresh.includes(q)) fresh.push(q)
    }
    for (const q of fresh) take(q, false)
  }

  // Present in the designed mix's cell order, shuffled within each cell.
  const ordered: PersonalityQuestion[] = []
  for (const key of mixOrder) ordered.push(...shuffle(picked.filter((q) => cellKey(q) === key)))
  for (const q of picked) if (!ordered.includes(q)) ordered.push(q)

  // 4. validity-scale items spread evenly through the scale-item block
  const sd = shuffle(validity).slice(0, VALIDITY_ITEMS_PER_TEST)
  const scaleIdx = ordered.map((q, i) => (SCALE_TYPES.has(q.questionType) ? i : -1)).filter((i) => i >= 0)
  const start = scaleIdx.length > 0 ? scaleIdx[0] : 0
  const span = scaleIdx.length > 0 ? scaleIdx[scaleIdx.length - 1] - start + 1 : 0
  const result = [...ordered]
  sd.forEach((q, i) => {
    const pos = start + Math.round(((i + 1) * span) / (sd.length + 1)) + i
    result.splice(Math.min(pos, result.length), 0, q)
  })

  return { ids: result.map((q) => q.id), uncovered, validityItemCount: sd.length }
}
