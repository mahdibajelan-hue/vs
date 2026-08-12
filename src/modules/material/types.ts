export type MtoRevisionStatus = 'draft' | 'issued' | 'superseded'

export const MTO_REVISION_STATUSES: MtoRevisionStatus[] = ['draft', 'issued', 'superseded']

export const MTO_REVISION_STATUS_LABEL_FA: Record<MtoRevisionStatus, string> = {
  draft: 'پیش‌نویس',
  issued: 'صادرشده',
  superseded: 'جایگزین‌شده',
}

export interface MtoRevision {
  id: string
  masterProjectId: string
  revisionNumber: string
  revisionDate: string
  status: MtoRevisionStatus
  notes: string
  createdBy: string | null
  createdAt: string
}

export type CommodityType = 'pipe' | 'fitting' | 'valve' | 'flange' | 'gasket' | 'bolt_nut' | 'instrument' | 'equipment' | 'support' | 'other'

export const COMMODITY_TYPES: CommodityType[] = ['pipe', 'fitting', 'valve', 'flange', 'gasket', 'bolt_nut', 'instrument', 'equipment', 'support', 'other']

export const COMMODITY_TYPE_LABEL_FA: Record<CommodityType, string> = {
  pipe: 'لوله',
  fitting: 'اتصالات',
  valve: 'شیرآلات',
  flange: 'فلنج',
  gasket: 'گسکت',
  bolt_nut: 'پیچ و مهره',
  instrument: 'ابزاردقیق',
  equipment: 'تجهیزات',
  support: 'ساپورت',
  other: 'سایر',
}

