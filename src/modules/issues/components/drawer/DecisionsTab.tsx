import { useState } from 'react'
import { Plus, Scale } from 'lucide-react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../../lib/jalali'
import { useAuthStore } from '../../../../store/useAuthStore'
import type { ImIssue } from '../../types'
import { DECISION_STATUS_FA, decisionHealth, decisionLateDays, delayImpact, rankOptions, type ImDecision } from '../../lib/imDecisions'
import { todayIso } from '../../lib/issueRing'
import { useDecisionStore } from '../../store/useDecisionStore'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import { useUserDirectory } from '../../lib/useUsers'

const HEALTH_COLOR = { on_time: 'var(--im-mint)', due_soon: 'var(--im-amber)', overdue: 'var(--im-coral)', closed: 'var(--im-muted)' } as const

export function DecisionsTab({ issue, roles }: { issue: ImIssue; roles: string[] }) {
  const store = useDecisionStore()
  const tasks = useIssueWorkStore((s) => s.tasks)
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id)
  const today = todayIso()
  const list = store.decisions.filter((d) => d.issueId === issue.id)
  const canCreate = roles.some((r) => ['admin', 'owner', 'follow_up', 'pursuer', 'member'].includes(r))
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ title: '', question: '', deciderId: issue.approverId ?? '', neededBy: '' })
  const [opts, setOpts] = useState([{ title: '', pros: '', cons: '', timeImpactDays: '' as string, costImpact: '' as string, recommended: false }, { title: '', pros: '', cons: '', timeImpactDays: '', costImpact: '', recommended: false }])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [why, setWhy] = useState<Record<string, string>>({})

  const submit = async () => {
    const r = await store.create({
      projectId: issue.projectId, issueId: issue.id, title: f.title.trim(), question: f.question.trim(), deciderId: f.deciderId || null, neededBy: f.neededBy || null,
      options: opts.filter((o) => o.title.trim()).map((o) => ({ title: o.title.trim(), pros: o.pros, cons: o.cons, timeImpactDays: o.timeImpactDays === '' ? null : Number(o.timeImpactDays), costImpact: o.costImpact === '' ? null : Number(o.costImpact), recommended: o.recommended })),
    })
    if (r.ok) { setAdding(false); setF({ title: '', question: '', deciderId: issue.approverId ?? '', neededBy: '' }) }
  }

  const Card = ({ d }: { d: ImDecision }) => {
    const h = decisionHealth(d, today)
    const impact = delayImpact(d.id, tasks, today)
    const options = rankOptions(store.options.filter((o) => o.decisionId === d.id))
    const canDecide = d.status === 'pending' && (d.deciderId === me || roles.includes('admin'))
    const late = decisionLateDays(d, today)
    return (
      <div className="im-task">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div><span className="im-code">{d.code}</span> <b style={{ fontSize: 13.5 }}>{d.title}</b></div>
          <span className="im-chip" style={{ color: HEALTH_COLOR[h] }}>{DECISION_STATUS_FA[d.status]}</span>
        </div>
        {d.question && <div className="im-helper">{d.question}</div>}
        <div className="im-issue-meta">
          <span className="im-chip">تصمیم‌گیرنده: {users.name(d.deciderId)}</span>
          {d.neededBy && <span className="im-chip" style={{ color: HEALTH_COLOR[h] }}>موعد {formatJalali(d.neededBy)}{late > 0 && ` · ${late} روز تأخیر`}</span>}
          {impact.blockedTasks > 0 && <span className="im-chip" style={{ color: 'var(--im-coral)' }}>{impact.blockedTasks} اقدام مسدود · {impact.taskDays} روز-اقدام تأخیر</span>}
        </div>
        {options.length > 0 && (
          <div className="im-grid" style={{ gap: 6 }}>
            {options.map((o) => (
              <label key={o.id} className="im-check" style={{ cursor: canDecide ? 'pointer' : 'default', alignItems: 'flex-start' }}>
                {canDecide && <input type="radio" name={'opt-' + d.id} checked={choice[d.id] === o.id} onChange={() => setChoice({ ...choice, [d.id]: o.id })} />}
                <span style={{ flex: 1 }}>
                  <b>{o.title}</b> {o.recommended && <span className="im-chip" style={{ color: 'var(--im-mint)' }}>پیشنهادی</span>} {d.chosenOption === o.id && <span className="im-chip" style={{ color: 'var(--im-amber)' }}>انتخاب‌شده</span>}
                  <div className="im-helper">{o.pros && `＋ ${o.pros}`}{o.pros && o.cons && ' · '}{o.cons && `－ ${o.cons}`}{(o.timeImpactDays !== null || o.costImpact !== null) && ` · اثر: ${o.timeImpactDays !== null ? o.timeImpactDays + ' روز' : ''}${o.timeImpactDays !== null && o.costImpact !== null ? ' / ' : ''}${o.costImpact !== null ? o.costImpact.toLocaleString('en-US') + ' ریال' : ''}`}</div>
                </span>
              </label>
            ))}
          </div>
        )}
        {d.status === 'decided' && d.rationale && <div className="im-notice ok">دلیل: {d.rationale}</div>}
        {canDecide && (
          <>
            <div className="im-field" style={{ margin: 0 }}><label>دلیل / توضیح تصمیم</label><input value={why[d.id] ?? ''} onChange={(e) => setWhy({ ...why, [d.id]: e.target.value })} /></div>
            <div className="im-actions">
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!choice[d.id] && !(why[d.id] ?? '').trim()} onClick={() => store.decide(d.id, choice[d.id] ?? null, why[d.id] ?? '')}>ثبت تصمیم</button>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => store.setStatus(d.id, 'deferred', why[d.id])}>به تعویق</button>
              <button className="im-btn im-btn-danger im-btn-sm" onClick={() => store.setStatus(d.id, 'cancelled', why[d.id])}>لغو</button>
            </div>
          </>
        )}
        {d.status === 'deferred' && (d.deciderId === me || roles.includes('admin')) && <div><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => store.setStatus(d.id, 'pending')}>بازگرداندن به صف تصمیم</button></div>}
      </div>
    )
  }

  return (
    <div className="im-grid" style={{ gap: 12 }}>
      <div className="im-notice ok" style={{ fontSize: 12 }}><Scale size={13} style={{ display: 'inline', marginLeft: 6 }} />تصمیم‌های معوق، اقدام‌های وابسته را مسدود می‌کنند؛ هزینهٔ انتظار در کارت هر تصمیم نمایش داده می‌شود. تصمیم اتخاذشده نهایی است.</div>
      {list.length === 0 && <div className="im-empty" style={{ padding: 24 }}>برای این مسئله تصمیمی ثبت نشده است.</div>}
      {list.map((d) => <Card key={d.id} d={d} />)}
      {canCreate && (adding ? (
        <div className="im-card">
          <div className="im-field"><label>عنوان تصمیم</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: انتخاب تأمین‌کنندهٔ جایگزین پمپ" autoFocus /></div>
          <div className="im-field"><label>پرسش (دقیقاً چه چیزی باید تصمیم گرفته شود؟)</label><textarea style={{ minHeight: 54 }} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></div>
          <div className="im-row">
            <div className="im-field"><label>تصمیم‌گیرنده</label><select value={f.deciderId} onChange={(e) => setF({ ...f, deciderId: e.target.value })}><option value="">—</option>{users.forProject(issue.projectId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select></div>
            <div className="im-field"><label>موعد تصمیم</label><JalaliDateInput value={f.neededBy} onChange={(iso) => setF({ ...f, neededBy: iso })} /></div>
          </div>
          <div className="im-section-title" style={{ marginTop: 6 }}>گزینه‌ها</div>
          {opts.map((o, k) => (
            <div key={k} className="im-task" style={{ marginBottom: 8 }}>
              <div className="im-field" style={{ margin: 0 }}><label>گزینهٔ {k + 1}</label><input value={o.title} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)))} /></div>
              <div className="im-row"><input placeholder="مزایا" value={o.pros} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, pros: e.target.value } : x)))} /><input placeholder="معایب" value={o.cons} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, cons: e.target.value } : x)))} /></div>
              <div className="im-row"><input type="number" placeholder="اثر زمانی (روز)" value={o.timeImpactDays} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, timeImpactDays: e.target.value } : x)))} /><input type="number" placeholder="اثر مالی (ریال)" value={o.costImpact} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, costImpact: e.target.value } : x)))} /></div>
              <label className="im-chip" style={{ cursor: 'pointer', width: 'fit-content' }}><input type="checkbox" checked={o.recommended} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? { ...x, recommended: e.target.checked } : x)))} /> پیشنهاد تحلیل‌گر</label>
            </div>
          ))}
          <div className="im-actions"><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setOpts([...opts, { title: '', pros: '', cons: '', timeImpactDays: '', costImpact: '', recommended: false }])}>گزینهٔ دیگر</button><button className="im-btn im-btn-primary im-btn-sm" disabled={f.title.trim().length < 3} onClick={submit}>ثبت تصمیم</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setAdding(false)}>انصراف</button></div>
        </div>
      ) : <button className="im-btn im-btn-ghost" onClick={() => setAdding(true)}><Plus size={15} /> تصمیم جدید</button>)}
    </div>
  )
}
