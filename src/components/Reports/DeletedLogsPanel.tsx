import { useEffect, useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { canAudit } from '../../lib/permissions'
import { formatJalali } from '../../lib/jalali'
import type { Project } from '../../types'

interface DeletedEntry {
  id: string
  rowId: string
  snapshot: Record<string, unknown>
  changedAt: string
  changedByName: string
}

interface AuditDeleteRow {
  id: string
  row_id: string
  old_data: Record<string, unknown> | null
  changed_at: string
  changed_by_profile: { full_name: string; email: string } | null
}

export function DeletedLogsPanel({ project }: { project: Project }) {
  const restoreLogSnapshot = useStore((s) => s.restoreLogSnapshot)
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [entries, setEntries] = useState<DeletedEntry[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const canSee = canAudit(role) || isAdmin

  useEffect(() => {
    if (!canSee) return
    let cancelled = false
    supabase
      .from('audit_log')
      .select('id, row_id, old_data, changed_at, changed_by_profile:profiles!changed_by(full_name, email)')
      .eq('table_name', 'daily_logs')
      .eq('project_id', project.id)
      .eq('action', 'delete')
      .order('changed_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as AuditDeleteRow[]
        const liveIds = new Set(project.logs.map((l) => l.id))
        setEntries(
          rows
            .filter((r) => r.old_data && !liveIds.has(r.row_id))
            .map((r) => ({
              id: r.id,
              rowId: r.row_id,
              snapshot: r.old_data as Record<string, unknown>,
              changedAt: r.changed_at,
              changedByName: r.changed_by_profile?.full_name || r.changed_by_profile?.email || 'نامشخص',
            })),
        )
      })
    return () => {
      cancelled = true
    }
  }, [canSee, project.id, project.logs])

  const restore = async (entry: DeletedEntry) => {
    setRestoringId(entry.id)
    await restoreLogSnapshot(project.id, entry.rowId, entry.snapshot)
    setRestoringId(null)
  }

  if (!canSee || !entries || entries.length === 0) return null

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-bold text-red-400">
        <Trash2 size={14} /> رکوردهای حذف‌شده ({entries.length})
      </p>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] p-2.5 text-xs">
          <div className="min-w-0">
            <p className="text-secondary">
              متراژ {String(entry.snapshot.length_done)}m — سرجوش {String(entry.snapshot.weld_count)}
            </p>
            <p className="text-muted truncate">
              حذف‌شده توسط {entry.changedByName} — {formatJalali(entry.changedAt.slice(0, 10))}
            </p>
          </div>
          <button
            onClick={() => restore(entry)}
            disabled={restoringId === entry.id}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-secondary hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={12} /> {restoringId === entry.id ? 'در حال بازیابی...' : 'بازیابی'}
          </button>
        </div>
      ))}
    </div>
  )
}
