import { useState } from 'react'
import { Clock3, History } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { toJalali } from '../../../lib/jalali'
import { fa } from '../lib/svMonth'
import { STATUS_FA, VSTATUS_FA } from '../lib/svCalc'
import { useSupervisionStore } from '../store/useSupervisionStore'

/** Required note for a day older than the entry window («ثبت با تأخیر»). */
export function LateReason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const grace = useSupervisionStore((s) => s.settings.entryGraceDays)
  return (
    <div className="sv-late">
      <label htmlFor="sv-late-r"><Clock3 size={13} /> این روز بیش از {fa(grace)} روز گذشته است؛ دلیل ثبت با تأخیر را بنویسید</label>
      <input id="sv-late-r" value={value} onChange={(e) => onChange(e.target.value)} placeholder="مثلاً: قطعی اینترنت کارگاه، تأیید سرپرست" autoFocus />
    </div>
  )
}

const when = (iso: string) => {
  const d = new Date(iso)
  const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return fa(`${j.jm}/${j.jd}، ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}
type Log = { action: string; at: string; user_id: string | null; late_reason: string; new_val: Record<string, unknown> | null; old_val: Record<string, unknown> | null }
const ACT: Record<string, string> = { insert: 'ثبت', update: 'تغییر', delete: 'پاک کردن' }

function describe(kind: 'person' | 'vehicle', v: Record<string, unknown> | null) {
  if (!v) return ''
  const st = String(v.status ?? '')
  const label = kind === 'person' ? STATUS_FA[st as keyof typeof STATUS_FA] : VSTATUS_FA[st as keyof typeof VSTATUS_FA]
  const t = v.check_in ? ` ${String(v.check_in).slice(0, 5)}–${v.check_out ? String(v.check_out).slice(0, 5) : '…'}` : ''
  return fa(`${label ?? st}${t}`)
}

/** When this cell was first written (server time), and on demand every change: who, when, what, why. */
export function EntryHistory({ kind, subjectId, day, row }: { kind: 'person' | 'vehicle'; subjectId: string; day: string; row: { createdAt?: string; lateReason?: string; source: string } }) {
  const pid = useSupervisionStore((s) => s.projectId)
  const [logs, setLogs] = useState<(Log & { who: string })[] | null>(null)
  const load = async () => {
    const { data } = await supabase.from('sv_entry_log').select('action,at,user_id,late_reason,new_val,old_val').eq('master_project_id', pid).eq('kind', kind).eq('subject_id', subjectId).eq('day', day).order('at')
    const rows = (data ?? []) as Log[]
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[]
    const { data: ps } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] }
    const names = new Map(((ps ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))
    setLogs(rows.map((r) => ({ ...r, who: (r.user_id && names.get(r.user_id)) || (r.user_id ? 'کاربر' : 'سامانه') })))
  }
  return (
    <div className="sv-hist">
      <span>{row.source === 'clock' ? 'از کارت ساعت' : row.createdAt ? `ثبت اول: ${when(row.createdAt)}` : 'ثبت قدیمی'}{row.lateReason ? <b className="sv-warn"> · با تأخیر: {row.lateReason}</b> : ''}</span>
      {logs === null ? (
        <button type="button" className="im-ghostlink" onClick={load}><History size={12} /> سابقه</button>
      ) : (
        <ul>
          {logs.length === 0 && <li>تغییری ثبت نشده (پیش از راه‌اندازی سابقه)</li>}
          {logs.map((l, i) => <li key={i}>{when(l.at)} · {l.who} · {ACT[l.action] ?? l.action} {describe(kind, l.new_val ?? l.old_val)}{l.late_reason ? ` · دلیل: ${l.late_reason}` : ''}</li>)}
        </ul>
      )}
    </div>
  )
}
