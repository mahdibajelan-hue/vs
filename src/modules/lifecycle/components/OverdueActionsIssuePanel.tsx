import { useEffect, useState } from 'react'
import { AlertOctagon, CheckCircle2, Send } from 'lucide-react'
import type { UserOption } from '../../masterdata/store/useMasterDataStore'
import { convertActionToIssue, resolveIssuesMappingStatus } from '../lib/issueBridge'
import type { LifecycleAction } from '../types'
import { EmptyState, fa, STATUS_TEXT_COLOR } from './ui'

const PRIORITY_LABEL_FA: Record<LifecycleAction['priority'], string> = {
  low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی',
}

/**
 * Lets the Control Tower convert an overdue action into a real Issue Management issue, in place,
 * with a responsible person and deadline chosen right here — the mechanism the user asked for so
 * Issue Management is genuinely wired into the lifecycle instead of sitting in a disconnected
 * fixed sidebar. Gated on a confirmed rasta_project_mappings row for source_module='issues';
 * without one there is no im_projects row to file the issue into.
 */
export function OverdueActionsIssuePanel({
  masterProjectId, actions, users, onConverted,
}: {
  masterProjectId: string
  actions: LifecycleAction[]
  users: UserOption[]
  onConverted: () => Promise<void>
}) {
  const [mappingLoading, setMappingLoading] = useState(true)
  const [mapped, setMapped] = useState(false)
  const [draftByAction, setDraftByAction] = useState<Record<string, { pursuerId: string; deadlineDays: number }>>({})
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [errorByAction, setErrorByAction] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setMappingLoading(true)
    resolveIssuesMappingStatus(masterProjectId).then((status) => {
      if (!cancelled) {
        setMapped(status.mapped)
        setMappingLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [masterProjectId])

  if (actions.length === 0) {
    return <EmptyState message="اقدام دیرکردی وجود ندارد" />
  }

  const draftFor = (actionId: string) => draftByAction[actionId] ?? { pursuerId: '', deadlineDays: 3 }

  const setDraft = (actionId: string, patch: Partial<{ pursuerId: string; deadlineDays: number }>) => {
    setDraftByAction((prev) => ({ ...prev, [actionId]: { ...draftFor(actionId), ...patch } }))
  }

  const convert = async (action: LifecycleAction) => {
    const draft = draftFor(action.id)
    setConvertingId(action.id)
    setErrorByAction((prev) => ({ ...prev, [action.id]: '' }))
    try {
      await convertActionToIssue(action.id, draft.pursuerId || null, draft.deadlineDays)
      await onConverted()
    } catch (err) {
      setErrorByAction((prev) => ({ ...prev, [action.id]: err instanceof Error ? err.message : 'خطای نامشخص' }))
    } finally {
      setConvertingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {!mappingLoading && !mapped && (
        <p className="rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed text-muted" style={{ borderColor: 'var(--border-soft)' }}>
          این پروژه هنوز به یک پروژه «مدیریت مسائل» متصل نشده — برای تبدیل اقدام به Issue، ابتدا این اتصال را در
          «داده‌های پایه ← نگاشت پروژه‌ها» برقرار کنید.
        </p>
      )}
      <ul className="space-y-1.5">
        {actions.map((a) => {
          const already = !!a.relatedIssueId
          const draft = draftFor(a.id)
          return (
            <li key={a.id} className="rounded-xl border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-start gap-1.5">
                  <AlertOctagon size={13} className="mt-0.5 shrink-0" style={{ color: STATUS_TEXT_COLOR.red }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold">{a.title}</span>
                    <span className="block text-[9px] text-muted">
                      سررسید {fa(a.dueDate)} · اولویت {PRIORITY_LABEL_FA[a.priority]}
                    </span>
                  </span>
                </span>
              </div>

              {already ? (
                <p className="flex items-center gap-1 pr-5.5 text-[10px] text-emerald-400">
                  <CheckCircle2 size={12} /> به Issue Management تبدیل شده است
                </p>
              ) : mapped ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pr-5.5">
                  <select
                    value={draft.pursuerId}
                    onChange={(e) => setDraft(a.id, { pursuerId: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border bg-transparent px-2 py-1 text-[10px]"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <option value="">مسئول اقدام...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName || u.email}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={draft.deadlineDays}
                    onChange={(e) => setDraft(a.id, { deadlineDays: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 rounded-lg border bg-transparent px-2 py-1 text-[10px]"
                    style={{ borderColor: 'var(--border-soft)' }}
                    title="مهلت (روز)"
                  />
                  <span className="text-[9px] text-muted">روز مهلت</span>
                  <button
                    onClick={() => convert(a)}
                    disabled={convertingId === a.id}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                    style={{ background: 'var(--plc-amber, #fab219)' }}
                  >
                    <Send size={11} /> {convertingId === a.id ? 'در حال ثبت...' : 'تبدیل به Issue'}
                  </button>
                  {errorByAction[a.id] && (
                    <span className="w-full text-[9px]" style={{ color: STATUS_TEXT_COLOR.red }}>{errorByAction[a.id]}</span>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
