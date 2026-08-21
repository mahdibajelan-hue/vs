import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type {
  Allocation,
  Manufacturing,
  Material,
  MtoRevision,
  PoLine,
  ProcurementLine,
  ProcurementRequest,
  PurchaseOrder,
  ReleaseLine,
  ReleaseNote,
  Shipment,
  ShipmentLine,
  WarehouseLine,
  WarehouseLineCondition,
  WarehouseReceipt,
} from '../types'
import {
  allocationFromRow,
  allocationToRow,
  manufacturingFromRow,
  manufacturingToRow,
  materialFromRow,
  materialToRow,
  mtoRevisionFromRow,
  mtoRevisionToRow,
  poLineFromRow,
  poLineToRow,
  procurementLineFromRow,
  procurementLineToRow,
  procurementRequestFromRow,
  procurementRequestToRow,
  purchaseOrderFromRow,
  purchaseOrderToRow,
  releaseLineFromRow,
  releaseLineToRow,
  releaseNoteFromRow,
  releaseNoteToRow,
  shipmentFromRow,
  shipmentLineFromRow,
  shipmentLineToRow,
  shipmentToRow,
  warehouseLineFromRow,
  warehouseLineToRow,
  warehouseReceiptFromRow,
  warehouseReceiptToRow,
} from '../lib/materialData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

/**
 * Fetch-all-then-filter, same pattern as Master Data/Finance — the whole material chain for
 * every project is fetched once and filtered/aggregated client-side, since the Dashboard and
 * the shortage/readiness calculations need the full picture of every stage anyway.
 */
interface MaterialState {
  mtoRevisions: MtoRevision[]
  materials: Material[]
  procurementRequests: ProcurementRequest[]
  procurementLines: ProcurementLine[]
  purchaseOrders: PurchaseOrder[]
  poLines: PoLine[]
  manufacturing: Manufacturing[]
  releaseNotes: ReleaseNote[]
  releaseLines: ReleaseLine[]
  shipments: Shipment[]
  shipmentLines: ShipmentLine[]
  warehouseReceipts: WarehouseReceipt[]
  warehouseLines: WarehouseLine[]
  allocations: Allocation[]
  loading: boolean
  loaded: boolean

  fetchAll: () => Promise<void>

  createMtoRevision: (masterProjectId: string, data: Partial<MtoRevision>) => Promise<string | null>
  updateMtoRevision: (id: string, data: Partial<MtoRevision>) => Promise<void>
  deleteMtoRevision: (id: string) => Promise<void>

  createMaterial: (masterProjectId: string, data: Partial<Material>) => Promise<string | null>
  bulkCreateMaterials: (masterProjectId: string, rows: Partial<Material>[]) => Promise<void>
  updateMaterial: (id: string, data: Partial<Material>) => Promise<void>
  deleteMaterial: (id: string) => Promise<void>

  createProcurementRequest: (masterProjectId: string, data: Partial<ProcurementRequest>) => Promise<string | null>
  updateProcurementRequest: (id: string, data: Partial<ProcurementRequest>) => Promise<void>
  deleteProcurementRequest: (id: string) => Promise<void>
  addProcurementLine: (requestId: string, materialId: string, quantityRequested: number) => Promise<void>
  deleteProcurementLine: (id: string) => Promise<void>

  createPurchaseOrder: (masterProjectId: string, data: Partial<PurchaseOrder>) => Promise<string | null>
  updatePurchaseOrder: (id: string, data: Partial<PurchaseOrder>) => Promise<void>
  deletePurchaseOrder: (id: string) => Promise<void>
  addPoLine: (poId: string, data: Partial<PoLine>) => Promise<void>
  deletePoLine: (id: string) => Promise<void>

  upsertManufacturing: (poLineId: string, data: Partial<Manufacturing>) => Promise<void>

  createReleaseNote: (masterProjectId: string, data: Partial<ReleaseNote>) => Promise<string | null>
  deleteReleaseNote: (id: string) => Promise<void>
  addReleaseLine: (releaseId: string, materialId: string, quantityReleased: number) => Promise<void>
  deleteReleaseLine: (id: string) => Promise<void>

  createShipment: (masterProjectId: string, data: Partial<Shipment>) => Promise<string | null>
  updateShipment: (id: string, data: Partial<Shipment>) => Promise<void>
  deleteShipment: (id: string) => Promise<void>
  addShipmentLine: (shipmentId: string, materialId: string, quantityShipped: number) => Promise<void>
  deleteShipmentLine: (id: string) => Promise<void>

