import { useEffect, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Gauge } from 'lucide-react'
import { fetchCostProgressCrossCheck, type CostProgressCrossCheck } from '../lib/financeProgress'
import type { MasterProject } from '../../masterdata/types'

const GAP_THRESHOLD = 5

/** Project-level EVM-lite card: physical progress (from PipePulse) vs financial progress (certified / current budget). */
export function CostProgressCheckCard({ project, financialPercent }: { project: MasterProject; financialPercent: number }) {
  const [check, setCheck] = useState<CostProgressCrossCheck | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCostProgressCrossCheck(project, financialPercent).then((c) => {
      if (!cancelled) {
        setCheck(c)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
    // keyed on project.id (stable), not the project object (a new reference every render) to avoid refetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, financialPercent])

  const gap = check?.gapPct ?? 0

  return (
    <div className="fin-card p-4">
      <p className="fin-text mb-3 flex items-center gap-1.5 text-sm font-bold">
        <Gauge size={14} style={{ color: '#c9a654' }} /> تطبیق پیشرفت فیزیکی و مالی (EVM ساده)
      </p>
      {loading ? (
        <p className="text-xs fin-text-muted">در حال دریافت پیشرفت فیزیکی از ماژول پایپ‌پالس...</p>
      ) : !check?.mapped ? (
        <p className="text-xs fin-text-muted">این پروژه هنوز به یک پروژه پایپ‌پالس نگاشت نشده است — نگاشت پروژه از ماژول مدیریت کاربران قابل انجام است.</p>
      ) : check.physicalPercent == null ? (
        <p className="text-xs fin-text-muted">برای این پروژه هنوز برنامه زمان‌بندی یا داده پیشرفت فیزیکی در پایپ‌پالس ثبت نشده است.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] fin-text-muted">پیشرفت فیزیکی واقعی (پایپ‌پالس)</p>
              <p className="num text-xl font-extrabold" style={{ color: '#3e7c74' }}>
                {check.physicalPercent.toLocaleString('fa-IR')}٪
              </p>
            </div>
            <div>
              <p className="text-[10px] fin-text-muted">پیشرفت مالی (تاییدشده / بودجه جاری)</p>
              <p className="num text-xl font-extrabold" style={{ color: '#5c7290' }}>
                {check.financialPercent.toLocaleString('fa-IR')}٪
              </p>
            </div>
            <div>
              <p className="text-[10px] fin-text-muted">فاصله (مالی − فیزیکی)</p>
              <p className="num flex items-center gap-1 text-xl font-extrabold" style={{ color: gap > GAP_THRESHOLD ? '#b5573a' : gap < -GAP_THRESHOLD ? '#b8863b' : '#3e7c74' }}>
                {gap > 0 ? <ArrowUpRight size={16} /> : gap < 0 ? <ArrowDownRight size={16} /> : <Activity size={16} />}
                {gap > 0 ? '+' : ''}
                {gap.toLocaleString('fa-IR')}٪
              </p>
            </div>
          </div>
          <p className="text-[10.5px] leading-5 fin-text-muted">
            {gap > GAP_THRESHOLD
              ? 'هشدار: پرداخت مالی سریع‌تر از پیشرفت فیزیکی واقعی پروژه پیش می‌رود — ریسک پرداخت بیش از کارکرد واقعی انجام‌شده وجود دارد.'
              : gap < -GAP_THRESHOLD
                ? 'کار فیزیکی از روند پرداخت جلوتر است — ممکن است پیمانکار نسبت به کارکرد انجام‌شده با کمبود نقدینگی مواجه باشد.'
                : 'پیشرفت مالی و فیزیکی پروژه هم‌راستا هستند.'}
          </p>
        </div>
      )}
    </div>
  )
}
