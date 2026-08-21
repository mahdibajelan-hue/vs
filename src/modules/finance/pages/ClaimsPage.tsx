import { useState } from 'react'
import { AlertTriangle, FileWarning, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { claimsExposureTotal, staleClaims } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard, StampBadge, hexToStampTone } from '../components/FinanceDashboardUI'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  FIN_CLAIM_STATUS_COLOR,
  FIN_CLAIM_STATUS_LABEL_FA,
  FIN_CLAIM_STATUSES,
  FIN_CLAIM_TYPE_LABEL_FA,
  FIN_CLAIM_TYPES,
  type FinClaim,
  type FinClaimStatus,
  type FinClaimType,
} from '../types'

/**
 * کلایم پیمانکار (Contractor Claims) — deliberately separate from Contract Amendments: a claim
 * starts as a contractor assertion (time extension / cost / disruption / variation) that may be
 * rejected, partially approved, or go to arbitration, so it's tracked with its own review
 * workflow rather than as an already-agreed value change.
 */
export function ClaimsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const claims = useFinanceStore((s) => s.claims)
  const createClaim = useFinanceStore((s) => s.createClaim)
  const updateClaim = useFinanceStore((s) => s.updateClaim)
  const deleteClaim = useFinanceStore((s) => s.deleteClaim)

  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinClaim | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const list = claims.filter((c) => contractIds.has(c.contractId)).sort((a, b) => (a.submittedDate < b.submittedDate ? 1 : -1))
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'
  const contractOf = (id: string) => contracts.find((c) => c.id === id)
  const contractLabel = (id: string) => contractOf(id)?.title || contractOf(id)?.contractNumber || '—'
  const stale = staleClaims(list)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">کلایم پیمانکار</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: '#b8863b' }}>
            <Plus size={13} /> ثبت کلایم جدید
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={FileWarning} label="تعداد کل کلایم‌ها" value={list.length.toLocaleString('fa-IR')} color="#5c7290" />
        <MetricCard icon={AlertTriangle} label="مواجهه مالی کلایم‌های حل‌نشده" value={fmtCurrency(claimsExposureTotal(list), currency)} color="#b8863b" />
        <MetricCard
          icon={AlertTriangle}
          label="کلایم‌های بدون تصمیم (بیش از ۱۴ روز)"
          value={stale.length.toLocaleString('fa-IR')}
          color={stale.length > 0 ? '#b5573a' : '#3e7c74'}
          status={stale.length > 0 ? 'bad' : 'good'}
        />
        <MetricCard
          icon={FileWarning}
          label="مبلغ تاییدشده کلایم‌ها"
          value={fmtCurrency(
            list.filter((c) => c.status === 'approved' || c.status === 'partially_approved').reduce((s, c) => s + (c.amountApproved ?? 0), 0),
            currency,
          )}
          color="#3e7c74"
        />
      </div>

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : list.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز کلایمی ثبت نشده است.</div>
      ) : (
        <div className="fin-card overflow-x-auto p-4">
          <table className="w-full min-w-[860px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted text-[10px]">
                <th className="pb-2 font-medium">شماره/عنوان</th>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">نوع</th>
                <th className="pb-2 font-medium">تاریخ ارسال</th>
                <th className="pb-2 font-medium">مبلغ ادعاشده</th>
                <th className="pb-2 font-medium">مبلغ تاییدشده</th>
                <th className="pb-2 font-medium">وضعیت</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const daysOpen = Math.round((Date.now() - Date.parse(c.submittedDate)) / 86400000)
                const isStale = (c.status === 'submitted' || c.status === 'under_review' || c.status === 'arbitration') && daysOpen > 14
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}>
                    <td className="fin-text py-2">
                      <p className="font-bold">{c.claimNumber || '—'}</p>
                      <p className="fin-text-muted mt-0.5 max-w-[220px] truncate text-[10px]">{c.title || '—'}</p>
                    </td>
                    <td className="fin-text py-2">{contractLabel(c.contractId)}</td>
                    <td className="py-2">
                      <StampBadge label={FIN_CLAIM_TYPE_LABEL_FA[c.claimType]} tone="tertiary" />
                    </td>
                    <td className="num fin-text-muted py-2">{fmtDate(c.submittedDate)}</td>
                    <td className="num fin-text py-2 font-bold">{fmtCurrency(c.amountClaimed, c.currency)}</td>
                    <td className="num fin-text py-2">{c.amountApproved != null ? fmtCurrency(c.amountApproved, c.currency) : '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StampBadge label={FIN_CLAIM_STATUS_LABEL_FA[c.status]} tone={hexToStampTone(FIN_CLAIM_STATUS_COLOR[c.status])} />
                        {isStale && <StampBadge label={`${daysOpen.toLocaleString('fa-IR')} روز`} tone="bad" />}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditing(c)} className="fin-text-secondary text-[10.5px] hover:underline">
                          ویرایش
                        </button>
                        <button onClick={() => deleteClaim(c.id)} className="fin-text-muted hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <ClaimModal
          title="ثبت کلایم جدید"
          contracts={contracts}
          onClose={() => setShowNew(false)}
          onSave={async (contractId, data) => {
            await createClaim(contractId, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <ClaimModal
          title="ویرایش کلایم"
          contracts={contracts}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (_contractId, data) => {
            await updateClaim(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ClaimModal({
  title,
  contracts,
  initial,
  onClose,
  onSave,
}: {
  title: string
  contracts: { id: string; title: string; contractNumber: string; currency: string }[]
  initial?: FinClaim
  onClose: () => void
  onSave: (contractId: string, data: Partial<FinClaim>) => Promise<void>
}) {
  const [contractId, setContractId] = useState(initial?.contractId ?? contracts[0]?.id ?? '')
  const [claimNumber, setClaimNumber] = useState(initial?.claimNumber ?? '')
  const [claimType, setClaimType] = useState<FinClaimType>(initial?.claimType ?? 'variation')
  const [claimTitle, setClaimTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [submittedDate, setSubmittedDate] = useState(initial?.submittedDate ?? new Date().toISOString().slice(0, 10))
  const [amountClaimed, setAmountClaimed] = useState(initial?.amountClaimed != null ? String(initial.amountClaimed) : '')
  const [amountApproved, setAmountApproved] = useState(initial?.amountApproved != null ? String(initial.amountApproved) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? contracts[0]?.currency ?? 'IRR')
  const [status, setStatus] = useState<FinClaimStatus>(initial?.status ?? 'submitted')
  const [correspondenceRef, setCorrespondenceRef] = useState(initial?.correspondenceRef ?? '')
  const [resolutionDate, setResolutionDate] = useState(initial?.resolutionDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!contractId) return
    setSaving(true)
    await onSave(contractId, {
      claimNumber,
      claimType,
      title: claimTitle,
      description,
      submittedDate,
      amountClaimed: amountClaimed === '' ? 0 : Number(amountClaimed),
      amountApproved: amountApproved === '' ? null : Number(amountApproved),
      currency,
      status,
      correspondenceRef,
      resolutionDate: resolutionDate || null,
      notes,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="fin-text flex items-center gap-2 text-sm font-extrabold">
          <FileWarning size={15} style={{ color: '#b8863b' }} /> {title}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">قرارداد</span>
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="fin-input" autoFocus>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.contractNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">نوع کلایم</span>
            <select value={claimType} onChange={(e) => setClaimType(e.target.value as FinClaimType)} className="fin-input">
              {FIN_CLAIM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIN_CLAIM_TYPE_LABEL_FA[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">شماره کلایم</span>
          <input value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} className="fin-input" dir="ltr" />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">عنوان</span>
          <input value={claimTitle} onChange={(e) => setClaimTitle(e.target.value)} className="fin-input" />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">شرح کلایم</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="fin-input" rows={2} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">تاریخ ارسال</span>
            <JalaliDateInput value={submittedDate} onChange={setSubmittedDate} />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FinClaimStatus)} className="fin-input">
              {FIN_CLAIM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FIN_CLAIM_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">مبلغ ادعاشده</span>
            <input type="number" value={amountClaimed} onChange={(e) => setAmountClaimed(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">مبلغ تاییدشده</span>
            <input type="number" value={amountApproved} onChange={(e) => setAmountApproved(e.target.value)} className="fin-input num" placeholder="—" />
          </label>
          <label className="block">
            <span className="fin-text-secondary mb-1 block text-xs">واحد پول</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="fin-input" dir="ltr" />
          </label>
        </div>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">شماره مکاتبه</span>
          <input value={correspondenceRef} onChange={(e) => setCorrespondenceRef(e.target.value)} className="fin-input" dir="ltr" />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">تاریخ نتیجه‌گیری (در صورت وجود)</span>
          <JalaliDateInput value={resolutionDate} onChange={setResolutionDate} />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">یادداشت</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="fin-input" rows={2} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="fin-text-secondary rounded-lg px-4 py-2 text-sm hover:opacity-70">
            انصراف
          </button>
          <button onClick={submit} disabled={saving || !contractId} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#b8863b' }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