  createWarehouseReceipt: (masterProjectId: string, data: Partial<WarehouseReceipt>) => Promise<string | null>
  deleteWarehouseReceipt: (id: string) => Promise<void>
  addWarehouseLine: (receiptId: string, materialId: string, quantityReceived: number, condition: WarehouseLineCondition) => Promise<void>
  deleteWarehouseLine: (id: string) => Promise<void>

  createAllocation: (masterProjectId: string, data: Partial<Allocation>) => Promise<void>
  updateAllocation: (id: string, data: Partial<Allocation>) => Promise<void>
  deleteAllocation: (id: string) => Promise<void>
  recordConsumption: (id: string, additionalQuantity: number) => Promise<void>
}

export const useMaterialStore = create<MaterialState>()((set, get) => ({
  mtoRevisions: [],
  materials: [],
  procurementRequests: [],
  procurementLines: [],
  purchaseOrders: [],
  poLines: [],
  manufacturing: [],
  releaseNotes: [],
  releaseLines: [],
  shipments: [],
  shipmentLines: [],
  warehouseReceipts: [],
  warehouseLines: [],
  allocations: [],
  loading: false,
  loaded: false,

  fetchAll: async () => {
    set({ loading: true })
    const [
      { data: revisions, error: e1 },
      { data: materials, error: e2 },
      { data: requests, error: e3 },
      { data: reqLines, error: e4 },
      { data: pos, error: e5 },
      { data: poLines, error: e6 },
      { data: manufacturing, error: e7 },
      { data: releaseNotes, error: e8 },
      { data: releaseLines, error: e9 },
      { data: shipments, error: e10 },
      { data: shipmentLines, error: e11 },
      { data: receipts, error: e12 },
      { data: whLines, error: e13 },
      { data: allocations, error: e14 },
    ] = await Promise.all([
      supabase.from('mtl_mto_revisions').select('*').order('revision_date', { ascending: false }),
      supabase.from('mtl_materials').select('*').order('line_no'),
      supabase.from('mtl_procurement_requests').select('*').order('mr_date', { ascending: false }),
      supabase.from('mtl_procurement_lines').select('*'),
      supabase.from('mtl_purchase_orders').select('*').order('po_date', { ascending: false }),
      supabase.from('mtl_po_lines').select('*'),
      supabase.from('mtl_manufacturing').select('*'),
      supabase.from('mtl_release_notes').select('*').order('release_date', { ascending: false }),
      supabase.from('mtl_release_lines').select('*'),
      supabase.from('mtl_shipments').select('*').order('shipment_date', { ascending: false }),
      supabase.from('mtl_shipment_lines').select('*'),
      supabase.from('mtl_warehouse_receipts').select('*').order('receipt_date', { ascending: false }),
      supabase.from('mtl_warehouse_lines').select('*'),
      supabase.from('mtl_allocations').select('*').order('allocation_date', { ascending: false }),
    ])
    const firstError = e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6 ?? e7 ?? e8 ?? e9 ?? e10 ?? e11 ?? e12 ?? e13 ?? e14
    if (reportError('بارگذاری داده‌های تامین کالا', firstError)) {
      set({ loading: false })
      return
    }
    set({
      mtoRevisions: (revisions ?? []).map(mtoRevisionFromRow),
      materials: (materials ?? []).map(materialFromRow),
      procurementRequests: (requests ?? []).map(procurementRequestFromRow),
      procurementLines: (reqLines ?? []).map(procurementLineFromRow),
      purchaseOrders: (pos ?? []).map(purchaseOrderFromRow),
      poLines: (poLines ?? []).map(poLineFromRow),
      manufacturing: (manufacturing ?? []).map(manufacturingFromRow),
      releaseNotes: (releaseNotes ?? []).map(releaseNoteFromRow),
      releaseLines: (releaseLines ?? []).map(releaseLineFromRow),
      shipments: (shipments ?? []).map(shipmentFromRow),
      shipmentLines: (shipmentLines ?? []).map(shipmentLineFromRow),
      warehouseReceipts: (receipts ?? []).map(warehouseReceiptFromRow),
      warehouseLines: (whLines ?? []).map(warehouseLineFromRow),
      allocations: (allocations ?? []).map(allocationFromRow),
      loading: false,
      loaded: true,
    })
  },

  createMtoRevision: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_mto_revisions').insert(mtoRevisionToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد ریویژن MTO', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updateMtoRevision: async (id, data) => {
    const { error } = await supabase.from('mtl_mto_revisions').update(mtoRevisionToRow('', data)).eq('id', id)
    if (reportError('ویرایش ریویژن MTO', error)) return
    await get().fetchAll()
  },
  deleteMtoRevision: async (id) => {
    const { error } = await supabase.from('mtl_mto_revisions').delete().eq('id', id)
    if (reportError('حذف ریویژن MTO', error)) return
    set((s) => ({ mtoRevisions: s.mtoRevisions.filter((r) => r.id !== id) }))
  },

  createMaterial: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_materials').insert(materialToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد کالا', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  bulkCreateMaterials: async (masterProjectId, rows) => {
    const { error } = await supabase.from('mtl_materials').insert(rows.map((r) => materialToRow(masterProjectId, r)))
    if (reportError('وارد کردن فهرست کالا', error)) return
    await get().fetchAll()
  },
  updateMaterial: async (id, data) => {
    const { error } = await supabase.from('mtl_materials').update(materialToRow(null, data)).eq('id', id)
    if (reportError('ویرایش کالا', error)) return
    await get().fetchAll()
  },
  deleteMaterial: async (id) => {
    const { error } = await supabase.from('mtl_materials').delete().eq('id', id)
    if (reportError('حذف کالا', error)) return
    set((s) => ({ materials: s.materials.filter((m) => m.id !== id) }))
  },

  createProcurementRequest: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_procurement_requests').insert(procurementRequestToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد درخواست خرید', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updateProcurementRequest: async (id, data) => {
    const { error } = await supabase.from('mtl_procurement_requests').update(procurementRequestToRow(null, data)).eq('id', id)
    if (reportError('ویرایش درخواست خرید', error)) return
    await get().fetchAll()
  },
  deleteProcurementRequest: async (id) => {
    const { error } = await supabase.from('mtl_procurement_requests').delete().eq('id', id)
    if (reportError('حذف درخواست خرید', error)) return
    set((s) => ({ procurementRequests: s.procurementRequests.filter((r) => r.id !== id) }))
  },
  addProcurementLine: async (requestId, materialId, quantityRequested) => {
    const { error } = await supabase.from('mtl_procurement_lines').insert(procurementLineToRow(requestId, materialId, quantityRequested))
    if (reportError('افزودن قلم درخواست خرید', error)) return
    await get().fetchAll()
  },
  deleteProcurementLine: async (id) => {
    const { error } = await supabase.from('mtl_procurement_lines').delete().eq('id', id)
    if (reportError('حذف قلم درخواست خرید', error)) return
    set((s) => ({ procurementLines: s.procurementLines.filter((l) => l.id !== id) }))
  },

  createPurchaseOrder: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_purchase_orders').insert(purchaseOrderToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد سفارش خرید', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updatePurchaseOrder: async (id, data) => {
    const { error } = await supabase.from('mtl_purchase_orders').update(purchaseOrderToRow(null, data)).eq('id', id)
    if (reportError('ویرایش سفارش خرید', error)) return
    await get().fetchAll()
  },
  deletePurchaseOrder: async (id) => {
    const { error } = await supabase.from('mtl_purchase_orders').delete().eq('id', id)
    if (reportError('حذف سفارش خرید', error)) return
    set((s) => ({ purchaseOrders: s.purchaseOrders.filter((p) => p.id !== id) }))
  },
  addPoLine: async (poId, data) => {
    const { error } = await supabase.from('mtl_po_lines').insert(poLineToRow(poId, data))
    if (reportError('افزودن قلم سفارش خرید', error)) return
    await get().fetchAll()
  },
  deletePoLine: async (id) => {
    const { error } = await supabase.from('mtl_po_lines').delete().eq('id', id)
    if (reportError('حذف قلم سفارش خرید', error)) return
    set((s) => ({ poLines: s.poLines.filter((l) => l.id !== id) }))
  },

  upsertManufacturing: async (poLineId, data) => {
    const existing = get().manufacturing.find((m) => m.poLineId === poLineId)
    const { error } = existing
      ? await supabase.from('mtl_manufacturing').update(manufacturingToRow(null, data)).eq('id', existing.id)
      : await supabase.from('mtl_manufacturing').insert(manufacturingToRow(poLineId, data))
    if (reportError('ثبت وضعیت ساخت', error)) return
    await get().fetchAll()
  },

  createReleaseNote: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_release_notes').insert(releaseNoteToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد حواله ارسال', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  deleteReleaseNote: async (id) => {
    const { error } = await supabase.from('mtl_release_notes').delete().eq('id', id)
    if (reportError('حذف حواله ارسال', error)) return
    set((s) => ({ releaseNotes: s.releaseNotes.filter((r) => r.id !== id) }))
  },
  addReleaseLine: async (releaseId, materialId, quantityReleased) => {
    const { error } = await supabase.from('mtl_release_lines').insert(releaseLineToRow(releaseId, materialId, quantityReleased))
    if (reportError('افزودن قلم حواله', error)) return
    await get().fetchAll()
  },
  deleteReleaseLine: async (id) => {
    const { error } = await supabase.from('mtl_release_lines').delete().eq('id', id)
    if (reportError('حذف قلم حواله', error)) return
    set((s) => ({ releaseLines: s.releaseLines.filter((l) => l.id !== id) }))
  },

  createShipment: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_shipments').insert(shipmentToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد محموله', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updateShipment: async (id, data) => {
    const { error } = await supabase.from('mtl_shipments').update(shipmentToRow(null, data)).eq('id', id)
    if (reportError('ویرایش محموله', error)) return
    await get().fetchAll()
  },
  deleteShipment: async (id) => {
    const { error } = await supabase.from('mtl_shipments').delete().eq('id', id)
    if (reportError('حذف محموله', error)) return
    set((s) => ({ shipments: s.shipments.filter((sh) => sh.id !== id) }))
  },
  addShipmentLine: async (shipmentId, materialId, quantityShipped) => {
    const { error } = await supabase.from('mtl_shipment_lines').insert(shipmentLineToRow(shipmentId, materialId, quantityShipped))
    if (reportError('افزودن قلم محموله', error)) return
    await get().fetchAll()
  },
  deleteShipmentLine: async (id) => {
    const { error } = await supabase.from('mtl_shipment_lines').delete().eq('id', id)
    if (reportError('حذف قلم محموله', error)) return
    set((s) => ({ shipmentLines: s.shipmentLines.filter((l) => l.id !== id) }))
  },

  createWarehouseReceipt: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('mtl_warehouse_receipts').insert(warehouseReceiptToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد رسید انبار', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  deleteWarehouseReceipt: async (id) => {
    const { error } = await supabase.from('mtl_warehouse_receipts').delete().eq('id', id)
    if (reportError('حذف رسید انبار', error)) return
    set((s) => ({ warehouseReceipts: s.warehouseReceipts.filter((r) => r.id !== id) }))
  },
  addWarehouseLine: async (receiptId, materialId, quantityReceived, condition) => {
    const { error } = await supabase.from('mtl_warehouse_lines').insert(warehouseLineToRow(receiptId, materialId, quantityReceived, condition))
    if (reportError('افزودن قلم رسید انبار', error)) return
    await get().fetchAll()
  },
  deleteWarehouseLine: async (id) => {
    const { error } = await supabase.from('mtl_warehouse_lines').delete().eq('id', id)
    if (reportError('حذف قلم رسید انبار', error)) return
    set((s) => ({ warehouseLines: s.warehouseLines.filter((l) => l.id !== id) }))
  },

  createAllocation: async (masterProjectId, data) => {
    const { error } = await supabase.from('mtl_allocations').insert(allocationToRow(masterProjectId, data))
    if (reportError('ایجاد تخصیص کالا', error)) return
    await get().fetchAll()
  },
  updateAllocation: async (id, data) => {
    const { error } = await supabase.from('mtl_allocations').update(allocationToRow(null, data)).eq('id', id)
    if (reportError('ویرایش تخصیص کالا', error)) return
    await get().fetchAll()
  },
  deleteAllocation: async (id) => {
    const { error } = await supabase.from('mtl_allocations').delete().eq('id', id)
    if (reportError('حذف تخصیص کالا', error)) return
    set((s) => ({ allocations: s.allocations.filter((a) => a.id !== id) }))
  },
  recordConsumption: async (id, additionalQuantity) => {
    const existing = get().allocations.find((a) => a.id === id)
    if (!existing) return
    const quantityConsumed = existing.quantityConsumed + additionalQuantity
    const status = quantityConsumed >= existing.quantityAllocated ? 'consumed' : existing.status
    const { error } = await supabase.from('mtl_allocations').update(allocationToRow(null, { quantityConsumed, status })).eq('id', id)
    if (reportError('ثبت مصرف کالا', error)) return
    await get().fetchAll()
  },
}))
