import type { Allocation, Manufacturing, Material, MtlPackage, MtlTxn, PackageItem, PoLine, PurchaseOrder, ShipmentLine, WarehouseLine } from '../../types'

/** Everything the quantity model reads. All of it comes from transactions — nothing here is a stored total. */
export interface MatData {
  materials: Material[]
  purchaseOrders: PurchaseOrder[]
  poLines: PoLine[]
  manufacturing: Manufacturing[]
  shipmentLines: ShipmentLine[]
  warehouseLines: WarehouseLine[]
  allocations: Allocation[]
  txns: MtlTxn[]
  packages?: MtlPackage[]
  packageItems?: PackageItem[]
}

const ACTIVE_PO = new Set(['issued', 'active', 'completed'])
const MAKING = new Set(['not_started', 'in_progress', 'fat_scheduled', 'fat_failed'])
const READY = new Set(['fat_passed', 'ready_for_shipment'])

export interface Position {
  materialId: string
  unit: string
  /** contract (base) quantity, the design quantity if any, and what the site is going to need */
  contractQty: number
  detailQty: number | null
  requiredQty: number
  /** design minus contract; null when there is no design quantity */
  diffQty: number | null
  packaged: number
  ordered: number
  inManufacturing: number
  readyToShip: number
  shipped: number
  /** everything that physically arrived, and the part of it that is usable / waiting / rejected / short */
  received: number
  accepted: number
  quarantine: number
  rejected: number
  shortReceived: number
  allocated: number
  issued: number
  returned: number
  scrapped: number
  adjusted: number
  netConsumed: number
  /** physical stock that is usable now */
  onHand: number
  reserved: number
  available: number
  /** ordered but not yet at site (never counted as stock) */
  inbound: number
  inTransit: number
  /** order still missing against the requirement */
  orderGap: number
  /** what the site still needs and does not have: needed − consumed − on hand */
  siteGap: number
  /** part of the site gap that no inbound order covers */
  uncoveredGap: number
  excess: number
  /** values in the base currency (quantity × price × rate) */
  baseValue: number
  orderedValue: number
  receivedValue: number
  consumedValue: number
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)
const group = <T,>(xs: T[], key: (x: T) => string | null | undefined) => {
  const m = new Map<string, T[]>()
  for (const x of xs) { const k = key(x); if (!k) continue; const a = m.get(k); if (a) a.push(x); else m.set(k, [x]) }
  return m
}
const EMPTY: never[] = []

export function buildPositions(d: MatData): Map<string, Position> {
  const poById = new Map(d.purchaseOrders.map((p) => [p.id, p]))
  const mfgByLine = new Map(d.manufacturing.map((m) => [m.poLineId, m]))
  const pkgActive = new Set((d.packages ?? []).filter((p) => p.status !== 'cancelled').map((p) => p.id))
  const lines = group(d.poLines.filter((l) => ACTIVE_PO.has(poById.get(l.poId)?.status ?? '')), (l) => l.materialId)
  const ship = group(d.shipmentLines, (l) => l.materialId)
  const wh = group(d.warehouseLines, (l) => l.materialId)
  const al = group(d.allocations.filter((a) => a.status !== 'returned'), (a) => a.materialId)
  const tx = group(d.txns.filter((t) => t.status === 'posted'), (t) => t.materialId)
  const pk = group((d.packageItems ?? []).filter((i) => pkgActive.has(i.packageId)), (i) => i.materialId)
  const out = new Map<string, Position>()
  for (const m of d.materials) {
    const L = lines.get(m.id) ?? EMPTY, S = ship.get(m.id) ?? EMPTY, W = wh.get(m.id) ?? EMPTY, A = al.get(m.id) ?? EMPTY, T = tx.get(m.id) ?? EMPTY, P = pk.get(m.id) ?? EMPTY
    const contractQty = m.contractQty ?? m.mtoQuantity ?? 0
    const detailQty = m.detailQty
    const requiredQty = detailQty ?? contractQty
    const ordered = sum(L, (l) => l.quantityOrdered)
    const shipped = sum(S, (l) => l.quantityShipped)
    const received = sum(W, (l) => l.quantityReceived)
    const accepted = sum(W.filter((l) => l.condition === 'ok' && l.inspectionStatus === 'accepted'), (l) => l.quantityReceived)
    const quarantine = sum(W.filter((l) => l.condition === 'ok' && (l.inspectionStatus === 'pending' || l.inspectionStatus === 'quarantine')), (l) => l.quantityReceived)
    const rejected = sum(W.filter((l) => l.condition === 'damaged' || l.inspectionStatus === 'rejected'), (l) => l.quantityReceived)
    const shortReceived = sum(W.filter((l) => l.condition === 'shortage'), (l) => l.quantityReceived)
    const making = sum(L.filter((l) => MAKING.has(mfgByLine.get(l.id)?.status ?? 'not_started')), (l) => l.quantityOrdered)
    const ready = sum(L.filter((l) => READY.has(mfgByLine.get(l.id)?.status ?? '')), (l) => l.quantityOrdered)
    const allocated = sum(A, (a) => a.quantityAllocated)
    const issued = sum(T.filter((t) => t.kind === 'issue'), (t) => t.qty)
    const returned = sum(T.filter((t) => t.kind === 'return'), (t) => t.qty)
    const scrapped = sum(T.filter((t) => t.kind === 'scrap'), (t) => t.qty)
    const adjusted = sum(T.filter((t) => t.kind === 'adjust'), (t) => t.qty * (t.adjustSign ?? 1))
    const netConsumed = Math.max(0, issued - returned)
    const onHand = Math.max(0, accepted - issued + returned - scrapped + adjusted)
    const reserved = Math.min(onHand, Math.max(0, allocated - netConsumed))
    const inbound = Math.max(0, ordered - received)
    const siteGap = Math.max(0, requiredQty - netConsumed - onHand)
    const uncoveredGap = Math.max(0, siteGap - inbound)
    const covered = netConsumed + onHand + inbound
    const price = m.unitPrice * (m.fxRate || 1)
    out.set(m.id, {
      materialId: m.id, unit: m.unit, contractQty, detailQty, requiredQty, diffQty: detailQty == null ? null : detailQty - contractQty,
      packaged: sum(P, (i) => i.qty), ordered, inManufacturing: Math.min(making, Math.max(0, ordered - shipped)), readyToShip: Math.min(ready, Math.max(0, ordered - shipped)), shipped,
      received, accepted, quarantine, rejected, shortReceived, allocated, issued, returned, scrapped, adjusted, netConsumed, onHand, reserved, available: onHand - reserved,
      inbound, inTransit: Math.max(0, shipped - received), orderGap: Math.max(0, requiredQty - ordered), siteGap, uncoveredGap, excess: requiredQty > 0 ? Math.max(0, covered - requiredQty) : 0,
      baseValue: contractQty * price, orderedValue: ordered * price, receivedValue: received * price, consumedValue: netConsumed * price,
    })
  }
  return out
}
