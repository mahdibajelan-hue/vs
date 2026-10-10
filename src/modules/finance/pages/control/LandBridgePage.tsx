import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Sprout } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useModuleStore } from '../../../../store/useModuleStore'
import { useFinanceControlStore, type LandLedgerRow } from '../../store/useFinanceControlStore'
import { landBridge } from '../../lib/financeControl'
import { useThresholds } from '../../lib/useThresholds'
import { fmtCurrency, fmtDate } from '../../components/FinanceKpiTile'
import { MetricCard, StampBadge } from '../../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../../FinanceApp'
import { Gauge, Wallet, Hourglass, PiggyBank } from 'lucide-react'

const CAT_FA: Record<string, string> = { owner: 'مالک', expert: 'کارشناس رسمی', transfer: 'انتقال سند', legal: 'حقوقی', other: 'سایر' }
const LEVEL_COLOR = { ok: '#3e7c74', warn: '#c28a2b', critical: '#b5573a', unset: '#7c8794' } as const

/**
 * Land acquisition ↔ finance. One record, two views: payments live in the land module (la_payments) and are *read* here, never copied;
 * the approved land budget lives here (budget lines of kind «تملک اراضی») and is *read* by the land module. Voiding a payment in either
 * place keeps the row and its reason, and drops it from both modules' sums.
 */
