import { useState } from 'react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../../lib/jalali'
import { useAuthStore } from '../../../../store/useAuthStore'
import type { ImExtension, ImIssue, ImTask } from '../../types'
import { effectiveDue } from '../../lib/imModel'
import { validateExtensionRequest } from '../../lib/imWorkflow'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import { useUserDirectory } from '../../lib/useUsers'

const ST: Record<ImExtension['status'], [string, string]> = { pending: ['در انتظار تصمیم', 'var(--im-amber)'], approved: ['تأیید شد', 'var(--im-mint)'], rejected: ['رد شد', 'var(--im-coral)'] }

export function ExtensionsTab({ issue, tasks, extensions, roles }: { issue: ImIssue; tasks: ImTask[]; extensions: ImExtension[]; roles: string[] }) {
  const w = useIssueWorkStore()
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id)
  const canRequest = roles.some((r) => ['admin', 'owner', 'follow_up', 'pursuer'].includes(r))
  const canDecide = roles.includes('admin') || roles.includes('approver')
  const [target, setTarget] = useState<string>('issue')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [impact, setImpact] = useState('')
  const [note, setNote] = useState('')
  const taskOpts = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate)
  const currentDue = target === 'issue' ? effectiveDue(issue) : taskOpts.find((t) => t.id === target)?.dueDate ?? null
  const check = to ? validateExtensionRequest(currentDue, to, reason) : null
  const hasPending = extensions.some((e) => e.status === 'pending' && (target === 'issue' ? e.taskId === null : e.taskId === target))

  return (
    <div className="im-grid" style={{ gap: 14 }}>
      <div className="im-card">
        <div className="im-kv"><span>سررسید اولیه</span><span>{formatJalali(issue.originalDueDate ?? issue.deadlineDate)}</span></div>
        <div className="im-kv"><span>سررسید مؤثر فعلی</span><b>{formatJalali(effectiveDue(issue))}</b></div>
        <div className="im-kv" style={{ borderBottom: 'none' }}><span>تعداد تمدید تأییدشده</span><span style={{ color: (issue.extensionCount ?? 0) >= 2 ? 'var(--im-coral)' : undefined }}>{issue.extensionCount ?? 0}</span></div>
        {(issue.extensionCount ?? 0) >= 2 && <div className="im-notice bad" style={{ marginTop: 8 }}>این مسئله بیش از یک‌بار تمدید شده؛ بازبینی برنامه و علت تأخیر توصیه می‌شود.</div>}
      </div>

      {canRequest && (
        <div className="im-card">
          <div className="im-section-title">درخواست تمدید <span className="im-helper">سررسید فقط با تأیید مسئول تأیید تغییر می‌کند</span></div>
          <div className="im-row">
            <div className="im-field"><label>مورد تمدید</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)}><option value="issue">کل مسئله</option>{taskOpts.map((t) => <option key={t.id} value={t.id}>اقدام: {t.title}</option>)}</select>
            </div>
            <div className="im-field"><label>سررسید فعلی</label><input readOnly value={currentDue ? formatJalali(currentDue) : '—'} /></div>
          </div>
          <div className="im-field"><label>سررسید پیشنهادی</label><JalaliDateInput value={to} onChange={setTo} /></div>
          <div className="im-field"><label>دلیل تمدید (الزامی)</label><textarea style={{ minHeight: 56 }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="im-field"><label>اثر بر پروژه (اختیاری)</label><input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="مثلاً: ۵ روز تأخیر در تحویل بخش ب" /></div>
          {check && !check.ok && <div className="im-notice bad" style={{ marginBottom: 8 }}>{check.error}</div>}
          {hasPending && <div className="im-notice" style={{ marginBottom: 8 }}>یک درخواست در انتظار برای این مورد وجود دارد.</div>}
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!check?.ok || hasPending} onClick={async () => { const r = await w.requestExtension(issue.id, target === 'issue' ? null : target, to, reason, impact); if (r.ok) { setTo(''); setReason(''); setImpact('') } }}>ارسال درخواست</button>
        </div>
      )}

      <div className="im-card">
        <div className="im-section-title">تاریخچهٔ تمدیدها</div>
        {extensions.length === 0 && <div className="im-helper">تمدیدی ثبت نشده است.</div>}
        <div className="im-grid" style={{ gap: 8 }}>
          {extensions.map((e) => {
            const taskTitle = e.taskId ? tasks.find((t) => t.id === e.taskId)?.title : null
            return (
              <div key={e.id} className="im-task">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{formatJalali(e.fromDue)} ← {formatJalali(e.toDue)} {taskTitle && <span className="im-helper">({taskTitle})</span>}</div>
                  <span className="im-chip" style={{ color: ST[e.status][1] }}>{ST[e.status][0]}</span>
                </div>
                <div className="im-helper">درخواست‌دهنده: {users.name(e.requestedBy)} — {e.reason}</div>
                {e.status === 'pending' && canDecide && (e.requestedBy !== me || roles.includes('admin')) && (
                  <div className="im-row" style={{ alignItems: 'flex-end' }}>
                    <div className="im-field" style={{ margin: 0 }}><label>یادداشت تصمیم</label><input value={note} onChange={(x) => setNote(x.target.value)} /></div>
                    <button className="im-btn im-btn-primary im-btn-sm" onClick={() => w.decideExtension(e.id, true, note)}>تأیید</button>
                    <button className="im-btn im-btn-danger im-btn-sm" onClick={() => w.decideExtension(e.id, false, note)}>رد</button>
                  </div>
                )}
                {e.status === 'pending' && e.requestedBy === me && !roles.includes('admin') && <div className="im-helper">تصمیم دربارهٔ درخواست خودتان با فرد دیگری است.</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
