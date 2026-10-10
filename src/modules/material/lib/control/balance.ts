import type { Material, MtlGroup, MtlSettings } from '../../types'
import type { Position } from './model'

export interface BalanceRow {
  key: string
  label: string
  unit: string
  /** false when items with different units were added together — quantities are then left out and only values are meaningful */
  sameUnit: boolean
  contractQty: number
  detailQty: number
  designVsContract: number
  ordered: number
  delivered: number
  accepted: number
  allocated: number
  consumed: number
  returned: number
  scrapped: number
  rejected: number
  onHand: number
  excess: number
  shortage: number
  contractValue: number
  shortageValue: number
  excessValue: number
  consumedValue: number
  unexplained: string[]
}

/** Things that do not add up and nobody has explained: negative stock, more allocated than ever accepted, more received than ordered, use beyond the requirement. */
export function unexplained(p: Position): string[] {
  const out: string[] = []
  const eps = 1e-6
  if (p.issued + p.scrapped - p.returned - p.adjusted > p.accepted + eps) out.push('مصرف و ضایعات بیش از کالای پذیرفته‌شده ثبت شده است')
  if (p.allocated > p.accepted + p.inbound + eps && p.allocated > 0) out.push('تخصیص بیش از مجموع پذیرفته‌شده و در راه است')
  if (p.ordered > 0 && p.received > p.ordered + eps) out.push('کالای رسیده بیش از سفارش است')
  if (p.requiredQty > 0 && p.netConsumed > p.requiredQty + eps) out.push('مصرف بیش از مقدار موردنیاز طراحی است')
  if (p.quarantine > 0) out.push('کالا در انتظار بازرسی یا قرنطینه است')
  return out
}

/** Balance per item (dimension 'item') or rolled up by group, station, front, or the whole project. */
export function balanceBy(a: { materials: Material[]; positions: Map<string, Position>; groups: MtlGroup[]; by: 'item' | 'group' | 'station' | 'front' | 'project'; settings?: MtlSettings }): BalanceRow[] {
  const groupTitle = new Map(a.groups.map((g) => [g.id, g.title]))
  const rows = new Map<string, BalanceRow & { units: Set<string> }>()
  for (const m of a.materials) {
    const p = a.positions.get(m.id)
    if (!p) continue
    const [key, label] = a.by === 'item' ? [m.id, `${m.materialCode || m.lineNo || ''} ${m.description}`.trim()]
      : a.by === 'group' ? [m.groupId ?? '—', groupTitle.get(m.groupId ?? '') ?? 'بدون گروه']
      : a.by === 'station' ? [m.facility || '—', m.facility || 'بدون ایستگاه']
      : a.by === 'front' ? [m.front || '—', m.front || 'بدون جبهه'] : ['all', 'کل پروژه']
    const price = m.unitPrice * (m.fxRate || 1)
    const r = rows.get(key) ?? { key, label, unit: m.unit, sameUnit: true, units: new Set<string>(), contractQty: 0, detailQty: 0, designVsContract: 0, ordered: 0, delivered: 0, accepted: 0, allocated: 0, consumed: 0, returned: 0, scrapped: 0, rejected: 0, onHand: 0, excess: 0, shortage: 0, contractValue: 0, shortageValue: 0, excessValue: 0, consumedValue: 0, unexplained: [] }
    r.units.add(m.unit)
    r.contractQty += p.contractQty; r.detailQty += p.detailQty ?? p.contractQty; r.designVsContract += p.diffQty ?? 0
    r.ordered += p.ordered; r.delivered += p.received; r.accepted += p.accepted; r.allocated += p.allocated; r.consumed += p.netConsumed; r.returned += p.returned; r.scrapped += p.scrapped; r.rejected += p.rejected
    r.onHand += p.onHand; r.excess += p.excess; r.shortage += p.siteGap
    r.contractValue += p.baseValue; r.shortageValue += p.siteGap * price; r.excessValue += p.excess * price; r.consumedValue += p.consumedValue
    if (a.by === 'item') r.unexplained = unexplained(p)
    else for (const u of unexplained(p)) if (!r.unexplained.includes(u)) r.unexplained.push(u)
    rows.set(key, r)
  }
  return [...rows.values()].map(({ units, ...r }) => ({ ...r, unit: units.size === 1 ? [...units][0] : '', sameUnit: units.size <= 1 })).sort((x, y) => y.contractValue - x.contractValue)
}
