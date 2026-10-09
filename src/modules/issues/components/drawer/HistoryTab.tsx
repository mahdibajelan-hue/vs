import { formatJalali } from '../../../../lib/jalali'
import { eventLabel, type ImEvent } from '../../lib/issueDataV2'
import { IM_STAGE_LABEL_FA } from '../../lib/imModel'
import type { ImStage } from '../../types'
import { useUserDirectory } from '../../lib/useUsers'

function describe(e: ImEvent, name: (id: string | null) => string): string {
  const v = (x: string | null) => (x == null || x === '' ? '—' : x)
  if (e.kind === 'stage_change') return `${IM_STAGE_LABEL_FA[e.oldValue as ImStage] ?? v(e.oldValue)} ← ${IM_STAGE_LABEL_FA[e.newValue as ImStage] ?? v(e.newValue)}`
  if (e.kind === 'assignment_change' || e.kind === 'task_assignment') return `${e.field}: ${name(e.oldValue)} ← ${name(e.newValue)}`
  if (e.kind === 'due_change' || e.kind === 'task_due_change' || e.kind.startsWith('extension')) return `${v(e.oldValue)} ← ${v(e.newValue)}`
  if (e.kind === 'created') return v(e.newValue)
  if (e.field) return `${e.field}: ${v(e.oldValue)} ← ${v(e.newValue)}`
  return ''
}

export function HistoryTab({ events }: { events: ImEvent[] }) {
  const users = useUserDirectory()
  if (!events.length) return <div className="im-empty" style={{ padding: 30 }}>رویدادی ثبت نشده است.</div>
  return (
    <div>
      <div className="im-helper" style={{ marginBottom: 12 }}>تاریخچه فقط افزودنی است: هیچ‌کس نمی‌تواند رویدادها را ویرایش یا حذف کند.</div>
      <div className="im-timeline">
        {events.map((e) => {
          const title = typeof e.meta.title === 'string' ? ` «${e.meta.title}»` : ''
          return (
            <div className="im-ev" key={e.id}>
              <div style={{ fontWeight: 700 }}>{eventLabel(e.kind)}{title}</div>
              <div style={{ color: 'var(--im-muted-2)' }}>{describe(e, users.name)}</div>
              {e.reason && <div className="im-helper">دلیل: {e.reason}</div>}
              <div className="w">{users.name(e.actorId)} · {formatJalali(e.at.slice(0, 10))} {new Date(e.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
