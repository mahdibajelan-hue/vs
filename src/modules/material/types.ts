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
  /** System-generated unique code (MT-000123); never changes, safe to search and quote. */
  itemUid: string
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
  /** Material control: group, contract MTO vs detail-design MTO, where it is used, when it is needed. */
  groupId: string | null
  contractQty: number | null
  detailQty: number | null
  detailStatus: DetailStatus
  pipelineNo: string
  isometricNo: string
  front: string
  usageLocation: string
  needDate: string | null
  criticality: Criticality
  leadTimeDays: number | null
  priceBasis: string
  priceDate: string | null
  fxRate: number
  specRef: string
  /** What the detail-design MTO says when it differs from the contract MTO (null = same or not stated). */
  detailSpec: string | null
  detailUnit: string | null
  detailCode: string | null
  detailLocation: string | null
  isDemo: boolean
}

export type DetailStatus = 'none' | 'draft' | 'linked' | 'final'
export const DETAIL_STATUS_LABEL_FA: Record<DetailStatus, string> = { none: 'بدون طراحی تفصیلی', draft: 'پیش‌نویس', linked: 'متصل به محل مصرف', final: 'نهایی' }
export type Criticality = 'A' | 'B' | 'C'
export const CRITICALITY_LABEL_FA: Record<Criticality, string> = { A: 'بحرانی (A)', B: 'مهم (B)', C: 'عادی (C)' }

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
  packageId: string | null
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
  packageId: string | null
  isDemo: boolean
}

export interface PoLine {
  id: string
  poId: string
  materialId: string
  quantityOrdered: number
  unitPrice: number
  plannedDeliveryDate: string | null
  exceptionReason: string
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
  inspectionStatus: InspectionStatus
}

export type InspectionStatus = 'pending' | 'accepted' | 'quarantine' | 'rejected'
export const INSPECTION_STATUS_LABEL_FA: Record<InspectionStatus, string> = { pending: 'در انتظار بازرسی', accepted: 'پذیرفته‌شده', quarantine: 'قرنطینه', rejected: 'مردود' }

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
  front: string
  facility: string
}

// ───────────────────────── material control (supabase/material)
export type MeasureKind = 'count' | 'length' | 'weight' | 'volume' | 'consumable'
export interface MtlGroup { id: string; code: string; title: string; measureKind: MeasureKind; defaultUnit: string | null; isConsumable: boolean; patternId: string | null; leadTimeDays: number; criticality: Criticality; sort: number; active: boolean }
export interface MtlUnit { code: string; label: string; kind: string; baseCode: string | null; toBase: number; active: boolean }
export type ReviewLevel = 'consultant' | 'employer' | 'both'
export interface StageDef { key: string; title: string; sort: number; reviewLevel: ReviewLevel; needsEvidence: boolean; active: boolean }
export interface MtlPattern { id: string; code: string; title: string; notes: string; isDefault: boolean; active: boolean }
export interface PatternWeight { patternId: string; stageKey: string; weight: number }

export type PackageStatus = 'draft' | 'active' | 'closed' | 'cancelled'
export const PACKAGE_STATUS_LABEL_FA: Record<PackageStatus, string> = { draft: 'پیش‌نویس', active: 'فعال', closed: 'بسته‌شده', cancelled: 'لغوشده' }
export interface MtlPackage { id: string; masterProjectId: string; code: string; title: string; groupId: string | null; contractorOrgId: string | null; supplierOrgId: string | null; patternId: string | null; status: PackageStatus; plannedStart: string | null; plannedEnd: string | null; notes: string }
export interface PackageItem { id: string; packageId: string; materialId: string; qty: number; unitPrice: number; currency: string; supplierOrgId: string | null; plannedDelivery: string | null; baselineVersion: number; exceptionReason: string }

export type StageStatus = 'pending' | 'submitted' | 'reviewed' | 'approved' | 'rejected'
export const STAGE_STATUS_LABEL_FA: Record<StageStatus, string> = { pending: 'شروع‌نشده', submitted: 'ارسال‌شده', reviewed: 'بررسی‌شده', approved: 'تأییدشده', rejected: 'ردشده' }
export interface ItemStage {
  id: string; itemId: string; stageKey: string; applicable: boolean; naReason: string; weight: number
  plannedDate: string | null; actualDate: string | null; responsible: string | null; status: StageStatus
  doneQty: number | null; approvedQty: number; evidenceUrl: string; evidenceNote: string
  submittedBy: string | null; submittedAt: string | null; reviewedBy: string | null; reviewedAt: string | null; approvedBy: string | null; approvedAt: string | null; rejectReason: string
}
export interface Baseline { id: string; masterProjectId: string; version: number; note: string; priceMethod: string; currency: string; fxRate: number; baseDate: string; totalValue: number; approvedAt: string | null; approvedBy: string | null }

