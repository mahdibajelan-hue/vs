import { useState } from 'react'
import { ShieldAlert, Plus, Trash2 } from 'lucide-react'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { useAuthStore } from '../../platform'
import { benchmarkFor, unitPrice, verdictOf } from '../../lib/pricing'
import { PAYMENT_LABEL } from '../../lib/finance'
import { faNum, fmtDateShort, fmtMoney } from '../../lib/fa'
import { Field } from '../ui'
import { HelpButton } from '../Help'
import { MoneyInput } from '../MoneyInput'
import { PaymentDialog } from '../PaymentDialog'

const VERDICT = { ok: { label: 'قیمت در محدودهٔ متعارف', color: '#22c55e' }, low: { label: 'قیمت غیرمتعارف — بسیار پایین', color: '#f59e0b' }, high: { label: 'قیمت غیرمتعارف — بسیار بالا', color: '#ef4444' } } as const

/** Land price of one parcel: area × unit price checked against the expected range, the exception request, and the money paid for it. */
export function FinanceTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const all = useLandStore((s) => s.data?.parcels ?? [])
  const payments = useLandStore((s) => s.data?.payments ?? [])
  const role = useLandStore((s) => s.data?.myRole ?? null)
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const setPrice = useLandStore((s) => s.setLandPrice)
  const request = useLandStore((s) => s.requestPriceException)
  const decide = useLandStore((s) => s.decidePriceException)
  const delPay = useLandStore((s) => s.deletePayment)
  const [area, setArea] = useState<number | null>(p.areaM2)
  const [unit, setUnit] = useState<number | null>(() => { const u = unitPrice(p); return u == null ? null : Math.round(u) })
  const [reason, setReason] = useState('')
  const [askEx, setAskEx] = useState(false)
  const [note, setNote] = useState('')
  const [dialog, setDialog] = useState(false)
  const bm = benchmarkFor(p, all)
  const verdict = unit != null && unit > 0 ? verdictOf(unit, bm) : null
  const ex = p.priceException
  const mine = payments.filter((x) => x.parcelId === p.id)
  const canDecide = isAdmin || role === 'project_manager' || role === 'executive'
  const total = unit != null && area ? Math.round(unit * area) : null
  const save = async () => {
    const r = await setPrice(p.id, area, unit)
    if (r === 'needs_exception') setAskEx(true)
    else if (r === 'saved') setAskEx(false)
  }
  return (
    <div className="flex flex-col gap-4 p-5">
      <section className="la-card-flat grid gap-3 p-4 sm:grid-cols-2">
        <p className="la-title m-0 flex items-center gap-1.5 sm:col-span-2">قیمت زمین <HelpButton topic="price" /></p>
        <Field label="مساحت (متر مربع)"><input className="la-input la-num" type="number" min={0} value={area ?? ''} onChange={(e) => setArea(e.target.value === '' ? null : Number(e.target.value))} /></Field>
        <Field label="قیمت هر متر مربع (ریال)"><MoneyInput value={unit} onChange={setUnit} /></Field>
        <div className="sm:col-span-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--la-ink-2)' }}>برآورد کل این قطعه: <b className="la-num" style={{ color: 'var(--la-ink)' }}>{total != null ? fmtMoney(total) : '—'}</b></p>
          {verdict && <p className="m-0 mt-1 text-[12.5px] font-bold" style={{ color: VERDICT[verdict].color }}>{VERDICT[verdict].label}</p>}
        </div>
        <div className="sm:col-span-2"><button className="la-btn la-btn-primary" onClick={save}>ثبت قیمت</button></div>
      </section>

      <section className="la-card-flat p-4">
        <p className="la-title m-0">قیمت مورد انتظار</p>
        <p className="m-0 mt-2 text-[20px] font-bold la-num">{faNum(Math.round(bm.expected))} <small className="text-[12px] font-semibold" style={{ color: 'var(--la-ink-2)' }}>ریال بر متر مربع</small></p>
        <p className="la-eyebrow mt-1 leading-6">محدودهٔ متعارف: {faNum(Math.round(bm.low))} تا {faNum(Math.round(bm.high))} ریال · {bm.source === 'project' ? `میانهٔ ${faNum(bm.samples)} قطعهٔ هم‌نوع همین پروژه` : 'جدول قیمت مرجع برای این نوع زمین (داده‌ی کافی در پروژه نیست)'}</p>
        {bm.factors.length > 0 && <ul className="m-0 mt-2 list-disc ps-5 text-[12px] leading-7" style={{ color: 'var(--la-ink-2)' }}>{bm.factors.map((f) => <li key={f.label}>{f.label} ×{faNum(f.mult)}</li>)}</ul>}
      </section>

      {(askEx || ex) && (
        <section className="la-card-flat flex flex-col gap-3 p-4" style={{ borderColor: 'color-mix(in srgb, #f59e0b 50%, var(--la-line))' }}>
          <p className="la-title m-0 flex items-center gap-2" style={{ color: '#f59e0b' }}><ShieldAlert size={16} /> ثبت استثنایی قیمت</p>
          {ex && (
            <p className="m-0 text-[12.5px] leading-7">
              <b>{ex.status === 'requested' ? 'در انتظار تصمیم مدیر پروژه' : ex.status === 'approved' ? 'تأیید شد' : 'رد شد'}</b> — قیمت درخواستی {faNum(ex.price)} ریال بر متر مربع، توسط {ex.requestedBy || '—'}.
              <span className="block" style={{ color: 'var(--la-ink-2)' }}>دلیل: {ex.reason}</span>
              {ex.decidedBy && <span className="block" style={{ color: 'var(--la-ink-2)' }}>تصمیم: {ex.decidedBy}{ex.decisionNote ? ` — ${ex.decisionNote}` : ''}</span>}
            </p>
          )}
          {askEx && (!ex || ex.status !== 'requested') && (
            <>
              <p className="la-eyebrow m-0 leading-7">این قیمت از محدودهٔ متعارف بیرون است و به‌صورت عادی ثبت نمی‌شود. دلیل را بنویسید؛ درخواست برای مدیر پروژه، مجری طرح و مسئول حقوقی کارفرما هشدار می‌شود و پس از تأیید مدیر پروژه قیمت ثبت خواهد شد.</p>
              <textarea className="la-input la-textarea" placeholder="دلیل قیمت استثنایی (مثلاً کارشناسی رسمی، موقعیت ویژه، رأی دادگاه …)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div><button className="la-btn la-btn-primary" disabled={unit == null || reason.trim().length < 15} onClick={async () => { if (unit && (await request(p.id, unit, reason))) { setAskEx(false); setReason('') } }}>ارسال درخواست استثنا</button></div>
            </>
          )}
          {ex?.status === 'requested' && canDecide && (
            <div className="flex flex-col gap-2">
              <input className="la-input" placeholder="توضیح تصمیم (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2"><button className="la-btn la-btn-primary" onClick={() => decide(p.id, true, note)}>تأیید و ثبت قیمت</button><button className="la-btn la-btn-danger" onClick={() => decide(p.id, false, note)}>رد درخواست</button></div>
            </div>
          )}
          {ex?.status === 'requested' && !canDecide && <p className="la-eyebrow m-0">تصمیم با مدیر پروژه یا مجری طرح است.</p>}
        </section>
      )}

      <section className="la-card-flat p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="la-title m-0">پرداخت‌های این قطعه</p>
          <button className="la-btn la-btn-sm" onClick={() => setDialog(true)}><Plus size={13} /> ثبت پرداخت</button>
        </div>
        {mine.length === 0 ? <p className="la-eyebrow mt-2">پرداختی ثبت نشده است.</p> : (
          <ul className="m-0 mt-2 list-none p-0">
            {mine.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2 text-[12.5px]" style={{ borderTop: '1px solid var(--la-line)' }}>
                <span className="min-w-0 flex-1"><b>{PAYMENT_LABEL[x.category]}</b> · {x.payee}<span className="la-eyebrow block">{fmtDateShort(x.paidDate)}{x.ref ? ` · ${x.ref}` : ''}</span></span>
                <b className="la-num">{fmtMoney(x.amount)}</b>
                <button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف پرداخت" onClick={() => delPay(x.id)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog && <PaymentDialog parcelId={p.id} onClose={() => setDialog(false)} />}
    </div>
  )
}
