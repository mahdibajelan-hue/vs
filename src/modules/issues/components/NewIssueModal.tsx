import { useEffect, useMemo, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, type ImIssue, type ImIssuePriority } from '../types'
import { findSimilarIssues } from '../lib/imText'
import { costLevel, derivePriority, suggestSeverity, timeLevel, type ImpactLevel } from '../lib/imScoring'
import { DEFAULT_SLA } from '../lib/imSla'

const LV = [[0, 'ندارد'], [1, 'کم'], [2, 'متوسط'], [3, 'زیاد']] as const

/** Registration form v2: category-driven acceptance hint, impact → explainable severity suggestion, live duplicate check, optional template with starter actions. */
export function NewIssueModal({ defaultProjectId, onClose, onCreated }: { defaultProjectId: string | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const createIssueV2 = useIssuesStore((s) => s.createIssueV2)
  const addTask = useIssueWorkStore((s) => s.addTask)
  const cfg = useIssueConfigStore()
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const fetchMembers = useIssuesMembersStore((s) => s.fetchForProject)
  const me = useAuthStore((s) => s.profile?.id) ?? ''

  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '')
  const [templateKey, setTemplateKey] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [ownerId, setOwnerId] = useState(me)
  const [followUpId, setFollowUpId] = useState('')
  const [pursuerId, setPursuerId] = useState('')
  const [approverId, setApproverId] = useState('')
  const [severity, setSeverity] = useState<ImIssuePriority>('medium')
  const [urgency, setUrgency] = useState<ImIssuePriority>('medium')
  const [days, setDays] = useState(7)
  const [criteria, setCriteria] = useState('')
  const [imp, setImp] = useState({ timeDays: 0, cost: 0, quality: 0, safety: 0, contract: 0, objectives: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [touchedSeverity, setTouchedSeverity] = useState(false)

  useEffect(() => { if (!cfg.loaded) cfg.fetch() }, [cfg])
  useEffect(() => { if (projectId && !(projectId in membersByProject)) fetchMembers(projectId) }, [projectId, membersByProject, fetchMembers])

  const members = membersByProject[projectId] ?? []
  const label = (m: { fullName: string; email: string }) => m.fullName || m.email

  const suggestion = useMemo(
    () => suggestSeverity({ time: timeLevel(imp.timeDays) as ImpactLevel, cost: costLevel(imp.cost) as ImpactLevel, quality: imp.quality as ImpactLevel, safety: imp.safety as ImpactLevel, contract: imp.contract as ImpactLevel, objectives: (imp.objectives.trim() ? 1 : 0) as ImpactLevel }),
    [imp],
  )
  const hasImpact = imp.timeDays > 0 || imp.cost > 0 || imp.quality > 0 || imp.safety > 0 || imp.contract > 0
  useEffect(() => { if (hasImpact && !touchedSeverity) setSeverity(suggestion.severity) }, [suggestion, hasImpact, touchedSeverity])

  const policy = (cfg.sla.length ? cfg.sla : DEFAULT_SLA).find((p) => p.severity === severity)
  const priority = derivePriority(severity, urgency)

  const similar = useMemo(() => (title.trim().length < 6 ? [] : findSimilarIssues({ title, description, projectId, category: category || null, location }, issues as ImIssue[], { limit: 3 })), [title, description, projectId, category, location, issues])

  const applyTemplate = (key: string) => {
    setTemplateKey(key)
    const t = cfg.templates.find((x) => x.key === key)
    if (!t) return
    if (t.category) setCategory(t.category)
    if (t.defaults.severity) { setSeverity(t.defaults.severity); setTouchedSeverity(true) }
    if (t.defaults.urgency) setUrgency(t.defaults.urgency)
    if (t.defaults.deadline_days) setDays(t.defaults.deadline_days)
    if (t.defaults.acceptance_criteria) setCriteria(t.defaults.acceptance_criteria)
    if (!title) setTitle(t.name)
  }

  const onCategory = (k: string) => {
    setCategory(k)
    const hint = cfg.categories.find((c) => c.key === k)?.acceptanceHint
    if (hint && !criteria.trim()) setCriteria(hint)
  }

  const submit = async () => {
    if (!projectId) return setError('یک پروژه انتخاب کنید')
    if (!title.trim()) return setError('عنوان مسئله را وارد کنید')
    if (!category) return setError('دستهٔ مسئله را مشخص کنید؛ قوانین بستن بر اساس دسته اعمال می‌شود')
    setBusy(true)
    setError('')
    try {
      const id = await createIssueV2(projectId, {
        title: title.trim(), description: description.trim(), pursuerId: pursuerId || null, approverId: approverId || null, ownerId: ownerId || null, followUpId: followUpId || null,
        severity, urgency, category, discipline, location, deadlineDays: Math.max(1, days), acceptanceCriteria: criteria.trim(),
        impacts: { timeDays: imp.timeDays || undefined, cost: imp.cost || undefined, quality: imp.quality, safety: imp.safety, contract: imp.contract, objectives: imp.objectives },
      })
      if (!id) { setBusy(false); return }
      const t = cfg.templates.find((x) => x.key === templateKey)
      if (t) for (const task of t.tasks) {
        const due = new Date(Date.now() + task.offset_days * 86400000).toISOString().slice(0, 10)
        await addTask(id, { title: task.title, executorId: pursuerId || null, approverId: approverId || null, dueDate: due })
      }
      onCreated?.(id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label="ثبت مسئلهٔ جدید">
        <div className="im-modal-head">
          <div className="im-modal-title">ثبت مسئله</div>
          <button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button>
        </div>

        {projects.length === 0 ? <div className="im-empty" style={{ padding: '20px 10px' }}>ابتدا باید یک پروژه بسازید</div> : (
          <>
            <div className="im-row">
              <div className="im-field"><label>پروژه</label><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="im-field"><label>الگو (اختیاری)</label>
                <select value={templateKey} onChange={(e) => applyTemplate(e.target.value)}><option value="">— بدون الگو —</option>{cfg.templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select>
              </div>
            </div>
            <div className="im-field"><label>عنوان (چه چیزی مانع کار است؟)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تأخیر در تأیید نقشه‌های سازهٔ بلوک B" autoFocus /></div>

            {similar.length > 0 && (
              <div className="im-notice" style={{ marginBottom: 12 }}>
                <b>مورد مشابه وجود دارد</b> — پیش از ثبت بررسی کنید که تکراری نباشد:
                {similar.map((m) => <div key={m.issue.id} style={{ marginTop: 4 }}><span className="im-code">{m.issue.code}</span> {m.issue.title} <span className="im-helper">({Math.round(m.score * 100)}٪)</span></div>)}
              </div>
            )}

            <div className="im-field"><label>شرح</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="شرح وضعیت، سابقه و پیامد در صورت رفع‌نشدن" /></div>
            <div className="im-row">
              <div className="im-field"><label>دسته *</label><select value={category} onChange={(e) => onCategory(e.target.value)}><option value="">— انتخاب کنید —</option>{cfg.categories.filter((c) => c.active).map((c) => <option key={c.key} value={c.key}>{c.labelFa}</option>)}</select></div>
              <div className="im-field"><label>محل / قطعه</label><input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
              <div className="im-field"><label>رشته</label><input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="سازه، برق، …" /></div>
            </div>

            <div className="im-card" style={{ marginBottom: 14 }}>
              <div className="im-section-title" style={{ marginBottom: 8 }}>اثر بر پروژه <span className="im-helper">برای پیشنهاد شدت</span></div>
              <div className="im-row">
                <div className="im-field"><label>اثر زمانی (روز)</label><input type="number" min={0} value={imp.timeDays} onChange={(e) => setImp({ ...imp, timeDays: Math.max(0, Number(e.target.value) || 0) })} /></div>
                <div className="im-field"><label>اثر مالی (ریال)</label><input type="number" min={0} value={imp.cost} onChange={(e) => setImp({ ...imp, cost: Math.max(0, Number(e.target.value) || 0) })} /></div>
              </div>
              <div className="im-row">
                {([['quality', 'کیفیت'], ['safety', 'ایمنی'], ['contract', 'قرارداد']] as const).map(([k, l]) => (
                  <div className="im-field" key={k}><label>{l}</label><select value={imp[k]} onChange={(e) => setImp({ ...imp, [k]: Number(e.target.value) })}>{LV.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
                ))}
              </div>
              <div className="im-field" style={{ marginBottom: 0 }}><label>اثر بر اهداف پروژه</label><input value={imp.objectives} onChange={(e) => setImp({ ...imp, objectives: e.target.value })} /></div>
              {hasImpact && (
                <div className="im-helper" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>شدت پیشنهادی: <b>{IM_PRIORITY_LABEL_FA[suggestion.severity]}</b> — {suggestion.reasons.join('؛ ')}</span>
                </div>
              )}
            </div>

            <div className="im-row">
              <div className="im-field"><label>شدت</label><select value={severity} onChange={(e) => { setSeverity(e.target.value as ImIssuePriority); setTouchedSeverity(true) }}>{IM_PRIORITIES.map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select></div>
              <div className="im-field"><label>فوریت</label><select value={urgency} onChange={(e) => setUrgency(e.target.value as ImIssuePriority)}>{IM_PRIORITIES.map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select></div>
              <div className="im-field"><label>مهلت رفع (روز)</label><input type="number" min={1} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} /></div>
            </div>
            <div className="im-helper" style={{ marginTop: -6, marginBottom: 12 }}>اولویت محاسبه‌شده: <b>{IM_PRIORITY_LABEL_FA[priority]}</b>{policy ? ` · SLA پاسخ ${policy.responseHours} ساعت، توصیهٔ رفع ${policy.resolveDays} روز` : ''}</div>

            <div className="im-row">
              <div className="im-field"><label>مالک مسئله</label><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">—</option>{members.map((m) => <option key={m.userId} value={m.userId}>{label(m)}</option>)}</select></div>
              <div className="im-field"><label>پیگیری‌کننده</label><select value={followUpId} onChange={(e) => setFollowUpId(e.target.value)}><option value="">—</option>{members.map((m) => <option key={m.userId} value={m.userId}>{label(m)}</option>)}</select></div>
            </div>
            <div className="im-row">
              <div className="im-field"><label>مسئول انجام</label><select value={pursuerId} onChange={(e) => setPursuerId(e.target.value)}><option value="">—</option>{members.filter((m) => m.role !== 'approver').map((m) => <option key={m.userId} value={m.userId}>{label(m)}</option>)}</select></div>
              <div className="im-field"><label>مسئول تأیید</label><select value={approverId} onChange={(e) => setApproverId(e.target.value)}><option value="">—</option>{members.filter((m) => m.role !== 'pursuer').map((m) => <option key={m.userId} value={m.userId}>{label(m)}</option>)}</select></div>
            </div>
            <div className="im-field"><label>معیار پذیرش (رفع واقعی یعنی چه؟)</label><textarea style={{ minHeight: 56 }} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="بدون معیار پذیرش، مسئله بسته نمی‌شود" /></div>
            {templateKey && <div className="im-helper" style={{ marginBottom: 10 }}>{cfg.templates.find((t) => t.key === templateKey)?.tasks.length ?? 0} اقدام پیشنهادی الگو همراه مسئله ساخته می‌شود.</div>}
            {error && <p style={{ color: 'var(--im-coral)', fontSize: 12, marginBottom: 12 }}>{error}</p>}
            <button className="im-btn im-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={submit} disabled={busy}>{busy ? 'در حال ثبت…' : 'ثبت مسئله'}</button>
          </>
        )}
      </div>
    </div>
  )
}
