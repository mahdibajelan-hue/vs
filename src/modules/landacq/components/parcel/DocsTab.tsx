import { useState } from 'react'
import { FileText, Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { JalaliDateInput, Modal } from '../../platform'
import type { DocMeta, DocStatus } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { DOC_STATUS_LABEL } from '../../lib/labels'
import { fmtDateShort, faNum } from '../../lib/fa'
import { Badge, EmptyState, Field } from '../ui'

const DOC_COLOR: Record<DocStatus, string> = { pending: '#94a3b8', submitted: '#eab308', approved: '#22c55e', rejected: '#ef4444' }
const TYPES = ['سند مالکیت', 'استعلام ثبتی', 'نظریه کارشناس رسمی', 'صورت‌جلسه توافق', 'مجوز عبور / معارض', 'نقشه تفکیکی', 'حکم دادگاه', 'نامهٔ متولی']

/** Metadata register: type, number, date, issuer, status, a short note and an optional reference — never the file itself. */
export function DocsTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const save = useLandStore((s) => s.saveDoc)
  const del = useLandStore((s) => s.deleteDoc)
  const [editing, setEditing] = useState<DocMeta | 'new' | null>(null)
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-2.5 rounded-xl p-3 text-[12px] leading-6" style={{ background: 'var(--la-surface-2)', border: '1px solid var(--la-line)', color: 'var(--la-ink-2)' }}>
        <Info size={15} style={{ marginTop: 4, flexShrink: 0 }} /> اسناد در این سامانه نگهداری نمی‌شود؛ فقط مشخصات و وضعیت هر سند (و در صورت وجود، لینک یا شمارهٔ ارجاع در سامانهٔ مدیریت مدارک) ثبت می‌شود.
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="la-eyebrow m-0">{faNum(p.docs.length)} مورد</p>
        <button className="la-btn la-btn-primary la-btn-sm" onClick={() => setEditing('new')}><Plus size={14} /> ثبت مشخصات سند</button>
      </div>
      {p.docs.length === 0 ? (
        <div className="la-card-flat"><EmptyState icon={<FileText size={20} />} title="سندی ثبت نشده" /></div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {p.docs.map((d) => (
            <li key={d.id} className="la-card-flat p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-bold">{d.docType || 'سند'} {d.docNumber && <span className="la-km la-eyebrow">#{d.docNumber}</span>}</p>
                  <p className="la-eyebrow m-0 leading-6">{[d.issuer, d.docDate ? fmtDateShort(d.docDate) : ''].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1"><Badge color={DOC_COLOR[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
                  <button className="la-btn la-btn-ghost la-btn-icon" aria-label="ویرایش" onClick={() => setEditing(d)}><Pencil size={14} /></button>
                  <button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف" onClick={() => del(p.id, d.id)}><Trash2 size={14} /></button></div>
              </div>
              {d.note && <p className="m-0 mt-1.5 text-[12px] leading-6" style={{ color: 'var(--la-ink-2)' }}>{d.note}</p>}
              {d.ref && (/^https?:\/\//.test(d.ref) ? <a href={d.ref} target="_blank" rel="noopener noreferrer" className="la-eyebrow mt-1 block underline" dir="ltr" style={{ textAlign: 'right' }}>{d.ref}</a> : <p className="la-eyebrow m-0 mt-1">ارجاع: {d.ref}</p>)}
            </li>
          ))}
        </ul>
      )}
      {editing && <DocDialog parcelId={p.id} doc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function DocDialog({ parcelId, doc, onClose, onSave }: { parcelId: string; doc: DocMeta | null; onClose: () => void; onSave: (parcelId: string, d: Omit<DocMeta, 'id'> & { id?: string }) => Promise<void> }) {
  const [f, setF] = useState<Omit<DocMeta, 'id'>>({ parcelId, docType: doc?.docType ?? '', docNumber: doc?.docNumber ?? '', docDate: doc?.docDate ?? null, issuer: doc?.issuer ?? '', status: doc?.status ?? 'pending', note: doc?.note ?? '', ref: doc?.ref ?? '' })
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={doc ? 'ویرایش مشخصات سند' : 'ثبت مشخصات سند'} onClose={() => !busy && onClose()} width="max-w-lg" isDirty={!doc && !!(f.docType || f.docNumber)}>
      <div className="la-root grid gap-3 sm:grid-cols-2" dir="rtl">
        <Field label="نوع سند *"><input className="la-input" list="la-doc-types" value={f.docType} onChange={(e) => setF({ ...f, docType: e.target.value })} autoFocus /><datalist id="la-doc-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="شمارهٔ سند"><input className="la-input" dir="ltr" style={{ textAlign: 'left' }} value={f.docNumber} onChange={(e) => setF({ ...f, docNumber: e.target.value })} /></Field>
        <div><span className="la-label">تاریخ</span><JalaliDateInput value={f.docDate ?? ''} onChange={(iso) => setF({ ...f, docDate: iso })} /></div>
        <Field label="مرجع صادرکننده"><input className="la-input" value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></Field>
        <Field label="وضعیت"><select className="la-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as DocStatus })}>{(Object.keys(DOC_STATUS_LABEL) as DocStatus[]).map((k) => <option key={k} value={k}>{DOC_STATUS_LABEL[k]}</option>)}</select></Field>
        <Field label="لینک یا شمارهٔ ارجاع" hint="اختیاری"><input className="la-input" dir="ltr" style={{ textAlign: 'left' }} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label="توضیح مختصر" className="sm:col-span-2"><input className="la-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
          <button className="la-btn" disabled={busy} onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={busy || !f.docType.trim()} onClick={async () => { setBusy(true); await onSave(parcelId, { ...f, docType: f.docType.trim(), id: doc?.id }); setBusy(false); onClose() }}>ذخیره</button>
        </div>
      </div>
    </Modal>
  )
}