export function LandBridgePage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const summary = useFinanceControlStore((s) => s.land.get(masterProjectId))
  const lines = useFinanceControlStore((s) => s.budgetLines).filter((l) => l.masterProjectId === masterProjectId && l.kind === 'land')
  const saveLine = useFinanceControlStore((s) => s.saveBudgetLine)
  const loadLedger = useFinanceControlStore((s) => s.loadLandLedger)
  const enterModule = useModuleStore((s) => s.enterModule)
  const { thresholds } = useThresholds()
  const [ledger, setLedger] = useState<LandLedgerRow[]>([])
  const [amount, setAmount] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const line = lines.find((l) => l.isActive) ?? null

  useEffect(() => { void loadLedger(masterProjectId).then(setLedger) }, [loadLedger, masterProjectId, summary?.paid])
  const bridge = useMemo(() => (summary ? landBridge(summary, thresholds) : null), [summary, thresholds])
  const rows = ledger.filter((r) => showVoided || r.status === 'posted')

  if (!project) return null
  if (!summary || !bridge) return (
    <div className="fin-card p-8 text-center text-sm fin-text-muted">
      برای این پروژه در ماژول تحصیل اراضی مسیری تعریف نشده است. پس از تعریف مسیر و ثبت پرداخت‌ها، وضعیت بودجهٔ تملک اینجا خودکار نمایش داده می‌شود.
      <div className="mt-3"><button className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: FINANCE_ACCENT }} onClick={() => enterModule('landacq')}>باز کردن تحصیل اراضی</button></div>
    </div>
  )
  const cur = line?.currency ?? 'ریال'
  const color = LEVEL_COLOR[bridge.level]

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">تملک اراضی و آزادسازی مسیر</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        <button onClick={() => enterModule('landacq')} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--fin-divider)' }}><Sprout size={13} /> باز کردن ماژول تحصیل اراضی <ExternalLink size={11} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={PiggyBank} label={`بودجهٔ مصوب (${bridge.approved_source === 'finance' ? 'مرجع: مالی' : bridge.approved_source === 'landacq' ? 'مرجع: مقدار قدیمی تحصیل اراضی' : 'ثبت نشده'})`} value={bridge.approved ? fmtCurrency(bridge.approved, cur) : '—'} color={FINANCE_ACCENT} />
        <MetricCard icon={Wallet} label="پرداخت‌شده (واقعی)" value={fmtCurrency(bridge.paid, cur)} color="#3e7c74" />
        <MetricCard icon={Hourglass} label="تعهد پرداخت‌نشده (برآورد قطعه‌ها)" value={fmtCurrency(bridge.committed_unpaid, cur)} color="#c28a2b" />
        <MetricCard icon={Gauge} label="مانده بودجه" value={bridge.approved ? fmtCurrency(bridge.remaining, cur) : '—'} color={bridge.remaining < 0 ? '#b5573a' : '#5c7290'} />
      </div>

      {bridge.usedPct != null && (
        <div className="fin-card p-4">
          <div className="mb-1.5 flex items-center justify-between text-xs"><span className="fin-text-secondary">پرداخت + تعهد نسبت به بودجه</span><span className="num font-bold" style={{ color }}>{bridge.usedPct.toLocaleString('fa-IR')}٪</span></div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--fin-divider)' }} role="progressbar" aria-valuenow={Math.min(100, bridge.usedPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, bridge.usedPct)}%`, background: color, transition: 'width .4s' }} />
          </div>
          <p className="mt-1.5 text-[11px] leading-5 fin-text-muted">پرداخت‌های باطل‌شده ({fmtCurrency(bridge.voided, cur)}) در هیچ جمعی نیست و هزینه‌ای دوبار شمرده نمی‌شود: تعهد هر قطعه = برآورد منهای آنچه به مالکش پرداخت شده.</p>
        </div>
      )}

      <div className="fin-card space-y-3 p-4">
        <p className="text-xs font-bold fin-text-secondary">ردیف بودجهٔ مصوب تملک اراضی (مرجع بودجه، ماژول مالی است)</p>
        {line ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0"><p className="text-sm font-bold">{line.code} · {line.title}</p><p className="num text-xs fin-text-muted">{fmtCurrency(line.approvedAmount, line.currency)}</p></div>
            <label className="block"><span className="mb-1 block text-[11px] fin-text-secondary">مبلغ جدید</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num w-52" placeholder={String(line.approvedAmount)} /></label>
            <button disabled={amount === ''} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }} onClick={async () => { if (await saveLine({ id: line.id, projectId: masterProjectId, code: line.code, title: line.title, costCategory: line.costCategory, kind: 'land', amount: Number(amount), currency: line.currency, notes: line.notes })) setAmount('') }}>ثبت اصلاح بودجه</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="mb-1 block text-[11px] fin-text-secondary">بودجهٔ مصوب (ریال)</span><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="fin-input num w-52" placeholder={summary.approved ? String(summary.approved) : ''} /></label>
            <button disabled={amount === ''} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }} onClick={async () => { if (await saveLine({ projectId: masterProjectId, code: 'LAND', title: 'تملک اراضی و آزادسازی مسیر', costCategory: 'land', kind: 'land', amount: Number(amount), currency: 'ریال' })) setAmount('') }}>ثبت بودجهٔ مصوب</button>
          </div>
        )}
        <p className="text-[11px] leading-5 fin-text-muted">پس از ثبت، ماژول تحصیل اراضی همین مبلغ را فقط‌خواندنی نشان می‌دهد؛ ورود دستی دوباره لازم نیست. اصلاح بودجه در سابقهٔ تغییرات (تنظیمات ← سابقه) ثبت می‌شود.</p>
      </div>

      <div className="fin-card overflow-x-auto p-4">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold fin-text-secondary">پرداخت‌های تملک (فقط‌خواندنی؛ ثبت و ابطال در ماژول تحصیل اراضی)</p>
          <label className="flex items-center gap-1.5 text-[11px] fin-text-muted"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> نمایش باطل‌شده‌ها</label></div>
        {rows.length === 0 ? <p className="py-6 text-center text-xs fin-text-muted">پرداختی ثبت نشده است.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="fin-text-muted text-right"><th className="py-1.5 font-medium">تاریخ</th><th className="font-medium">دریافت‌کننده</th><th className="font-medium">نوع</th><th className="font-medium">شناسهٔ مرجع</th><th className="text-left font-medium">مبلغ (ریال)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--fin-divider)', opacity: r.status === 'voided' ? 0.5 : 1 }}>
                  <td className="num py-1.5">{fmtDate(r.paidDate)}</td>
                  <td>{r.payee || '—'}</td>
                  <td>{CAT_FA[r.category] ?? r.category}{r.status === 'voided' && <span className="ms-1"><StampBadge label="باطل" tone="bad" /></span>}</td>
                  <td className="num" dir="ltr">{r.ref || r.id.slice(0, 8)}</td>
                  <td className="num text-left" style={{ textDecoration: r.status === 'voided' ? 'line-through' : undefined }}>{r.amount.toLocaleString('fa-IR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
