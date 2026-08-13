import { useState } from 'react'
import { AlertTriangle, FileText, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { currentContractValue, expiringGuarantees } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  FIN_CONTRACT_ROLE_COLOR,
  FIN_CONTRACT_ROLE_LABEL_FA,
  FIN_CONTRACT_ROLES,
  FIN_CONTRACT_STATUS_LABEL_FA,
  FIN_CONTRACT_STATUSES,
  FIN_GUARANTEE_STATUS_COLOR,
  FIN_GUARANTEE_STATUS_LABEL_FA,
  FIN_GUARANTEE_STATUSES,
  FIN_GUARANTEE_TYPE_LABEL_FA,
  FIN_GUARANTEE_TYPES,
  type FinContract,
  type FinContractRole,
  type FinContractStatus,
  type FinGuarantee,
  type FinGuaranteeStatus,
  type FinGuaranteeType,
} from '../types'

const STATUS_TONE: Record<FinContractStatus, string> = { draft: '#64748b', active: '#2ecc71', completed: '#38bdf8', terminated: '#e74c3c' }

export function ContractsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const organizations = useMasterDataStore((s) => s.organizations)
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const createContract = useFinanceStore((s) => s.createContract)
  const updateContract = useFinanceStore((s) => s.updateContract)
  const deleteContract = useFinanceStore((s) => s.deleteContract)
  const addAmendment = useFinanceStore((s) => s.addAmendment)
  const deleteAmendment = useFinanceStore((s) => s.deleteAmendment)
  const createGuarantee = useFinanceStore((s) => s.createGuarantee)
  const updateGuarantee = useFinanceStore((s) => s.updateGuarantee)
  const deleteGuarantee = useFinanceStore((s) => s.deleteGuarantee)

  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinContract | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingAmendmentFor, setAddingAmendmentFor] = useState<string | null>(null)
  const [addingGuaranteeFor, setAddingGuaranteeFor] = useState<string | null>(null)
  const [editingGuarantee, setEditingGuarantee] = useState<FinGuarantee | null>(null)

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—'
  const contractIds = new Set(contracts.map((c) => c.id))
  const projectGuarantees = guarantees.filter((g) => contractIds.has(g.contractId))
  const soonExpiring = expiringGuarantees(projectGuarantees)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  return (
    <div className="space-y-4">
      <div className="fin-card flex items-center justify-between p-4">
        <div>
          <p className="text-xs fin-text-muted">قراردادها و تعهدات مالی</p>
          <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: FINANCE_ACCENT }}>
          <Plus size={13} /> قرارداد جدید
        </button>
      </div>

      {projectGuarantees.length > 0 && (
        <div className="fin-card flex flex-wrap items-center gap-4 border p-4" style={{ borderColor: `${FINANCE_ACCENT}40` }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: FINANCE_ACCENT }} />
            <div>
              <p className="num text-2xl font-extrabold" style={{ color: FINANCE_ACCENT }}>
                {fmtCurrency(
                  projectGuarantees.filter((g) => g.status === 'active').reduce((s, g) => s + g.amount, 0),
                  project.currency,
                )}
              </p>
              <p className="text-[10.5px] fin-text-secondary">مجموع ضمانت‌نامه‌های معتبر دریافتی از پیمانکاران</p>
            </div>
          </div>
          {soonExpiring.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-300">
              <AlertTriangle size={12} /> {soonExpiring.length} ضمانت‌نامه نزدیک به انقضا (تا ۶۰ روز آینده)
            </span>
          )}
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز قراردادی برای این پروژه ثبت نشده است.</div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const contractAmendments = amendments.filter((a) => a.contractId === c.id)
            const contractGuarantees = guarantees.filter((g) => g.contractId === c.id)
            const current = currentContractValue(c, amendments)
            const expanded = expandedId === c.id
            return (
              <div key={c.id} className="fin-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText size={14} style={{ color: FINANCE_ACCENT }} />
                      <p className="text-sm font-bold">{c.title || c.contractNumber || 'قرارداد بدون عنوان'}</p>
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{ borderColor: `${FIN_CONTRACT_ROLE_COLOR[c.contractRole]}55`, color: FIN_CONTRACT_ROLE_COLOR[c.contractRole] }}
                      >
                        {FIN_CONTRACT_ROLE_LABEL_FA[c.contractRole]}
                      </span>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: `${STATUS_TONE[c.status]}55`, color: STATUS_TONE[c.status] }}>
                        {FIN_CONTRACT_STATUS_LABEL_FA[c.status]}
                      </span>
                    </div>
                    <p className="num mt-0.5 text-[11px] fin-text-muted" dir="ltr">
                      {c.contractNumber}
                    </p>
                    <p className="mt-1 text-xs fin-text-secondary">پیمانکار/طرف قرارداد: {orgName(c.contractorOrgId)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(c)} className="text-xs fin-text-secondary hover:underline">
                      ویرایش
                    </button>
                    <button onClick={() => deleteContract(c.id)} className="fin-text-muted hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniField label="مبلغ اولیه قرارداد" value={fmtCurrency(c.contractValue, c.currency)} />
                  <MiniField label="مبلغ جاری قرارداد (شامل ارزی)" value={fmtCurrency(current, c.currency)} highlight />
                  <MiniField label="پیش‌پرداخت" value={`${c.advancePaymentPercent}٪`} />
                  <MiniField label="کسر حسن انجام کار (Retention)" value={`${c.retentionPercent}٪`} />
                </div>
                {c.fx.fcAmount > 0 && (
                  <p className="num mt-2 text-[10.5px] fin-text-muted" dir="ltr">
                    سهم ارزی: {c.fx.fcAmount.toLocaleString('fa-IR')} {c.fx.fcCurrency} × {c.fx.exchangeRate.toLocaleString('fa-IR')} = {fmtCurrency(c.fx.fcRialEquivalent, c.currency)}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-3">
                  <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="text-[11px] font-medium hover:underline" style={{ color: FINANCE_ACCENT }}>
                    {expanded ? 'بستن جزئیات' : `الحاقیه‌ها (${contractAmendments.length}) و ضمانت‌نامه‌ها (${contractGuarantees.length})`}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 space-y-4 border-t pt-3" style={{ borderColor: 'var(--fin-divider)' }}>
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold fin-text-secondary">الحاقیه‌ها و تغییرات قرارداد</p>
                      {contractAmendments.length === 0 && <p className="text-xs fin-text-muted">الحاقیه‌ای ثبت نشده است.</p>}
                      <div className="space-y-1.5">
                        {contractAmendments.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-1.5" style={{ borderColor: 'var(--fin-divider)' }}>
                            <span className="num text-[11px] fin-text-muted">{fmtDate(a.amendmentDate)}</span>
                            <span className="min-w-0 flex-1 truncate text-xs">{a.reason || a.amendmentNumber || '—'}</span>
                            <span className="num shrink-0 text-xs font-bold" style={{ color: a.amount >= 0 ? '#2ecc71' : '#e74c3c' }}>
                              {a.amount >= 0 ? '+' : ''}
                              {fmtCurrency(a.amount, c.currency)}
                            </span>
                            <button onClick={() => deleteAmendment(a.id)} className="shrink-0 fin-text-muted hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setAddingAmendmentFor(c.id)} className="mt-1.5 flex items-center gap-1 text-[11px] fin-text-secondary hover:text-current">
                        <Plus size={11} /> افزودن الحاقیه
                      </button>
                    </div>

                    <div>
                      <p className="mb-1.5 text-[11px] font-bold fin-text-secondary">ضمانت‌نامه‌ها</p>
                      {contractGuarantees.length === 0 && <p className="text-xs fin-text-muted">ضمانت‌نامه‌ای ثبت نشده است.</p>}
                      <div className="space-y-1.5">
                        {contractGuarantees.map((g) => {
                          const daysLeft = g.expiryDate ? Math.round((Date.parse(g.expiryDate) - Date.now()) / 86400000) : null
                          return (
                            <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5" style={{ borderColor: 'var(--fin-divider)' }}>
                              <ShieldCheck size={12} className="shrink-0 fin-text-muted" />
                              <span className="min-w-0 flex-1 truncate text-xs">
                                {FIN_GUARANTEE_TYPE_LABEL_FA[g.guaranteeType]} — {g.number || '—'}
                              </span>
                              <span className="num shrink-0 text-xs font-bold">{fmtCurrency(g.amount, g.currency)}</span>
                              <span className="num shrink-0 text-[10.5px] fin-text-muted">تا {fmtDate(g.expiryDate)}</span>
                              {g.status === 'active' && daysLeft != null && daysLeft <= 60 && (
                                <span className="rounded-full border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[9.5px] font-bold text-red-300">
                                  {daysLeft <= 0 ? 'منقضی' : `${daysLeft} روز مانده`}
                                </span>
                              )}
                              <span
                                className="shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
                                style={{ borderColor: `${FIN_GUARANTEE_STATUS_COLOR[g.status]}55`, color: FIN_GUARANTEE_STATUS_COLOR[g.status] }}
                              >
                                {FIN_GUARANTEE_STATUS_LABEL_FA[g.status]}
                              </span>
                              <button onClick={() => setEditingGuarantee(g)} className="shrink-0 text-[10.5px] fin-text-secondary hover:underline">
                                ویرایش
                              </button>
                              <button onClick={() => deleteGuarantee(g.id)} className="shrink-0 fin-text-muted hover:text-red-400">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <button onClick={() => setAddingGuaranteeFor(c.id)} className="mt-1.5 flex items-center gap-1 text-[11px] fin-text-secondary hover:text-current">
                        <Plus size={11} /> افزودن ضمانت‌نامه
                      </button>
                    </div>
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
      {addingGuaranteeFor && (
        <GuaranteeModal
          title="ضمانت‌نامه جدید"
          onClose={() => setAddingGuaranteeFor(null)}
          onSave={async (data) => {
            await createGuarantee(addingGuaranteeFor, data)
            setAddingGuaranteeFor(null)
          }}
        />
      )}
      {editingGuarantee && (
        <GuaranteeModal
          title="ویرایش ضمانت‌نامه"
          initial={editingGuarantee}
          onClose={() => setEditingGuarantee(null)}
          onSave={async (data) => {
            await updateGuarantee(editingGuarantee.id, data)
            setEditingGuarantee(null)
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
  const [contractRole, setContractRole] = useState<FinContractRole>(initial?.contractRole ?? 'main_epc')
  const [contractorOrgId, setContractorOrgId] = useState(initial?.contractorOrgId ?? '')
  const [contractValue, setContractValue] = useState(initial?.contractValue != null ? String(initial.contractValue) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [fcAmount, setFcAmount] = useState(initial?.fx.fcAmount != null ? String(initial.fx.fcAmount) : '0')
  const [fcCurrency, setFcCurrency] = useState(initial?.fx.fcCurrency ?? 'EUR')
  const [exchangeRate, setExchangeRate] = useState(initial?.fx.exchangeRate != null ? String(initial.fx.exchangeRate) : '0')
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
      contractRole,
      contractorOrgId: contractorOrgId || null,
      contractValue: contractValue === '' ? 0 : Number(contractValue),
      currency,
      fx: { fcAmount: Number(fcAmount) || 0, fcCurrency, exchangeRate: Number(exchangeRate) || 0, fcRialEquivalent: 0 },
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
      <div className="fin-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">{title}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">عنوان قرارداد</span>
            <input value={ctitle} onChange={(e) => setCtitle(e.target.value)} className="fin-input" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">شماره قرارداد</span>
            <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} className="fin-input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">نوع قرارداد</span>
            <select value={contractRole} onChange={(e) => setContractRole(e.target.value as FinContractRole)} className="fin-input">
              {FIN_CONTRACT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {FIN_CONTRACT_ROLE_LABEL_FA[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">طرف قرارداد (پیمانکار/مشاور/...)</span>
            <select value={contractorOrgId} onChange={(e) => setContractorOrgId(e.target.value)} className="fin-input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FinContractStatus)} className="fin-input">
              {FIN_CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FIN_CONTRACT_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ ریالی قرارداد</span>
            <div className="flex gap-1.5">
              <input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="fin-input num" />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">مبلغ ارزی قرارداد</span>
            <div className="flex gap-1.5">
              <input type="number" value={fcAmount} onChange={(e) => setFcAmount(e.target.value)} className="fin-input num" />
              <input value={fcCurrency} onChange={(e) => setFcCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">نرخ تبدیل ارز</span>
            <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">پیش‌پرداخت (٪)</span>
            <input type="number" value={advancePaymentPercent} onChange={(e) => setAdvancePaymentPercent(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">کسر حسن انجام کار — Retention (٪)</span>
            <input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">ضمانت‌نامه انجام تعهدات (٪)</span>
            <input type="number" value={performanceGuaranteePercent} onChange={(e) => setPerformanceGuaranteePercent(e.target.value)} className="fin-input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ شروع</span>
            <JalaliDateInput value={startDate} onChange={setStartDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs fin-text-secondary">تاریخ تکمیل برنامه‌ریزی‌شده</span>
            <JalaliDateInput value={plannedCompletionDate} onChange={setPlannedCompletionDate} />
          </label>
        </div>
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
      <div className="fin-card w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">افزودن الحاقیه قرارداد</h3>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">شماره الحاقیه</span>
          <input value={amendmentNumber} onChange={(e) => setAmendmentNumber(e.target.value)} className="fin-input" dir="ltr" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">تاریخ</span>
          <JalaliDateInput value={amendmentDate} onChange={setAmendmentDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">مبلغ تغییر (مثبت = افزایش، منفی = کاهش)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">دلیل</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="fin-input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm fin-text-secondary hover:opacity-70">
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

function GuaranteeModal({ title, initial, onClose, onSave }: { title: string; initial?: FinGuarantee; onClose: () => void; onSave: (data: Partial<FinGuarantee>) => Promise<void> }) {
  const [guaranteeType, setGuaranteeType] = useState<FinGuaranteeType>(initial?.guaranteeType ?? 'bank_guarantee')
  const [number, setNumber] = useState(initial?.number ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'IRR')
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? '')
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? '')
  const [status, setStatus] = useState<FinGuaranteeStatus>(initial?.status ?? 'active')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    await onSave({ guaranteeType, number, amount: amount === '' ? 0 : Number(amount), currency, issueDate: issueDate || null, expiryDate: expiryDate || null, status })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-sm font-extrabold">
          <ShieldCheck size={15} style={{ color: FINANCE_ACCENT }} /> {title}
        </h3>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">نوع ضمانت‌نامه</span>
          <select value={guaranteeType} onChange={(e) => setGuaranteeType(e.target.value as FinGuaranteeType)} className="fin-input" autoFocus>
            {FIN_GUARANTEE_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIN_GUARANTEE_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">شماره</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} className="fin-input" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">مبلغ</span>
          <div className="flex gap-1.5">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" />
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="fin-input w-20" dir="ltr" />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">تاریخ صدور</span>
          <JalaliDateInput value={issueDate} onChange={setIssueDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">تاریخ انقضا</span>
          <JalaliDateInput value={expiryDate} onChange={setExpiryDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as FinGuaranteeStatus)} className="fin-input">
            {FIN_GUARANTEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FIN_GUARANTEE_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
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
