import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, BarChart3 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { fa } from '../lib/resultsModel'

interface Row { question_id: string; job_role: string; topic: string; difficulty: number; n: number; correct_rate: number; flag: 'NOT_ENOUGH_DATA' | 'TOO_EASY' | 'TOO_HARD' | 'OK'; active: boolean }
const MIN_N = 5

/** Item analysis for the online MCQ bank: what share of scored sittings got each question right. Nearly-always-correct questions add no information and can be retired once enough candidates have seen them. */
export function McqItemAnalysisCard() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('comp_mcq_item_stats', { p_min_n: MIN_N })
    setRows(error ? [] : ((data ?? []) as Row[]))
  }, [])
  useEffect(() => { void load() }, [load])
  const sum = useMemo(() => {
    const r = rows ?? []
    return { total: r.length, measured: r.filter((x) => x.flag !== 'NOT_ENOUGH_DATA').length, easy: r.filter((x) => x.flag === 'TOO_EASY' && x.active).length, hard: r.filter((x) => x.flag === 'TOO_HARD').length, sittings: r.reduce((a, x) => a + x.n, 0) }
  }, [rows])
  const retire = async () => {
    if (!window.confirm(`${fa(sum.easy)} سؤال با درصد پاسخ درست ۹۰٪ یا بیشتر از بانک فعال کنار گذاشته می‌شود (قابل‌بازگردانی از بانک سؤالات). ادامه می‌دهید؟`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('comp_mcq_retire_easy', { p_threshold: 0.9, p_min_n: MIN_N })
    setBusy(false)
    setMsg(error ? 'اجازهٔ این کار را ندارید.' : `${fa(Number(data))} سؤال کنار گذاشته شد.`)
    void load()
  }
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><BarChart3 size={15} className="text-sky-300" /> تحلیل گویهٔ آزمون تستی</p>
      <p className="mb-3 text-[11px] leading-6 text-muted">درصد پاسخ درست هر سؤال در آزمون‌های ثبت‌شده. سؤالی که تقریباً همه درست جواب می‌دهند (۹۰٪+) تفکیک‌کننده نیست و پس از دست‌کم {fa(MIN_N)} آزمون می‌تواند کنار گذاشته شود تا نمره‌های سقفی کم شود.</p>
      {rows == null ? <p className="text-[11px] text-muted">در حال بارگذاری…</p> : (
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="rounded-lg border border-white/10 px-2.5 py-1">سؤال بانک: <b className="num">{fa(sum.total)}</b></span>
          <span className="rounded-lg border border-white/10 px-2.5 py-1">دارای دادهٔ کافی: <b className="num">{fa(sum.measured)}</b></span>
          <span className="rounded-lg border border-white/10 px-2.5 py-1" style={{ color: sum.easy ? '#f59e0b' : undefined }}>بسیار آسان: <b className="num">{fa(sum.easy)}</b></span>
          <span className="rounded-lg border border-white/10 px-2.5 py-1">بسیار دشوار: <b className="num">{fa(sum.hard)}</b></span>
          <button className="mr-auto flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-40" disabled={busy || sum.easy === 0} onClick={() => void retire()}><Archive size={13} /> کنار گذاشتن سؤال‌های بسیار آسان</button>
        </div>
      )}
      {rows != null && sum.measured === 0 && <p className="mt-2 text-[11px] text-muted">هنوز هیچ سؤالی به {fa(MIN_N)} آزمون ثبت‌شده نرسیده است؛ تحلیل با افزایش آزمون‌ها فعال می‌شود ({fa(sum.sittings)} پاسخ ثبت شده).</p>}
      {msg && <p className="mt-2 text-[11px]" role="status">{msg}</p>}
    </div>
  )
}
