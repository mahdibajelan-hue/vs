import { useState } from 'react'
import { AlertTriangle, Banknote, Database, Loader2, Package, Plus, RefreshCcw } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { wipeAllDemoData, seedDemoData, type DemoSeedCounts } from '../lib/demoSeed'
import { seedFinanceDemoData, type FinanceDemoSeedCounts } from '../../finance/lib/financeDemoSeed'
import { seedMaterialDemoData, type MaterialDemoSeedCounts } from '../../material/lib/materialDemoSeed'

/**
 * Admin-only, demo/test-environment tool (spec §31): wipes every Portfolio/Program/Project and
 * every connected module's data (Risk, Issue Management, PipePulse, Reporting) and regenerates a
 * coherent, reproducible sample dataset in their place — run entirely through the app's own
 * authenticated Supabase client. Deliberately not exposed anywhere outside this admin page; this
 * is a destructive action and must stay opt-in.
 */
export function DemoDataPage() {
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<DemoSeedCounts | null>(null)
  const [error, setError] = useState('')

  const [confirming2, setConfirming2] = useState(false)
  const [busy2, setBusy2] = useState(false)
  const [progress2, setProgress2] = useState('')
  const [result2, setResult2] = useState<{ finance: FinanceDemoSeedCounts; material: MaterialDemoSeedCounts } | null>(null)
  const [error2, setError2] = useState('')

  const run = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      await wipeAllDemoData(setProgress)
      const counts = await seedDemoData(setProgress)
      setResult(counts)
      setConfirming(false)
      setConfirmText('')
      await fetchMasterData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای نامشخص در بازتولید داده نمایشی')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const runFinanceMaterial = async () => {
    setBusy2(true)
    setError2('')
    setResult2(null)
    try {
      const finance = await seedFinanceDemoData(setProgress2)
      const material = await seedMaterialDemoData(setProgress2)
      setResult2({ finance, material })
      setConfirming2(false)
    } catch (err) {
      setError2(err instanceof Error ? err.message : 'خطای نامشخص در تولید داده نمایشی مالی و تامین کالا')
    } finally {
      setBusy2(false)
      setProgress2('')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Database size={15} className="text-red-400" /> داده‌های نمایشی (Demo Data)
          </p>
          <p className="text-[11px] text-muted">
            تولید یک مجموعه داده منسجم و قابل‌تکرار برای آزمایش تمام ماژول‌ها — ۴ پورتفولیو، ۸ طرح و ۱۶ پروژه پایه، به‌همراه داده کامل ریسک، مدیریت مسائل، PipePulse (خطوط، گزارش کارکرد روزانه، برنامه زمان‌بندی) و گزارش‌گیری (تصمیمات، اقدامات، نقش‌های پروژه) برای هر پروژه — به‌گونه‌ای که گزارش‌های تجمیعی سطح پرتفولیو/طرح (مثلاً ریسک‌های یک پرتفولیو) از همه ماژول‌ها قابل استخراج باشد.
          </p>
        </div>

        <div className="glass-panel rounded-2xl border border-red-400/30 p-4">
          <div className="mb-3 flex items-start gap-2.5 text-xs text-red-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p className="leading-6">
              این عملیات <b>تمام</b> داده‌های موجود پورتفولیو، طرح، پروژه، سازمان‌ها و هر چهار ماژول متصل (ریسک، مدیریت مسائل، PipePulse و گزارش‌گیری) — شامل پروژه‌های واقعی ثبت‌شده — را برای
              همیشه حذف کرده و با داده نمایشی جایگزین می‌کند. این عملیات غیرقابل‌بازگشت است و فقط باید در محیط آزمایشی/دمو استفاده شود.
            </p>
          </div>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-400 transition-colors"
            >
              <RefreshCcw size={13} /> بازتولید کامل داده نمایشی
            </button>
          ) : (
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-1 block text-[11px] text-secondary">
                  برای تایید، عبارت <b className="num text-red-300">RESET</b> را دقیقاً وارد کنید
                </span>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input num" placeholder="RESET" disabled={busy} />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirming(false)
                    setConfirmText('')
                  }}
                  disabled={busy}
                  className="rounded-lg px-3.5 py-2 text-xs text-secondary hover:bg-white/5 disabled:opacity-50"
                >
                  انصراف
                </button>
                <button
                  onClick={run}
                  disabled={confirmText !== 'RESET' || busy}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-40 transition-colors"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                  {busy ? progress || 'در حال اجرا...' : 'تایید نهایی و اجرا'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">خطا: {error}</p>}

          {result && (
            <div className="mt-3 rounded-xl bg-green-500/10 p-3 text-[11px] text-green-300">
              <p className="mb-1.5 font-bold">داده نمایشی با موفقیت بازتولید شد:</p>
              <div className="grid grid-cols-2 gap-2 num sm:grid-cols-3">
                <span>{result.organizations} سازمان</span>
                <span>{result.portfolios} پورتفولیو</span>
                <span>{result.programs} طرح</span>
                <span>{result.projects} پروژه</span>
                <span>{result.phases} فاز پروژه</span>
                <span>{result.risks} ریسک</span>
                <span>{result.reviews} بازبینی ریسک</span>
                <span>{result.riskActions} اقدام ریسک</span>
                <span>{result.issues} مسئله</span>
                <span>{result.pipepulseLines} خط PipePulse</span>
                <span>{result.dailyLogs} گزارش روزانه</span>
                <span>{result.decisions} تصمیم</span>
                <span>{result.actions} اقدام مدیریتی</span>
                <span>{result.roleAssignments} نقش تخصیص‌یافته</span>
              </div>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl border border-amber-400/25 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <Banknote size={15} className="text-amber-300" />
            <Package size={15} className="text-amber-300" />
            داده نمایشی مالی و تامین کالا
          </div>
          <p className="mb-3 text-[11px] text-muted">
            بدون حذف پورتفولیو، طرح، پروژه یا داده هیچ ماژول دیگری، برای همان ۱۶ پروژه پایه موجود، داده نمایشی ماژول «مدیریت مالی» (بودجه، قرارداد، صورت‌وضعیت) و ماژول «مدیریت تامین کالا» (MTO، خرید، ساخت، حمل، انبار، تخصیص) تولید می‌کند. اجرای مجدد فقط داده نمایشی همین دو ماژول را جایگزین می‌کند.
          </p>

          {!confirming2 ? (
            <button
              onClick={() => setConfirming2(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-400 transition-colors"
            >
              <Plus size={13} /> افزودن داده نمایشی مالی و تامین کالا
            </button>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-amber-300">برای همه پروژه‌های پایه موجود، داده مالی و تامین کالا تولید می‌شود. اگر قبلاً یک بار اجرا شده باشد، داده نمایشی قبلی همین دو ماژول جایگزین می‌شود.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming2(false)} disabled={busy2} className="rounded-lg px-3.5 py-2 text-xs text-secondary hover:bg-white/5 disabled:opacity-50">
                  انصراف
                </button>
                <button
                  onClick={runFinanceMaterial}
                  disabled={busy2}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-400 disabled:opacity-40 transition-colors"
                >
                  {busy2 ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                  {busy2 ? progress2 || 'در حال اجرا...' : 'تایید و اجرا'}
                </button>
              </div>
            </div>
          )}

          {error2 && <p className="mt-3 text-xs text-red-400">خطا: {error2}</p>}

          {result2 && (
            <div className="mt-3 rounded-xl bg-green-500/10 p-3 text-[11px] text-green-300">
              <p className="mb-1.5 font-bold">داده نمایشی مالی و تامین کالا با موفقیت تولید شد:</p>
              <p className="mb-1 font-bold text-green-200">مدیریت مالی</p>
              <div className="mb-2 grid grid-cols-2 gap-2 num sm:grid-cols-3">
                <span>{result2.finance.projectsCovered} پروژه</span>
                <span>{result2.finance.budgets} بودجه</span>
                <span>{result2.finance.budgetChanges} تغییر بودجه</span>
                <span>{result2.finance.contracts} قرارداد</span>
                <span>{result2.finance.amendments} الحاقیه</span>
                <span>{result2.finance.certificates} صورت‌وضعیت</span>
              </div>
              <p className="mb-1 font-bold text-green-200">مدیریت تامین کالا</p>
              <div className="grid grid-cols-2 gap-2 num sm:grid-cols-3">
                <span>{result2.material.projectsCovered} پروژه</span>
                <span>{result2.material.mtoRevisions} ریویژن MTO</span>
                <span>{result2.material.materials} کالا</span>
                <span>{result2.material.procurementRequests} درخواست خرید</span>
                <span>{result2.material.purchaseOrders} سفارش خرید</span>
                <span>{result2.material.manufacturing} قلم ساخت</span>
                <span>{result2.material.shipments} محموله</span>
                <span>{result2.material.warehouseReceipts} رسید انبار</span>
                <span>{result2.material.allocations} تخصیص</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