export type ChangeField = 'contract_qty' | 'detail_qty' | 'unit_price' | 'spec' | 'size' | 'unit' | 'material_code' | 'usage_location' | 'need_date'
export const CHANGE_FIELD_LABEL_FA: Record<ChangeField, string> = { contract_qty: 'مقدار MTO پیمان', detail_qty: 'مقدار طراحی تفصیلی', unit_price: 'قیمت واحد', spec: 'مشخصات فنی', size: 'سایز', unit: 'واحد', material_code: 'کد کالا', usage_location: 'محل مصرف', need_date: 'تاریخ نیاز' }
export interface MtlChange { id: string; masterProjectId: string; materialId: string; field: ChangeField; oldValue: string; newValue: string; reason: string; docRef: string; status: 'requested' | 'approved' | 'rejected'; requestedBy: string | null; requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string }

export type TxnKind = 'transfer' | 'issue' | 'return' | 'scrap' | 'adjust'
export const TXN_KIND_LABEL_FA: Record<TxnKind, string> = { transfer: 'انتقال', issue: 'حواله مصرف', return: 'برگشت به انبار', scrap: 'ضایعات', adjust: 'تعدیل موجودی' }
export interface MtlTxn { id: string; masterProjectId: string; materialId: string; kind: TxnKind; qty: number; adjustSign: 1 | -1 | null; txnDate: string; fromLoc: string; toLoc: string; facility: string; front: string; allocationId: string | null; workOp: string; activityQty: number | null; activityUnit: string; contractorOrgId: string | null; docRef: string; status: 'pending' | 'posted' | 'voided'; voidReason: string; notes: string; isDemo: boolean; createdBy: string | null; createdAt: string; approvedBy: string | null }
export interface MtlNorm { id: string; masterProjectId: string; materialId: string | null; groupId: string | null; workOp: string; perUnit: string; qtyPerUnit: number; notes: string }

export type DiscrepancyKind = 'not_in_contract' | 'qty_diff' | 'no_order' | 'under_ordered' | 'delay_risk' | 'unallocated' | 'spec_mismatch' | 'unit_mismatch' | 'code_mismatch' | 'location_mismatch' | 'manual'
export const DISCREPANCY_KIND_LABEL_FA: Record<DiscrepancyKind, string> = {
  not_in_contract: 'خارج از MTO پیمان', qty_diff: 'اختلاف مقدار پیمان و طراحی', no_order: 'فاقد سفارش خرید', under_ordered: 'سفارش کمتر از نیاز', delay_risk: 'احتمال تأخیر تأمین',
  unallocated: 'تأمین‌شده بدون تخصیص', spec_mismatch: 'مغایرت مشخصات فنی', unit_mismatch: 'مغایرت واحد', code_mismatch: 'مغایرت کد کالا', location_mismatch: 'مغایرت محل مصرف', manual: 'ثبت دستی',
}
export type DiscrepancyStatus = 'open' | 'in_review' | 'resolved' | 'accepted' | 'escalated' | 'cleared'
export const DISCREPANCY_STATUS_LABEL_FA: Record<DiscrepancyStatus, string> = { open: 'باز', in_review: 'در بررسی', resolved: 'برطرف‌شده', accepted: 'پذیرفته‌شده', escalated: 'ارجاع‌شده', cleared: 'خودکار برطرف‌شده' }
export interface MtlDiscrepancy { id: string; masterProjectId: string; materialId: string | null; packageId: string | null; kind: DiscrepancyKind; source: 'auto' | 'manual'; fingerprint: string; diffQty: number | null; probableCause: string; usageLocation: string; impact: string; responsible: string | null; dueDate: string | null; status: DiscrepancyStatus; resolution: string; decidedBy: string | null; decidedAt: string | null; detectedAt: string }

