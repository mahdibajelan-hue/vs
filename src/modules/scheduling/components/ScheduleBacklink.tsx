import { CalendarClock } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { useModuleStore } from '../../../store/useModuleStore'
import { useScheduleBacklinks } from '../store/useScheduleBacklinks'

/** Shows, inside the execution / engineering modules, which schedule activities depend on this record (the schedule owns the link; this only reads it). */
export function ScheduleBacklink({ projectId, kind, id, compact }: { projectId: string; kind: 'exec_activity' | 'eng_doc'; id: string; compact?: boolean }) {
  const rows = useScheduleBacklinks(projectId, kind, id)
  if (!rows.length) return null
  const first = rows[0]
  const title = rows.map((r) => `${r.code} — ${r.name}${r.plannedStart ? ` (${jalaliText(r.plannedStart)} تا ${r.plannedFinish ? jalaliText(r.plannedFinish) : '—'})` : ''}${r.needDate ? ` · نیاز: ${jalaliText(r.needDate)}` : ''}`).join('\n')
  return (
    <button type="button" title={`${title}\n\nبرای باز کردن ماژول برنامه‌ریزی کلیک کنید`} onClick={(e) => { e.stopPropagation(); try { sessionStorage.setItem('sch.openTab', 'links'); sessionStorage.setItem('sch.openProject', projectId) } catch { /* ignore */ } useModuleStore.getState().enterModule('scheduling') }}
      style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, padding: '1px 7px', borderRadius: 99, background: 'rgba(14,165,164,.14)', color: '#0f766e', whiteSpace: 'nowrap' }}>
      <CalendarClock size={11} aria-hidden />{compact ? first.code : `برنامه: ${first.code}${rows.length > 1 ? ` +${rows.length - 1}` : ''}`}
    </button>
  )
}
