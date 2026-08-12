import { useState } from 'react'
import { Banknote, Calculator, Gauge, Plus, Scale, Target, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { computeProjectFinancialSummary } from '../lib/financeCalc'
import { FinanceKpiTile, fmtCurrency } from '../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'

export function BudgetPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const upsertBudget = useFinanceStore((s) => s.upsertBudget)
  const addBudgetChange = useFinanceStore((s) => s.addBudgetChange)
  const deleteBudgetChange = useFinanceStore((s) => s.deleteBudgetChange)

  const budget = budgets.find((b) => b.masterProjectId === masterProjectId) ?? null
  const projectChanges = budgetChanges.filter((c) => c.masterProjectId === masterProjectId)
  const currency = budget?.currency ?? project?.currency ?? 'ریال'
  const eac = project?.forecastCostAtCompletion ?? null

  const summary = computeProjectFinancialSummary(masterProjectId, eac, budget, projectChanges, contracts, amendments, certificates)

  const [editingApproved, setEditingApproved] = useState(false)
  const [approvedInput, setApprovedInput] = useState(budget?.approvedBudget != null ? String(budget.approvedBudget) : '')
  const [showAddChange, setShowAddChange] = useState(false)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const saveApproved = async () => {
    await upsertBudget(masterProjectId, { approvedBudget: approvedInput === '' ? 0 : Number(approvedInput), currency })
    setEditingApproved(false)
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">بودجه پروژه</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <FinanceKpiTile icon={Wallet} label="بودجه مصوب (Approved)" value={fmtCurrency(summary.approvedBudget, currency)} color={FINANCE_ACCENT} tooltip="مبلغ بودجه اولیه مصوب برای این پروژه." />
        <FinanceKpiTile
          icon={Banknote}
          label="بودجه جاری (Current)"
          value={fmtCurrency(summary.currentBudgetAmount, currency)}
          color={FINANCE_ACCENT}
          tooltip="بودجه مصوب به‌علاوه مجموع تغییرات بودجه ثبت‌شده."
        />
        <FinanceKpiTile
          icon={Calculator}
          label="هزینه متعهدشده (Committed)"
          value={fmtCurrency(summary.committedCost, currency)}
          color="#38bdf8"
          tooltip="مجموع ارزش جاری قراردادهای فعال/تکمیل‌شده این پروژه."
        />
        <FinanceKpiTile icon={Gauge} label="هزینه واقعی/تاییدشده (Actual)" value={fmtCurrency(summary.actualCost, currency)} color="#a78bfa" tooltip="مجموع مبالغ تاییدشده صورت‌وضعیت‌ها." />
        <FinanceKpiTile
          icon={TrendingUp}
          label="پیش‌بینی هزینه در تکمیل (EAC)"
          value={eac != null ? fmtCurrency(eac, currency) : 'ثبت نشده'}
          color="#f59e0b"
          tooltip="از شناسنامه پروژه در داده پایه خوانده می‌شود (فیلد پیش‌بینی هزینه در تکمیل)."
        />
        <FinanceKpiTile
          icon={Scale}
          label="بودجه باقی‌مانده (Remaining)"
          value={fmtCurrency(summary.remainingBudget, currency)}
          color={summary.remainingBudget >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.remainingBudget >= 0 ? 'good' : 'bad'}
          tooltip="بودجه جاری منهای هزینه متعهدشده."
        />
        <FinanceKpiTile
          icon={TrendingDown}
          label="انحراف بودجه (Variance)"
          value={fmtCurrency(summary.budgetVariance, currency)}
          color={summary.budgetVariance >= 0 ? '#2ecc71' : '#e74c3c'}
          status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
          tooltip={eac != null ? 'بودجه جاری منهای EAC.' : 'بودجه جاری منهای هزینه متعهدشده (چون EAC هنوز ثبت نشده).'}
        />
        <FinanceKpiTile icon={Target} label="تعداد تغییرات بودجه" value={projectChanges.length} color="#64748b" />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">بودجه مصوب</p>
          {!editingApproved && (
            <button onClick={() => { setApprovedInput(budget?.approvedBudget != null ? String(budget.approvedBudget) : ''); setEditingApproved(true) }} className="text-xs text-secondary hover:underline">
              ویرایش
            </button>
          )}
        </div>
        {editingApproved ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" value={approvedInput} onChange={(e) => setApprovedInput(e.target.value)} className="input num w-48" autoFocus />
            <span className="text-xs text-muted">{currency}</span>
            <button onClick={saveApproved} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: FINANCE_ACCENT }}>
              ذخیره
            </button>
            <button onClick={() => setEditingApproved(false)} className="text-xs text-secondary hover:underline">
              انصراف
            </button>
          </div>
        ) : (
          <p className="num text-2xl font-extrabold" style={{ color: FINANCE_ACCENT }}>
            {fmtCurrency(summary.approvedBudget, currency)}
          </p>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">تغییرات بودجه (Budget Changes)</p>
          <button onClick={() => setShowAddChange(true)} className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5">
            <Plus size={12} /> افزودن تغییر
          </button>
        </div>
        {projectChanges.length === 0 ? (
          <p className="text-xs text-muted">هنوز تغییری برای این بودجه ثبت نشده است.</p>
        ) : (
          <div className="space-y-1.5">
            {projectChanges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="num text-[11px] text-muted" dir="ltr">
                  {c.changeDate}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{c.reason || '—'}</span>
                <span className="num shrink-0 text-sm font-bold" style={{ color: c.amount >= 0 ? '#2ecc71' : '#e74c3c' }}>
                  {c.amount >= 0 ? '+' : ''}
                  {fmtCurrency(c.amount, currency)}
                </span>
                <button onClick={() => deleteBudgetChange(c.id)} className="shrink-0 text-muted hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddChange && (
        <AddBudgetChangeModal
          onClose={() => setShowAddChange(false)}
          onSave={async (data) => {
            await addBudgetChange(masterProjectId, data)
            setShowAddChange(false)
          }}
        />
      )}
    </div>
  )
}

function AddBudgetChangeModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { changeDate: string; amount: number; reason: string }) => Promise<void> }) {
  const [changeDate, setChangeDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (amount === '') return
    setSaving(true)
    await onSave({ changeDate, amount: Number(amount), reason })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">ثبت تغییر بودجه</h3>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ</span>
          <input type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} className="input num" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مبلغ (مثبت = افزایش، منفی = کاهش)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="input num" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">دلیل</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={amount === '' || saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: FINANCE_ACCENT }}
          >
            {saving ? 'در حال ذخیره...' : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  )
}
