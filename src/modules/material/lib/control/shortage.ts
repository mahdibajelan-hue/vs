import type { Material } from '../../types'
import type { Position } from './model'

/** Where a work front's item stands: ready in the site store, ordered and on its way, or short (not ordered / ordered too little). */
export type LineStatus = 'ready' | 'inbound' | 'late' | 'partial' | 'not_ordered'
export type FrontVerdict = 'ready' | 'in_transit' | 'blocked'
export type FrontBy = 'facility' | 'area' | 'front' | 'usage'

export interface ShortageLine {
  materialId: string; itemUid: string; lineNo: string; code: string; description: string; unit: string
  required: number; consumed: number; onHand: number; inbound: number; gap: number; uncovered: number
  status: LineStatus; eta: string | null; needDate: string | null
}
export interface FrontReadiness {
  key: string; label: string; items: number; ready: number; inTransit: number; short: number
  verdict: FrontVerdict; lines: ShortageLine[]
}

export const FRONT_BY_LABEL_FA: Record<FrontBy, string> = { facility: 'ایستگاه / تأسیسات', area: 'بخش اجرایی (مثلاً عبور از جاده)', front: 'جبهه کاری', usage: 'محل مصرف' }
export const LINE_STATUS_LABEL_FA: Record<LineStatus, string> = { ready: 'آماده در انبار', inbound: 'سفارش‌شده، در راه', late: 'در راه ولی دیرتر از نیاز', partial: 'سفارش ناقص', not_ordered: 'بدون سفارش' }
export const VERDICT_LABEL_FA: Record<FrontVerdict, string> = { ready: 'می‌توان شروع کرد', in_transit: 'منتظر رسیدن اقلام', blocked: 'کسری دارد؛ شروع نکنید' }

const keyOf = (m: Material, by: FrontBy): string => ((by === 'facility' ? m.facility : by === 'area' ? m.area : by === 'front' ? m.front : m.usageLocation) || '').trim()

/**
 * Whether a work front can start: every item with a requirement must be in the site store (net of what was already consumed) — or at least fully covered by an order that arrives before it is needed.
 * A front is «blocked» when any item is not ordered, ordered too little, or arrives after the need date; «in transit» when everything missing is covered by orders on time; «ready» when nothing is missing.
 */
export function shortageByFront(a: { materials: Material[]; positions: Map<string, Position>; arrival: Map<string, string | null>; by: FrontBy }): FrontReadiness[] {
  const buckets = new Map<string, ShortageLine[]>()
  for (const m of a.materials) {
    const p = a.positions.get(m.id)
    if (!p || p.requiredQty <= 0) continue
    const eta = a.arrival.get(m.id) ?? null
    let status: LineStatus
    if (p.siteGap <= 0) status = 'ready'
    else if (p.uncoveredGap > 0) status = p.ordered > 0 ? 'partial' : 'not_ordered'
    else status = eta && m.needDate && eta > m.needDate ? 'late' : 'inbound'
    const line: ShortageLine = { materialId: m.id, itemUid: m.itemUid, lineNo: m.lineNo, code: m.materialCode, description: m.description, unit: m.unit, required: p.requiredQty, consumed: p.netConsumed, onHand: p.onHand, inbound: p.inbound, gap: p.siteGap, uncovered: p.uncoveredGap, status, eta, needDate: m.needDate }
    const k = keyOf(m, a.by) || '—'
    const arr = buckets.get(k)
    if (arr) arr.push(line); else buckets.set(k, [line])
  }
  const order: Record<LineStatus, number> = { not_ordered: 0, partial: 1, late: 2, inbound: 3, ready: 4 }
  return [...buckets.entries()].map(([key, lines]) => {
    lines.sort((x, y) => order[x.status] - order[y.status] || (x.needDate ?? '9').localeCompare(y.needDate ?? '9'))
    const ready = lines.filter((l) => l.status === 'ready').length
    const hard = lines.filter((l) => l.status === 'not_ordered' || l.status === 'partial' || l.status === 'late').length
    const inTransit = lines.filter((l) => l.status === 'inbound').length
    const verdict: FrontVerdict = hard > 0 ? 'blocked' : inTransit > 0 ? 'in_transit' : 'ready'
    return { key, label: key === '—' ? 'بدون مشخص‌کردن محل' : key, items: lines.length, ready, inTransit, short: hard, verdict, lines }
  }).sort((x, y) => y.short - x.short || y.inTransit - x.inTransit || x.label.localeCompare(y.label, 'fa'))
}
