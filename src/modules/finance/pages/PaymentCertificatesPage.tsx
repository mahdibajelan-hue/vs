import { useState } from 'react'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { paymentAgingDays } from '../lib/financeCalc'
import { fmtCurrency } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { FIN_CERTIFICATE_STATUS_COLOR, FIN_CERTIFICATE_STATUS_LABEL_FA, FIN_CERTIFICATE_STATUSES, type FinPaymentCertificate, type FinCertificateStatus } from '../types'

export function PaymentCertificatesPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const createCertificate = useFinanceStore((s) => s.createCertificate)
  const updateCertificate = useFinanceStore((s) => s.updateCertificate)
  const deleteCertificate = useFinanceStore((s) => s.deleteCertificate)

  const [contractId, setContractId] = useState<string | null>(contracts[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinPaymentCertificate | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const activeContract = contracts.find((c) => c.id === (contractId ?? contracts[0]?.id))
  const list = activeContract ? certificates.filter((c) => c.contractId === activeContract.id) : []

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs text-muted">صورت‌وضعیت‌های پرداخت</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={activeContract?.id ?? ''}
              onChange={(e) => setContractId(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.contractNumber || 'قرارداد بدون عنوان'}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white"
              style={{ background: FINANCE_ACCENT }}
            >
              <Plus size={13} /> صورت‌وضعیت جدید
            </button>
          </div>
        )}
      </div>

      {contracts.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : list.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">برای این قرارداد هنوز صورت‌وضعیتی ثبت نشده است.</div>
      ) : (
        <div className="space-y-3">
          {list.map((cert) => {
            const aging = paymentAgingDays(cert)
            const tone = FIN_CERTIFICATE_STATUS_COLOR[cert.status]
            return (
              <div key={cert.id} className="glass-panel rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Receipt size={14} style={{ color: FINANCE_ACCENT }} />
                      <p className="text-sm font-bold">صورت‌وضعیت {cert.certificateNumber || '—'}</p>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${tone}55`, color: tone }}>
                        {FIN_CERTIFICATE_STATUS_LABEL_FA[cert.status]}
                      </span>
                      {aging != null && (
                        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: aging > 30 ? '#e74c3c55' : '#f1c40f55', color: aging > 30 ? '#e74c3c' : '#f1c40f' }}>
                          {aging} روز معطلی پرداخت
                        </span>
                      )}
                    </div>
                    <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                      {cert.certificateDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(cert)} className="text-xs text-secondary hover:underline">
                      ویرایش
                    </button>
                    <button onClick={() => deleteCertificate(cert.id)} className="text-muted hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniField label="مبلغ ناخالص" value={fmtCurrency(cert.grossAmount, activeContract?.currency)} />
                  <MiniField label="کسورات (حسن انجام کار + بازپرداخت پیش‌پرداخت)" value={fmtCurrency(cert.retentionAmount + cert.advanceRecoveryAmount + cert.deductions, activeContract?.currency)} />
                  <MiniField label="مبلغ قابل پرداخت (محاسبه‌شده)" value={fmtCurrency(cert.payableAmount, activeContract?.currency)} highlight />
                  <MiniField
                    label="مبلغ تاییدشده"
                    value={cert.certifiedAmount != null ? fmtCurrency(cert.certifiedAmount, activeContract?.currency) : 'در انتظار تایید'}
                  />
                  <MiniField label="مبلغ پرداخت‌شده" value={fmtCurrency(cert.paidAmount, activeContract?.currency)} />
                  <MiniField label="تاریخ ارسال" value={cert.submittedDate ?? '—'} />
                  <MiniField label="تاریخ تایید" value={cert.certifiedDate ?? '—'} />
                  <MiniField label="تاریخ پرداخت" value={cert.paidDate ?? '—'} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && activeContract && (
        <CertificateModal
          title="صورت‌وضعیت جدید"
          currency={activeContract.currency}
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            await createCertificate(activeContract.id, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <CertificateModal
          title="ویرایش صورت‌وضعیت"
          currency={activeContract?.currency}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateCertificate(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function MiniField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted">{label}</p>
      <p className="num text-sm font-bold" style={highlight ? { color: FINANCE_ACCENT } : undefined}>
        {value}
      </p>
    </div>
  )
}

function CertificateModal({
  title,
  currency,
  initial,
  onClose,
  onSave,
}: {
  title: string
  currency?: string
  initial?: FinPaymentCertificate
  onClose: () => void
  onSave: (data: Partial<FinPaymentCertificate>) => Promise<void>
}) {
  const [certificateNumber, setCertificateNumber] = useState(initial?.certificateNumber ?? '')
  const [certificateDate, setCertificateDate] = useState(initial?.certificateDate ?? new Date().toISOString().slice(0, 10))
  const [grossAmount, setGrossAmount] = useState(initial?.grossAmount != null ? String(initial.grossAmount) : '')
  const [adjustments, setAdjustments] = useState(initial?.adjustments != null ? String(initial.adjustments) : '0')
  const [deductions, setDeductions] = useState(initial?.deductions != null ? String(initial.deductions) : '0')
  const [retentionAmount, setRetentionAmount] = useState(initial?.retentionAmount != null ? String(initial.retentionAmount) : '0')
  const [advanceRecoveryAmount, setAdvanceRecoveryAmount] = useState(initial?.advanceRecoveryAmount != null ? String(initial.advanceRecoveryAmount) : '0')
  const [certifiedAmount, setCertifiedAmount] = useState(initial?.certifiedAmount != null ? String(initial.certifiedAmount) : '')
  const [paidAmount, setPaidAmount] = useState(initial?.paidAmount != null ? String(initial.paidAmount) : '0')
  const [status, setStatus] = useState<FinCertificateStatus>(initial?.status ?? 'draft')
  const [submittedDate, setSubmittedDate] = useState(initial?.submittedDate ?? '')
  const [certifiedDate, setCertifiedDate] = useState(initial?.certifiedDate ?? '')
  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const previewPayable =
    (grossAmount === '' ? 0 : Number(grossAmount)) +
    (Number(adjustments) || 0) -
    (Number(deductions) || 0) -
    (Number(retentionAmount) || 0) -
    (Number(advanceRecoveryAmount) || 0)

  const submit = async () => {
    setSaving(true)
    await onSave({
      certificateNumber,
      certificateDate,
      grossAmount: grossAmount === '' ? 0 : Number(grossAmount),
      adjustments: Number(adjustments) || 0,
      deductions: Number(deductions) || 0,
      retentionAmount: Number(retentionAmount) || 0,
      advanceRecoveryAmount: Number(advanceRecoveryAmount) || 0,
      certifiedAmount: certifiedAmount === '' ? null : Number(certifiedAmount),
      paidAmount: Number(paidAmount) || 0,
      status,
      submittedDate: submittedDate || null,
      certifiedDate: certifiedDate || null,
      paidDate: paidDate || null,
      notes,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره صورت‌وضعیت</span>
            <input value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} className="input" dir="ltr" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ صورت‌وضعیت</span>
            <input type="date" value={certificateDate} onChange={(e) => setCertificateDate(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ ناخالص (Gross)</span>
            <input type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تعدیلات (Adjustments)</span>
            <input type="number" value={adjustments} onChange={(e) => setAdjustments(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کسورات متفرقه (Deductions)</span>
            <input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کسر حسن انجام کار (Retention)</span>
            <input type="number" value={retentionAmount} onChange={(e) => setRetentionAmount(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">بازپرداخت پیش‌پرداخت (Advance Recovery)</span>
            <input type="number" value={advanceRecoveryAmount} onChange={(e) => setAdvanceRecoveryAmount(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ قابل پرداخت (محاسبه خودکار)</span>
            <input value={fmtCurrency(previewPayable, currency)} disabled className="input num opacity-70" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ تاییدشده</span>
            <input type="number" value={certifiedAmount} onChange={(e) => setCertifiedAmount(e.target.value)} className="input num" placeholder="در انتظار تایید" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ پرداخت‌شده</span>
            <input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FinCertificateStatus)} className="input">
              {FIN_CERTIFICATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FIN_CERTIFICATE_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ ارسال</span>
            <input type="date" value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ تایید</span>
            <input type="date" value={certifiedDate} onChange={(e) => setCertifiedDate(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ پرداخت</span>
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="input num" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
