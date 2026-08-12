import { supabase } from '../../../lib/supabaseClient'

/**
 * Additive demo-data generator for the Material Supply & Inventory module — mirrors
 * financeDemoSeed.ts: reuses whatever Portfolio/Program/Project hierarchy already exists rather
 * than creating a parallel one, and only clears out mtl_* rows for the specific
 * master_project_ids it is about to reseed (never portfolios/programs/master_projects/other
 * modules' data), so it is safe to re-run.
 */

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let rand = mulberry32(20260813)
function ri(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[ri(0, arr.length - 1)]
}
function chance(p: number): boolean {
  return rand() < p
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const TODAY = new Date().toISOString().slice(0, 10)

type Commodity = 'pipe' | 'fitting' | 'valve' | 'flange' | 'gasket' | 'bolt_nut' | 'instrument' | 'equipment' | 'support' | 'other'

const COMMODITY_DEFS: { type: Commodity; codePrefix: string; unit: string; weightRange: [number, number]; priceRange: [number, number]; qtyRange: [number, number]; tagged: boolean; specs: string[]; sizes: string[] }[] = [
  { type: 'pipe', codePrefix: 'PIPE', unit: 'M', weightRange: [8, 60], priceRange: [1_500_000, 6_500_000], qtyRange: [150, 1200], tagged: false, specs: ['A106 Gr.B', 'API 5L X60', 'API 5L X70', 'SS316L'], sizes: ['4"', '6"', '8"', '10"', '12"', '16"', '20"', '24"'] },
  { type: 'fitting', codePrefix: 'FIT', unit: 'EA', weightRange: [2, 25], priceRange: [8_000_000, 60_000_000], qtyRange: [20, 150], tagged: false, specs: ['ASME B16.9', 'MSS SP-75'], sizes: ['4"', '6"', '8"', '10"', '12"'] },
  { type: 'valve', codePrefix: 'VLV', unit: 'EA', weightRange: [40, 220], priceRange: [180_000_000, 650_000_000], qtyRange: [4, 24], tagged: true, specs: ['API 600', 'API 6D', 'API 594'], sizes: ['4"', '6"', '8"', '10"', '12"'] },
  { type: 'flange', codePrefix: 'FLG', unit: 'EA', weightRange: [8, 45], priceRange: [15_000_000, 55_000_000], qtyRange: [20, 80], tagged: false, specs: ['ASME B16.5'], sizes: ['4"', '6"', '8"', '10"'] },
  { type: 'gasket', codePrefix: 'GSK', unit: 'EA', weightRange: [0.2, 2], priceRange: [1_500_000, 6_000_000], qtyRange: [40, 160], tagged: false, specs: ['Spiral Wound CS/PTFE'], sizes: ['4"', '6"', '8"'] },
  { type: 'bolt_nut', codePrefix: 'BLT', unit: 'SET', weightRange: [0.5, 4], priceRange: [900_000, 3_500_000], qtyRange: [80, 320], tagged: false, specs: ['ASTM A193 B7/A194 2H'], sizes: ['3/4"', '7/8"', '1"'] },
  { type: 'instrument', codePrefix: 'INST', unit: 'EA', weightRange: [1.5, 12], priceRange: [150_000_000, 420_000_000], qtyRange: [3, 14], tagged: true, specs: ['Rosemount 3051', 'Yokogawa EJA'], sizes: [''] },
  { type: 'equipment', codePrefix: 'EQP', unit: 'EA', weightRange: [800, 12000], priceRange: [2_500_000_000, 18_000_000_000], qtyRange: [1, 3], tagged: true, specs: ['Vendor Package'], sizes: [''] },
  { type: 'support', codePrefix: 'SUP', unit: 'EA', weightRange: [15, 120], priceRange: [10_000_000, 45_000_000], qtyRange: [15, 60], tagged: false, specs: ['Standard Pipe Support'], sizes: [''] },
]

const FACILITIES = ['واحد ۱۰۰', 'واحد ۲۰۰', 'واحد ۳۰۰']
const AREAS = ['Area 10', 'Area 20', 'Area 30', 'Area 40']
const SYSTEMS = ['خوراک', 'واکنش', 'جداسازی', 'بازیافت', 'یوتیلیتی']
const RATINGS = ['CL150', 'CL300', 'SCH40', 'SCH80', '']
const WORK_PACKAGES = ['نصب خط خوراک', 'نصب خط محصول', 'نصب تجهیزات دوار', 'نصب ساپورت و استراکچر', 'پیش‌راه‌اندازی سیستم کنترل']

export interface MaterialDemoSeedCounts {
  projectsCovered: number
  mtoRevisions: number
  materials: number
  procurementRequests: number
  purchaseOrders: number
  manufacturing: number
  shipments: number
  warehouseReceipts: number
  allocations: number
}

export interface DemoSeedProgress {
  (message: string): void
}

interface MasterProjectRow {
  id: string
  official_name: string
  currency: string
  contractor_org_id: string | null
  planned_start_date: string | null
  planned_finish_date: string | null
  status: string
}

/** How far along a project's materials should typically be, based on the project's own lifecycle status. */
function progressWeightsForStatus(status: string): number[] {
  // index: 0=mto only,1=ordered,2=manufactured,3=shipped,4=received,5=allocated,6=consumed
  if (status === 'completed' || status === 'closed') return [2, 3, 4, 6, 10, 15, 60]
  if (status === 'planning' || status === 'approved' || status === 'idea' || status === 'proposed') return [55, 30, 10, 3, 1, 1, 0]
  if (status === 'on_hold') return [25, 30, 20, 10, 8, 5, 2]
  return [8, 14, 16, 16, 18, 16, 12] // executing (default)
}
function weightedLevel(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export async function seedMaterialDemoData(onProgress?: DemoSeedProgress): Promise<MaterialDemoSeedCounts> {
  rand = mulberry32(20260813)

  onProgress?.('دریافت پروژه‌های پایه موجود...')
  const { data: projects, error: projErr } = await supabase
    .from('master_projects')
    .select('id, official_name, currency, contractor_org_id, planned_start_date, planned_finish_date, status')
  if (projErr) throw new Error(projErr.message)
  const projectRows = (projects ?? []) as MasterProjectRow[]
  if (projectRows.length === 0) {
    throw new Error('هیچ پروژه پایه‌ای یافت نشد — ابتدا از صفحه «داده‌های نمایشی» در بخش داده پایه، مجموعه داده اصلی را تولید کنید.')
  }
  const projectIds = projectRows.map((p) => p.id)

  onProgress?.('پاک‌سازی داده تامین کالای نمایشی قبلی این پروژه‌ها...')
  const { data: existingMaterials } = await supabase.from('mtl_materials').select('id').in('master_project_id', projectIds)
  const materialIds = (existingMaterials ?? []).map((m) => m.id as string)
  const { data: existingPos } = await supabase.from('mtl_purchase_orders').select('id').in('master_project_id', projectIds)
  const poIds = (existingPos ?? []).map((p) => p.id as string)
  const { data: existingPoLines } = poIds.length > 0 ? await supabase.from('mtl_po_lines').select('id').in('po_id', poIds) : { data: [] as { id: string }[] }
  const poLineIds = (existingPoLines ?? []).map((l) => l.id as string)
  if (poLineIds.length > 0) await supabase.from('mtl_manufacturing').delete().in('po_line_id', poLineIds)
  if (poIds.length > 0) await supabase.from('mtl_po_lines').delete().in('po_id', poIds)
  await supabase.from('mtl_purchase_orders').delete().in('master_project_id', projectIds)
  await supabase.from('mtl_procurement_lines').delete().in('material_id', materialIds.length > 0 ? materialIds : ['00000000-0000-0000-0000-000000000000'])
  await supabase.from('mtl_procurement_requests').delete().in('master_project_id', projectIds)
  const { data: existingShipments } = await supabase.from('mtl_shipments').select('id').in('master_project_id', projectIds)
  const shipmentIds = (existingShipments ?? []).map((s) => s.id as string)
  if (shipmentIds.length > 0) await supabase.from('mtl_shipment_lines').delete().in('shipment_id', shipmentIds)
  await supabase.from('mtl_shipments').delete().in('master_project_id', projectIds)
  const { data: existingReceipts } = await supabase.from('mtl_warehouse_receipts').select('id').in('master_project_id', projectIds)
  const receiptIds = (existingReceipts ?? []).map((r) => r.id as string)
  if (receiptIds.length > 0) await supabase.from('mtl_warehouse_lines').delete().in('receipt_id', receiptIds)
  await supabase.from('mtl_warehouse_receipts').delete().in('master_project_id', projectIds)
  await supabase.from('mtl_release_lines').delete().in('material_id', materialIds.length > 0 ? materialIds : ['00000000-0000-0000-0000-000000000000'])
  await supabase.from('mtl_release_notes').delete().in('master_project_id', projectIds)
  await supabase.from('mtl_allocations').delete().in('master_project_id', projectIds)
  await supabase.from('mtl_materials').delete().in('master_project_id', projectIds)
  await supabase.from('mtl_mto_revisions').delete().in('master_project_id', projectIds)

  let mtoRevisionCount = 0
  let materialCount = 0
  let procurementRequestCount = 0
  let purchaseOrderCount = 0
  let manufacturingCount = 0
  let shipmentCount = 0
  let warehouseReceiptCount = 0
  let allocationCount = 0

  for (const project of projectRows) {
    onProgress?.(`تولید داده کالا — ${project.official_name}`)
    const currency = project.currency || 'IRR'
    const startDate = project.planned_start_date ?? addDays(TODAY, -200)
    const weights = progressWeightsForStatus(project.status)

    const { data: revRow, error: revErr } = await supabase
      .from('mtl_mto_revisions')
      .insert({ master_project_id: project.id, revision_number: 'Rev.0', revision_date: addDays(startDate, -20), status: 'issued', notes: '' })
      .select('id')
      .single()
    if (revErr || !revRow) throw new Error(revErr?.message ?? 'خطا در ایجاد ریویژن MTO')
    mtoRevisionCount++

    const materialCountForProject = ri(6, 10)
    const materialRows = Array.from({ length: materialCountForProject }, (_, i) => {
      const def = pick(COMMODITY_DEFS)
      const facility = pick(FACILITIES)
      const area = pick(AREAS)
      const system = pick(SYSTEMS)
      const mtoQuantity = ri(def.qtyRange[0], def.qtyRange[1])
      const unitWeightKg = Math.round((def.weightRange[0] + rand() * (def.weightRange[1] - def.weightRange[0])) * 10) / 10
      const unitPrice = ri(def.priceRange[0], def.priceRange[1])
      return {
        master_project_id: project.id,
        mto_revision_id: revRow.id as string,
        line_no: String(i + 1).padStart(3, '0'),
        material_code: `${def.codePrefix}-${ri(100, 999)}`,
        description: `${def.codePrefix} ${pick(def.sizes) || ''}`.trim(),
        commodity_type: def.type,
        spec: pick(def.specs),
        size: pick(def.sizes),
        rating: pick(RATINGS),
        unit: def.unit,
        facility,
        area,
        system_name: system,
        pid_number: `PID-${facility.replace(/\D/g, '')}-${ri(1, 9).toString().padStart(2, '0')}`,
        pid_revision: pick(['Rev.1', 'Rev.2']),
        tag_number: def.tagged ? `${def.type === 'valve' ? 'V' : def.type === 'instrument' ? 'PT' : 'EQ'}-${ri(1000, 9999)}` : '',
        mto_quantity: mtoQuantity,
        unit_weight_kg: unitWeightKg,
        unit_price: unitPrice,
        currency,
        is_construction_blocking: false,
        notes: '',
        _level: weightedLevel(weights),
        _def: def,
      }
    })

    const { data: insertedMaterials, error: matErr } = await supabase
      .from('mtl_materials')
      .insert(materialRows.map(({ _level, _def, ...row }) => row))
      .select('id, material_code, mto_quantity, unit_price')
    if (matErr || !insertedMaterials) throw new Error(matErr?.message ?? 'خطا در ایجاد کالا')
    materialCount += insertedMaterials.length

    const materialsWithLevel = insertedMaterials.map((m, i) => ({ ...m, level: materialRows[i]._level as number }))
    for (const m of materialsWithLevel) {
      if (m.level === 0 && chance(0.12)) {
        await supabase.from('mtl_materials').update({ is_construction_blocking: true }).eq('id', m.id)
      }
    }

    const ordered = materialsWithLevel.filter((m) => m.level >= 1)
    if (ordered.length === 0) continue

    const { data: reqRow, error: reqErr } = await supabase
      .from('mtl_procurement_requests')
      .insert({ master_project_id: project.id, mr_number: 'MR-001', mr_date: addDays(startDate, ri(5, 25)), status: 'awarded', supplier_org_id: project.contractor_org_id, notes: '' })
      .select('id')
      .single()
    if (reqErr || !reqRow) throw new Error(reqErr?.message ?? 'خطا در ایجاد درخواست خرید')
    procurementRequestCount++
    await supabase.from('mtl_procurement_lines').insert(ordered.map((m) => ({ request_id: reqRow.id, material_id: m.id, quantity_requested: m.mto_quantity })))

    const { data: poRow, error: poErr } = await supabase
      .from('mtl_purchase_orders')
      .insert({
        master_project_id: project.id,
        request_id: reqRow.id,
        po_number: 'PO-500',
        po_date: addDays(startDate, ri(30, 60)),
        supplier_org_id: project.contractor_org_id,
        currency,
        status: project.status === 'completed' ? 'completed' : 'active',
        notes: '',
      })
      .select('id')
      .single()
    if (poErr || !poRow) throw new Error(poErr?.message ?? 'خطا در ایجاد سفارش خرید')
    purchaseOrderCount++

    const poLineRows = ordered.map((m) => ({
      po_id: poRow.id as string,
      material_id: m.id as string,
      quantity_ordered: Math.round(m.mto_quantity * (ri(90, 100) / 100)),
      unit_price: Math.round(Number(m.unit_price) * (ri(95, 108) / 100)),
      planned_delivery_date: addDays(startDate, ri(60, 180)),
    }))
    const { data: insertedPoLines, error: poLineErr } = await supabase.from('mtl_po_lines').insert(poLineRows).select('id, material_id, quantity_ordered, planned_delivery_date')
    if (poLineErr || !insertedPoLines) throw new Error(poLineErr?.message ?? 'خطا در ایجاد اقلام سفارش خرید')

    const levelByMaterialId = new Map(materialsWithLevel.map((m) => [m.id as string, m.level]))
    const manufacturingRows: Record<string, unknown>[] = []
    for (const line of insertedPoLines) {
      const level = levelByMaterialId.get(line.material_id as string) ?? 1
      const isLongLead = chance(0.25)
      const plannedReady = addDays((line.planned_delivery_date as string) ?? startDate, -ri(5, 20))
      if (level === 1) {
        manufacturingRows.push({ po_line_id: line.id, status: pick(['not_started', 'in_progress']), is_long_lead: isLongLead, planned_ready_date: plannedReady, actual_ready_date: null, fat_date: null, notes: '' })
      } else {
        const actualReady = addDays(plannedReady, ri(-8, 15))
        manufacturingRows.push({
          po_line_id: line.id,
          status: pick(['fat_passed', 'ready_for_shipment']),
          is_long_lead: isLongLead,
          planned_ready_date: plannedReady,
          actual_ready_date: actualReady <= TODAY ? actualReady : plannedReady,
          fat_date: chance(0.6) ? addDays(plannedReady, -ri(2, 10)) : null,
          notes: '',
        })
      }
    }
    if (manufacturingRows.length > 0) {
      const { error: mfErr } = await supabase.from('mtl_manufacturing').insert(manufacturingRows)
      if (mfErr) throw new Error(mfErr.message)
      manufacturingCount += manufacturingRows.length
    }

    const shippedMaterials = materialsWithLevel.filter((m) => m.level >= 3)
    if (shippedMaterials.length > 0) {
      const releaseDate = addDays(startDate, ri(90, 160))
      const { data: releaseRow } = await supabase
        .from('mtl_release_notes')
        .insert({ master_project_id: project.id, release_number: 'REL-01', release_date: releaseDate, po_id: poRow.id, notes: '' })
        .select('id')
        .single()
      if (releaseRow) {
        await supabase
          .from('mtl_release_lines')
          .insert(shippedMaterials.map((m) => ({ release_id: releaseRow.id, material_id: m.id, quantity_released: Math.round(Number(m.mto_quantity) * (ri(85, 100) / 100)) })))
      }

      const shipmentDate = addDays(releaseDate, ri(1, 4))
      const shipmentStatus = shippedMaterials.some((m) => m.level >= 4) ? 'delivered' : pick(['in_transit', 'customs'])
      const { data: shipRow, error: shipErr } = await supabase
        .from('mtl_shipments')
        .insert({
          master_project_id: project.id,
          shipment_number: 'SHP-01',
          shipment_date: shipmentDate,
          carrier: pick(['شرکت باربری پارس', 'شرکت حمل و نقل بین‌المللی کاوه', 'ترابر آسیا']),
          tracking_ref: `TRK-${ri(1000, 9999)}`,
          origin: 'کارخانه تامین‌کننده',
          destination: 'سایت پروژه',
          status: shipmentStatus,
          eta: addDays(shipmentDate, ri(15, 30)),
          ata: shipmentStatus === 'delivered' ? addDays(shipmentDate, ri(15, 32)) : null,
          notes: '',
        })
        .select('id')
        .single()
      if (shipErr || !shipRow) throw new Error(shipErr?.message ?? 'خطا در ایجاد محموله')
      shipmentCount++
      await supabase
        .from('mtl_shipment_lines')
        .insert(shippedMaterials.map((m) => ({ shipment_id: shipRow.id, material_id: m.id, quantity_shipped: Math.round(Number(m.mto_quantity) * (ri(85, 100) / 100)) })))

      const receivedMaterials = shippedMaterials.filter((m) => m.level >= 4)
      if (receivedMaterials.length > 0) {
        const receiptDate = addDays(shipmentDate, ri(15, 32))
        const { data: receiptRow, error: recErr } = await supabase
          .from('mtl_warehouse_receipts')
          .insert({ master_project_id: project.id, receipt_number: 'WH-01', receipt_date: receiptDate, shipment_id: shipRow.id, warehouse_location: 'انبار مرکزی سایت', notes: '' })
          .select('id')
          .single()
        if (recErr || !receiptRow) throw new Error(recErr?.message ?? 'خطا در ایجاد رسید انبار')
        warehouseReceiptCount++
        const receiptLineRows = receivedMaterials.map((m) => {
          const qty = Math.round(Number(m.mto_quantity) * (ri(80, 100) / 100))
          const condition = chance(0.08) ? 'shortage' : chance(0.06) ? 'damaged' : 'ok'
          return { receipt_id: receiptRow.id, material_id: m.id, quantity_received: qty, condition }
        })
        await supabase.from('mtl_warehouse_lines').insert(receiptLineRows)

        const allocatedMaterials = receivedMaterials.filter((m) => m.level >= 5)
        if (allocatedMaterials.length > 0) {
          const qtyByMaterial = new Map(receiptLineRows.filter((r) => r.condition === 'ok').map((r) => [r.material_id as string, r.quantity_received]))
          const allocationRows = allocatedMaterials
            .map((m) => {
              const receivedOk = qtyByMaterial.get(m.id as string) ?? 0
              if (receivedOk <= 0) return null
              const allocated = Math.round(receivedOk * (ri(40, 90) / 100))
              if (allocated <= 0) return null
              const consumed = m.level >= 6 ? Math.round(allocated * (ri(30, 100) / 100)) : 0
              return {
                master_project_id: project.id,
                material_id: m.id,
                work_package_code: `WP-${ri(1000, 1099)}`,
                work_package_name: pick(WORK_PACKAGES),
                quantity_allocated: allocated,
                quantity_consumed: consumed,
                allocation_date: addDays(receiptDate, ri(5, 40)),
                status: consumed >= allocated ? 'consumed' : 'allocated',
                notes: '',
              }
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
          if (allocationRows.length > 0) {
            const { error: allocErr } = await supabase.from('mtl_allocations').insert(allocationRows)
            if (allocErr) throw new Error(allocErr.message)
            allocationCount += allocationRows.length
          }
        }
      }
    }
  }

  onProgress?.('اتمام')
  return {
    projectsCovered: projectRows.length,
    mtoRevisions: mtoRevisionCount,
    materials: materialCount,
    procurementRequests: procurementRequestCount,
    purchaseOrders: purchaseOrderCount,
    manufacturing: manufacturingCount,
    shipments: shipmentCount,
    warehouseReceipts: warehouseReceiptCount,
    allocations: allocationCount,
  }
}
