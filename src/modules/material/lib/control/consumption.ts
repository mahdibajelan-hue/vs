import type { Material, MtlGroup, MtlNorm, MtlSettings, MtlTxn } from '../../types'

export interface ConsumptionRow {
  key: string
  materialId: string
  workOp: string
  actual: number
  activityQty: number
  /** quantity the norm allows for the recorded activity; null when no norm applies */
  expected: number | null
  deviation: number | null
  deviationPct: number | null
  over: boolean
}

/** A norm written for the item itself wins over the one written for its group; the operation must match (an empty operation in the norm applies to every operation). */
export function normFor(m: Material, op: string, norms: MtlNorm[]): MtlNorm | null {
  const fits = (n: MtlNorm) => !n.workOp || n.workOp === op
  return norms.find((n) => n.materialId === m.id && fits(n) && n.workOp === op) ?? norms.find((n) => n.materialId === m.id && fits(n))
    ?? (m.groupId ? norms.find((n) => !n.materialId && n.groupId === m.groupId && fits(n) && n.workOp === op) ?? norms.find((n) => !n.materialId && n.groupId === m.groupId && fits(n)) : null) ?? null
}

/** Actual use (issues minus returns) against the norm for the activity recorded with each issue, per item and operation. */
export function consumptionReport(a: { materials: Material[]; groups: MtlGroup[]; norms: MtlNorm[]; txns: MtlTxn[]; settings: MtlSettings; from?: string; to?: string; contractorId?: string; front?: string; facility?: string }): ConsumptionRow[] {
  const consumableGroups = new Set(a.groups.filter((g) => g.isConsumable).map((g) => g.id))
  const matById = new Map(a.materials.map((m) => [m.id, m]))
  const rows = new Map<string, ConsumptionRow>()
  for (const t of a.txns) {
    if (t.status !== 'posted' || (t.kind !== 'issue' && t.kind !== 'return')) continue
    if (a.from && t.txnDate < a.from) continue
    if (a.to && t.txnDate > a.to) continue
    if (a.contractorId && t.contractorOrgId !== a.contractorId) continue
    if (a.front && t.front !== a.front) continue
    if (a.facility && t.facility !== a.facility) continue
    const m = matById.get(t.materialId)
    if (!m || !(consumableGroups.has(m.groupId ?? '') || a.norms.some((n) => n.materialId === m.id))) continue
    const key = `${m.id}|${t.workOp}`
    const r = rows.get(key) ?? { key, materialId: m.id, workOp: t.workOp, actual: 0, activityQty: 0, expected: null, deviation: null, deviationPct: null, over: false }
    const sign = t.kind === 'issue' ? 1 : -1
    r.actual += sign * t.qty
    if (t.kind === 'issue' && t.activityQty != null) r.activityQty += t.activityQty
    rows.set(key, r)
  }
  for (const r of rows.values()) {
    const m = matById.get(r.materialId)!
    const n = normFor(m, r.workOp, a.norms)
    if (n && r.activityQty > 0) {
      r.expected = r.activityQty * n.qtyPerUnit
      r.deviation = r.actual - r.expected
      r.deviationPct = r.expected > 0 ? (r.deviation / r.expected) * 100 : null
      r.over = r.deviationPct != null && r.deviationPct > a.settings.consumptionTolerancePct
    }
  }
  return [...rows.values()].sort((x, y) => (y.deviationPct ?? -1e9) - (x.deviationPct ?? -1e9))
}

/** Use of each item by dimension (contractor, station, front, month, operation) for the consumption reports. */
export function consumptionBy(txns: MtlTxn[], by: 'contractor' | 'facility' | 'front' | 'month' | 'op'): { key: string; qty: number }[] {
  const m = new Map<string, number>()
  for (const t of txns) {
    if (t.status !== 'posted' || (t.kind !== 'issue' && t.kind !== 'return')) continue
    const k = by === 'contractor' ? t.contractorOrgId ?? '—' : by === 'facility' ? t.facility || '—' : by === 'front' ? t.front || '—' : by === 'month' ? t.txnDate.slice(0, 7) : t.workOp || '—'
    m.set(k, (m.get(k) ?? 0) + (t.kind === 'issue' ? t.qty : -t.qty))
  }
  return [...m.entries()].map(([key, qty]) => ({ key, qty })).sort((a, b) => b.qty - a.qty)
}
