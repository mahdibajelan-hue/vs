import type { useMaterialStore } from '../../store/useMaterialStore'
import type { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { buildPositions, type MatData } from './model'
import { itemProgress, rollup } from './progress'

type MatState = Pick<ReturnType<typeof useMaterialStore.getState>, 'materials' | 'purchaseOrders' | 'poLines' | 'manufacturing' | 'shipmentLines' | 'warehouseLines' | 'warehouseReceipts' | 'allocations'>
type CtlState = Pick<ReturnType<typeof useMaterialControlStore.getState>, 'packages' | 'items' | 'stages' | 'txns'>

/**
 * One project's material positions and its value-weighted procurement progress — the single computation behind the
 * material module's own figures (useMaterialModel), the radar and the project list. Pure: stores in, numbers out.
 */
export function materialCore(ms: MatState, cs: CtlState, projectId: string | null, today = new Date().toISOString().slice(0, 10)) {
  const materials = ms.materials.filter((m) => m.masterProjectId === projectId)
  const mIds = new Set(materials.map((m) => m.id))
  const pos = ms.purchaseOrders.filter((p) => p.masterProjectId === projectId)
  const poIds = new Set(pos.map((p) => p.id))
  const poLines = ms.poLines.filter((l) => poIds.has(l.poId))
  const lineIds = new Set(poLines.map((l) => l.id))
  const receipts = new Set(ms.warehouseReceipts.filter((r) => r.masterProjectId === projectId).map((r) => r.id))
  const packages = cs.packages.filter((p) => p.masterProjectId === projectId)
  const pkgIds = new Set(packages.map((p) => p.id))
  const items = cs.items.filter((i) => pkgIds.has(i.packageId))
  const itemIds = new Set(items.map((i) => i.id))
  const stages = cs.stages.filter((s) => itemIds.has(s.itemId))
  const data: MatData = {
    materials, purchaseOrders: pos, poLines, manufacturing: ms.manufacturing.filter((m) => lineIds.has(m.poLineId)),
    shipmentLines: ms.shipmentLines.filter((l) => mIds.has(l.materialId)), warehouseLines: ms.warehouseLines.filter((l) => receipts.has(l.receiptId)),
    allocations: ms.allocations.filter((a) => a.masterProjectId === projectId), txns: cs.txns.filter((t) => t.masterProjectId === projectId), packages, packageItems: items,
  }
  const positions = buildPositions(data)
  const progressRows = items.map((i) => itemProgress(i, stages, today, materials.find((m) => m.id === i.materialId)?.fxRate ?? 1, positions.get(i.materialId)))
  return { today, materials, pos, poLines, packages, items, stages, data, positions, progressRows, progress: rollup(progressRows) }
}
