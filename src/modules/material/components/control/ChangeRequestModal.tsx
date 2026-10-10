import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { FormModal, type FieldDef } from '../../../finance/components/FormModal'
import { CHANGE_FIELD_LABEL_FA, type ChangeField, type Material } from '../../types'

const NUMERIC: ChangeField[] = ['contract_qty', 'detail_qty', 'unit_price']
const current = (m: Material, f: ChangeField): string => ({ contract_qty: m.contractQty ?? '', detail_qty: m.detailQty ?? '', unit_price: m.unitPrice, spec: m.spec, size: m.size, unit: m.unit, material_code: m.materialCode, usage_location: m.usageLocation, need_date: m.needDate ?? '' }[f]).toString()

/** A change to a quantity, price, specification, unit, code, place or date goes through a request: the reason is required, the decision and the decider are kept. */
export function ChangeRequestModal({ material, field, onClose }: { material: Material; field?: ChangeField; onClose: () => void }) {
  const request = useMaterialControlStore((s) => s.requestChange)
  const fields: FieldDef[] = [
    { key: 'field', label: 'چه چیزی تغییر می‌کند؟', kind: 'select', required: true, options: (Object.keys(CHANGE_FIELD_LABEL_FA) as ChangeField[]).map((k) => ({ value: k, label: CHANGE_FIELD_LABEL_FA[k] })), span: 2 },
    { key: 'num', label: 'مقدار جدید', kind: 'num', show: (v) => NUMERIC.includes(v.field as ChangeField) },
    { key: 'date', label: 'تاریخ جدید', kind: 'date', show: (v) => v.field === 'need_date' },
    { key: 'text', label: 'مقدار جدید', kind: 'text', show: (v) => !NUMERIC.includes(v.field as ChangeField) && v.field !== 'need_date' },
    { key: 'reason', label: 'علت تغییر', kind: 'area', required: true, span: 2 },
    { key: 'doc', label: 'سند مرجع (نامه، نسخهٔ نقشه، شمارهٔ مکاتبه)', kind: 'text', span: 2 },
  ]
  return (
    <FormModal title={`درخواست تغییر · ${material.materialCode || material.description}`} subtitle="پس از ثبت، مشاور یا کارفرما درخواست را تأیید یا رد می‌کند و مقدار فقط با تأیید اعمال می‌شود." fields={fields}
      initial={{ field: field ?? 'detail_qty', num: 0, date: null, text: '', reason: '', doc: '' }} submitLabel="ثبت درخواست" onClose={onClose}
      preview={(v) => { const f = v.field as ChangeField; return <span>مقدار فعلی: <b>{current(material, f) || '—'}</b></span> }}
      onSubmit={async (v) => {
        const f = v.field as ChangeField
        const value = NUMERIC.includes(f) ? String(v.num ?? '') : f === 'need_date' ? String(v.date ?? '') : String(v.text ?? '')
        await request(material.id, f, value, String(v.reason), String(v.doc ?? ''))
      }} />
  )
}