export interface MtlLink { id: string; masterProjectId: string; sourceType: 'material' | 'package' | 'discrepancy' | 'project' | 'risk'; sourceId: string | null; targetType: 'risk' | 'issue'; targetId: string; rel: 'raised' | 'attached' | 'realized'; label: string; createdAt: string }
export type MtlRole = 'contractor' | 'consultant' | 'employer' | 'storekeeper' | 'controller' | 'inspector' | 'manager'
export const MTL_ROLE_LABEL_FA: Record<MtlRole, string> = { contractor: 'پیمانکار', consultant: 'مشاور', employer: 'کارفرما', storekeeper: 'انباردار', controller: 'کنترل متریال', inspector: 'بازرس', manager: 'مدیر سامانه' }
export const MTL_ROLES: MtlRole[] = ['contractor', 'consultant', 'employer', 'storekeeper', 'controller', 'inspector', 'manager']
export interface ProjectRole { id: string; projectId: string; userId: string; role: MtlRole; organizationId: string | null; active: boolean }
export interface AuditRow { id: number; at: string; actor: string | null; tableName: string; rowId: string | null; masterProjectId: string | null; action: string; oldRow: Record<string, unknown> | null; newRow: Record<string, unknown> | null }

export interface MtlSettings {
  longLeadDays: number; delayBufferDays: number; stagnantDays: number; qtyTolerancePct: number; scrapWarnPct: number; consumptionTolerancePct: number
  priority: { criticality: number; urgency: number; gap: number; risk: number }
  rolePerms?: Partial<Record<MtlRole, string[]>>
}
export const DEFAULT_MTL_SETTINGS: MtlSettings = { longLeadDays: 90, delayBufferDays: 14, stagnantDays: 120, qtyTolerancePct: 0, scrapWarnPct: 3, consumptionTolerancePct: 10, priority: { criticality: 40, urgency: 30, gap: 20, risk: 10 } }

/** Warehouse issue requisition: the technical office asks for goods for a place of use; four signatures in order (requester, site supervisor, supervision supervisor, storekeeper) release them. */
export type RequisitionStatus = 'awaiting_signatures' | 'issued' | 'rejected' | 'cancelled'
export const REQUISITION_STATUS_LABEL_FA: Record<RequisitionStatus, string> = { awaiting_signatures: 'در انتظار امضا', issued: 'کالا خارج شد', rejected: 'ردشده', cancelled: 'لغوشده' }
export type SignerRole = 'requester' | 'site_supervisor' | 'supervision_supervisor' | 'storekeeper'
export const SIGNER_ROLES: SignerRole[] = ['requester', 'site_supervisor', 'supervision_supervisor', 'storekeeper']
export const SIGNER_ROLE_LABEL_FA: Record<SignerRole, string> = { requester: 'درخواست‌کننده', site_supervisor: 'سرپرست کارگاه', supervision_supervisor: 'سرپرست نظارت', storekeeper: 'انباردار' }
export interface Requisition { id: string; masterProjectId: string; number: string; requesterId: string | null; requestDate: string; facility: string; front: string; purpose: string; neededBy: string | null; notes: string; status: RequisitionStatus; rejectReason: string; issuedAt: string | null; createdAt: string }
export interface RequisitionLine { id: string; requisitionId: string; materialId: string; qtyRequested: number; stockAtRequest: number; qtyIssued: number; notes: string }
export interface RequisitionSigner { id: string; requisitionId: string; role: SignerRole; sort: number; userId: string | null; decision: 'pending' | 'approved' | 'rejected'; signedAt: string | null; note: string; signatureImage: string | null }

/** Lists the project defines once (Settings → فهرست‌های پایه); every form picks from them so one place is never spelled two ways. */
export type LookupKind = 'facility' | 'area' | 'front' | 'usage' | 'warehouse' | 'pipeline'
export const LOOKUP_KINDS: LookupKind[] = ['facility', 'area', 'front', 'usage', 'warehouse', 'pipeline']
export const LOOKUP_LABEL_FA: Record<LookupKind, string> = { facility: 'ایستگاه / تأسیسات', area: 'بخش اجرایی', front: 'جبهه کاری', usage: 'محل مصرف', warehouse: 'انبار / محوطه', pipeline: 'شماره خط لوله' }
export const LOOKUP_HINT_FA: Record<LookupKind, string> = { facility: 'مثلاً ایستگاه تقویت فشار ۱، ایستگاه تقویت فشار ۲', area: 'مثلاً عبور از جاده، عبور از رودخانه، خط اصلی', front: 'مثلاً جبهه شمال، جبهه مرکز', usage: 'جایی که کالا مصرف می‌شود: مثلاً مانیفولد ورودی، خط ۱۶ اینچ خروجی', warehouse: 'مثلاً انبار مرکزی، محوطهٔ لوله، انبار ایستگاه ۱', pipeline: 'مثلاً L-101' }
export interface MtlLookup { id: string; masterProjectId: string; kind: LookupKind; label: string; active: boolean; sort: number }
