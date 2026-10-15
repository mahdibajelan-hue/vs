/**
 * MCQ scoring v2 — a TypeScript mirror of the SQL `comp_mcq_item_credit` (supabase/competency/017_mcq_item_types.sql),
 * used for previews and tests. The database is the only authority for real scores.
 * SINGLE: 1 / 0. MULTI: (hits − wrong picks) / keys, floored at 0. NUMERIC: within tolerance → 1.
 * ORDER: exact → 1, otherwise half of the concordant-pair surplus over chance (random order averages ≈ 0).
 */
export type McqItemType = 'SINGLE' | 'MULTI' | 'NUMERIC' | 'ORDER'
export const MCQ_ITEM_TYPE_LABEL_FA: Record<McqItemType, string> = {
  SINGLE: 'تک‌پاسخی', MULTI: 'چندپاسخی', NUMERIC: 'عددی', ORDER: 'ترتیب‌دهی',
}
export type McqAnswerKey = number[] | { value: number; tolPct?: number; tolAbs?: number; unit?: string } | null

export function itemCredit(type: McqItemType, key: McqAnswerKey, correct: number, chosen: number | null, answer: unknown): number {
  if (type === 'SINGLE') return chosen != null && chosen === correct ? 1 : 0
  if (type === 'MULTI') {
    if (!Array.isArray(answer) || !Array.isArray(key) || key.length === 0) return 0
    const picked = new Set((answer as unknown[]).map(Number))
    let hits = 0, wrong = 0
    for (const p of picked) (key as number[]).includes(p) ? hits++ : wrong++
    return Math.max(0, (hits - wrong) / key.length)
  }
  if (type === 'NUMERIC') {
    const k = key as { value: number; tolPct?: number; tolAbs?: number } | null
    const a = answer && typeof answer === 'object' ? Number((answer as { value?: unknown }).value) : NaN
    if (!k || !Number.isFinite(a)) return 0
    const tol = Math.max(Math.abs(k.value) * (k.tolPct ?? 1) / 100, k.tolAbs ?? 0)
    return Math.abs(a - k.value) <= tol + 1e-9 ? 1 : 0
  }
  if (!Array.isArray(answer) || answer.length !== 4 || !Array.isArray(key)) return 0
  const a = (answer as unknown[]).map(Number), k = key as number[]
  if (a.every((v, i) => v === k[i])) return 1
  let conc = 0
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (k.indexOf(a[i]) < k.indexOf(a[j])) conc++
  return Math.max(0, (conc - 3) / 3) * 0.5
}
