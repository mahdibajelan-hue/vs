import { useMemo, useState } from 'react'
import { Coins, Plus, ShieldAlert, Trash2, Wallet } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { useAuthStore } from '../platform'
import { NoRoute, Kpi } from '../components/shared'
import { Card, EmptyState } from '../components/ui'
import { BudgetChart } from '../components/BudgetChart'
import { MoneyInput } from '../components/MoneyInput'
import { PaymentDialog } from '../components/PaymentDialog'
import { PAYMENT_LABEL, monthsOfBudgetLeft, spendSeries, summarize } from '../lib/finance'
import { BASE_PRICE, averagesByFactor, type FactorAverage } from '../lib/pricing'
import { LAND_TYPE_LABEL, OWNERSHIP_LABEL } from '../lib/labels'
import { faNum, fmtDateShort, fmtMoney } from '../lib/fa'
import type { LandType, Payment, PaymentCategory } from '../types'

/** Land-acquisition money: budget and its consumption, average price by the facts that drive it, and every payment made. */
export function FinancePage() {
  const data = useLandStore((s) => s.data)
  const saveBudget = useLandStore((s) => s.saveBudget)
  const delPay = useLandStore((s) => s.deletePayment)
  const decide = useLandStore((s) => s.decidePriceException)
  const select = useLandStore((s) => s.selectParcel)
  const role = data?.myRole ?? null
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const { settings, today } = useLandAnalysis()
  const [dialog, setDialog] = useState<PaymentCategory | null>(null)
  const [draftBudget, setDraftBudget] = useState<number | null | undefined>(undefined)
  const [budgetNote, setBudgetNote] = useState<string | undefined>(undefined)
  const parcels = useMemo(() => data?.parcels ?? [], [data])
  const payments = useMemo(() => data?.payments ?? [], [data])
  const sum = useMemo(() => summarize(parcels, payments, settings.budgetAmount), [parcels, payments, settings.budgetAmount])
  const series = useMemo(() => spendSeries(payments, today), [payments, today])
  const averages = useMemo(() => averagesByFactor(parcels), [parcels])
  if (!data?.route) return <NoRoute />
  const byId = new Map(parcels.map((p) => [p.id, p]))
  const pending = parcels.filter((p) => p.priceException?.status === 'requested')
  const canDecide = isAdmin || role === 'project_manager' || role === 'executive'
  const left = monthsOfBudgetLeft(series, sum.budget, today)
  const level = sum.consumption == null ? null : sum.consumption > 1 ? '#ef4444' : sum.consumption >= 0.8 ? '#f59e0b' : '#22c55e'
  const budgetValue = draftBudget === undefined ? (settings.budgetAmount ?? null) : draftBudget
  const feeRows = payments.filter((x) => x.category !== 'owner')
  const ownerRows = payments.filter((x) => x.category === 'owner')
  const whoPays = (x: Payment) => (x.parcelId ? byId.get(x.parcelId)?.code ?? '' : 'عمومی')

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      {/* ------------------------------------------------------------ budget */}
      <Card help="budget" title="بودجهٔ تحصیل اراضی پروژه" hint="در ابتدای پروژه بودجهٔ مصوب تحصیل اراضی را ثبت کنید؛ مصرف آن همواره با پرداخت‌ها سنجیده می‌شود." action={sum.budget == null ? <span className="la-badge" style={{ '--c': '#f59e0b' } as React.CSSProperties}><i /> بودجه ثبت نشده</span> : undefined}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr_auto] sm:items-end">
          <div><span className="la-label">بودجهٔ مصوب (ریال)</span><MoneyInput value={budgetValue} onChange={setDraftBudget} ariaLabel="بودجهٔ مصوب" /></div>
          <label className="block"><span className="la-label">توضیح (منبع تأمین، شمارهٔ ابلاغ …)</span><input className="la-input" value={budgetNote ?? settings.budgetNote ?? ''} onChange={(e) => setBudgetNote(e.target.value)} /></label>
          <button className="la-btn la-btn-primary" disabled={draftBudget === undefined && budgetNote === undefined} onClick={async () => { await saveBudget(budgetValue ?? null, budgetNote ?? settings.budgetNote ?? ''); setDraftBudget(undefined); setBudgetNote(undefined) }}>ذخیرهٔ بودجه</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="بودجهٔ مصوب" value={<span className="text-[20px]">{sum.budget ? fmtMoney(sum.budget) : '—'}</span>} />
          <Kpi label="جمع پرداخت‌ها" value={<span className="text-[20px]">{fmtMoney(sum.total)}</span>} color={level ?? undefined} />
          <Kpi label="مصرف بودجه" value={sum.consumption != null ? `${faNum(Math.round(sum.consumption * 100))}٪` : '—'} color={level ?? undefined} alert={sum.consumption != null && sum.consumption >= 0.8} sub={left != null ? `با روند فعلی حدود ${faNum(Math.round(left))} ماه دیگر` : undefined} />
          <Kpi label="باقی‌ماندهٔ بودجه" value={<span className="text-[20px]">{sum.remaining != null ? fmtMoney(sum.remaining) : '—'}</span>} color={sum.remaining != null && sum.remaining < 0 ? '#ef4444' : undefined} />
          <Kpi label="برآورد کل زمین‌ها" value={<span className="text-[20px]">{fmtMoney(sum.estimated)}</span>} alert={sum.overrun} sub={sum.overrun ? 'برآورد + هزینه‌ها از بودجه بیشتر است' : undefined} color={sum.overrun ? '#ef4444' : undefined} />
        </div>
        <div className="mt-4"><BudgetChart series={series} budget={sum.budget} estimated={sum.estimated} /></div>
      </Card>

      {/* ------------------------------------------------------------ price exceptions */}
      {pending.length > 0 && (
        <Card help="price" title="درخواست‌های ثبت استثنایی قیمت" hint="قیمت‌هایی که از محدودهٔ متعارف بیرون بودند و با دلیل برای تصمیم ارسال شده‌اند — مدیر پروژه، مجری طرح و مسئول حقوقی کارفرما هشدار گرفته‌اند." pad={false}>
          <ul className="m-0 list-none p-0">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--la-line)' }}>
                <ShieldAlert size={18} style={{ color: '#f59e0b' }} aria-hidden />
                <button className="la-btn la-btn-ghost la-btn-sm" onClick={() => select(p.id)}>{p.code}</button>
                <span className="min-w-0 flex-1 text-[12.5px] leading-6"><b className="la-num">{faNum(p.priceException!.price)}</b> ریال بر متر مربع · {p.priceException!.requestedBy}<span className="la-eyebrow block">{p.priceException!.reason}</span></span>
                {canDecide ? <><button className="la-btn la-btn-primary la-btn-sm" onClick={() => decide(p.id, true, '')}>تأیید</button><button className="la-btn la-btn-danger la-btn-sm" onClick={() => decide(p.id, false, '')}>رد</button></> : <span className="la-eyebrow">منتظر تصمیم مدیر پروژه</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------------------------ price by factor */}
      <Card title="میانگین قیمت هر متر مربع بر حسب عامل‌ها" hint="میانگین وزنی بر اساس مساحت قطعه‌هایی که مساحت و قیمت دارند؛ ستون «مرجع» قیمت پایهٔ مقایسه برای نوع زمین است.">
        {averages.length === 0 ? <EmptyState icon={<Coins size={20} />} title="هنوز قیمتی ثبت نشده" text="در پنل هر قطعه، تب «مالی و قیمت»، مساحت و قیمت هر متر مربع را وارد کنید." /> : (
          <div className="grid gap-4 lg:grid-cols-3">
            <AvgTable title="بر حسب نوع زمین" rows={averages.filter((x) => x.group === 'landType')} label={(k) => LAND_TYPE_LABEL[k as LandType] ?? k} ref_={(k) => BASE_PRICE[k as LandType]} />
            <AvgTable title="بر حسب ماهیت مالکیت" rows={averages.filter((x) => x.group === 'ownership')} label={(k) => OWNERSHIP_LABEL[k as keyof typeof OWNERSHIP_LABEL] ?? k} />
            <AvgTable title="بر حسب کاربری" rows={averages.filter((x) => x.group === 'landUse').slice(0, 8)} label={(k) => k} />
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ ledger */}
      <Card title="ریز هزینه‌های پرداخت‌شده" hint="هر پرداخت به تفکیک: هزینه‌های کارشناسی، انتقال مالکیت و سایر، و پرداخت به مالکین." pad={false}
        action={<div className="flex gap-2"><button className="la-btn la-btn-sm" onClick={() => setDialog('expert')}><Plus size={13} /> هزینه</button><button className="la-btn la-btn-sm la-btn-primary" onClick={() => setDialog('owner')}><Plus size={13} /> پرداخت به مالک</button></div>}>
        <Ledger title="هزینه‌های کارشناسی، انتقال مالکیت و سایر" rows={feeRows} who={whoPays} onDelete={delPay} showCategory />
        <Ledger title="پرداخت به مالکین" rows={ownerRows} who={whoPays} onDelete={delPay} />
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--la-line)', borderTop: '1px solid var(--la-line)' }} role="group" aria-label="جمع کل هزینه‌ها">
          <Total label="جمع هزینه‌های کارشناسی" v={sum.expert} />
          <Total label="جمع انتقال مالکیت، حقوقی و سایر" v={sum.byCategory.transfer + sum.byCategory.legal + sum.byCategory.other} />
          <Total label="جمع پرداخت به مالکین" v={sum.owners} />
          <Total label="هزینهٔ کل تحصیل اراضی" v={sum.total} strong />
        </div>
      </Card>
      {dialog && <PaymentDialog category={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Total({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className="p-4" style={{ background: 'var(--la-surface)' }}>
      <p className="la-eyebrow m-0">{label}</p>
      <p className={`la-num m-0 mt-1 ${strong ? 'text-[22px] font-bold' : 'text-[16px] font-semibold'}`} style={strong ? { color: 'var(--la-accent)' } : undefined}>{fmtMoney(v)}</p>
    </div>
  )
}

function Ledger({ title, rows, who, onDelete, showCategory }: { title: string; rows: Payment[]; who: (x: Payment) => string; onDelete: (id: string) => void; showCategory?: boolean }) {
  const sum = rows.reduce((n, x) => n + x.amount, 0)
  return (
    <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--la-line)' }}>
      <p className="la-title m-0 px-4 pt-3 flex items-center gap-2"><Wallet size={14} aria-hidden /> {title} <span className="la-eyebrow">({faNum(rows.length)} مورد)</span></p>
      {rows.length === 0 ? <p className="la-eyebrow px-4 py-3">موردی ثبت نشده است.</p> : (
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: 'var(--la-muted)' }}>{['تاریخ', showCategory ? 'نوع هزینه' : 'مالک', 'قطعه', showCategory ? 'دریافت‌کننده' : 'توضیح', 'سند', 'مبلغ', ''].map((h, i) => <th key={i} className="px-3 py-2 text-right font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} style={{ borderTop: '1px solid var(--la-line)' }}>
                <td className="whitespace-nowrap px-3 py-2">{fmtDateShort(x.paidDate)}</td>
                <td className="px-3 py-2">{showCategory ? PAYMENT_LABEL[x.category] : x.payee}</td>
                <td className="la-km px-3 py-2">{who(x)}</td>
                <td className="px-3 py-2" style={{ color: 'var(--la-ink-2)' }}>{showCategory ? x.payee : x.note}</td>
                <td className="px-3 py-2" style={{ color: 'var(--la-ink-2)' }}>{x.ref || '—'}</td>
                <td className="la-num whitespace-nowrap px-3 py-2 font-bold">{fmtMoney(x.amount)}</td>
                <td className="px-2"><button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف" onClick={() => onDelete(x.id)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--la-line-2)' }}><td colSpan={5} className="px-3 py-2 font-bold">جمع</td><td className="la-num px-3 py-2 font-bold" colSpan={2}>{fmtMoney(sum)}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

function AvgTable({ title, rows, label, ref_ }: { title: string; rows: FactorAverage[]; label: (k: string) => string; ref_?: (k: string) => number }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="la-title mb-1.5 mt-0">{title}</p>
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
        <thead><tr style={{ color: 'var(--la-muted)' }}><th className="py-1.5 text-right font-semibold" /><th className="py-1.5 text-right font-semibold">تعداد</th><th className="py-1.5 text-right font-semibold">میانگین (میلیون ریال/م²)</th>{ref_ && <th className="py-1.5 text-right font-semibold">مرجع</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: '1px solid var(--la-line)' }}>
              <td className="py-1.5 font-semibold">{label(r.key)}</td>
              <td className="la-num py-1.5">{faNum(r.n)}</td>
              <td className="la-num py-1.5 font-bold">{faNum(+(r.avg / 1e6).toFixed(1))}<span className="la-eyebrow"> ({faNum(+(r.min / 1e6).toFixed(1))}–{faNum(+(r.max / 1e6).toFixed(1))})</span></td>
              {ref_ && <td className="la-num py-1.5" style={{ color: 'var(--la-ink-2)' }}>{faNum(+(ref_(r.key) / 1e6).toFixed(1))}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
