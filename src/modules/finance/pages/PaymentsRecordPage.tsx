import { useState } from 'react'
import { AlertTriangle, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { certificatePaidTotal } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard } from '../components/FinanceDashboardUI'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import type { FinPayment } from '../types'

/**
 * سوابق پرداخت — an itemized ledger of payment transactions per certificate. Record-keeping only:
 * a certificate's own paidAmount/paidDate (used everywhere else in the module) is not recomputed
 * from this list — a small reconciliation badge flags certificates where the two diverge.
 */
export function PaymentsRecordPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const payments = useFinanceStore((s) => s.payments)
  const createPayment = useFinanceStore((s) => s.createPayment)
  const updatePayment = useFinanceStore((s) => s.updatePayment)
  const deletePayment = useFinanceStore((s) => s.deletePayment)

  const [contractId, setContractId] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinPayment | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const projectCertificates = certificates.filter((c) => contractIds.has(c.contractId))
  const scopedCertificateIds = new Set((contractId ? projectCertificates.filter((c) => c.contractId === contractId) : projectCertificates).map((c) => c.id))
  const list = payments.filter((p) => scopedCertificateIds.has(p.certificateId)).sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))

  const certOf = (id: string) => certificates.find((c) => c.id === id)
  const contractOf = (certId: string) => contracts.find((c) => c.id === certOf(certId)?.contractId)
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'

  const totalLogged = list.reduce((s, p) => s + p.amount + p.fx.fcRialEquivalent, 0)
  const mismatchCount = projectCertificates.filter((c) => {
    const loggedForCert = payments.filter((p) => p.certificateId === c.id).reduce((s, p) => s + p.amount + p.fx.fcRialEquivalent, 0)
    return Math.abs(loggedForCert - certificatePaidTotal(c)) > 1 && (loggedForCert > 0 || certificatePaidTotal(c) > 0)
  }).length

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">سوابق پرداخت</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <div className="flex items-center gap-2">
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="fin-input">
              <option value="">همه قراردادها</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.contractNumber}
                </option>
              ))}
            </select>
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: '#10b981' }}>
              <Plus size={13} /> ثبت پرداخت
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard icon={Wallet} label="مجموع پرداخت‌های ثبت‌شده" value={fmtCurrency(totalLogged, currency)} color="#10b981" />
        <MetricCard icon={Receipt} label="تعداد رکورد پرداخت" value={list.length.toLocaleString('fa-IR')} color="#3b82f6" />
        <MetricCard
          icon={AlertTriangle}
          label="صورت‌وضعیت‌های دارای مغایرت"
          value={mismatchCount.toLocaleString('fa-IR')}
          color={mismatchCount > 0 ? '#ef4444' : '#16a34a'}
        />
      </div>

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : list.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز پرداختی ثبت نشده است.</div>
      ) : (
        <div className="fin-card overflow-x-auto p-4">
          <table className="w-full min-w-[760px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted text-[10px]">
                <th className="pb-2 font-medium">تاریخ پرداخت</th>
                <th className="pb-2 font-medium">صورت‌وضعیت</th>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">مبلغ</th>
                <th className="pb-2 font-medium">روش پرداخت</th>
                <th className="pb-2 font-medium">شماره پیگیری</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}>
                  <td className="num fin-text py-2">{fmtDate(p.paymentDate)}</td>
                  <td className="fin-text py-2">{certOf(p.certificateId)?.certificateNumber || '—'}</td>
                  <td className="fin-text py-2">{contractOf(p.certificateId)?.title || contractOf(p.certificateId)?.contractNumber || '—'}</td>
                  <td className="num fin-text py-2 font-bold">{fmtCurrency(p.amount + p.fx.fcRialEquivalent, currency)}</td>
                  <td className="fin-text py-2">{p.method || '—'}</td>
                  <td className="num fin-text py-2">{p.referenceNumber || '—'}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(p)} className="fin-text-secondary text-[10.5px] hover:underline">
                        ویرایش
                      </button>
                      <button onClick={() => deletePayment(p.id)} className="fin-text-muted hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <PaymentModal
          title="ثبت پرداخت جدید"
          certificates={projectCertificates}
          contracts={contracts}
          onClose={() => setShowNew(false)}
          onSave={async (certificateId, data) => {
            await createPayment(certificateId, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <PaymentModal
          title="ویرایش پرداخت"
          certificates={projectCertificates}
          contracts={contracts}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (_certificateId, data) => {
            await updatePayment(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function PaymentModal({
  title,
  certificates,
  contracts,
  initial,
  onClose,
  onSave,
}: {
  title: string
  certificates: { id: string; certificateNumber: string; contractId: string }[]
  contracts: { id: string; title: string; contractNumber: string }[]
  initial?: FinPayment
  onClose: () => void
  onSave: (certificateId: string, data: Partial<FinPayment>) => Promise<void>
}) {
  const [certificateId, setCertificateId] = useState(initial?.certificateId ?? certificates[0]?.id ?? '')
  const [paymentDate, setPaymentDate] = useState(initial?.paymentDate ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [fcAmount, setFcAmount] = useState(initial?.fx.fcAmount != null ? String(initial.fx.fcAmount) : '0')
  const [fcCurrency, setFcCurrency] = useState(initial?.fx.fcCurrency ?? 'EUR')
  const [exchangeRate, setExchangeRate] = useState(initial?.fx.exchangeRate != null ? String(initial.fx.exchangeRate) : '0')
  const [method, setMethod] = useState(initial?.method ?? '')
  const [referenceNumber, setReferenceNumber] = useState(initial?.referenceNumber ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const contractOf = (certId: string) => contracts.find((c) => c.id === certificates.find((cert) => cert.id === certId)?.contractId)

  const submit = async () => {
    if (!certificateId) return
    setSaving(true)
    await onSave(certificateId, {
      paymentDate,
      amount: amount === '' ? 0 : Number(amount),
      fx: { fcAmount: Number(fcAmount) || 0, fcCurrency, exchangeRate: Number(exchangeRate) || 0, fcRialEquivalent: 0 },
      method,
      referenceNumber,
      notes,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="fin-text text-sm font-extrabold">{title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="fin-text-secondary mb-1 block text-xs">صورت‌وضعیت</span>
            <select value={certificateId} onChange={(e) => setCertificateId(e.target.value)} className="fin-input" autoFocus>
              {certificates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.certificateNumber || 'بدون شماره'} — {contractOf(c.id)?.title || contractOf(c.id)?.contractNumber || ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">تاریخ پرداخت</span>
            <JalaliDateInput value={paymentDate} onChange={setPaymentDate} />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">مبلغ ریالی</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">مبلغ ارزی</span>
            <div className="flex gap-1.5">
              <input type="number" value={fcAmount} onChange={(e) => setFcAmount(e.target.value)} className="fin-input num" />
              <input value={fcCurrency} onChange={(e) => setFcCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">نرخ تبدیل</span>
            <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">روش پرداخت</span>
            <input value={method} onChange={(e) => setMethod(e.target.value)} className="fin-input" placeholder="مثلاً انتقال بانکی، چک" />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">شماره پیگیری/سند</span>
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="fin-input num" dir="ltr" />
          </label>
        </div>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">یادداشت</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="fin-input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="fin-text-secondary rounded-lg px-4 py-2 text-sm hover:opacity-70">
            انصراف
          </button>
          <button onClick={submit} disabled={saving || !certificateId} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#10b981' }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
