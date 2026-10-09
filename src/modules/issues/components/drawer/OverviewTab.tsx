import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Copy, Pencil } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { MissionOriginChip } from '../../../missions/integration/originChip'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, type ImIssue, type ImIssuePriority, type ImStage, type ImTask } from '../../types'
import { IM_BLOCK_KIND_FA, IM_CATEGORY_FA, IM_SOURCE_FA, IM_STAGE_LABEL_FA, IM_STAGE_ORDER, effectiveDue, stageOf } from '../../lib/imModel'
import { allowedNext, closeBlockers } from '../../lib/imWorkflow'
import { findSimilarIssues } from '../../lib/imText'
import { useIssuesStore } from '../../store/useIssuesStore'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import { useIssueConfigStore } from '../../store/useIssueConfigStore'
import { useUserDirectory } from '../../lib/useUsers'
import type { ImAttachment } from '../../lib/issueDataV2'

export function OverviewTab({ issue, tasks, attachments, roles }: { issue: ImIssue; tasks: ImTask[]; attachments: ImAttachment[]; roles: string[] }) {
  const users = useUserDirectory()
  const cfg = useIssueConfigStore()
  const transition = useIssueWorkStore((s) => s.transition)
  const addLink = useIssueWorkStore((s) => s.addLink)
  const patchIssue = useIssuesStore((s) => s.patchIssue)
  const allIssues = useIssuesStore((s) => s.issues)
  const stage = stageOf(issue)
  const [pending, setPending] = useState<ImStage | null>(null)
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState(issue.resolutionSummary ?? '')
  const [criteria, setCriteria] = useState(issue.acceptanceCriteria ?? '')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: issue.title, description: issue.description, severity: (issue.severity ?? issue.priority) as ImIssuePriority, urgency: (issue.urgency ?? 'medium') as ImIssuePriority, category: issue.category ?? '', location: issue.location ?? '', discipline: issue.discipline ?? '', ownerId: issue.ownerId ?? '', followUpId: issue.followUpId ?? '', pursuerId: issue.pursuerId ?? '', approverId: issue.approverId ?? '' })

  const isStaff = roles.includes('admin') || roles.includes('owner') || roles.includes('follow_up')
  const next = useMemo(() => allowedNext(cfg.transitions, stage, roles), [cfg.transitions, stage, roles])
  const cat = cfg.categories.find((c) => c.key === issue.category)
  const blockers = closeBlockers({ ...issue, resolutionSummary: resolution, acceptanceCriteria: criteria }, tasks, attachments.filter((a) => a.kind === 'resolution_evidence').length, cat)
  const similar = useMemo(() => findSimilarIssues({ title: issue.title, description: issue.description, projectId: issue.projectId, category: issue.category, location: issue.location }, allIssues, { excludeId: issue.id, limit: 4 }), [issue, allIssues])
  const labelOf = (s: string) => cfg.stages.find((x) => x.key === s)?.labelFa ?? IM_STAGE_LABEL_FA[s as ImStage] ?? s
  const pendingDef = pending ? cfg.transitions.find((t) => t.from === stage && t.to === pending) : null
  const needsText = pending === 'resolution_review' || pending === 'closed' || pending === 'effectiveness_check'

  const run = async () => {
    if (!pending) return
    setBusy(true)
    const patch: Record<string, unknown> = {}
    if (needsText) { patch.resolution_summary = resolution; patch.acceptance_criteria = criteria }
    const r = await transition(issue.id, pending, reason, patch)
    setBusy(false)
    if (r.ok) { setPending(null); setReason('') }
  }

  const save = async () => {
    setBusy(true)
    const ok = await patchIssue(issue.id, {
      title: draft.title.trim(), description: draft.description, severity: draft.severity, priority: draft.severity, urgency: draft.urgency,
      category: draft.category || null, location: draft.location, discipline: draft.discipline,
      owner_id: draft.ownerId || null, follow_up_id: draft.followUpId || null, pursuer_id: draft.pursuerId || null, approver_id: draft.approverId || null,
    })
    setBusy(false)
    if (ok) setEditing(false)
  }

  const curIdx = IM_STAGE_ORDER.indexOf(stage)
  const persons: [string, string | null | undefined][] = [
    ['مالک مسئله (Owner)', issue.ownerId], ['پیگیری‌کننده (Follow-up)', issue.followUpId], ['مسئول انجام', issue.pursuerId], ['مسئول تأیید', issue.approverId],
  ]
  const due = effectiveDue(issue)

  return (
    <div className="im-grid" style={{ gap: 16 }}>
      <div>
        <div className="im-stepper" aria-label="مراحل چرخه‌عمر">
          {IM_STAGE_ORDER.map((s, i) => <div key={s} className={`im-step ${curIdx >= 0 && i < curIdx ? 'done' : ''} ${s === stage || (curIdx < 0 && i === 0) ? 'cur' : ''}`} />)}
        </div>
        <div className="im-step-labels">{IM_STAGE_ORDER.map((s) => <span key={s} title={labelOf(s)}>{labelOf(s)}</span>)}</div>
        {curIdx < 0 && <div className="im-notice">وضعیت فعلی: «{labelOf(stage)}» — خارج از مسیر اصلی</div>}
      </div>

      {editing ? (
        <div className="im-card">
          <div className="im-field"><label>عنوان</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="im-field"><label>شرح</label><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="im-row">
            <div className="im-field"><label>شدت</label><select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as ImIssuePriority })}>{IM_PRIORITIES.map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select></div>
            <div className="im-field"><label>فوریت</label><select value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value as ImIssuePriority })}>{IM_PRIORITIES.map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select></div>
            <div className="im-field"><label>دسته</label><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="">—</option>{cfg.categories.filter((c) => c.active || c.key === draft.category).map((c) => <option key={c.key} value={c.key}>{c.labelFa}</option>)}</select></div>
          </div>
          <div className="im-row">
            <div className="im-field"><label>محل / قطعه / بخش</label><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></div>
            <div className="im-field"><label>رشته / دیسیپلین</label><input value={draft.discipline} onChange={(e) => setDraft({ ...draft, discipline: e.target.value })} /></div>
          </div>
          <div className="im-row">
            {([['ownerId', 'مالک'], ['followUpId', 'پیگیری‌کننده'], ['pursuerId', 'مسئول انجام'], ['approverId', 'مسئول تأیید']] as const).map(([k, l]) => (
              <div className="im-field" key={k}><label>{l}</label>
                <select value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}><option value="">—</option>{users.forProject(issue.projectId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select>
              </div>
            ))}
          </div>
          <div className="im-row"><button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !draft.title.trim()} onClick={save}>ذخیره</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditing(false)}>انصراف</button></div>
        </div>
      ) : (
        <div className="im-card">
          {issue.description && <div style={{ fontSize: 13.5, color: 'var(--im-muted-2)', lineHeight: 1.9, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{issue.description}</div>}
          {persons.map(([l, id]) => <div className="im-kv" key={l}><span>{l}</span><span>{users.name(id)}</span></div>)}
          <div className="im-kv"><span>دسته</span><span>{issue.category ? IM_CATEGORY_FA[issue.category] ?? issue.category : '—'}</span></div>
          <div className="im-kv"><span>محل / رشته</span><span>{[issue.location, issue.discipline].filter(Boolean).join(' · ') || '—'}</span></div>
          <div className="im-kv"><span>شدت / فوریت</span><span>{IM_PRIORITY_LABEL_FA[issue.severity ?? issue.priority]} / {IM_PRIORITY_LABEL_FA[issue.urgency ?? 'medium']}</span></div>
          <div className="im-kv"><span>تاریخ ثبت</span><span>{formatJalali(issue.createdAt.slice(0, 10))}</span></div>
          <div className="im-kv">
            <span>سررسید رفع</span>
            <span>{formatJalali(due)}{(issue.extensionCount ?? 0) > 0 && <span className="im-chip" style={{ marginRight: 8, color: 'var(--im-amber)' }} title={`سررسید اولیه ${formatJalali(issue.originalDueDate ?? issue.deadlineDate)}`}>{issue.extensionCount} تمدید</span>}</span>
          </div>
          <div className="im-kv"><span>منبع</span><span>{IM_SOURCE_FA[issue.source] ?? issue.source} <MissionOriginChip recordId={issue.id} /></span></div>
          {issue.externalSystem && <div className="im-kv"><span>سامانهٔ خارجی</span><span>{issue.externalSystem} · {issue.externalId} · <b>{issue.syncStatus}</b></span></div>}
          {issue.blockedSince && <div className="im-notice bad" style={{ marginTop: 10 }}>این مسئله به‌دلیل اقدام مسدود در انتظار است ({IM_BLOCK_KIND_FA[issue.blockedKind ?? ''] ?? 'نامشخص'}) از {formatJalali(issue.blockedSince.slice(0, 10))}</div>}
          {isStaff && <div style={{ marginTop: 10 }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditing(true)}><Pencil size={13} /> ویرایش مشخصات</button></div>}
        </div>
      )}

      {next.length > 0 && (
        <div className="im-card">
          <div className="im-section-title">گام بعدی در گردش‌کار</div>
          <div className="im-row" style={{ marginBottom: pending ? 12 : 0 }}>
            {next.map((t) => (
              <button key={t.to} className={`im-btn ${pending === t.to ? 'im-btn-primary' : 'im-btn-ghost'} im-btn-sm`} onClick={() => { setPending(pending === t.to ? null : (t.to as ImStage)); setReason('') }}>
                <ArrowLeft size={13} /> {labelOf(t.to)}
              </button>
            ))}
          </div>
          {pending && (
            <div className="im-grid" style={{ gap: 10 }}>
              {needsText && (
                <>
                  <div className="im-field" style={{ margin: 0 }}><label>خلاصه و نتیجهٔ رفع (چه شد؟)</label><textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></div>
                  <div className="im-field" style={{ margin: 0 }}>
                    <label>معیار پذیرش (چگونه می‌فهمیم مسئله واقعاً رفع شده؟)</label>
                    <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={cat?.acceptanceHint || 'مثلاً: نقشهٔ بازنگری‌شده تأیید و ابلاغ شده باشد'} />
                  </div>
                </>
              )}
              {(pendingDef?.requiresReason || pending === 'closed') && (
                <div className="im-field" style={{ margin: 0 }}><label>{pendingDef?.requiresReason ? 'دلیل (الزامی)' : 'توضیح'}</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              )}
              {pending === 'closed' && (
                <div className="im-checklist" aria-label="شرایط بستن">
                  {blockers.length === 0 ? <div className="im-check ok"><Check size={14} /> همهٔ شرایط بستن برقرار است</div> : blockers.map((b) => <div key={b} className="im-check no">• {b}</div>)}
                </div>
              )}
              <div className="im-row">
                <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || (pendingDef?.requiresReason && reason.trim().length < 3) || (pending === 'closed' && blockers.length > 0)} onClick={run}>{busy ? 'در حال ثبت…' : `انتقال به «${labelOf(pending)}»`}</button>
                <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setPending(null)}>انصراف</button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage !== 'closed' && stage !== 'cancelled' && stage !== 'duplicate' && (
        <div className="im-card">
          <div className="im-section-title">پیش‌نیازهای بستن <span className="im-helper">«اقدام انجام شد» ≠ «مسئله رفع شد»</span></div>
          <div className="im-checklist">
            {blockers.length === 0 ? <div className="im-check ok"><Check size={14} /> آمادهٔ درخواست تأیید نهایی</div> : blockers.map((b) => <div key={b} className="im-check no">• {b}</div>)}
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <div className="im-card">
          <div className="im-section-title">موارد مشابه <span className="im-helper">پیشنهاد سیستم؛ تصمیم با شماست</span></div>
          <div className="im-grid" style={{ gap: 8 }}>
            {similar.map((m) => (
              <div key={m.issue.id} className="im-check" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--im-text)' }}><span className="im-code">{m.issue.code}</span> {m.issue.title}</div>
                  <div className="im-helper">{m.reasons.join(' · ')} — شباهت {Math.round(m.score * 100)}٪</div>
                </div>
                {isStaff && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => addLink(issue.id, { targetType: 'issue', targetId: m.issue.id, targetLabel: `${m.issue.code} · ${m.issue.title}`, relation: 'related' })}>پیوند</button>
                    <button className="im-btn im-btn-ghost im-btn-sm" title="ثبت این مورد به‌عنوان تکراری" onClick={async () => { await addLink(issue.id, { targetType: 'issue', targetId: m.issue.id, targetLabel: `${m.issue.code} · ${m.issue.title}`, relation: 'duplicate_of' }); if (allowedNext(cfg.transitions, stage, roles).some((t) => t.to === 'duplicate')) { setPending('duplicate'); setReason(`تکراری ${m.issue.code}`) } }}><Copy size={12} /> تکراری</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
