import { useState } from 'react'
import { CalendarRange, Coins, Gauge, PieChart, Plus, Scale, ShieldCheck, Target, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { computeAnnualBudgetRows, computeProjectFinancialSummary } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard } from '../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../FinanceApp'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { todayJalali } from '../../../lib/jalali'

export function BudgetPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const annualBudgets = useFinanceStore((s) => s.annualBudgets)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const upsertBudget = useFinanceStore((s) => s.upsertBudget)
  const addBudgetChange = useFinanceStore((s) => s.addBudgetChange)
  const deleteBudgetChange = useFinanceStore((s) => s.deleteBudgetChange)
  const upsertAnnualBudget = useFinanceStore((s) => s.upsertAnnualBudget)
  const deleteAnnualBudget = useFinanceStore((s) => s.deleteAnnualBudget)

  const budget = budgets.find((b) => b.masterProjectId === masterProjectId) ?? null
  const projectChanges = budgetChanges.filter((c) => c.masterProjectId === masterProjectId)
  const currency = budget?.currency ?? project?.currency ?? 'ریال'
  const eac = project?.forecastCostAtCompletion ?? null

  const projectContracts = contracts.filter((c) => c.masterProjectId === masterProjectId)
  const contractIds = new Set(projectContracts.map((c) => c.id))
  const projectCertificates = certificates.filter((c) => contractIds.has(c.contractId))

  const summary = computeProjectFinancialSummary(masterProjectId, eac, budget, projectChanges, contracts, amendments, certificates, annualBudgets, guarantees)
  const annualRows = computeAnnualBudgetRows(masterProjectId, annualBudgets, projectCertificates)

  const [editingApproved, setEditingApproved] = useState(false)
  const [approvedInput, setApprovedInput] = useState(budget?.approvedBudget != null ? String(budget.approvedBudget) : '')
  const [approvedFcInput, setApprovedFcInput] = useState(budget?.fx.fcAmount != null ? String(budget.fx.fcAmount) : '0')
  const [approvedRateInput, setApprovedRateInput] = useState(budget?.fx.exchangeRate != null ? String(budget.fx.exchangeRate) : '0')
  const [thresholdInput, setThresholdInput] = useState(budget?.certificateApprovalThreshold != null ? String(budget.certificateApprovalThreshold) : '')
  const [showAddChange, setShowAddChange] = useState(false)
  const [showAnnualForm, setShowAnnualForm] = useState(false)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const saveApproved = async () => {
    await upsertBudget(masterProjectId, {
      approvedBudget: approvedInput === '' ? 0 : Number(approvedInput),
      currency,
      fx: { fcAmount: Number(approvedFcInput) || 0, fcCurrency: budget?.fx.fcCurrency ?? 'EUR', exchangeRate: Number(approvedRateInput) || 0, fcRialEquivalent: 0 },
      certificateApprovalThreshold: thresholdInput === '' ? null : Number(thresholdInput),
    })
    setEditingApproved(false)
  }

  return (
    <div className="space-y-4">
      <div className="fin-card p-4">
        <p className="text-xs fin-text-muted">بودجه پروژه</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          icon={Wallet}
          label="بودجه مصوب (Approved)"
          value={fmtCurrency(summary.approvedBudget, currency)}
          color={FINANCE_ACCENT}
          tooltip="تعریف: مبلغ بودجه اولیه مصوب برای این پروژه (ریالی + معادل ریالی سهم ارزی). هدف: نقطه شروع کنترل بودجه. تفسیر: عددی ثابت است؛ تغییر آن فقط از طریق تغییرات بودجه ثبت‌شده رخ می‌دهد."
        />
        <MetricCard
          icon={Coins}
          label="بودجه جاری (Current)"
          value={fmtCurrency(summary.currentBudgetAmount, currency)}
          color={FINANCE_ACCENT}
          tooltip="تعریف: بودجه مصوب به‌علاوه مجموع تغییرات بودجه ثبت‌شده. هدف: سقف واقعی و به‌روز منابع مالی مصوب پروژه. تفسیر: با هزینه متعهدشده مقایسه شود؛ فاصله زیاد یعنی ظرفیت بودجه‌ای باقی‌مانده."
        />
        <MetricCard
          icon={Gauge}
          label="جذب بودجه (Absorption)"
          value={`${summary.budgetAbsorptionPct}٪`}
          color={summary.budgetAbsorptionPct <= 100 ? '#5c7290' : '#b5573a'}
          status={summary.budgetAbsorptionPct <= 90 ? 'good' : summary.budgetAbsorptionPct <= 100 ? 'warn' : 'bad'}
          tooltip="تعریف: نسبت هزینه متعهدشده به بودجه جاری. هدف: نشان‌دادن سرعت مصرف بودجه. تفسیر: افزایش به سمت ۱۰۰٪ طبیعی است؛ عبور از ۱۰۰٪ یعنی هزینه از بودجه مصوب فراتر رفته است."
        />
        <MetricCard icon={Target} label="بودجه سال جاری (Annual)" value={summary.annualBudgetAmount != null ? fmtCurrency(summary.annualBudgetAmount, currency) : 'ثبت نشده'} color="#b8863b" tooltip={`تعریف: بودجه مصوب سال ${todayJalali().jy} شمسی برای این پروژه — با «بودجه جاری» (کل پروژه) اشتباه نشود. هدف: کنترل مصرف بودجه در بازه یک‌ساله. تفسیر: در بخش «بودجه سالانه» پایین همین صفحه قابل ثبت و ویرایش است.`} />
        <MetricCard
          icon={Scale}
          label="بودجه باقی‌مانده (Remaining)"
          value={fmtCurrency(summary.remainingBudget, currency)}
          color={summary.remainingBudget >= 0 ? '#3e7c74' : '#b5573a'}
          status={summary.remainingBudget >= 0 ? 'good' : 'bad'}
          tooltip="تعریف: بودجه جاری منهای هزینه متعهدشده. هدف: ظرفیت باقی‌مانده برای تعهدات جدید. تفسیر: منفی‌شدن یعنی هزینه متعهدشده از بودجه فراتر رفته و نیاز به تغییر بودجه یا کنترل هزینه دارد."
        />
        <MetricCard
          icon={TrendingUp}
          label="پیش‌بینی هزینه در تکمیل (EAC)"
          value={eac != null ? fmtCurrency(eac, currency) : 'ثبت نشده'}
          color="#b8863b"
          tooltip="تعریف: برآورد کل هزینه پروژه در زمان تکمیل، از شناسنامه پروژه در داده پایه خوانده می‌شود. هدف: مقایسه با بودجه برای پیش‌بینی انحراف نهایی. تفسیر: بالاتر از بودجه جاری یعنی هشدار انحراف هزینه."
        />
        <MetricCard
          icon={TrendingDown}
          label="انحراف بودجه (Variance)"
          value={fmtCurrency(summary.budgetVariance, currency)}
          color={summary.budgetVariance >= 0 ? '#3e7c74' : '#b5573a'}
          status={summary.budgetVariance >= 0 ? 'good' : 'bad'}
          tooltip={`تعریف: بودجه جاری منهای ${eac != null ? 'EAC' : 'هزینه متعهدشده (چون EAC هنوز ثبت نشده)'}. هدف: سنجش کفایت بودجه نسبت به برآورد نهایی هزینه. تفسیر: مثبت یعنی بودجه کافی است؛ منفی یعنی نیاز به بودجه اضافه پیش‌بینی می‌شود.`}
        />
        <MetricCard icon={PieChart} label="تعداد تغییرات بودجه" value={projectChanges.length.toLocaleString('fa-IR')} color="#7c8794" tooltip="تعداد رکوردهای افزایش/کاهش بودجه ثبت‌شده برای این پروژه." />
      </div>

      <div className="fin-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">بودجه مصوب</p>
          {!editingApproved && (
            <button
              onClick={() => {
                setApprovedInput(budget?.approvedBudget != null ? String(budget.approvedBudget) : '')
                setApprovedFcInput(budget?.fx.fcAmount != null ? String(budget.fx.fcAmount) : '0')
                setApprovedRateInput(budget?.fx.exchangeRate != null ? String(budget.fx.exchangeRate) : '0')
                setThresholdInput(budget?.certificateApprovalThreshold != null ? String(budget.certificateApprovalThreshold) : '')
                setEditingApproved(true)
              }}
              className="text-xs fin-text-secondary hover:underline"
            >
              ویرایش
            </button>
          )}
        </div>
        {editingApproved ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] fin-text-muted">مبلغ ریالی</span>
              <input type="number" value={approvedInput} onChange={(e) => setApprovedInput(e.target.value)} className="fin-input num w-48" autoFocus />
              <span className="text-xs fin-text-muted">{currency}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] fin-text-muted">مبلغ ارزی</span>
              <input type="number" value={approvedFcInput} onChange={(e) => setApprovedFcInput(e.target.value)} className="fin-input num w-32" />
              <span className="text-xs fin-text-muted">{budget?.fx.fcCurrency ?? 'EUR'}</span>
              <span className="w-16 shrink-0 text-[11px] fin-text-muted">نرخ ارز</span>
              <input type="number" value={approvedRateInput} onChange={(e) => setApprovedRateInput(e.target.value)} className="fin-input num w-32" />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-2.5" style={{ borderColor: 'var(--fin-divider)' }}>
              <span className="flex items-center gap-1 w-52 shrink-0 text-[11px] fin-text-muted">
                <ShieldCheck size={12} /> سقف اختیار تصویب صورت‌وضعیت (DOA)
              </span>
              <input
                type="number"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder="بدون سقف — بدون نیاز به تصویب مدیرعامل"
                className="fin-input num w-56"
              />
              <span className="text-xs fin-text-muted">{currency}</span>
            </div>
            <p className="text-[10.5px] leading-5 fin-text-muted">
              صورت‌وضعیت‌هایی که مبلغ تاییدشده آن‌ها از این سقف فراتر رود، در صفحه «صورت‌وضعیت‌های پرداخت» با نشان «فراتر از سقف اختیار» علامت‌گذاری می‌شوند و برای تصویب نهایی به تایید مدیرعامل نیاز دارند.
            </p>
            <div className="flex gap-2">
              <button onClick={saveApproved} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: FINANCE_ACCENT }}>
                ذخیره
              </button>
              <button onClick={() => setEditingApproved(false)} className="text-xs fin-text-secondary hover:underline">
                انصراف
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="num text-2xl font-extrabold" style={{ color: FINANCE_ACCENT }}>
              {fmtCurrency(summary.approvedBudget, currency)}
            </p>
            {budget && budget.fx.fcAmount > 0 && (
              <p className="num mt-1 text-[11px] fin-text-muted" dir="ltr">
                + {budget.fx.fcAmount.toLocaleString('fa-IR')} {budget.fx.fcCurrency} × {budget.fx.exchangeRate.toLocaleString('fa-IR')} = {fmtCurrency(budget.fx.fcRialEquivalent, currency)}
              </p>
            )}
            {budget?.certificateApprovalThreshold != null && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] fin-text-secondary">
                <ShieldCheck size={12} />
                سقف اختیار تصویب صورت‌وضعیت: <span className="num font-bold">{fmtCurrency(budget.certificateApprovalThreshold, currency)}</span>
              </p>
            )}
          </>
        )}
      </div>

      <div className="fin-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">تغییرات بودجه (Budget Changes)</p>
          <button onClick={() => setShowAddChange(true)} className="flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-[11px] fin-text-secondary hover:opacity-70">
            <Plus size={12} /> افزودن تغییر
          </button>
        </div>
        {projectChanges.length === 0 ? (
          <p className="text-xs fin-text-muted">هنوز تغییری برای این بودجه ثبت نشده است.</p>
        ) : (
          <div className="space-y-1.5">
            {projectChanges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--fin-divider)' }}>
                <span className="num text-[11px] fin-text-muted">{fmtDate(c.changeDate)}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{c.reason || '—'}</span>
                <span className="num shrink-0 text-sm font-bold" style={{ color: c.amount >= 0 ? '#3e7c74' : '#b5573a' }}>
                  {c.amount >= 0 ? '+' : ''}
                  {fmtCurrency(c.amount, currency)}
                </span>
                <button onClick={() => deleteBudgetChange(c.id)} className="shrink-0 fin-text-muted hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fin-card p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <CalendarRange size={14} style={{ color: FINANCE_ACCENT }} /> بودجه سالانه (Annual Budget)
          </p>
          <button onClick={() => setShowAnnualForm(true)} className="flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-[11px] fin-text-secondary hover:opacity-70">
            <Plus size={12} /> ثبت/ویرایش سال
          </button>
        </div>
        <p className="mb-3 text-[10.5px] leading-5 fin-text-muted">بودجه پروژه به‌صورت سالانه (شمسی) مدیریت می‌شود — این جدول مستقل از «بودجه جاری» کل پروژه است.</p>
        {annualRows.length === 0 ? (
          <p className="text-xs fin-text-muted">هنوز بودجه سالانه‌ای ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10.5px] fin-text-secondary">
                  <th className="p-2 text-right font-medium">سال شمسی</th>
                  <th className="p-2 text-right font-medium">بودجه سال</th>
                  <th className="p-2 text-right font-medium">هزینه تاییدشده سال</th>
                  <th className="p-2 text-right font-medium">باقی‌مانده</th>
                  <th className="p-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--fin-divider)' }}>
                {annualRows.map((row) => {
                  const rowId = annualBudgets.find((a) => a.masterProjectId === masterProjectId && a.jalaliYear === row.jalaliYear)?.id
                  return (
                    <tr key={row.jalaliYear}>
                      <td className="num p-2 font-bold">{row.jalaliYear}</td>
                      <td className="num p-2">{fmtCurrency(row.budgetAmount, currency)}</td>
                      <td className="num p-2">{fmtCurrency(row.actualCommitted, currency)}</td>
                      <td className="num p-2 font-bold" style={{ color: row.remaining >= 0 ? '#3e7c74' : '#b5573a' }}>
                        {fmtCurrency(row.remaining, currency)}
                      </td>
                      <td className="p-2">{rowId && <button onClick={() => deleteAnnualBudget(rowId)} className="fin-text-muted hover:text-red-400"><Trash2 size={12} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
      {showAnnualForm && (
        <AnnualBudgetModal
          currency={currency}
          onClose={() => setShowAnnualForm(false)}
          onSave={async (jalaliYear, budgetAmount) => {
            await upsertAnnualBudget(masterProjectId, jalaliYear, { budgetAmount, currency })
            setShowAnnualForm(false)
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
      <div className="fin-card w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">ثبت تغییر بودجه</h3>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">تاریخ</span>
          <JalaliDateInput value={changeDate} onChange={setChangeDate} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">مبلغ (مثبت = افزایش، منفی = کاهش)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">دلیل</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="fin-input" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm fin-text-secondary hover:opacity-70">
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

function AnnualBudgetModal({ currency, onClose, onSave }: { currency: string; onClose: () => void; onSave: (jalaliYear: number, budgetAmount: number) => Promise<void> }) {
  const [jalaliYear, setJalaliYear] = useState(String(todayJalali().jy))
  const [budgetAmount, setBudgetAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (budgetAmount === '' || jalaliYear === '') return
    setSaving(true)
    await onSave(Number(jalaliYear), Number(budgetAmount))
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-extrabold">ثبت بودجه سالانه</h3>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">سال شمسی</span>
          <input type="number" value={jalaliYear} onChange={(e) => setJalaliYear(e.target.value)} className="fin-input num" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs fin-text-secondary">مبلغ بودجه سال ({currency})</span>
          <input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} className="fin-input num" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm fin-text-secondary hover:opacity-70">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={budgetAmount === '' || saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: FINANCE_ACCENT }}
          >
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
