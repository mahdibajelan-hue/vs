import { useState } from 'react'
import { AlertTriangle, Database, Loader2, RefreshCcw } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { wipeAllDemoData, seedDemoData, type DemoSeedCounts } from '../lib/demoSeed'

/**
 * Admin-only, demo/test-environment tool (spec §31): wipes every Portfolio/Program/Project and
 * Risk-module record and regenerates a coherent, reproducible sample dataset in their place —
 * run entirely through the app's own authenticated Supabase client. Deliberately not exposed
 * anywhere outside this admin page; this is a destructive action and must stay opt-in.
 */
export function DemoDataPage() {
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<DemoSeedCounts | null>(null)
  const [error, setError] = useState('')

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

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Database size={15} className="text-red-400" /> داده‌های نمایشی (Demo Data)
          </p>
          <p className="text-[11px] text-muted">
            تولید یک مجموعه داده منسجم و قابل‌تکرار برای آزمایش داشبوردها — ۳ پورتفولیو، ۶ طرح، ۱۰ پروژه، و حدود ۱۰۰ ریسک با تاریخچه بازبینی، اقدامات و ارجاع.
          </p>
        </div>

        <div className="glass-panel rounded-2xl border border-red-400/30 p-4">
          <div className="mb-3 flex items-start gap-2.5 text-xs text-red-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p className="leading-6">
              این عملیات <b>تمام</b> داده‌های موجود پورتفولیو، طرح، پروژه و ریسک (شامل پروژه‌های واقعی ثبت‌شده) را برای همیشه حذف کرده و با داده نمایشی جایگزین می‌کند. این عملیات
              غیرقابل‌بازگشت است و فقط باید در محیط آزمایشی/دمو استفاده شود.
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
                <span>{result.portfolios} پورتفولیو</span>
                <span>{result.programs} طرح</span>
                <span>{result.projects} پروژه</span>
                <span>{result.risks} ریسک</span>
                <span>{result.reviews} بازبینی</span>
                <span>{result.actions} اقدام</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
