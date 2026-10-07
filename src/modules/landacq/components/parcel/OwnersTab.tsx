import { useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Modal } from '../../platform'
import type { AgreementStatus, Owner, PaymentStatus } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { AGREEMENT_LABEL, PAYMENT_LABEL } from '../../lib/labels'
import { faNum, fmtMoney } from '../../lib/fa'
import { Badge, EmptyState, Field } from '../ui'

const AGREEMENT_COLOR: Record<AgreementStatus, string> = { unknown: '#94a3b8', not_contacted: '#94a3b8', negotiating: '#eab308', agreed: '#22c55e', refused: '#ef4444', legal: '#f97316' }
const PAYMENT_COLOR: Record<PaymentStatus, string> = { unpaid: '#94a3b8', partial: '#eab308', paid: '#22c55e' }

/** Owners of the parcel. Only the facts that drive decisions are kept — no scanned documents. */
export function OwnersTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const save = useLandStore((s) => s.saveOwner)
  const del = useLandStore((s) => s.deleteOwner)
  const [editing, setEditing] = useState<Owner | 'new' | null>(null)
  const share = p.owners.reduce((n, o) => n + (o.sharePct ?? 0), 0)
  const est = p.owners.reduce((n, o) => n + (o.estAmount ?? 0), 0)
  const fin = p.owners.reduce((n, o) => n + (o.finalAmount ?? 0), 0)

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="la-eyebrow m-0 leading-6">{faNum(p.owners.length)} مالک ثبت شده{p.ownerCountEst > p.owners.length ? ` از حدود ${faNum(p.ownerCountEst)} نفر` : ''}</p>
        <button className="la-btn la-btn-primary la-btn-sm" onClick={() => setEditing('new')}><Plus size={14} /> افزودن مالک</button>
      </div>

      {p.owners.length === 0 ? (
        <div className="la-card-flat"><EmptyState icon={<Users size={20} />} title="مالکی ثبت نشده" text="در مرحلهٔ «شناسایی مالک / متولی» نام و سهم مالکین را ثبت کنید." /></div>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {p.owners.map((o) => (
              <li key={o.id} className="la-card-flat p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[13px] font-bold">{o.name || 'بدون نام'}</p>
                    <p className="la-eyebrow m-0 leading-6">{o.sharePct != null ? `سهم ${faNum(o.sharePct)}٪` : 'سهم نامشخص'}{o.contact ? ` · ${o.contact}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="la-btn la-btn-ghost la-btn-icon" aria-label="ویرایش" onClick={() => setEditing(o)}><Pencil size={14} /></button>
                    <button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف" onClick={() => del(p.id, o.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge color={AGREEMENT_COLOR[o.agreement]}>{AGREEMENT_LABEL[o.agreement]}</Badge>
                  <Badge color={PAYMENT_COLOR[o.payment]}>{PAYMENT_LABEL[o.payment]}</Badge>
                  <Badge color={o.released ? '#22c55e' : '#94a3b8'}>{o.released ? 'آزاد شد' : 'آزادسازی نشده'}</Badge>
                </div>
                <p className="la-eyebrow m-0 mt-2">برآورد {fmtMoney(o.estAmount)} · نهایی {fmtMoney(o.finalAmount)}</p>
              </li>
            ))}
          </ul>
          <div className="la-card-flat flex flex-wrap items-center justify-between gap-2 p-3 text-[12px]">
            <span>جمع سهم‌ها: <b style={{ color: Math.abs(share - 100) > 0.5 ? '#f97316' : undefined }}>{faNum(+share.toFixed(2))}٪</b>{Math.abs(share - 100) > 0.5 && ' (باید ۱۰۰٪ شود)'}</span>
            <span>برآورد: <b>{fmtMoney(est)}</b></span>
            <span>نهایی: <b>{fmtMoney(fin || null)}</b></span>
          </div>
        </>
      )}
      {editing && <OwnerDialog parcelId={p.id} owner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function OwnerDialog({ parcelId, owner, onClose, onSave }: { parcelId: string; owner: Owner | null; onClose: () => void; onSave: (parcelId: string, o: Omit<Owner, 'id'> & { id?: string }) => Promise<void> }) {
  const [f, setF] = useState<Omit<Owner, 'id'>>({ parcelId, name: owner?.name ?? '', contact: owner?.contact ?? '', sharePct: owner?.sharePct ?? null, agreement: owner?.agreement ?? 'not_contacted', estAmount: owner?.estAmount ?? null, finalAmount: owner?.finalAmount ?? null, payment: owner?.payment ?? 'unpaid', released: owner?.released ?? false, notes: owner?.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const num = (v: string): number | null => (v === '' ? null : Number(v))
  return (
    <Modal title={owner ? 'ویرایش مالک' : 'افزودن مالک'} onClose={() => !busy && onClose()} width="max-w-lg" isDirty={!owner && !!f.name}>
      <div className="la-root grid gap-3 sm:grid-cols-2" dir="rtl">
        <Field label="نام مالک *" className="sm:col-span-2"><input className="la-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="اطلاعات تماس"><input className="la-input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Field label="سهم مالک (٪)"><input className="la-input la-num" type="number" min={0} max={100} step="any" value={f.sharePct ?? ''} onChange={(e) => setF({ ...f, sharePct: num(e.target.value) })} /></Field>
        <Field label="وضعیت توافق"><select className="la-select" value={f.agreement} onChange={(e) => setF({ ...f, agreement: e.target.value as AgreementStatus })}>{(Object.keys(AGREEMENT_LABEL) as AgreementStatus[]).map((k) => <option key={k} value={k}>{AGREEMENT_LABEL[k]}</option>)}</select></Field>
        <Field label="وضعیت پرداخت"><select className="la-select" value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value as PaymentStatus })}>{(Object.keys(PAYMENT_LABEL) as PaymentStatus[]).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}</select></Field>
        <Field label="مبلغ برآوردی (ریال)"><input className="la-input la-num" type="number" min={0} value={f.estAmount ?? ''} onChange={(e) => setF({ ...f, estAmount: num(e.target.value) })} /></Field>
        <Field label="مبلغ نهایی (ریال)"><input className="la-input la-num" type="number" min={0} value={f.finalAmount ?? ''} onChange={(e) => setF({ ...f, finalAmount: num(e.target.value) })} /></Field>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] sm:col-span-2"><input type="checkbox" checked={f.released} onChange={(e) => setF({ ...f, released: e.target.checked })} /> زمین این مالک آزادسازی شده است</label>
        <Field label="یادداشت" className="sm:col-span-2"><input className="la-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
          <button className="la-btn" disabled={busy} onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={busy || !f.name.trim()} onClick={async () => { setBusy(true); await onSave(parcelId, { ...f, name: f.name.trim(), id: owner?.id }); setBusy(false); onClose() }}>ذخیره</button>
        </div>
      </div>
    </Modal>
  )
}
