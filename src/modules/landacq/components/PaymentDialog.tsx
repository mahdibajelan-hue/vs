import { useState } from 'react'
import { JalaliDateInput, Modal } from '../platform'
import { useLandStore } from '../store/useLandStore'
import { PAYMENT_LABEL } from '../lib/finance'
import { todayIso } from '../lib/dates'
import type { PaymentCategory } from '../types'
import { Field } from './ui'
import { MoneyInput } from './MoneyInput'

/** Record one payment made for land acquisition (an owner, or an expert / transfer / legal fee). */
export function PaymentDialog({ onClose, parcelId = null, category = 'owner' }: { onClose: () => void; parcelId?: string | null; category?: PaymentCategory }) {
  const parcels = useLandStore((s) => s.data?.parcels)
  const save = useLandStore((s) => s.savePayment)
  const [f, setF] = useState({ category, parcelId: parcelId ?? '', payee: '', amount: null as number | null, paidDate: todayIso(), ref: '', note: '' })
  const valid = (f.amount ?? 0) > 0 && f.payee.trim() !== '' && f.paidDate !== ''
  return (
    <Modal title="ثبت پرداخت" onClose={onClose} width="max-w-lg">
      <div className="la-root grid gap-3 sm:grid-cols-2" dir="rtl">
        <Field label="نوع پرداخت">
          <select className="la-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PaymentCategory })}>
            {(Object.keys(PAYMENT_LABEL) as PaymentCategory[]).map((c) => <option key={c} value={c}>{PAYMENT_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="مربوط به قطعه / ایستگاه (اختیاری)">
          <select className="la-select" value={f.parcelId} onChange={(e) => setF({ ...f, parcelId: e.target.value })}>
            <option value="">— عمومی پروژه —</option>
            {(parcels ?? []).map((p) => <option key={p.id} value={p.id}>{p.code}{p.title ? ` · ${p.title}` : ''}</option>)}
          </select>
        </Field>
        <Field label={f.category === 'owner' ? 'نام مالک' : 'دریافت‌کننده (کارشناس / اداره / وکیل …)'}><input className="la-input" value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
        <Field label="مبلغ (ریال)"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <div><span className="la-label">تاریخ پرداخت</span><JalaliDateInput value={f.paidDate} onChange={(iso) => setF({ ...f, paidDate: iso ?? '' })} /></div>
        <Field label="شمارهٔ سند / چک / فیش"><input className="la-input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
        <Field label="توضیح" className="sm:col-span-2"><input className="la-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={!valid} onClick={async () => { await save({ category: f.category, parcelId: f.parcelId || null, payee: f.payee.trim(), amount: f.amount ?? 0, paidDate: f.paidDate, ref: f.ref, note: f.note, isDemo: false }); onClose() }}>ثبت پرداخت</button>
        </div>
      </div>
    </Modal>
  )
}
