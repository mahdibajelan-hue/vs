import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatJalali } from '../../lib/jalali'

interface BaselineRow {
  id: string
  baseline_version: string
  captured_at: string
}

/**
 * Every whole-plan owner approval now freezes an immutable snapshot of the schedule
 * (schedule_baselines table, server-side trigger — see supabase/schema.sql section 17h).
 * This surfaces that history, which previously didn't exist anywhere: before this, editing
 * a planned date after approval silently erased what the plan used to say.
 */
export function BaselineHistoryPanel({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<BaselineRow[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('schedule_baselines')
      .select('id, baseline_version, captured_at')
      .eq('project_id', projectId)
      .order('captured_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!rows || rows.length === 0) return null

  const latest = rows[0]

  return (
    <div className="mb-4 glass-panel rounded-2xl p-3.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-right">
        <div className="flex items-center gap-2.5">
          <History size={16} className="text-brand-400" />
          <div>
            <p className="text-sm font-bold">تاریخچه خط مبنا (Baseline)</p>
            <p className="text-[11px] text-muted">
              {rows.length} خط مبنا ثبت شده — آخرین: {latest.baseline_version} در {formatJalali(latest.captured_at.slice(0, 10))}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-brand-400">{open ? 'بستن' : 'نمایش تاریخچه'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span className="font-medium">{r.baseline_version}</span>
              <span className="text-muted num">{formatJalali(r.captured_at.slice(0, 10))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
