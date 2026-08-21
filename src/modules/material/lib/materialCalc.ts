import type { Allocation, Manufacturing, Material, PoLine, PurchaseOrder, ReleaseLine, ShipmentLine, WarehouseLine } from '../types'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const ACTIVE_PO_STATUSES = new Set(['issued', 'active', 'completed'])
const MANUFACTURING_READY_STATUSES = new Set(['fat_passed', 'ready_for_shipment'])

/** Full status-chain quantities for one material — every number here is summed from a transaction table, never stored. */
export interface MaterialStatus {
  materialId: string
  mtoQuantity: number
  ordered: number
  manufacturedReady: number
  released: number
  shipped: number
  received: number
  receivedOk: number
  receivedDamaged: number
  receivedShortage: number
  inTransit: number
  allocated: number
  consumed: number
  /** In warehouse (received OK) and not yet allocated to a work package. */
  available: number
  /** Allocated to a work package but not yet consumed/installed. */
  reserved: number
  /** Still needed against the MTO quantity (mtoQuantity - consumed). */
  remaining: number
  /** Forecast gap: MTO need not covered by what's already received or in transit. */
  shortageQuantity: number
  isShort: boolean
}

export function computeMaterialStatus(
  material: Material,
  poLines: PoLine[],
  purchaseOrders: PurchaseOrder[],
  manufacturing: Manufacturing[],
  releaseLines: ReleaseLine[],
  shipmentLines: ShipmentLine[],
  warehouseLines: WarehouseLine[],
  allocations: Allocation[],
): MaterialStatus {
  const poById = new Map(purchaseOrders.map((p) => [p.id, p]))
  const myPoLines = poLines.filter((l) => l.materialId === material.id)
  const ordered = myPoLines.filter((l) => ACTIVE_PO_STATUSES.has(poById.get(l.poId)?.status ?? '')).reduce((sum, l) => sum + l.quantityOrdered, 0)

  const manufacturingByPoLine = new Map(manufacturing.map((m) => [m.poLineId, m]))
  const manufacturedReady = myPoLines
    .filter((l) => MANUFACTURING_READY_STATUSES.has(manufacturingByPoLine.get(l.id)?.status ?? ''))
    .reduce((sum, l) => sum + l.quantityOrdered, 0)

  const released = releaseLines.filter((l) => l.materialId === material.id).reduce((sum, l) => sum + l.quantityReleased, 0)
  const shipped = shipmentLines.filter((l) => l.materialId === material.id).reduce((sum, l) => sum + l.quantityShipped, 0)

  const myWarehouseLines = warehouseLines.filter((l) => l.materialId === material.id)
  const receivedOk = myWarehouseLines.filter((l) => l.condition === 'ok').reduce((sum, l) => sum + l.quantityReceived, 0)
  const receivedDamaged = myWarehouseLines.filter((l) => l.condition === 'damaged').reduce((sum, l) => sum + l.quantityReceived, 0)
  const receivedShortage = myWarehouseLines.filter((l) => l.condition === 'shortage').reduce((sum, l) => sum + l.quantityReceived, 0)
  const received = receivedOk + receivedDamaged + receivedShortage
  const inTransit = Math.max(0, shipped - received)

  const myAllocations = allocations.filter((a) => a.materialId === material.id && a.status !== 'returned')
  const allocated = myAllocations.reduce((sum, a) => sum + a.quantityAllocated, 0)
  const consumed = myAllocations.reduce((sum, a) => sum + a.quantityConsumed, 0)

  const available = Math.max(0, receivedOk - allocated)
  const reserved = Math.max(0, allocated - consumed)
  const remaining = Math.max(0, material.mtoQuantity - consumed)
  const shortageQuantity = Math.max(0, material.mtoQuantity - (received + inTransit))

  return {
    materialId: material.id,
    mtoQuantity: material.mtoQuantity,
    ordered,
    manufacturedReady,
    released,
    shipped,
    received,
    receivedOk,
    receivedDamaged,
    receivedShortage,
    inTransit,
    allocated,
    consumed,
    available,
    reserved,
    remaining,
    shortageQuantity,
    isShort: shortageQuantity > 0 || material.isConstructionBlocking,
  }
}

