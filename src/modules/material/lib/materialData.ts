import type {
  Allocation,
  AllocationStatus,
  CommodityType,
  Manufacturing,
  ManufacturingStatus,
  Material,
  MtoRevision,
  MtoRevisionStatus,
  PoLine,
  PoStatus,
  ProcurementLine,
  ProcurementRequest,
  ProcurementRequestStatus,
  PurchaseOrder,
  ReleaseLine,
  ReleaseNote,
  Shipment,
  ShipmentLine,
  ShipmentStatus,
  WarehouseLine,
  WarehouseLineCondition,
  WarehouseReceipt,
} from '../types'

interface MtoRevisionRow {
  id: string
  master_project_id: string
  revision_number: string
  revision_date: string
  status: string
  notes: string
  created_by: string | null
  created_at: string
}

export function mtoRevisionFromRow(r: MtoRevisionRow): MtoRevision {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    revisionNumber: r.revision_number,
    revisionDate: r.revision_date,
    status: r.status as MtoRevisionStatus,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export function mtoRevisionToRow(masterProjectId: string, r: Partial<MtoRevision>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (r.revisionNumber !== undefined) row.revision_number = r.revisionNumber
  if (r.revisionDate !== undefined) row.revision_date = r.revisionDate
  if (r.status !== undefined) row.status = r.status
  if (r.notes !== undefined) row.notes = r.notes
  return row
}

interface MaterialRow {
  id: string
  master_project_id: string
  mto_revision_id: string | null
  line_no: string
  material_code: string
  description: string
  commodity_type: string
  spec: string
  size: string
  rating: string
  unit: string
  facility: string
  area: string
  system_name: string
  pid_number: string
  pid_revision: string
  tag_number: string
  mto_quantity: number
  unit_weight_kg: number
  unit_price: number
  currency: string
  total_weight_kg: number
  total_value: number
  is_construction_blocking: boolean
  notes: string
  created_at: string
  updated_at: string
}

export function materialFromRow(r: MaterialRow): Material {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    mtoRevisionId: r.mto_revision_id,
    lineNo: r.line_no,
    materialCode: r.material_code,
    description: r.description,
    commodityType: r.commodity_type as CommodityType,
    spec: r.spec,
    size: r.size,
    rating: r.rating,
    unit: r.unit,
    facility: r.facility,
    area: r.area,
    systemName: r.system_name,
    pidNumber: r.pid_number,
    pidRevision: r.pid_revision,
    tagNumber: r.tag_number,
    mtoQuantity: Number(r.mto_quantity),
    unitWeightKg: Number(r.unit_weight_kg),
    unitPrice: Number(r.unit_price),
    currency: r.currency,
    totalWeightKg: Number(r.total_weight_kg),
    totalValue: Number(r.total_value),
    isConstructionBlocking: r.is_construction_blocking,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** masterProjectId is only written when provided (insert) — omit it on update so it's never overwritten to a blank value. */
export function materialToRow(masterProjectId: string | null, m: Partial<Material>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (m.mtoRevisionId !== undefined) row.mto_revision_id = m.mtoRevisionId || null
  if (m.lineNo !== undefined) row.line_no = m.lineNo
  if (m.materialCode !== undefined) row.material_code = m.materialCode
  if (m.description !== undefined) row.description = m.description
  if (m.commodityType !== undefined) row.commodity_type = m.commodityType
  if (m.spec !== undefined) row.spec = m.spec
  if (m.size !== undefined) row.size = m.size
  if (m.rating !== undefined) row.rating = m.rating
  if (m.unit !== undefined) row.unit = m.unit
  if (m.facility !== undefined) row.facility = m.facility
  if (m.area !== undefined) row.area = m.area
  if (m.systemName !== undefined) row.system_name = m.systemName
  if (m.pidNumber !== undefined) row.pid_number = m.pidNumber
  if (m.pidRevision !== undefined) row.pid_revision = m.pidRevision
  if (m.tagNumber !== undefined) row.tag_number = m.tagNumber
  if (m.mtoQuantity !== undefined) row.mto_quantity = m.mtoQuantity
  if (m.unitWeightKg !== undefined) row.unit_weight_kg = m.unitWeightKg
  if (m.unitPrice !== undefined) row.unit_price = m.unitPrice
  if (m.currency !== undefined) row.currency = m.currency
  if (m.isConstructionBlocking !== undefined) row.is_construction_blocking = m.isConstructionBlocking
  if (m.notes !== undefined) row.notes = m.notes
  return row
}

interface ProcurementRequestRow {
  id: string
  master_project_id: string
  mr_number: string
  mr_date: string
  status: string
  supplier_org_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function procurementRequestFromRow(r: ProcurementRequestRow): ProcurementRequest {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    mrNumber: r.mr_number,
    mrDate: r.mr_date,
    status: r.status as ProcurementRequestStatus,
    supplierOrgId: r.supplier_org_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function procurementRequestToRow(masterProjectId: string | null, r: Partial<ProcurementRequest>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (r.mrNumber !== undefined) row.mr_number = r.mrNumber
  if (r.mrDate !== undefined) row.mr_date = r.mrDate
  if (r.status !== undefined) row.status = r.status
  if (r.supplierOrgId !== undefined) row.supplier_org_id = r.supplierOrgId || null
  if (r.notes !== undefined) row.notes = r.notes
  return row
}

interface ProcurementLineRow {
  id: string
  request_id: string
  material_id: string
  quantity_requested: number
}

export function procurementLineFromRow(r: ProcurementLineRow): ProcurementLine {
  return { id: r.id, requestId: r.request_id, materialId: r.material_id, quantityRequested: Number(r.quantity_requested) }
}

export function procurementLineToRow(requestId: string, materialId: string, quantityRequested: number) {
  return { request_id: requestId, material_id: materialId, quantity_requested: quantityRequested }
}

interface PurchaseOrderRow {
  id: string
  master_project_id: string
  request_id: string | null
  po_number: string
  po_date: string
  supplier_org_id: string | null
  currency: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export function purchaseOrderFromRow(r: PurchaseOrderRow): PurchaseOrder {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    requestId: r.request_id,
    poNumber: r.po_number,
    poDate: r.po_date,
    supplierOrgId: r.supplier_org_id,
    currency: r.currency,
    status: r.status as PoStatus,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function purchaseOrderToRow(masterProjectId: string | null, p: Partial<PurchaseOrder>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (p.requestId !== undefined) row.request_id = p.requestId || null
  if (p.poNumber !== undefined) row.po_number = p.poNumber
  if (p.poDate !== undefined) row.po_date = p.poDate
  if (p.supplierOrgId !== undefined) row.supplier_org_id = p.supplierOrgId || null
  if (p.currency !== undefined) row.currency = p.currency
  if (p.status !== undefined) row.status = p.status
  if (p.notes !== undefined) row.notes = p.notes
  return row
}

interface PoLineRow {
  id: string
  po_id: string
  material_id: string
  quantity_ordered: number
  unit_price: number
  planned_delivery_date: string | null
}

export function poLineFromRow(r: PoLineRow): PoLine {
  return {
    id: r.id,
    poId: r.po_id,
    materialId: r.material_id,
    quantityOrdered: Number(r.quantity_ordered),
    unitPrice: Number(r.unit_price),
    plannedDeliveryDate: r.planned_delivery_date,
  }
}

export function poLineToRow(poId: string, l: Partial<PoLine>) {
  const row: Record<string, unknown> = { po_id: poId }
  if (l.materialId !== undefined) row.material_id = l.materialId
  if (l.quantityOrdered !== undefined) row.quantity_ordered = l.quantityOrdered
  if (l.unitPrice !== undefined) row.unit_price = l.unitPrice
  if (l.plannedDeliveryDate !== undefined) row.planned_delivery_date = l.plannedDeliveryDate || null
  return row
}

interface ManufacturingRow {
  id: string
  po_line_id: string
  status: string
  is_long_lead: boolean
  planned_ready_date: string | null
  actual_ready_date: string | null
  fat_date: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function manufacturingFromRow(r: ManufacturingRow): Manufacturing {
  return {
    id: r.id,
    poLineId: r.po_line_id,
    status: r.status as ManufacturingStatus,
    isLongLead: r.is_long_lead,
    plannedReadyDate: r.planned_ready_date,
    actualReadyDate: r.actual_ready_date,
    fatDate: r.fat_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function manufacturingToRow(poLineId: string | null, m: Partial<Manufacturing>) {
  const row: Record<string, unknown> = {}
  if (poLineId) row.po_line_id = poLineId
  if (m.status !== undefined) row.status = m.status
  if (m.isLongLead !== undefined) row.is_long_lead = m.isLongLead
  if (m.plannedReadyDate !== undefined) row.planned_ready_date = m.plannedReadyDate || null
  if (m.actualReadyDate !== undefined) row.actual_ready_date = m.actualReadyDate || null
  if (m.fatDate !== undefined) row.fat_date = m.fatDate || null
  if (m.notes !== undefined) row.notes = m.notes
  return row
}

interface ReleaseNoteRow {
  id: string
  master_project_id: string
  release_number: string
  release_date: string
  po_id: string | null
  notes: string
  created_at: string
}

export function releaseNoteFromRow(r: ReleaseNoteRow): ReleaseNote {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    releaseNumber: r.release_number,
    releaseDate: r.release_date,
    poId: r.po_id,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export function releaseNoteToRow(masterProjectId: string, r: Partial<ReleaseNote>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (r.releaseNumber !== undefined) row.release_number = r.releaseNumber
  if (r.releaseDate !== undefined) row.release_date = r.releaseDate
  if (r.poId !== undefined) row.po_id = r.poId || null
  if (r.notes !== undefined) row.notes = r.notes
  return row
}

interface ReleaseLineRow {
  id: string
  release_id: string
  material_id: string
  quantity_released: number
}

export function releaseLineFromRow(r: ReleaseLineRow): ReleaseLine {
  return { id: r.id, releaseId: r.release_id, materialId: r.material_id, quantityReleased: Number(r.quantity_released) }
}

export function releaseLineToRow(releaseId: string, materialId: string, quantityReleased: number) {
  return { release_id: releaseId, material_id: materialId, quantity_released: quantityReleased }
}

interface ShipmentRow {
  id: string
  master_project_id: string
  shipment_number: string
  shipment_date: string
  carrier: string
  tracking_ref: string
  origin: string
  destination: string
  status: string
  eta: string | null
  ata: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function shipmentFromRow(r: ShipmentRow): Shipment {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    shipmentNumber: r.shipment_number,
    shipmentDate: r.shipment_date,
    carrier: r.carrier,
    trackingRef: r.tracking_ref,
    origin: r.origin,
    destination: r.destination,
    status: r.status as ShipmentStatus,
    eta: r.eta,
    ata: r.ata,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function shipmentToRow(masterProjectId: string | null, s: Partial<Shipment>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (s.shipmentNumber !== undefined) row.shipment_number = s.shipmentNumber
  if (s.shipmentDate !== undefined) row.shipment_date = s.shipmentDate
  if (s.carrier !== undefined) row.carrier = s.carrier
  if (s.trackingRef !== undefined) row.tracking_ref = s.trackingRef
  if (s.origin !== undefined) row.origin = s.origin
  if (s.destination !== undefined) row.destination = s.destination
  if (s.status !== undefined) row.status = s.status
  if (s.eta !== undefined) row.eta = s.eta || null
  if (s.ata !== undefined) row.ata = s.ata || null
  if (s.notes !== undefined) row.notes = s.notes
  return row
}

interface ShipmentLineRow {
  id: string
  shipment_id: string
  material_id: string
  quantity_shipped: number
}

export function shipmentLineFromRow(r: ShipmentLineRow): ShipmentLine {
  return { id: r.id, shipmentId: r.shipment_id, materialId: r.material_id, quantityShipped: Number(r.quantity_shipped) }
}

export function shipmentLineToRow(shipmentId: string, materialId: string, quantityShipped: number) {
  return { shipment_id: shipmentId, material_id: materialId, quantity_shipped: quantityShipped }
}

interface WarehouseReceiptRow {
  id: string
  master_project_id: string
  receipt_number: string
  receipt_date: string
  shipment_id: string | null
  warehouse_location: string
  notes: string
  created_at: string
}

export function warehouseReceiptFromRow(r: WarehouseReceiptRow): WarehouseReceipt {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    receiptNumber: r.receipt_number,
    receiptDate: r.receipt_date,
    shipmentId: r.shipment_id,
    warehouseLocation: r.warehouse_location,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export function warehouseReceiptToRow(masterProjectId: string, r: Partial<WarehouseReceipt>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (r.receiptNumber !== undefined) row.receipt_number = r.receiptNumber
  if (r.receiptDate !== undefined) row.receipt_date = r.receiptDate
  if (r.shipmentId !== undefined) row.shipment_id = r.shipmentId || null
  if (r.warehouseLocation !== undefined) row.warehouse_location = r.warehouseLocation
  if (r.notes !== undefined) row.notes = r.notes
  return row
}

interface WarehouseLineRow {
  id: string
  receipt_id: string
  material_id: string
  quantity_received: number
  condition: string
}

export function warehouseLineFromRow(r: WarehouseLineRow): WarehouseLine {
  return { id: r.id, receiptId: r.receipt_id, materialId: r.material_id, quantityReceived: Number(r.quantity_received), condition: r.condition as WarehouseLineCondition }
}

export function warehouseLineToRow(receiptId: string, materialId: string, quantityReceived: number, condition: WarehouseLineCondition) {
  return { receipt_id: receiptId, material_id: materialId, quantity_received: quantityReceived, condition }
}

interface AllocationRow {
  id: string
  master_project_id: string
  material_id: string
  work_package_code: string
  work_package_name: string
  quantity_allocated: number
  quantity_consumed: number
  allocation_date: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export function allocationFromRow(r: AllocationRow): Allocation {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    materialId: r.material_id,
    workPackageCode: r.work_package_code,
    workPackageName: r.work_package_name,
    quantityAllocated: Number(r.quantity_allocated),
    quantityConsumed: Number(r.quantity_consumed),
    allocationDate: r.allocation_date,
    status: r.status as AllocationStatus,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function allocationToRow(masterProjectId: string | null, a: Partial<Allocation>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (a.materialId !== undefined) row.material_id = a.materialId
  if (a.workPackageCode !== undefined) row.work_package_code = a.workPackageCode
  if (a.workPackageName !== undefined) row.work_package_name = a.workPackageName
  if (a.quantityAllocated !== undefined) row.quantity_allocated = a.quantityAllocated
  if (a.quantityConsumed !== undefined) row.quantity_consumed = a.quantityConsumed
  if (a.allocationDate !== undefined) row.allocation_date = a.allocationDate
  if (a.status !== undefined) row.status = a.status
  if (a.notes !== undefined) row.notes = a.notes
  return row
}
