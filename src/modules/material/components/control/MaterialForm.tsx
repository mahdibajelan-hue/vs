import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { FormModal, type FieldDef, type GroupDef, type Vals } from '../../../finance/components/FormModal'
import { lookupOptions } from '../../lib/control/lookups'
import { COMMODITY_TYPES, COMMODITY_TYPE_LABEL_FA, CRITICALITY_LABEL_FA, type Criticality, type Material } from '../../types'

const GROUPS: GroupDef[] = [{ id: 'where', title: 'محل مصرف و نقشه' }, { id: 'price', title: 'قیمت و مبنا' }, { id: 'more', title: 'سایر مشخصات', collapsed: true }]
const num = (x: unknown) => Number(x) || 0
const nul = (x: unknown) => (x === '' || x == null ? null : Number(x))

/** Create or edit one MTO item. For an existing item the quantities and the price are not edited here — they change through a request with a reason and a decision, so the history stays. */
export function MaterialForm({ projectId, material, onClose }: { projectId: string; material: Material | null; onClose: () => void }) {
  const createMaterial = useMaterialStore((s) => s.createMaterial)
  const updateMaterial = useMaterialStore((s) => s.updateMaterial)
  const groups = useMaterialControlStore((s) => s.groups).filter((g) => g.active)
  const units = useMaterialControlStore((s) => s.units).filter((u) => u.active)
  const lookups = useMaterialControlStore((s) => s.lookups)
  const lk = (kind: Parameters<typeof lookupOptions>[2], cur?: string) => lookupOptions(lookups, projectId, kind, cur)
  const isNew = !material
  const fields: FieldDef[] = [
    { key: 'lineNo', label: 'شماره ردیف پیمان', kind: 'text', hint: 'شمارهٔ ردیف همین قلم در MTO / فهرست‌بهای پیمان؛ برای جست‌وجو و تطبیق با پیمان' },
    { key: 'materialCode', label: 'کد کالا', kind: 'text', required: true },
    { key: 'description', label: 'شرح', kind: 'text', required: true, span: 2 },
    { key: 'groupId', label: 'گروه کالا', kind: 'select', required: true, options: groups.map((g) => ({ value: g.id, label: g.title })) },
    { key: 'unit', label: 'واحد اندازه‌گیری', kind: 'select', required: true, options: units.map((u) => ({ value: u.code, label: `${u.label} (${u.code})` })) },
    { key: 'spec', label: 'مشخصات فنی', kind: 'text', span: 2 },
    { key: 'size', label: 'سایز', kind: 'text' }, { key: 'rating', label: 'کلاس / رتبه', kind: 'text' },
    ...(isNew ? [{ key: 'contractQty', label: 'مقدار MTO پیمان', kind: 'num' as const }, { key: 'detailQty', label: 'مقدار طراحی تفصیلی', kind: 'num' as const }] : []),
    { key: 'facility', label: 'ایستگاه / تأسیسات', kind: 'select', options: lk('facility', material?.facility), group: 'where', hint: 'از «تنظیمات ← فهرست‌های پایه»' }, { key: 'area', label: 'بخش اجرایی', kind: 'select', options: lk('area', material?.area), group: 'where' }, { key: 'front', label: 'جبهه کاری', kind: 'select', options: lk('front', material?.front), group: 'where' },
    { key: 'pipelineNo', label: 'شماره خط لوله', kind: 'select', options: lk('pipeline', material?.pipelineNo), group: 'where' }, { key: 'isometricNo', label: 'ایزومتریک', kind: 'text', group: 'where' }, { key: 'pidNumber', label: 'نقشه P&ID', kind: 'text', group: 'where' },
    { key: 'pidRevision', label: 'ویرایش نقشه', kind: 'text', group: 'where' }, { key: 'tagNumber', label: 'تگ تجهیز', kind: 'text', group: 'where' }, { key: 'usageLocation', label: 'محل مصرف', kind: 'select', options: lk('usage', material?.usageLocation), group: 'where' },
    { key: 'needDate', label: 'تاریخ نیاز در کارگاه', kind: 'date', group: 'where' },
    ...(isNew ? [{ key: 'unitPrice', label: 'قیمت واحد (ریال)', kind: 'money' as const, group: 'price' }] : []),
    { key: 'currency', label: 'ارز قیمت', kind: 'text', group: 'price' }, { key: 'fxRate', label: 'ضریب تبدیل به ریال', kind: 'num', group: 'price' }, { key: 'priceBasis', label: 'روش قیمت‌گذاری مبنا', kind: 'text', group: 'price', hint: 'مثلاً فهرست بهای پیمان، پیشنهاد سازنده' }, { key: 'priceDate', label: 'تاریخ مبنای قیمت', kind: 'date', group: 'price' },
    { key: 'criticality', label: 'بحرانی‌بودن', kind: 'select', group: 'more', options: (['A', 'B', 'C'] as Criticality[]).map((c) => ({ value: c, label: CRITICALITY_LABEL_FA[c] })) },
    { key: 'leadTimeDays', label: 'زمان تأمین (روز)', kind: 'num', group: 'more' }, { key: 'commodityType', label: 'نوع کالا (قدیمی)', kind: 'select', group: 'more', options: COMMODITY_TYPES.map((c) => ({ value: c, label: COMMODITY_TYPE_LABEL_FA[c] })) },
    { key: 'unitWeightKg', label: 'وزن واحد (کیلوگرم)', kind: 'num', group: 'more' }, { key: 'specRef', label: 'مرجع مشخصات / دیتاشیت', kind: 'text', group: 'more' }, { key: 'notes', label: 'یادداشت', kind: 'text', group: 'more', span: 2 },
  ]
  const m = material
  const initial: Vals = { materialCode: m?.materialCode ?? '', description: m?.description ?? '', groupId: m?.groupId ?? '', unit: m?.unit ?? 'EA', spec: m?.spec ?? '', size: m?.size ?? '', rating: m?.rating ?? '', contractQty: m?.contractQty ?? 0, detailQty: m?.detailQty ?? 0,
    facility: m?.facility ?? '', area: m?.area ?? '', front: m?.front ?? '', pipelineNo: m?.pipelineNo ?? '', isometricNo: m?.isometricNo ?? '', pidNumber: m?.pidNumber ?? '', pidRevision: m?.pidRevision ?? '', tagNumber: m?.tagNumber ?? '', usageLocation: m?.usageLocation ?? '', needDate: m?.needDate ?? null,
    unitPrice: m?.unitPrice ?? 0, currency: m?.currency ?? 'IRR', fxRate: m?.fxRate ?? 1, priceBasis: m?.priceBasis ?? '', priceDate: m?.priceDate ?? null, criticality: m?.criticality ?? 'B', leadTimeDays: m?.leadTimeDays ?? 0,
    commodityType: m?.commodityType ?? 'other', unitWeightKg: m?.unitWeightKg ?? 0, specRef: m?.specRef ?? '', lineNo: m?.lineNo ?? '', notes: m?.notes ?? '' }
  return (
    <FormModal title={m ? `ویرایش ${m.materialCode || m.description}` : 'قلم جدید'} subtitle={m ? `کد یکتا: ${m.itemUid} (ثابت و غیرقابل‌ویرایش) · مقدار و قیمت از «کنترل MTO ← درخواست تغییر» تغییر می‌کند.` : 'کد یکتای سامانه (MT-…) پس از ثبت به‌طور خودکار ساخته می‌شود.'} fields={fields} groups={GROUPS} initial={initial} submitLabel={m ? 'ذخیرهٔ تغییرات' : 'ثبت قلم'} onClose={onClose}
      onSubmit={async (v) => {
        const g = groups.find((x) => x.id === v.groupId)
        const data: Partial<Material> = { materialCode: String(v.materialCode), description: String(v.description), groupId: (v.groupId as string) || null, unit: String(v.unit), spec: String(v.spec ?? ''), size: String(v.size ?? ''), rating: String(v.rating ?? ''),
          facility: String(v.facility ?? ''), area: String(v.area ?? ''), front: String(v.front ?? ''), pipelineNo: String(v.pipelineNo ?? ''), isometricNo: String(v.isometricNo ?? ''), pidNumber: String(v.pidNumber ?? ''), pidRevision: String(v.pidRevision ?? ''), tagNumber: String(v.tagNumber ?? ''),
          usageLocation: String(v.usageLocation ?? ''), needDate: (v.needDate as string) || null, currency: String(v.currency || 'IRR'), fxRate: num(v.fxRate) || 1, priceBasis: String(v.priceBasis ?? ''), priceDate: (v.priceDate as string) || null,
          criticality: v.criticality as Criticality, leadTimeDays: nul(v.leadTimeDays) || g?.leadTimeDays || null, commodityType: v.commodityType as Material['commodityType'], unitWeightKg: num(v.unitWeightKg), specRef: String(v.specRef ?? ''), lineNo: String(v.lineNo ?? ''), notes: String(v.notes ?? '') }
        if (isNew) await createMaterial(projectId, { ...data, contractQty: nul(v.contractQty) || null, detailQty: nul(v.detailQty) || null, detailStatus: nul(v.detailQty) ? 'draft' : 'none', unitPrice: num(v.unitPrice), mtoQuantity: num(v.contractQty) || num(v.detailQty) })
        else await updateMaterial(m!.id, data)
      }} />
  )
}
