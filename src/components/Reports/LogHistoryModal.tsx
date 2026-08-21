import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Modal } from '../common/Modal'
import { supabase } from '../../lib/supabaseClient'
import { useStore } from '../../store/useStore'
import { formatJalali } from '../../lib/jalali'

type AuditAction = 'insert' | 'update' | 'delete'

interface HistoryEntry {
  id: string
  action: AuditAction
  /** The record's state right after this event — for a delete, its last state right before removal. */
  snapshot: Record<string, unknown> | null
  changedAt: string
  changedByName: string
}

const ACTION_LABEL_FA: Record<AuditAction, string> = {
  insert: 'ایجاد',
  update: 'ویرایش',
  delete: 'حذف',
}

interface AuditRow {
  id: string
  action: AuditAction
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
  changed_by_profile: { full_name: string; email: string } | null
}

export function LogHistoryModal({ projectId, logId, onClose }: { projectId: string; logId: string; onClose: () => void }) {
  const restoreLogSnapshot = useStore((s) => s.restoreLogSnapshot)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('audit_log')
      .select('id, action, old_data, new_data, changed_at, changed_by_profile:profiles!changed_by(full_name, email)')
      .eq('table_name', 'daily_logs')
      .eq('row_id', logId)
      .order('changed_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as AuditRow[]
        setEntries(
          rows.map((r) => ({
            id: r.id,
            action: r.action,
            snapshot: r.new_data ?? r.old_data,
            changedAt: r.changed_at,
            changedByName: r.changed_by_profile?.full_name || r.changed_by_profile?.email || 'نامشخص',
          })),
        )
      })
    return () => {
      cancelled = true
    }
  }, [logId])

  const restore = async (entry: HistoryEntry) => {
    if (!entry.snapshot) return
    setRestoringId(entry.id)
    await restoreLogSnapshot(projectId, logId, entry.snapshot)
    setRestoringId(null)
    onClose()
  }

  return (
    <Modal title="تاریخچه تغییرات" subtitle="سوابق ایجاد، ویرایش و حذف این رکورد به همراه کاربر مربوطه" onClose={onClose}>
      {entries === null && <p className="text-xs text-muted">در حال بارگذاری...</p>}
      {entries && entries.length === 0 && <p className="text-xs text-muted">سابقه‌ای ثبت نشده است.</p>}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {entries?.map((entry) => (
          <div key={entry.id} className="rounded-xl bg-white/[0.03] p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-medium">
                {ACTION_LABEL_FA[entry.action]} — {entry.changedByName}
              </span>
              <span className="text-muted">{formatJalali(entry.changedAt.slice(0, 10))}</span>
            </div>
            {entry.snapshot && (
              <p className="text-secondary">
                متراژ: {String(entry.snapshot.length_done)}m — سرجوش: {String(entry.snapshot.weld_count)} — وضعیت: {String(entry.snapshot.approval_status)}
              </p>
            )}
            {entry.snapshot && (
              <button
                onClick={() => restore(entry)}
                disabled={restoringId === entry.id}
                className="mt-2 flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                <RotateCcw size={12} /> {restoringId === entry.id ? 'در حال بازیابی...' : entry.action === 'delete' ? 'بازیابی رکورد حذف‌شده' : 'بازگردانی به این نسخه'}
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
