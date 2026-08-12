import { useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { currentContractValue } from '../lib/financeCalc'
import { fmtCurrency } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { FIN_CONTRACT_STATUS_LABEL_FA, FIN_CONTRACT_STATUSES, type FinContract, type FinContractStatus } from '../types'

const STATUS_TONE: Record<FinContractStatus, string> = { draft: '#64748b', active: '#2ecc71', completed: '#38bdf8', terminated: '#e74c3c' }

export function ContractsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const organizations = useMasterDataStore((s) => s.organizations)
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const createContract = useFinanceStore((s) => s.createContract)
  const updateContract = useFinanceStore((s) => s.updateContract)
  const deleteContract = useFinanceStore((s) => s.deleteContract)
  const addAmendment = useFinanceStore((s) => s.addAmendment)
  const deleteAmendment = useFinanceStore((s) => s.deleteAmendment)

  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinContract | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingAmendmentFor, setAddingAmendmentFor] = useState<string | null>(null)

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—'

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="glass-panel flex items-center justify-between rounded-2xl p-4">
        <div>
          <p className="text-xs text-muted">قراردادها و تعهدات مالی</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: FINANCE_ACCENT }}>
          <Plus size={13} /> قرارداد جدید
        </button>
      </div>

      {contracts.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-xs text-muted">هنوز قراردادی برای این پروژه ثبت نشده است.</div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const contractAmendments = amendments.filter((a) => a.contractId === c.id)
            const current = currentContractValue(c, amendments)
            const expanded = expandedId === c.id
            return (
              <div key={c.id} className="glass-panel rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText size={14} style={{ color: FINANCE_ACCENT }} />
                      <p className="text-sm font-bold">{c.title || c.contractNumber || 'قرارداد بدون عنوان'}</p>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${STATUS_TONE[c.status]}55`, color: STATUS_TONE[c.status] }}>
                        {FIN_CONTRACT_STATUS_LABEL_FA[c.status]}
                      </span>
                    </div>
                    <p className="num mt-0.5 text-[11px] text-muted" dir="ltr">
                      {c.contractNumber}
                    </p>
                    <p className="mt-1 text-xs text-secondary">پیمانکار: {orgName(c.contractorOrgId)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(c)} className="text-xs text-secondary hover:underline">
                      ویرایش
                    </button>
                    <button onClick={() => deleteContract(c.id)} className="text-muted hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniField label="مبلغ اولیه قرارداد" value={fmtCurrency(c.contractValue, c.currency)} />
                  <MiniField label="مبلغ جاری قرارداد" value={fmtCurrency(current, c.currency)} highlight />
                  <MiniField label="پیش‌پرداخت" value={`${c.advancePaymentPercent}٪`} />
                  <MiniField label="کسر حسن انجام کار (Retention)" value={`${c.retentionPercent}٪`} />
                </div>

                <button onClick={() => setExpandedId(expanded ? null : c.id)} className="mt-3 text-[11px] font-medium hover:underline" style={{ color: FINANCE_ACCENT }}>
                  {expanded ? 'بستن الحاقیه‌ها' : `الحاقیه‌ها و تغییرات قرارداد (${contractAmendments.length})`}
                </button>

                {expanded && (
                  <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                    {contractAmendments.length === 0 && <p className="text-xs text-muted">الحاقیه‌ای ثبت نشده است.</p>}
                    {contractAmendments.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                        <span className="num text-[11px] text-muted" dir="ltr">
                          {a.amendmentDate}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">{a.reason || a.amendmentNumber || '—'}</span>
                        <span className="num shrink-0 text-xs font-bold" style={{ color: a.amount >= 0 ? '#2ecc71' : '#e74c3c' }}>
                          {a.amount >= 0 ? '+' : ''}
                          {fmtCurrency(a.amount, c.currency)}
                        </span>
                        <button onClick={() => deleteAmendment(a.id)} className="shrink-0 text-muted hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setAddingAmendmentFor(c.id)} className="flex items-center gap-1 text-[11px] text-secondary hover:text-current">
                      <Plus size={11} /> افزودن الحاقیه
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <ContractModal
          title="قرارداد جدید"
          organizations={organizations}
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            await createContract(masterProjectId, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <ContractModal
          title="ویرایش قرارداد"
          organizations={organizations}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateContract(editing.id, data)
            setEditing(null)
          }}
        />
      )}
      {addingAmendmentFor && (
        <AmendmentModal
          onClose={() => setAddingAmendmentFor(null)}
          onSave={async (data) => {
            await addAmendment(addingAmendmentFor, data)
            setAddingAmendmentFor(null)
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

function ContractModal({
  title,
  organizations,
  initial,
  onClose,
  onSave,
}: {
  title: string
  organizations: { id: string; name: string }[]
  initial?: FinContract
  onClose: () => void
  onSave: (data: Partial<FinContract>) => Promise<void>
}) {
  const [contractNumber, setContractNumber] = useState(initial?.contractNumber ?? '')
  const [ctitle, setCtitle] = useState(initial?.title ?? '')
  const [contractorOrgId, setContractorOrgId] = useState(initial?.contractorOrgId ?? '')
  const [contractValue, setContractValue] = useState(initial?.contractValue != null ? String(initial.contractValue) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [advancePaymentPercent, setAdvancePaymentPercent] = useState(initial?.advancePaymentPercent != null ? String(initial.advancePaymentPercent) : '0')
  const [retentionPercent, setRetentionPercent] = useState(initial?.retentionPercent != null ? String(initial.retentionPercent) : '0')
  const [performanceGuaranteePercent, setPerformanceGuaranteePercent] = useState(initial?.performanceGuaranteePercent != null ? String(initial.performanceGuaranteePercent) : '0')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [plannedCompletionDate, setPlannedCompletionDate] = useState(initial?.plannedCompletionDate ?? '')
  const [status, setStatus] = useState<FinContractStatus>(initial?.status ?? 'active')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({
      contractNumber,
      title: ctitle,
      contractorOrgId: contractorOrgId || null,
      contractValue: contractValue === '' ? 0 : Number(contractValue),
      currency,
      advancePaymentPercent: Number(advancePaymentPercent) || 0,
      retentionPercent: Number(retentionPercent) || 0,
      performanceGuaranteePercent: Number(performanceGuaranteePercent) || 0,
      startDate: startDate || null,
      plannedCompletionDate: plannedCompletionDate || null,
      status,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">عنوان قرارداد</span>
            <input value={ctitle} onChange={(e) => setCtitle(e.target.value)} className="input" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره قرارداد</span>
            <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پیمانکار</span>
            <select value={contractorOrgId} onChange={(e) => setContractorOrgId(e.target.value)} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FinContractStatus)} className="input">
              {FIN_CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FIN_CONTRACT_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ قرارداد</span>
            <div className="flex gap-1.5">
              <input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="input num" />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پیش‌پرداخت (٪)</span>
            <input type="number" value={advancePaymentPercent} onChange={(e) => setAdvancePaymentPercent(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کسر حسن انجام کار — Retention (٪)</span>
            <input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ضمانت‌نامه انجام تعهدات (٪)</span>
            <input type="number" value={performanceGuaranteePercent} onChange={(e) => setPerformanceGuaranteePercent(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ شروع</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ تکمیل برنامه‌ریزی‌شده</span>
            <input type="date" value={plannedCompletionDate} onChange={(e) => setPlannedCompletionDate(e.target.value)} className="input num" />
          </label>
        </div>
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

function AmendmentModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { amendmentNumber: string; amendmentDate: string; amount: number; reason: string }) => Promise<void> }) {
  const [amendmentNumber, setAmendmentNumber] = useState('')
  const [amendmentDate, setAmendmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (amount === '') return
    setSaving(true)
    await onSave({ amendmentNumber, amendmentDate, amount: Number(amount), reason })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">افزودن الحاقیه قرارداد</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شماره الحاقیه</span>
          <input value={amendmentNumber} onChange={(e) => setAmendmentNumber(e.target.value)} className="input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <input type="date" value={amendmentDate} onChange={(e) => setAmendmentDate(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مبلغ تغییر (مثبت = افزایش، منفی = کاهش)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">دلیل</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={amount === '' || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }}>
            {saving ? 'در حال ذخیره...' : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  )
}