/** Days a manufacturing item is behind its planned-ready date — null once actually ready, or if no plan/delay. */
export function manufacturingDelayDays(plannedReadyDate: string | null, actualReadyDate: string | null, status: string, today = todayIso()): number | null {
  if (actualReadyDate) return null
  if (!plannedReadyDate || plannedReadyDate >= today) return null
  if (status === 'fat_passed' || status === 'ready_for_shipment') return null
  return Math.round((Date.parse(today) - Date.parse(plannedReadyDate)) / 86400000)
}

export interface ProjectMaterialSummary {
  materialCount: number
  totalMtoWeightKg: number
  totalMtoValue: number
  totalOrdered: number
  totalManufacturedReady: number
  totalShipped: number
  totalReceived: number
  totalAllocated: number
  totalConsumed: number
  procurementProgressPct: number
  manufacturingProgressPct: number
  shippedProgressPct: number
  receivedProgressPct: number
  allocatedProgressPct: number
  consumedProgressPct: number
  shortMaterialCount: number
  blockingMaterialCount: number
  longLeadOpenCount: number
  overdueManufacturingCount: number
}

export function computeProjectMaterialSummary(
  materials: Material[],
  poLines: PoLine[],
  purchaseOrders: PurchaseOrder[],
  manufacturing: Manufacturing[],
  releaseLines: ReleaseLine[],
  shipmentLines: ShipmentLine[],
  warehouseLines: WarehouseLine[],
  allocations: Allocation[],
  today = todayIso(),
): ProjectMaterialSummary {
  const statuses = materials.map((m) => computeMaterialStatus(m, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations))

  const totalMto = statuses.reduce((sum, s) => sum + s.mtoQuantity, 0)
  const totalOrdered = statuses.reduce((sum, s) => sum + s.ordered, 0)
  const totalManufacturedReady = statuses.reduce((sum, s) => sum + s.manufacturedReady, 0)
  const totalShipped = statuses.reduce((sum, s) => sum + s.shipped, 0)
  const totalReceived = statuses.reduce((sum, s) => sum + s.received, 0)
  const totalAllocated = statuses.reduce((sum, s) => sum + s.allocated, 0)
  const totalConsumed = statuses.reduce((sum, s) => sum + s.consumed, 0)

  const pct = (num: number, den: number) => (den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0)

  const longLeadOpenCount = manufacturing.filter((m) => m.isLongLead && !MANUFACTURING_READY_STATUSES.has(m.status)).length
  const overdueManufacturingCount = manufacturing.filter((m) => manufacturingDelayDays(m.plannedReadyDate, m.actualReadyDate, m.status, today) != null).length

  return {
    materialCount: materials.length,
    totalMtoWeightKg: materials.reduce((sum, m) => sum + m.totalWeightKg, 0),
    totalMtoValue: materials.reduce((sum, m) => sum + m.totalValue, 0),
    totalOrdered,
    totalManufacturedReady,
    totalShipped,
    totalReceived,
    totalAllocated,
    totalConsumed,
    procurementProgressPct: pct(totalOrdered, totalMto),
    manufacturingProgressPct: pct(totalManufacturedReady, totalOrdered),
    shippedProgressPct: pct(totalShipped, totalOrdered),
    receivedProgressPct: pct(totalReceived, totalShipped),
    allocatedProgressPct: pct(totalAllocated, totalReceived),
    consumedProgressPct: pct(totalConsumed, totalMto),
    shortMaterialCount: statuses.filter((s) => s.isShort).length,
    blockingMaterialCount: materials.filter((m) => m.isConstructionBlocking).length,
    longLeadOpenCount,
    overdueManufacturingCount,
  }
}