export interface Material {
  id: string
  masterProjectId: string
  mtoRevisionId: string | null
  lineNo: string
  materialCode: string
  description: string
  commodityType: CommodityType
  spec: string
  size: string
  rating: string
  unit: string
  facility: string
  area: string
  systemName: string
  pidNumber: string
  pidRevision: string
  tagNumber: string
  mtoQuantity: number
  unitWeightKg: number
  unitPrice: number
  currency: string
  /** Generated column: mtoQuantity * unitWeightKg. */
  totalWeightKg: number
  /** Generated column: mtoQuantity * unitPrice. */
  totalValue: number
  isConstructionBlocking: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type ProcurementRequestStatus = 'draft' | 'mr_issued' | 'rfq_sent' | 'under_evaluation' | 'awarded' | 'cancelled'

export const PROCUREMENT_REQUEST_STATUSES: ProcurementRequestStatus[] = ['draft', 'mr_issued', 'rfq_sent', 'under_evaluation', 'awarded', 'cancelled']

export const PROCUREMENT_REQUEST_STATUS_LABEL_FA: Record<ProcurementRequestStatus, string> = {
  draft: 'پیش‌نویس',
  mr_issued: 'درخواست خرید صادرشده (MR)',
  rfq_sent: 'استعلام ارسال‌شده (RFQ)',
  under_evaluation: 'در حال ارزیابی',
  awarded: 'واگذارشده',
  cancelled: 'لغوشده',
}

export const PROCUREMENT_REQUEST_STATUS_COLOR: Record<ProcurementRequestStatus, string> = {
  draft: '#64748b',
  mr_issued: '#38bdf8',
  rfq_sent: '#a78bfa',
  under_evaluation: '#f59e0b',
  awarded: '#2ecc71',
  cancelled: '#e74c3c',
}

export interface ProcurementRequest {
  id: string
  masterProjectId: string
  mrNumber: string
  mrDate: string
  status: ProcurementRequestStatus
  supplierOrgId: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ProcurementLine {
  id: string
  requestId: string
  materialId: string
  quantityRequested: number
}

export type PoStatus = 'draft' | 'issued' | 'active' | 'completed' | 'cancelled'

export const PO_STATUSES: PoStatus[] = ['draft', 'issued', 'active', 'completed', 'cancelled']

export const PO_STATUS_LABEL_FA: Record<PoStatus, string> = {
  draft: 'پیش‌نویس',
  issued: 'صادرشده',
  active: 'فعال',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
}

export const PO_STATUS_COLOR: Record<PoStatus, string> = {
  draft: '#64748b',
  issued: '#38bdf8',
  active: '#2ecc71',
  completed: '#a78bfa',
  cancelled: '#e74c3c',
}

export interface PurchaseOrder {
  id: string
  masterProjectId: string
  requestId: string | null
  poNumber: string
  poDate: string
  supplierOrgId: string | null
  currency: string
  status: PoStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PoLine {
  id: string
  poId: string
  materialId: string
  quantityOrdered: number
  unitPrice: number
  plannedDeliveryDate: string | null
}

export type ManufacturingStatus = 'not_started' | 'in_progress' | 'fat_scheduled' | 'fat_passed' | 'fat_failed' | 'ready_for_shipment'

export const MANUFACTURING_STATUSES: ManufacturingStatus[] = ['not_started', 'in_progress', 'fat_scheduled', 'fat_passed', 'fat_failed', 'ready_for_shipment']

export const MANUFACTURING_STATUS_LABEL_FA: Record<ManufacturingStatus, string> = {
  not_started: 'شروع‌نشده',
  in_progress: 'در حال ساخت',
  fat_scheduled: 'تست کارخانه‌ای زمان‌بندی‌شده (FAT)',
  fat_passed: 'FAT موفق',
  fat_failed: 'FAT ناموفق',
  ready_for_shipment: 'آماده ارسال',
}

export const MANUFACTURING_STATUS_COLOR: Record<ManufacturingStatus, string> = {
  not_started: '#64748b',
  in_progress: '#38bdf8',
  fat_scheduled: '#f59e0b',
  fat_passed: '#a78bfa',
  fat_failed: '#e74c3c',
  ready_for_shipment: '#2ecc71',
}

export interface Manufacturing {
  id: string
  poLineId: string
  status: ManufacturingStatus
  isLongLead: boolean
  plannedReadyDate: string | null
  actualReadyDate: string | null
  fatDate: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ReleaseNote {
  id: string
  masterProjectId: string
  releaseNumber: string
  releaseDate: string
  poId: string | null
  notes: string
  createdAt: string
}

export interface ReleaseLine {
  id: string
  releaseId: string
  materialId: string
  quantityReleased: number
}

export type ShipmentStatus = 'planned' | 'in_transit' | 'customs' | 'delivered'

export const SHIPMENT_STATUSES: ShipmentStatus[] = ['planned', 'in_transit', 'customs', 'delivered']

export const SHIPMENT_STATUS_LABEL_FA: Record<ShipmentStatus, string> = {
  planned: 'برنامه‌ریزی‌شده',
  in_transit: 'در حال حمل',
  customs: 'ترخیص گمرکی',
  delivered: 'تحویل‌شده',
}

export const SHIPMENT_STATUS_COLOR: Record<ShipmentStatus, string> = {
  planned: '#64748b',
  in_transit: '#38bdf8',
  customs: '#f59e0b',
  delivered: '#2ecc71',
}

export interface Shipment {
  id: string
  masterProjectId: string
  shipmentNumber: string
  shipmentDate: string
  carrier: string
  trackingRef: string
  origin: string
  destination: string
  status: ShipmentStatus
  eta: string | null
  ata: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ShipmentLine {
  id: string
  shipmentId: string
  materialId: string
  quantityShipped: number
}

export interface WarehouseReceipt {
  id: string
  masterProjectId: string
  receiptNumber: string
  receiptDate: string
  shipmentId: string | null
  warehouseLocation: string
  notes: string
  createdAt: string
}

export type WarehouseLineCondition = 'ok' | 'damaged' | 'shortage'

export const WAREHOUSE_LINE_CONDITION_LABEL_FA: Record<WarehouseLineCondition, string> = {
  ok: 'سالم',
  damaged: 'آسیب‌دیده',
  shortage: 'کسری',
}

export interface WarehouseLine {
  id: string
  receiptId: string
  materialId: string
  quantityReceived: number
  condition: WarehouseLineCondition
}

export type AllocationStatus = 'allocated' | 'consumed' | 'returned'

export const ALLOCATION_STATUSES: AllocationStatus[] = ['allocated', 'consumed', 'returned']

export const ALLOCATION_STATUS_LABEL_FA: Record<AllocationStatus, string> = {
  allocated: 'تخصیص‌یافته',
  consumed: 'مصرف‌شده',
  returned: 'مرجوع‌شده',
}

export interface Allocation {
  id: string
  masterProjectId: string
  materialId: string
  workPackageCode: string
  workPackageName: string
  quantityAllocated: number
  quantityConsumed: number
  allocationDate: string
  status: AllocationStatus
  notes: string
  createdAt: string
  updatedAt: string
}
