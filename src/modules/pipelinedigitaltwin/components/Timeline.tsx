import { CalendarClock } from 'lucide-react'

/**
 * Bottom timeline bar — the static shell only (project start/finish + a "today" marker). The
 * interactive date-scrubbing behavior ("see the pipeline as it looked on 2026-07-01") is Phase 10
 * and needs the Joint/status history that later phases build, so it isn't wired up yet.
 */
export function Timeline() {
  return (
    <div className="glass-panel flex shrink-0 items-center gap-4 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
        <CalendarClock size={13} /> جدول زمانی اجرا
      </div>
      <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
        <div className="absolute inset-y-0 right-0 w-[38%] rounded-full bg-brand-500/60" />
        <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-brand-400" style={{ right: '38%' }} />
      </div>
      <div className="flex shrink-0 gap-4 text-[10px] text-muted">
        <span>شروع پروژه</span>
        <span>امروز</span>
        <span>پایان پروژه</span>
      </div>
    </div>
  )
}
