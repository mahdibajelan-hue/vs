import { useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Link2, Plus, Receipt, ShieldCheck, Stamp, Trash2, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { averagePaymentDelayDays, certificateGrossTotal, certificateOutstanding, certificatePaidTotal, paymentAgingDays, realizedPaymentDelayDays } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard, StampBadge, hexToStampTone } from '../components/FinanceDashboardUI'
import { AttachmentField, AttachmentLink } from '../components/AttachmentField'
import { FINANCE_ACCENT } from '../FinanceApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  FIN_CERTIFICATE_STATUS_COLOR,
  FIN_CERTIFICATE_STATUS_LABEL_FA,
  FIN_CERTIFICATE_STATUSES,
  FIN_CERTIFICATE_TYPE_LABEL_FA,
  FIN_CERTIFICATE_TYPES,
  type FinCertificateStatus,
  type FinCertificateType,
  type FinPaymentCertificate,
} from '../types'

const CERT_TYPE_COLOR: Record<FinCertificateType, string> = { work: '#5c7290', adjustment: '#8b6e9c' }

export function PaymentCertificatesPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const createCertificate = useFinanceStore((s) => s.createCertificate)
  const updateCertificate = useFinanceStore((s) => s.updateCertificate)
  const deleteCertificate = useFinanceStore((s) => s.deleteCertificate)
  const certifyCertificate = useFinanceStore((s) => s.certifyCertificate)
  const approveCertificate = useFinanceStore((s) => s.approveCertificate)
  const profiles = useFinanceStore((s) => s.profiles)
  const budget = useFinanceStore((s) => s.budgets.find((b) => b.masterProjectId === masterProjectId))
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const profileName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.fullName || 'کاربر نامشخص' : null)
  const approvalThreshold = budget?.certificateApprovalThreshold ?? null
  const exceedsThreshold = (cert: FinPaymentCertificate) => approvalThreshold != null && (cert.certifiedAmount ?? 0) > approvalThreshold

  const [contractId, setContractId] = useState<string | null>(contracts[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinPaymentCertificate | null>(null)
  const [certifying, setCertifying] = useState<FinPaymentCertificate | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const activeContract = contracts.find((c) => c.id === (contractId ?? contracts[0]?.id))
  const list = activeContract
    ? certificates.filter((c) => c.contractId === activeContract.id).sort((a, b) => (a.certificateDate < b.certificateDate ? 1 : -1))
    : []
  const workCertificates = list.filter((c) => c.certificateType === 'work')
  const certByNumber = (id: string | null) => (id ? list.find((c) => c.id === id) : null)

  const grossTotal = list.reduce((s, c) => s + certificateGrossTotal(c), 0)
  const certifiedTotal = list.reduce((s, c) => s + (c.certifiedAmount ?? 0), 0)
  const paidTotal = list.reduce((s, c) => s + certificatePaidTotal(c), 0)
  const outstandingTotal = list.reduce((s, c) => s + certificateOutstanding(c), 0)
  const avgDelay = averagePaymentDelayDays(list)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs fin-text-muted">صورت‌وضعیت‌های پرداخت</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={activeContract?.id ?? ''}
              onChange={(e) => setContractId(e.target.value)}
              className="fin-input"
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

      {activeContract && list.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            icon={Receipt}
            label="جمع ناخالص (شامل ارزی)"
            value={fmtCurrency(grossTotal, activeContract.currency)}
            color="#5c7290"
            tooltip="مجموع مبلغ ناخالص همه صورت‌وضعیت‌های این قرارداد پیش از هرگونه کسورات، به‌علاوه معادل ریالی سهم ارزی. هرچه بالاتر، حجم کارکرد گزارش‌شده بیشتر است."
          />
          <MetricCard
            icon={CheckCircle2}
            label="جمع تاییدشده"
            value={fmtCurrency(certifiedTotal, activeContract.currency)}
            color="#8b6e9c"
            tooltip="مجموع مبالغی که توسط کارفرما/مشاور تایید نهایی شده‌اند. فاصله زیاد بین این مقدار و «جمع ناخالص» نشانه صورت‌وضعیت‌های معطل‌مانده در فرآیند تایید است."
          />
          <MetricCard
            icon={Wallet}
            label="جمع پرداخت‌شده (شامل ارزی)"
            value={fmtCurrency(paidTotal, activeContract.currency)}
            color="#3e7c74"
            tooltip="مجموع مبالغ واقعا پرداخت‌شده به پیمانکار برای این قرارداد، به‌علاوه معادل ریالی سهم ارزی پرداختی."
          />
          <MetricCard
            icon={AlertCircle}
            label="مانده پرداخت‌نشده"
            value={fmtCurrency(outstandingTotal, activeContract.currency)}
            color={outstandingTotal > 0 ? '#b8863b' : '#3e7c74'}
            status={outstandingTotal > 0 ? 'warn' : 'good'}
            tooltip="تفاوت بین مبلغ تاییدشده (یا قابل پرداخت، اگر هنوز تایید نشده) و مبلغ پرداخت‌شده. این عدد بدهی جاری کارفرما به پیمانکار برای این قرارداد است."
            emphasize
          />
          <MetricCard
            icon={Clock}
            label="میانگین تاخیر پرداخت (روز)"
            value={avgDelay != null ? avgDelay.toLocaleString('fa-IR') : '—'}
            color={avgDelay != null && avgDelay > 30 ? '#b5573a' : '#5c7290'}
            status={avgDelay != null && avgDelay > 30 ? 'bad' : undefined}
            tooltip="میانگین فاصله زمانی بین تاریخ تایید (یا ارسال) و تاریخ پرداخت واقعی، فقط برای صورت‌وضعیت‌های پرداخت‌شده. عدد بالا یعنی روند پرداخت کند شده است."
          />
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : list.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">برای این قرارداد هنوز صورت‌وضعیتی ثبت نشده است.</div>
      ) : (
        <div className="space-y-3">
          {list.map((cert) => {
            const aging = paymentAgingDays(cert)
            const realizedDelay = realizedPaymentDelayDays(cert)
            const tone = FIN_CERTIFICATE_STATUS_COLOR[cert.status]
            const related = certByNumber(cert.relatedCertificateId)
            return (
              <div key={cert.id} className="fin-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Receipt size={14} style={{ color: FINANCE_ACCENT }} />
                      <p className="text-sm font-bold">صورت‌وضعیت {cert.certificateNumber || '—'}</p>
                      <StampBadge label={FIN_CERTIFICATE_TYPE_LABEL_FA[cert.certificateType]} tone={hexToStampTone(CERT_TYPE_COLOR[cert.certificateType])} />
                      <StampBadge label={FIN_CERTIFICATE_STATUS_LABEL_FA[cert.status]} tone={hexToStampTone(tone)} />
                      {aging != null && <StampBadge label={`${aging.toLocaleString('fa-IR')} روز معطلی پرداخت`} tone={aging > 30 ? 'bad' : 'warn'} />}
                      {realizedDelay != null && <StampBadge label={`تاخیر واقعی پرداخت: ${realizedDelay.toLocaleString('fa-IR')} روز`} tone="neutral" />}
                    </div>
                    <p className="num mt-0.5 text-[11px] fin-text-muted" dir="ltr">
                      {fmtDate(cert.certificateDate)}
                    </p>
                    {cert.certificateType === 'adjustment' && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] fin-text-secondary">
                        <Link2 size={11} />
                        تعدیل صورت‌وضعیت کارکرد {related ? `شماره ${related.certificateNumber || '—'}` : 'نامشخص'}
                        {cert.adjustmentFactor != null && <span className="num"> — ضریب تعدیل: {cert.adjustmentFactor.toLocaleString('fa-IR')}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!cert.certifiedBy && (
                      <button
                        onClick={() => setCertifying(cert)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white"
                        style={{ background: '#8b6e9c' }}
                      >
                        <Stamp size={12} /> ثبت تایید کارکرد
                      </button>
                    )}
                    {cert.certifiedBy && !cert.approvedBy && (
                      <button
                        onClick={() => isAdmin && approveCertificate(cert.id)}
                        disabled={!isAdmin}
                        title={!isAdmin ? 'تصویب نهایی صرفا برای مدیران سیستم مجاز است' : undefined}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                        style={{ background: exceedsThreshold(cert) ? '#b5573a' : '#3e7c74' }}
                      >
                        {exceedsThreshold(cert) ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                        {exceedsThreshold(cert) ? 'تصویب مدیرعامل (فراتر از سقف اختیار)' : 'تصویب نهایی'}
                      </button>
                    )}
                    <button onClick={() => setEditing(cert)} className="text-xs fin-text-secondary hover:underline">
                      ویرایش
                    </button>
                    <button onClick={() => deleteCertificate(cert.id)} className="fin-text-muted hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniField label="مبلغ ناخالص" value={fmtCurrency(cert.grossAmount, activeContract?.currency)} />
                  <MiniField label="کسر حسن انجام کار" value={fmtCurrency(cert.retentionAmount, activeContract?.currency)} />
                  <MiniField label="مالیات تکلیفی" value={fmtCurrency(cert.taxDeduction, activeContract?.currency)} />
                  <MiniField label="بیمه تامین اجتماعی" value={fmtCurrency(cert.insuranceDeduction, activeContract?.currency)} />
                  <MiniField label="سایر کسورات" value={fmtCurrency(cert.otherDeduction, activeContract?.currency)} />
                  <MiniField label="مبلغ قابل پرداخت (محاسبه‌شده)" value={fmtCurrency(cert.payableAmount, activeContract?.currency)} highlight />
                  <MiniField
                    label="مبلغ تاییدشده"
                    value={cert.certifiedAmount != null ? fmtCurrency(cert.certifiedAmount, activeContract?.currency) : 'در انتظار تایید'}
                  />
                  <MiniField label="مبلغ پرداخت‌شده" value={fmtCurrency(cert.paidAmount, activeContract?.currency)} />
                  <MiniField label="تاریخ ارسال" value={fmtDate(cert.submittedDate)} />
                  <MiniField label="تاریخ تایید" value={fmtDate(cert.certifiedDate)} />
                  <MiniField label="تاریخ پرداخت" value={fmtDate(cert.paidDate)} />
                </div>
                {(cert.grossFx.fcAmount > 0 || cert.paidFx.fcAmount > 0) && (
                  <div className="mt-2 space-y-0.5" dir="ltr">
                    {cert.grossFx.fcAmount > 0 && (
                      <p className="num text-[10.5px] fin-text-muted">
                        سهم ارزی ناخالص: {cert.grossFx.fcAmount.toLocaleString('fa-IR')} {cert.grossFx.fcCurrency} × {cert.grossFx.exchangeRate.toLocaleString('fa-IR')} ={' '}
                        {fmtCurrency(cert.grossFx.fcRialEquivalent, activeContract?.currency)}
                      </p>
                    )}
                    {cert.paidFx.fcAmount > 0 && (
                      <p className="num text-[10.5px] fin-text-muted">
                        سهم ارزی پرداختی: {cert.paidFx.fcAmount.toLocaleString('fa-IR')} {cert.paidFx.fcCurrency} × {cert.paidFx.exchangeRate.toLocaleString('fa-IR')} ={' '}
                        {fmtCurrency(cert.paidFx.fcRialEquivalent, activeContract?.currency)}
                      </p>
                    )}
                  </div>
                )}
                {cert.attachmentUrl && (
                  <div className="mt-2">
                    <AttachmentLink path={cert.attachmentUrl} />
                  </div>
                )}
                {(cert.certifiedBy || cert.approvedBy) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t pt-2.5 text-[10.5px] fin-text-muted" style={{ borderColor: 'var(--fin-divider)' }}>
                    <span className="flex items-center gap-1">
                      <Stamp size={11} />
                      زنجیره تایید:
                    </span>
                    {cert.certifiedBy && (
                      <span>
                        تایید کارکرد توسط <span className="font-bold fin-text-secondary">{profileName(cert.certifiedBy)}</span> در <span className="num">{fmtDate(cert.certifiedDate)}</span>
                      </span>
                    )}
                    {cert.approvedBy && (
                      <span>
                        تصویب نهایی توسط <span className="font-bold fin-text-secondary">{profileName(cert.approvedBy)}</span> در <span className="num">{fmtDate(cert.approvedDate)}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {certifying && (
        <CertifyModal
          cert={certifying}
          currency={activeContract?.currency}
          onClose={() => setCertifying(null)}
          onConfirm={async (amount) => {
            await certifyCertificate(certifying.id, amount)
            setCertifying(null)
          }}
        />
      )}

      {showNew && activeContract && (
        <CertificateModal
          title="صورت‌وضعیت جدید"
          currency={activeContract.currency}
          contractId={activeContract.id}
          workCertificates={workCertificates}
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
          contractId={activeContract?.id ?? editing.contractId}
          initial={editing}
          workCertificates={workCertificates.filter((c) => c.id !== editing.id)}
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
      <p className="text-[10px] fin-text-muted">{label}</p>
      <p className="num text-sm font-bold" style={highlight ? { color: FINANCE_ACCENT } : undefined}>
        {value}
      </p>
    </div>
  )
}

function CertifyModal({
  cert,
  currency,
  onClose,
  onConfirm,
}: {
  cert: FinPaymentCertificate
  currency?: string
  onClose: () => void
  onConfirm: (amount: number) => Promise<void>
}) {
  const [amount, setAmount] = useState(String(cert.payableAmount))
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-sm space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <Stamp size={15} style={{ color: '#8b6e9c' }} /> ثبت تایید کارکرد صورت‌وضعیت {cert.certificateNumber || '—'}
        </h3>
        <p className="text-[11px] fin-text-muted">
          با ثبت این تایید، مبلغ زیر به‌عنوان مبلغ نهایی تاییدشده کارکرد ثبت شده و نام و تاریخ شما به‌عنوان تاییدکننده در زنجیره تایید صورت‌وضعیت درج می‌شود.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">مبلغ تاییدشده ({currency ?? 'ریال'})</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" autoFocus />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm fin-text-secondary hover:opacity-70">
            انصراف
          </button>
          <button
            onClick={async () => {
              setSaving(true)
              await onConfirm(Number(amount) || 0)
              setSaving(false)
            }}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: '#8b6e9c' }}
          >
            {saving ? 'در حال ثبت...' : 'ثبت تایید'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CertificateModal({
  title,
  currency,
  contractId,
  initial,
  workCertificates,
  onClose,
  onSave,
}: {
  title: string
  currency?: string
  contractId: string
  initial?: FinPaymentCertificate
  workCertificates: FinPaymentCertificate[]
  onClose: () => void
  onSave: (data: Partial<FinPaymentCertificate>) => Promise<void>
}) {
  const [certificateNumber, setCertificateNumber] = useState(initial?.certificateNumber ?? '')
  const [certificateDate, setCertificateDate] = useState(initial?.certificateDate ?? new Date().toISOString().slice(0, 10))
  const [certificateType, setCertificateType] = useState<FinCertificateType>(initial?.certificateType ?? 'work')
  const [relatedCertificateId, setRelatedCertificateId] = useState(initial?.relatedCertificateId ?? '')
  const [adjustmentFactor, setAdjustmentFactor] = useState(initial?.adjustmentFactor != null ? String(initial.adjustmentFactor) : '')
  const [grossAmount, setGrossAmount] = useState(initial?.grossAmount != null ? String(initial.grossAmount) : '')
  const [fcAmount, setFcAmount] = useState(initial?.grossFx.fcAmount != null ? String(initial.grossFx.fcAmount) : '0')
  const [fcCurrency, setFcCurrency] = useState(initial?.grossFx.fcCurrency ?? 'EUR')
  const [exchangeRate, setExchangeRate] = useState(initial?.grossFx.exchangeRate != null ? String(initial.grossFx.exchangeRate) : '0')
  const [adjustments, setAdjustments] = useState(initial?.adjustments != null ? String(initial.adjustments) : '0')
  const [taxDeduction, setTaxDeduction] = useState(initial?.taxDeduction != null ? String(initial.taxDeduction) : '0')
  const [insuranceDeduction, setInsuranceDeduction] = useState(initial?.insuranceDeduction != null ? String(initial.insuranceDeduction) : '0')
  const [otherDeduction, setOtherDeduction] = useState(initial?.otherDeduction != null ? String(initial.otherDeduction) : '0')
  const [retentionAmount, setRetentionAmount] = useState(initial?.retentionAmount != null ? String(initial.retentionAmount) : '0')
  const [advanceRecoveryAmount, setAdvanceRecoveryAmount] = useState(initial?.advanceRecoveryAmount != null ? String(initial.advanceRecoveryAmount) : '0')
  const [certifiedAmount, setCertifiedAmount] = useState(initial?.certifiedAmount != null ? String(initial.certifiedAmount) : '')
  const [paidAmount, setPaidAmount] = useState(initial?.paidAmount != null ? String(initial.paidAmount) : '0')
  const [paidFcAmount, setPaidFcAmount] = useState(initial?.paidFx.fcAmount != null ? String(initial.paidFx.fcAmount) : '0')
  const [paidExchangeRate, setPaidExchangeRate] = useState(initial?.paidFx.exchangeRate != null ? String(initial.paidFx.exchangeRate) : '0')
  const [status, setStatus] = useState<FinCertificateStatus>(initial?.status ?? 'draft')
  const [submittedDate, setSubmittedDate] = useState(initial?.submittedDate ?? '')
  const [certifiedDate, setCertifiedDate] = useState(initial?.certifiedDate ?? '')
  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [attachmentUrl, setAttachmentUrl] = useState(initial?.attachmentUrl ?? '')
  const [saving, setSaving] = useState(false)

  const previewPayable =
    (grossAmount === '' ? 0 : Number(grossAmount)) +
    (Number(adjustments) || 0) -
    (Number(taxDeduction) || 0) -
    (Number(insuranceDeduction) || 0) -
    (Number(otherDeduction) || 0) -
    (Number(retentionAmount) || 0) -
    (Number(advanceRecoveryAmount) || 0)

  const submit = async () => {
    setSaving(true)
    await onSave({
      certificateNumber,
      certificateDate,
      certificateType,
      relatedCertificateId: certificateType === 'adjustment' ? relatedCertificateId || null : null,
      adjustmentFactor: certificateType === 'adjustment' && adjustmentFactor !== '' ? Number(adjustmentFactor) : null,
      grossAmount: grossAmount === '' ? 0 : Number(grossAmount),
      grossFx: { fcAmount: Number(fcAmount) || 0, fcCurrency, exchangeRate: Number(exchangeRate) || 0, fcRialEquivalent: 0 },
      adjustments: Number(adjustments) || 0,
      taxDeduction: Number(taxDeduction) || 0,
      insuranceDeduction: Number(insuranceDeduction) || 0,
      otherDeduction: Number(otherDeduction) || 0,
      retentionAmount: Number(retentionAmount) || 0,
      advanceRecoveryAmount: Number(advanceRecoveryAmount) || 0,
      certifiedAmount: certifiedAmount === '' ? null : Number(certifiedAmount),
      paidAmount: Number(paidAmount) || 0,
      paidFx: { fcAmount: Number(paidFcAmount) || 0, fcCurrency, exchangeRate: Number(paidExchangeRate) || 0, fcRialEquivalent: 0 },
      status,
      submittedDate: submittedDate || null,
      certifiedDate: certifiedDate || null,
      paidDate: paidDate || null,
      notes,
      attachmentUrl,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">شماره صورت‌وضعیت</span>
            <input value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} className="fin-input" dir="ltr" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ صورت‌وضعیت</span>
            <JalaliDateInput value={certificateDate} onChange={setCertificateDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">نوع صورت‌وضعیت</span>
            <select value={certificateType} onChange={(e) => setCertificateType(e.target.value as FinCertificateType)} className="fin-input">
              {FIN_CERTIFICATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIN_CERTIFICATE_TYPE_LABEL_FA[t]}
                </option>
              ))}
            </select>
          </label>
          {certificateType === 'adjustment' && (
            <label className="block">
              <span className="mb-1 block text-xs fin-text-secondary">صورت‌وضعیت کارکرد مرتبط</span>
              <select value={relatedCertificateId} onChange={(e) => setRelatedCertificateId(e.target.value)} className="fin-input">
                <option value="">—</option>
                {workCertificates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.certificateNumber || 'بدون شماره'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {certificateType === 'adjustment' && (
            <label className="block">
              <span className="mb-1 block text-xs fin-text-secondary">ضریب تعدیل</span>
              <input type="number" step="0.0001" value={adjustmentFactor} onChange={(e) => setAdjustmentFactor(e.target.value)} className="fin-input num" />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ ناخالص ریالی (Gross)</span>
            <input type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ ناخالص ارزی</span>
            <div className="flex gap-1.5">
              <input type="number" value={fcAmount} onChange={(e) => setFcAmount(e.target.value)} className="fin-input num" />
              <input value={fcCurrency} onChange={(e) => setFcCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">نرخ تبدیل (ناخالص)</span>
            <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تعدیلات (Adjustments)</span>
            <input type="number" value={adjustments} onChange={(e) => setAdjustments(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مالیات تکلیفی (Tax)</span>
            <input type="number" value={taxDeduction} onChange={(e) => setTaxDeduction(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">بیمه تامین اجتماعی (Insurance)</span>
            <input type="number" value={insuranceDeduction} onChange={(e) => setInsuranceDeduction(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">سایر کسورات (Other)</span>
            <input type="number" value={otherDeduction} onChange={(e) => setOtherDeduction(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">کسر حسن انجام کار (Retention)</span>
            <input type="number" value={retentionAmount} onChange={(e) => setRetentionAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">بازپرداخت پیش‌پرداخت (Advance Recovery)</span>
            <input type="number" value={advanceRecoveryAmount} onChange={(e) => setAdvanceRecoveryAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ قابل پرداخت (محاسبه خودکار)</span>
            <input value={fmtCurrency(previewPayable, currency)} disabled className="fin-input num opacity-70" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ تاییدشده</span>
            <input type="number" value={certifiedAmount} onChange={(e) => setCertifiedAmount(e.target.value)} className="fin-input num" placeholder="در انتظار تایید" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ پرداخت‌شده ریالی</span>
            <input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ پرداخت‌شده ارزی</span>
            <input type="number" value={paidFcAmount} onChange={(e) => setPaidFcAmount(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">نرخ تبدیل (پرداختی)</span>
            <input type="number" value={paidExchangeRate} onChange={(e) => setPaidExchangeRate(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FinCertificateStatus)} className="fin-input">
              {FIN_CERTIFICATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FIN_CERTIFICATE_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ ارسال</span>
            <JalaliDateInput value={submittedDate} onChange={setSubmittedDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ تایید</span>
            <JalaliDateInput value={certifiedDate} onChange={setCertifiedDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ پرداخت</span>
            <JalaliDateInput value={paidDate} onChange={setPaidDate} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">یادداشت</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="fin-input" />
        </label>
        <AttachmentField folder={`certificates/${contractId}`} value={attachmentUrl} onChange={setAttachmentUrl} />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm fin-text-secondary hover:opacity-70">
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
