import type { Material, MtlGroup } from '../../types'
import type { Position } from './model'

const price = (m: Material) => m.unitPrice * (m.fxRate || 1)
const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

export interface FunnelStage { key: string; label: string; value: number }

/** Value of the requirement that has reached each step of supply, never more than the requirement itself (so an over-delivery cannot bend the funnel). */
export function supplyFunnel(materials: Material[], positions: Map<string, Position>): FunnelStage[] {
  const acc = { need: 0, packaged: 0, ordered: 0, received: 0, accepted: 0, consumed: 0 }
  for (const m of materials) {
    const p = positions.get(m.id); if (!p) continue
    const pr = price(m), cap = (q: number) => Math.min(q, p.requiredQty) * pr
    acc.need += p.requiredQty * pr; acc.packaged += cap(p.packaged); acc.ordered += cap(p.ordered); acc.received += cap(p.received); acc.accepted += cap(p.accepted); acc.consumed += cap(p.netConsumed)
  }
  return [
    { key: 'need', label: 'نیاز (طراحی/پیمان)', value: acc.need }, { key: 'packaged', label: 'در بستهٔ خرید', value: acc.packaged }, { key: 'ordered', label: 'سفارش‌شده', value: acc.ordered },
    { key: 'received', label: 'تحویل‌شده', value: acc.received }, { key: 'accepted', label: 'پذیرفته‌شده', value: acc.accepted }, { key: 'consumed', label: 'مصرف‌شده', value: acc.consumed },
  ]
}

export interface AgingBucket { key: string; label: string; count: number; value: number }

/** What the site still lacks, grouped by how soon it is needed: the longer an item is overdue the more it hurts, and the later the date the more room there is to act. */
export function needAging(materials: Material[], positions: Map<string, Position>, today: string): AgingBucket[] {
  const defs: [string, string, (d: number | null) => boolean][] = [
    ['over', 'دیرتر از نیاز', (d) => d != null && d < 0], ['d30', 'تا ۳۰ روز', (d) => d != null && d >= 0 && d <= 30], ['d60', '۳۱ تا ۶۰ روز', (d) => d != null && d > 30 && d <= 60],
    ['d90', '۶۱ تا ۹۰ روز', (d) => d != null && d > 60 && d <= 90], ['far', 'بیش از ۹۰ روز', (d) => d != null && d > 90], ['none', 'بدون تاریخ نیاز', (d) => d == null],
  ]
  const out: AgingBucket[] = defs.map(([key, label]) => ({ key, label, count: 0, value: 0 }))
  for (const m of materials) {
    const p = positions.get(m.id); if (!p || p.siteGap <= 0) continue
    const d = m.needDate ? day(m.needDate, today) : null
    const i = defs.findIndex((x) => x[2](d))
    out[i].count++; out[i].value += p.siteGap * price(m)
  }
  return out
}

export interface OrderDeadline { materialId: string; orderBy: string; daysLeft: number; gapValue: number }

/** Latest date an order can still be placed so the item arrives on its need date (need date − lead time − buffer). Only items still short of an order are listed. */
export function orderDeadlines(materials: Material[], positions: Map<string, Position>, today: string, bufferDays = 14): OrderDeadline[] {
  const out: OrderDeadline[] = []
  for (const m of materials) {
    const p = positions.get(m.id); if (!p || p.orderGap <= 0 || !m.needDate || !m.leadTimeDays) continue
    const orderBy = addDays(m.needDate, -(m.leadTimeDays + bufferDays))
    out.push({ materialId: m.id, orderBy, daysLeft: day(orderBy, today), gapValue: p.orderGap * price(m) })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export interface HeatCell { value: number; covered: number }
export interface Heat { stations: string[]; groups: { id: string; title: string }[]; cells: Map<string, HeatCell> }

/** Share of each station × material-group requirement that has physically arrived (by value). Empty combinations stay out of the map. */
export function stationGroupHeat(materials: Material[], positions: Map<string, Position>, groups: MtlGroup[]): Heat {
  const title = new Map(groups.map((g) => [g.id, g.title]))
  const cells = new Map<string, HeatCell>(); const st = new Set<string>(); const gs = new Map<string, string>()
  for (const m of materials) {
    const p = positions.get(m.id); if (!p || p.requiredQty <= 0) continue
    const s = m.facility || 'بدون ایستگاه', g = m.groupId ?? '—'
    st.add(s); gs.set(g, title.get(g) ?? 'بدون گروه')
    const k = `${s}|${g}`, c = cells.get(k) ?? { value: 0, covered: 0 }, pr = price(m)
    c.value += p.requiredQty * pr; c.covered += Math.min(p.received, p.requiredQty) * pr; cells.set(k, c)
  }
  return { stations: [...st].sort(), groups: [...gs].map(([id, t]) => ({ id, title: t })), cells }
}

export interface LeadRow { materialId: string; leadDays: number; slackDays: number | null; gapValue: number }

/** Items with an open requirement ranked by lead time, with the slack that is left (need date − today − lead time). Negative slack means the item can no longer arrive on time. */
export function leadTimeExposure(materials: Material[], positions: Map<string, Position>, today: string): LeadRow[] {
  const out: LeadRow[] = []
  for (const m of materials) {
    const p = positions.get(m.id); if (!p || p.uncoveredGap <= 0 || !m.leadTimeDays) continue
    out.push({ materialId: m.id, leadDays: m.leadTimeDays, slackDays: m.needDate ? day(m.needDate, today) - m.leadTimeDays : null, gapValue: p.uncoveredGap * price(m) })
  }
  return out.sort((a, b) => (a.slackDays ?? 1e9) - (b.slackDays ?? 1e9))
}
