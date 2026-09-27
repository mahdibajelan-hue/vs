import { FlaskConical } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'

/** «نمایش داده‌های آزمایشی» — includes demo/test candidates (comp_assessments.is_demo, N-15) in
 * stats, peer rank/averages and reports. Off by default; remembered per browser. Renders nothing
 * when there is no demo data. */
export function DemoDataToggle({ className = '' }: { className?: string }) {
  const show = useCompetencyStore((s) => s.showDemoData)
  const setShow = useCompetencyStore((s) => s.setShowDemoData)
  const demoCount = useCompetencyStore((s) => s.assessments.filter((a) => a.isDemo).length)
  if (demoCount === 0) return null
  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${
        show ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-white/10 bg-white/5 text-secondary'
      } ${className}`}
      title="داوطلبان آزمایشی در آمار، رتبه/میانگین همتایان و گزارش‌ها حساب شوند یا نه"
    >
      <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-3.5 w-3.5" />
      <FlaskConical size={12} /> نمایش داده‌های آزمایشی ({demoCount.toLocaleString('fa-IR')})
    </label>
  )
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200" title="داوطلب آزمایشی — در آمار و رتبه‌بندی پیش‌فرض حساب نمی‌شود">
      آزمایشی
    </span>
  )
}
