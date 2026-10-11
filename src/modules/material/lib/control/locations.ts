import type { MtlTxn, WarehouseLine, WarehouseReceipt } from '../../types'

export interface LocationStock { location: string; materialId: string; qty: number }

/**
 * Stock per place of keeping. Accepted receipts add to the place named on the receipt; a transfer moves quantity from one place to another;
 * issues, scrap and negative adjustments take from the place named on the voucher (blank = the place the item is mostly kept); returns and positive adjustments add to it.
 */
export function stockByLocation(a: { receipts: WarehouseReceipt[]; lines: WarehouseLine[]; txns: MtlTxn[] }): LocationStock[] {
  const loc = new Map<string, number>()
  const key = (l: string, m: string) => `${l || 'بدون محل'}\u0000${m}`
  const add = (l: string, m: string, q: number) => loc.set(key(l, m), (loc.get(key(l, m)) ?? 0) + q)
  const place = new Map(a.receipts.map((r) => [r.id, r.warehouseLocation]))
  for (const w of a.lines) if (w.condition === 'ok' && w.inspectionStatus === 'accepted') add(place.get(w.receiptId) ?? '', w.materialId, w.quantityReceived)
  const main = (m: string): string => { let best = '', q = -1; for (const [k, v] of loc) { const [l, id] = k.split('\u0000'); if (id === m && v > q) { best = l; q = v } } return best }
  for (const t of a.txns) {
    if (t.status !== 'posted') continue
    if (t.kind === 'transfer') { add(t.fromLoc || main(t.materialId), t.materialId, -t.qty); add(t.toLoc, t.materialId, t.qty) }
    else if (t.kind === 'issue' || t.kind === 'scrap' || (t.kind === 'adjust' && t.adjustSign === -1)) add(t.fromLoc || main(t.materialId), t.materialId, -t.qty)
    else if (t.kind === 'return' || (t.kind === 'adjust' && t.adjustSign === 1)) add(t.toLoc || main(t.materialId), t.materialId, t.qty)
  }
  return [...loc.entries()].map(([k, qty]) => { const [location, materialId] = k.split('\u0000'); return { location, materialId, qty } }).filter((r) => Math.abs(r.qty) > 1e-9)
}
