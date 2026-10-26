/**
 * The project's EPC physical progress, in one place. Engineering, procurement and construction each come from their own
 * module's computation (engineering documents, material packages, approved daily reports — see engCore / materialCore /
 * executionCore); this only weights them together. The weights are the Stage-Gate client report's E/P/C weights when the
 * project has them, equal shares otherwise; a discipline with no data in its module is left out and the others are
 * re-weighted, so a missing module never drags the figure toward zero. All values are percentages 0…100.
 */
export interface Discipline { actual: number; planned: number | null }
export interface EpcWeights { e: number; p: number; c: number }
export interface EpcProgress {
  eng: Discipline | null
  proc: Discipline | null
  cons: Discipline | null
  weights: EpcWeights
  /** where the E/P/C weights came from: each module's own value (rial), the client report, or equal shares */
  weightSource?: 'value' | 'report' | 'equal'
  /** each discipline's value in rial when the weights are value-based */
  values?: EpcWeights
  /** weighted over the disciplines that have data; null when none has */
  overall: { actual: number; planned: number | null } | null
}

export const EQUAL_EPC_WEIGHTS: EpcWeights = { e: 1, p: 1, c: 1 }

export function combineEpc(parts: { eng: Discipline | null; proc: Discipline | null; cons: Discipline | null }, weights: EpcWeights = EQUAL_EPC_WEIGHTS): EpcProgress {
  const list = ([[parts.eng, weights.e], [parts.proc, weights.p], [parts.cons, weights.c]] as const)
    .filter((x): x is readonly [Discipline, number] => !!x[0] && x[1] > 0)
  const w = list.reduce((s, [, k]) => s + k, 0)
  if (!list.length || w <= 0) return { ...parts, weights, overall: null }
  const actual = list.reduce((s, [d, k]) => s + d.actual * k, 0) / w
  // planned only when every counted discipline has a plan — a partial plan would understate it
  const planned = list.every(([d]) => d.planned != null) ? list.reduce((s, [d, k]) => s + (d.planned as number) * k, 0) / w : null
  return { ...parts, weights, overall: { actual, planned } }
}

/** E/P/C weights from a Stage-Gate client report row (progress_*_weight columns); equal shares when absent or all zero. */
export function weightsFromReport(r: Record<string, unknown> | null | undefined): EpcWeights {
  if (!r) return EQUAL_EPC_WEIGHTS
  const n = (k: string) => Number(r[k]) || 0
  const e = n('progress_engineering_weight'), p = n('progress_procurement_weight'), c = n('progress_construction_weight')
  return e + p + c > 0 ? { e, p, c } : EQUAL_EPC_WEIGHTS
}
