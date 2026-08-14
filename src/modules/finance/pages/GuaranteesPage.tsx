import { useState } from 'react'
import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { activeGuaranteesTotal, expiringGuarantees } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard, StampBadge, hexToStampTone } from '../components/FinanceDashboardUI'
import { AttachmentField, AttachmentLink } from '../components/AttachmentField'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  FIN_GUARANTEE_STATUS_COLOR,
  FIN_GUARANTEE_STATUS_LABEL_FA,
  FIN_GUARANTEE_STATUSES,
  FIN_GUARANTEE_TYPE_LABEL_FA,
  FIN_GUARANTEE_TYPES,
  type FinGuarantee,
  type FinGuaranteeStatus,
  type FinGuaranteeType,
} from '../types'

/** ضمانت‌نامه‌ها — cross-contract guarantee register for a project, standalone from Contracts (spec item 7). */
export function GuaranteesPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const createGuarantee = useFinanceStore((s) => s.createGuarantee)
  const updateGuarantee = useFinanceStore((s) => s.updateGuarantee)
  const deleteGuarantee = useFinanceStore((s) => s.deleteGuarantee)

  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinGuarantee | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const list = guarantees.filter((g) => contractIds.has(g.contractId)).sort((a, b) => ((a.expiryDate ?? '9999') < (b.expiryDate ?? '9999') ? -1 : 1))
  const soonExpiring = expiringGuarantees(list)
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'
  const contractOf = (id: string) => contracts.find((c) => c.id === id)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">ضمانت‌نامه‌ها</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: '#c9a654' }}>
            <Plus size={13} /> ضمانت‌نامه جدید
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard icon={ShieldCheck} label="مجموع ضمانت‌نامه‌های معتبر" value={fmtCurrency(activeGuaranteesTotal(list), currency)} color="#c9a654" />
        <MetricCard icon={AlertTriangle} label="نزدیک به انقضا (۶۰ روز آینده)" value={soonExpiring.length.toLocaleString('fa-IR')} color={soonExpiring.length > 0 ? '#b5573a' : '#3e7c74'} />
        <MetricCard icon={ShieldCheck} label="تعداد کل ضمانت‌نامه‌ها" value={list.length.toLocaleString('fa-IR')} color="#5c7290" />
      </div>

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : list.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز ضمانت‌نامه‌ای ثبت نشده است.</div>
      ) : (
        <div className="fin-card overflow-x-auto p-4">
          <table className="w-full min-w-[760px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted text-[10px]">
                <th className="pb-2 font-medium">نوع</th>
                <th className="pb-2 font-medium">شماره</th>
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">مبلغ</th>
                <th className="pb-2 font-medium">تاریخ صدور</th>
                <th className="pb-2 font-medium">تاریخ انقضا</th>
                <th className="pb-2 font-medium">وضعیت</th>
                <th className="pb-2 font-medium">سند</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((g) => {
                const daysLeft = g.expiryDate ? Math.round((Date.parse(g.expiryDate) - Date.now()) / 86400000) : null
                const tone = FIN_GUARANTEE_STATUS_COLOR[g.status]
                return (
                  <tr key={g.id} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}>
                    <td className="fin-text py-2">{FIN_GUARANTEE_TYPE_LABEL_FA[g.guaranteeType]}</td>
                    <td className="num fin-text py-2">{g.number || '—'}</td>
                    <td className="fin-text py-2">{contractOf(g.contractId)?.title || contractOf(g.contractId)?.contractNumber || '—'}</td>
                    <td className="num fin-text py-2 font-bold">{fmtCurrency(g.amount, g.currency)}</td>
                    <td className="num fin-text py-2">{fmtDate(g.issueDate)}</td>
                    <td className="num fin-text py-2">
                      {fmtDate(g.expiryDate)}
                      {g.status === 'active' && daysLeft != null && daysLeft <= 60 && (
                        <span className="mr-1.5 inline-block">
                          <StampBadge label={daysLeft <= 0 ? 'منقضی' : `${daysLeft} روز`} tone="bad" />
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <StampBadge label={FIN_GUARANTEE_STATUS_LABEL_FA[g.status]} tone={hexToStampTone(tone)} />
                    </td>
                    <td className="py-2">{g.attachmentUrl ? <AttachmentLink path={g.attachmentUrl} /> : <span className="fin-text-muted">—</span>}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditing(g)} className="fin-text-secondary text-[10.5px] hover:underline">
                          ویرایش
                        </button>
                        <button onClick={() => deleteGuarantee(g.id)} className="fin-text-muted hover:text-red-500">
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
        <GuaranteeModal
          title="ضمانت‌نامه جدید"
          contracts={contracts}
          onClose={() => setShowNew(false)}
          onSave={async (contractId, data) => {
            await createGuarantee(contractId, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <GuaranteeModal
          title="ویرایش ضمانت‌نامه"
          contracts={contracts}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (_contractId, data) => {
            await updateGuarantee(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function GuaranteeModal({
  title,
  contracts,
  initial,
  onClose,
  onSave,
}: {
  title: string
  contracts: { id: string; title: string; contractNumber: string }[]
  initial?: FinGuarantee
  onClose: () => void
  onSave: (contractId: string, data: Partial<FinGuarantee>) => Promise<void>
}) {
  const [contractId, setContractId] = useState(initial?.contractId ?? contracts[0]?.id ?? '')
  const [guaranteeType, setGuaranteeType] = useState<FinGuaranteeType>(initial?.guaranteeType ?? 'bank_guarantee')
  const [number, setNumber] = useState(initial?.number ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? '')
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? '')
  const [status, setStatus] = useState<FinGuaranteeStatus>(initial?.status ?? 'active')
  const [attachmentUrl, setAttachmentUrl] = useState(initial?.attachmentUrl ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!contractId) return
    setSaving(true)
    await onSave(contractId, {
      guaranteeType,
      number,
      amount: amount === '' ? 0 : Number(amount),
      currency,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      status,
      attachmentUrl,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-sm space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="fin-text flex items-center gap-2 text-sm font-extrabold">
          <ShieldCheck size={15} style={{ color: '#c9a654' }} /> {title}
        </h3>
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
          <span className="fin-text-secondary mb-1 block text-xs">نوع ضمانت‌نامه</span>
          <select value={guaranteeType} onChange={(e) => setGuaranteeType(e.target.value as FinGuaranteeType)} className="fin-input">
            {FIN_GUARANTEE_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIN_GUARANTEE_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">شماره</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} className="fin-input" dir="ltr" />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">مبلغ</span>
          <div className="flex gap-1.5">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" />
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
          </div>
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">تاریخ صدور</span>
          <JalaliDateInput value={issueDate} onChange={setIssueDate} />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">تاریخ انقضا</span>
          <JalaliDateInput value={expiryDate} onChange={setExpiryDate} />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as FinGuaranteeStatus)} className="fin-input">
            {FIN_GUARANTEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FIN_GUARANTEE_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <AttachmentField folder={`guarantees/${contractId || 'unassigned'}`} value={attachmentUrl} onChange={setAttachmentUrl} />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="fin-text-secondary rounded-lg px-4 py-2 text-sm hover:opacity-70">
            انصراف
          </button>
          <button onClick={submit} disabled={saving || !contractId} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#c9a654' }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
