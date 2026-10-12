import type { Material } from '../../types'

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
/** Identity of an MTO line across the contract MTO and the detail-design MTO: code, station and where it is used. */
export const matchKey = (m: Pick<Material, 'materialCode' | 'facility' | 'usageLocation' | 'pipelineNo' | 'tagNumber'>): string => `${norm(m.materialCode)}|${norm(m.facility)}|${norm(m.usageLocation || m.pipelineNo || m.tagNumber)}`
const looseKey = (m: Pick<Material, 'materialCode' | 'facility'>) => `${norm(m.materialCode)}|${norm(m.facility)}`

export interface MtoRowIn { lineNo?: string; materialCode: string; description?: string; spec?: string; size?: string; unit?: string; qty: number; unitPrice?: number; facility?: string; area?: string; pipelineNo?: string; isometricNo?: string; pidNumber?: string; tagNumber?: string; front?: string; usageLocation?: string; needDate?: string | null; groupCode?: string }
export interface MtoPlan {
  create: MtoRowIn[]
  /** contract import: existing items whose quantity differs — never changed silently, they become change requests */
  changed: { material: Material; from: number; to: number }[]
  /** detail import: items updated with the design quantity (and the differences in spec / unit / code / location) */
  attach: { material: Material; patch: Partial<Material> }[]
  unchanged: number
  errors: { row: number; message: string }[]
}

/**
 * Applies an imported MTO to what exists. The contract MTO creates new lines and proposes changes for existing ones;
 * the detail MTO attaches the design quantity to lines it finds and creates lines it does not find (those then show up as outside the contract MTO).
 */
export function planMtoImport(existing: Material[], rows: MtoRowIn[], mode: 'contract' | 'detail'): MtoPlan {
  const plan: MtoPlan = { create: [], changed: [], attach: [], unchanged: 0, errors: [] }
  const exact = new Map(existing.map((m) => [matchKey(m), m]))
  const loose = new Map<string, Material[]>()
  for (const m of existing) loose.set(looseKey(m), [...(loose.get(looseKey(m)) ?? []), m])
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    if (!norm(r.materialCode)) return void plan.errors.push({ row: i + 1, message: 'کد کالا خالی است' })
    if (!(r.qty >= 0) || !Number.isFinite(r.qty)) return void plan.errors.push({ row: i + 1, message: 'مقدار نامعتبر است' })
    const probe = { materialCode: r.materialCode, facility: r.facility ?? '', usageLocation: r.usageLocation ?? '', pipelineNo: r.pipelineNo ?? '', tagNumber: r.tagNumber ?? '' }
    const k = matchKey(probe)
    if (seen.has(k)) return void plan.errors.push({ row: i + 1, message: 'ردیف تکراری با همین کد، ایستگاه و محل مصرف' })
    seen.add(k)
    let m = exact.get(k)
    if (!m) { const c = loose.get(looseKey(probe)); if (c && c.length === 1) m = c[0] }
    if (!m) return void plan.create.push(r)
    if (mode === 'contract') {
      if ((m.contractQty ?? 0) === r.qty) plan.unchanged++
      else plan.changed.push({ material: m, from: m.contractQty ?? 0, to: r.qty })
    } else {
      const patch: Partial<Material> = { detailQty: r.qty, detailStatus: m.detailStatus === 'final' ? 'final' : 'draft' }
      if (r.spec && r.spec !== m.spec) patch.detailSpec = r.spec
      if (r.unit && r.unit !== m.unit) patch.detailUnit = r.unit
      if (r.materialCode !== m.materialCode) patch.detailCode = r.materialCode
      const loc = r.usageLocation || r.pipelineNo || r.tagNumber
      if (loc && loc !== (m.usageLocation || m.pipelineNo || m.tagNumber)) patch.detailLocation = loc
      if (m.detailQty === r.qty && Object.keys(patch).length === 2) plan.unchanged++
      else plan.attach.push({ material: m, patch })
    }
  })
  return plan
}

const HEADERS: Record<keyof MtoRowIn, string[]> = {
  lineNo: ['ردیف', 'شماره ردیف', 'ردیف پیمان', 'شماره ردیف پیمان', 'item no', 'item no.', 'row no', 'contract line'],
  materialCode: ['کد', 'کد کالا', 'code', 'material code', 'item code'], description: ['شرح', 'توضیح', 'description', 'desc'], spec: ['مشخصات', 'مشخصات فنی', 'spec', 'specification'], size: ['سایز', 'size'],
  unit: ['واحد', 'unit', 'uom'], qty: ['مقدار', 'تعداد', 'qty', 'quantity'], unitPrice: ['قیمت', 'قیمت واحد', 'price', 'unit price'], facility: ['ایستگاه', 'تاسیسات', 'تأسیسات', 'facility', 'station'],
  area: ['بخش', 'بخش اجرایی', 'area'], pipelineNo: ['خط', 'شماره خط', 'خط لوله', 'line', 'line no', 'pipeline'], isometricNo: ['ایزومتریک', 'ایزو', 'iso', 'isometric'], pidNumber: ['نقشه', 'p&id', 'pid', 'نقشه p&id'],
  tagNumber: ['تگ', 'tag', 'tag no'], front: ['جبهه', 'جبهه کاری', 'front'], usageLocation: ['محل مصرف', 'location', 'usage'], needDate: ['تاریخ نیاز', 'need date'], groupCode: ['گروه', 'گروه کالا', 'group'],
}
/** Maps spreadsheet rows (Persian or English headers) to MTO rows. Unknown columns are ignored. */
export function parseMtoRows(raw: Record<string, unknown>[]): MtoRowIn[] {
  const toKey = (h: string): keyof MtoRowIn | null => { const n = norm(h); for (const [k, syn] of Object.entries(HEADERS)) if (syn.includes(n)) return k as keyof MtoRowIn; return null }
  return raw.map((row) => {
    const o: Record<string, unknown> = {}
    for (const [h, v] of Object.entries(row)) { const k = toKey(h); if (k) o[k] = v }
    const num = (x: unknown) => { const n = Number(String(x ?? '').replace(/[٬,\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))); return Number.isFinite(n) ? n : NaN }
    return { lineNo: String(o.lineNo ?? '').trim(), materialCode: String(o.materialCode ?? '').trim(), description: String(o.description ?? ''), spec: String(o.spec ?? ''), size: String(o.size ?? ''), unit: String(o.unit ?? ''), qty: num(o.qty), unitPrice: o.unitPrice == null ? undefined : num(o.unitPrice),
      facility: String(o.facility ?? ''), area: String(o.area ?? ''), pipelineNo: String(o.pipelineNo ?? ''), isometricNo: String(o.isometricNo ?? ''), pidNumber: String(o.pidNumber ?? ''), tagNumber: String(o.tagNumber ?? ''), front: String(o.front ?? ''), usageLocation: String(o.usageLocation ?? ''),
      needDate: o.needDate ? String(o.needDate) : null, groupCode: String(o.groupCode ?? '') }
  })
}
