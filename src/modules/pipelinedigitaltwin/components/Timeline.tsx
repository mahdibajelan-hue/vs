import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { formatJalali } from '../../../lib/jalali'

/**
 * Scrubs the pipeline's visual state (pipe color, joint markers, KPI numbers — all recomputed by
 * DashboardPage from `scrubDate`) across the project's real history: from `projectCreatedAt` to
 * now. There is no separate stored snapshot per date — moving the slider just changes which
 * moment each joint's own append-only history log gets replayed up to (see lib/jointHistory.ts),
 * so a scrubbed view can never show something that wasn't actually logged.
 */
export function Timeline() {
  const projectCreatedAt = usePdtStore((s) => s.projectCreatedAt)
  const scrubDate = usePdtStore((s) => s.scrubDate)
  const setScrubDate = usePdtStore((s) => s.setScrubDate)

  const startMs = useMemo(() => new Date(projectCreatedAt).getTime(), [projectCreatedAt])
  const nowMs = useMemo(() => Date.now(), [])
  const totalMs = Math.max(1, nowMs - startMs)

  const currentMs = scrubDate ? new Date(scrubDate).getTime() : nowMs
  const percent = Math.min(100, Math.max(0, ((currentMs - startMs) / totalMs) * 100))

  const handleChange = (v: number) => {
    if (v >= 99.5) {
      setScrubDate(null)
      return
    }
    setScrubDate(new Date(startMs + (v / 100) * totalMs).toISOString())
  }

  return (
    <div className="glass-panel flex shrink-0 items-center gap-4 rounded-2xl px-4 py-3">
      <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-secondary">
        <CalendarClock size={13} /> جدول زمانی اجرا
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={percent}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="h-1.5 flex-1 accent-brand-400"
      />
      <div className="flex shrink-0 items-center gap-3 text-[10px] text-muted">
        <span className="num">{formatJalali(projectCreatedAt.slice(0, 10))}</span>
        <span className={`font-bold ${scrubDate ? 'num text-amber-300' : 'text-brand-300'}`}>{scrubDate ? formatJalali(scrubDate.slice(0, 10)) : 'امروز'}</span>
        <span className="num">{formatJalali(new Date(nowMs).toISOString().slice(0, 10))}</span>
      </div>
    </div>
  )
}
