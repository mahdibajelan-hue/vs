import { useState } from 'react'
import { AlertOctagon, CheckCircle2, Link2, Play, Plus, ShieldCheck, Undo2 } from 'lucide-react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../../lib/jalali'
import { useAuthStore } from '../../../../store/useAuthStore'
import type { ImIssue, ImTask } from '../../types'
import { IM_BLOCK_KIND_FA, IM_TASK_STATUS_LABEL_FA } from '../../lib/imModel'
import { canVerifyTask, hasDependencyCycle } from '../../lib/imWorkflow'
import { todayIso } from '../../lib/issueRing'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import { useUserDirectory } from '../../lib/useUsers'
import { useDecisionStore } from '../../store/useDecisionStore'

const STATUS_COLOR: Record<string, string> = { not_started: 'var(--im-muted)', in_progress: 'var(--im-amber)', blocked: 'var(--im-coral)', pending_verification: 'var(--im-violet)', done: 'var(--im-mint)', cancelled: 'var(--im-muted)' }

export function TasksTab({ issue, tasks, roles }: { issue: ImIssue; tasks: ImTask[]; roles: string[] }) {
  const w = useIssueWorkStore()
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id) ?? ''
  const isAdmin = roles.includes('admin')
  const isStaff = isAdmin || roles.includes('owner') || roles.includes('follow_up')
  const [form, setForm] = useState({ title: '', executorId: '', approverId: issue.approverId ?? '', dueDate: '' })
  const [adding, setAdding] = useState(false)
  const [blocking, setBlocking] = useState<string | null>(null)
  const [blockKind, setBlockKind] = useState('decision')
  const [blockNote, setBlockNote] = useState('')
  const [blockDecision, setBlockDecision] = useState('')
  const decisions = useDecisionStore((s) => s.decisions).filter((d) => d.issueId === issue.id && d.status === 'pending')
  const [depFor, setDepFor] = useState<string | null>(null)
  const today = todayIso()
  const byId = new Map(tasks.map((t) => [t.id, t]))

  const add = async () => {
    if (!form.title.trim()) return
    const r = await w.addTask(issue.id, { title: form.title.trim(), executorId: form.executorId || null, approverId: form.approverId || null, dueDate: form.dueDate || null })
    if (r.ok) { setForm({ title: '', executorId: '', approverId: issue.approverId ?? '', dueDate: '' }); setAdding(false) }
  }

  const toggleDep = async (t: ImTask, depId: string) => {
    const cur = w.depsByTask[t.id] ?? []
    const nextDeps = cur.includes(depId) ? cur.filter((d) => d !== depId) : [...cur, depId]
    const graph = Object.fromEntries(tasks.map((x) => [x.id, x.id === t.id ? nextDeps : w.depsByTask[x.id] ?? []]))
    if (hasDependencyCycle(graph)) { alert('این وابستگی یک حلقه می‌سازد و مجاز نیست'); return }
    await w.setTaskDeps(t.id, nextDeps)
  }

  return (
    <div className="im-grid" style={{ gap: 12 }}>
      <div className="im-notice ok" style={{ fontSize: 12 }}>
        اقدام تا زمانی که مجری «اعلام انجام» کند و فردی غیر از او آن را <b>تأیید</b> کند، «انجام‌شده» محسوب نمی‌شود.
      </div>
      {tasks.length === 0 && <div className="im-empty" style={{ padding: 24 }}>هنوز اقدامی تعریف نشده است.</div>}
      {tasks.map((t) => {
        const executorMe = t.executorId === me
        const open = t.status !== 'done' && t.status !== 'cancelled'
        const overdue = open && t.dueDate && t.dueDate < today
        const deps = w.depsByTask[t.id] ?? []
        const waitingOn = deps.map((d) => byId.get(d)).filter((d) => d && d.status !== 'done')
        return (
          <div key={t.id} className={`im-task ${t.status === 'blocked' ? 'blocked' : t.status === 'pending_verification' ? 'pv' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.title}</div>
              <span className="im-chip" style={{ color: STATUS_COLOR[t.status] }}>{IM_TASK_STATUS_LABEL_FA[t.status]}</span>
            </div>
            <div className="im-issue-meta">
              <span className="im-chip">مجری: {users.name(t.executorId)}</span>
              <span className="im-chip">تأییدکننده: {users.name(t.approverId)}</span>
              {t.dueDate && <span className="im-chip" style={{ color: overdue ? 'var(--im-coral)' : undefined }}>سررسید {formatJalali(t.dueDate)}{t.extensionCount > 0 && ` · ${t.extensionCount} تمدید`}</span>}
              {t.status === 'blocked' && <span className="im-chip" style={{ color: 'var(--im-coral)' }}>{IM_BLOCK_KIND_FA[t.blockedKind ?? 'other'] ?? t.blockedKind}</span>}
            </div>
            {waitingOn.length > 0 && <div className="im-helper">منتظر: {waitingOn.map((d) => d!.title).join('، ')}</div>}
            <div className="im-bar" aria-label={`پیشرفت ${t.progress}٪`}><i style={{ width: `${t.progress}%` }} /></div>

            <div className="im-row" style={{ gap: 6 }}>
              {(executorMe || isStaff) && open && t.status === 'not_started' && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => w.setTaskStatus(t.id, 'in_progress')}><Play size={12} /> شروع</button>}
              {(executorMe || isStaff) && t.status === 'in_progress' && (
                <>
                  <select style={{ width: 90, padding: 5 }} value={t.progress} onChange={(e) => w.setTaskProgress(t.id, Number(e.target.value))} aria-label="پیشرفت">
                    {[0, 10, 25, 50, 75, 90, 100].map((p) => <option key={p} value={p}>{p}٪</option>)}
                  </select>
                  <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => w.setTaskStatus(t.id, 'pending_verification')}><CheckCircle2 size={12} /> اعلام انجام</button>
                  <button className="im-btn im-btn-danger im-btn-sm" onClick={() => setBlocking(blocking === t.id ? null : t.id)}><AlertOctagon size={12} /> مسدود</button>
                </>
              )}
              {t.status === 'blocked' && (executorMe || isStaff) && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => w.setTaskStatus(t.id, 'in_progress')}>رفع انسداد</button>}
              {t.status === 'pending_verification' && (
                canVerifyTask(t, me, isAdmin) ? (
                  <>
                    <button className="im-btn im-btn-primary im-btn-sm" onClick={() => w.verifyTask(t.id, true)}><ShieldCheck size={12} /> تأیید انجام</button>
                    <button className="im-btn im-btn-danger im-btn-sm" onClick={() => w.verifyTask(t.id, false)}><Undo2 size={12} /> برگشت برای اصلاح</button>
                  </>
                ) : <span className="im-helper">در انتظار تأیید مستقل{executorMe ? ' (مجری نمی‌تواند خودش تأیید کند)' : ''}</span>
              )}
              {isStaff && open && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDepFor(depFor === t.id ? null : t.id)}><Link2 size={12} /> وابستگی{deps.length ? ` (${deps.length})` : ''}</button>}
              {isStaff && open && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => w.setTaskStatus(t.id, 'cancelled')}>لغو</button>}
            </div>

            {blocking === t.id && (
              <div className="im-row" style={{ alignItems: 'flex-end' }}>
                <div className="im-field" style={{ margin: 0 }}><label>علت انسداد</label><select value={blockKind} onChange={(e) => setBlockKind(e.target.value)}>{Object.entries(IM_BLOCK_KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                {blockKind === 'decision' && (
                  <div className="im-field" style={{ margin: 0 }}><label>تصمیم مرتبط</label>
                    <select value={blockDecision} onChange={(e) => setBlockDecision(e.target.value)}><option value="">— انتخاب (توصیه می‌شود) —</option>{decisions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.title}</option>)}</select>
                  </div>
                )}
                <div className="im-field" style={{ margin: 0 }}><label>توضیح</label><input value={blockNote} onChange={(e) => setBlockNote(e.target.value)} /></div>
                <button className="im-btn im-btn-danger im-btn-sm" onClick={async () => { const r = await w.setTaskStatus(t.id, 'blocked', { blockedKind: blockKind, blockedNote: blockNote, blockedDecisionId: blockKind === 'decision' && blockDecision ? blockDecision : null }); if (r.ok) { setBlocking(null); setBlockNote(''); setBlockDecision('') } }}>ثبت انسداد</button>
              </div>
            )}
            {depFor === t.id && (
              <div className="im-checklist">
                <div className="im-helper">این اقدام بعد از تکمیل کدام اقدام‌ها شروع می‌شود؟</div>
                {tasks.filter((o) => o.id !== t.id).map((o) => (
                  <label key={o.id} className="im-check" style={{ cursor: 'pointer', margin: 0 }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={deps.includes(o.id)} onChange={() => toggleDep(t, o.id)} /> {o.title}
                  </label>
                ))}
                {tasks.length < 2 && <div className="im-helper">اقدام دیگری برای وابستگی وجود ندارد.</div>}
              </div>
            )}
          </div>
        )
      })}

      {(isStaff || roles.includes('pursuer')) && (adding ? (
        <div className="im-card">
          <div className="im-field"><label>عنوان اقدام</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></div>
          <div className="im-row">
            <div className="im-field"><label>مجری</label><select value={form.executorId} onChange={(e) => setForm({ ...form, executorId: e.target.value })}><option value="">—</option>{users.forProject(issue.projectId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select></div>
            <div className="im-field"><label>تأییدکنندهٔ مستقل</label><select value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })}><option value="">—</option>{users.forProject(issue.projectId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select></div>
          </div>
          <div className="im-field"><label>سررسید</label><JalaliDateInput value={form.dueDate} onChange={(iso) => setForm({ ...form, dueDate: iso })} /></div>
          <div className="im-row"><button className="im-btn im-btn-primary im-btn-sm" onClick={add} disabled={!form.title.trim()}>افزودن</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setAdding(false)}>انصراف</button></div>
        </div>
      ) : (
        <button className="im-btn im-btn-ghost" onClick={() => setAdding(true)}><Plus size={15} /> اقدام جدید</button>
      ))}
    </div>
  )
}
