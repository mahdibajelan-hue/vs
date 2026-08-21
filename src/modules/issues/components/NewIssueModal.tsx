import { useEffect, useState } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, type ImIssuePriority } from '../types'

export function NewIssueModal({ defaultProjectId, onClose }: { defaultProjectId: string | null; onClose: () => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const createIssue = useIssuesStore((s) => s.createIssue)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const fetchMembersForProject = useIssuesMembersStore((s) => s.fetchForProject)

  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pursuerId, setPursuerId] = useState('')
  const [approverId, setApproverId] = useState('')
  const [priority, setPriority] = useState<ImIssuePriority>('medium')
  const [days, setDays] = useState(3)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (projectId && !(projectId in membersByProject)) fetchMembersForProject(projectId)
  }, [projectId, membersByProject, fetchMembersForProject])

  const members = membersByProject[projectId] ?? []
  const pursuerPool = members.filter((m) => m.role === 'pursuer' || m.role === 'admin')
  const approverPool = members.filter((m) => m.role === 'approver' || m.role === 'admin')

  const submit = async () => {
    if (!projectId) {
      setError('یک پروژه انتخاب کن')
      return
    }
    if (!title.trim()) {
      setError('عنوان مشکل را وارد کن')
      return
    }
    setBusy(true)
    try {
      await createIssue(projectId, {
        title: title.trim(),
        description: description.trim(),
        pursuerId: pursuerId || null,
        approverId: approverId || null,
        priority,
        deadlineDays: Math.max(1, days),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal">
        <div className="im-modal-head">
          <div className="im-modal-title">ثبت مشکل جدید</div>
          <button className="im-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="im-empty" style={{ padding: '20px 10px' }}>
            اول باید یک پروژه بسازی
          </div>
        ) : (
          <>
            <div className="im-field">
              <label>پروژه</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="im-field">
              <label>عنوان مشکل</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً باگ در فرم ثبت‌نام" autoFocus />
            </div>
            <div className="im-field">
              <label>توضیحات</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="جزئیات مشکل..." />
            </div>
            <div className="im-row">
              <div className="im-field">
                <label>مسئول انجام</label>
                <select value={pursuerId} onChange={(e) => setPursuerId(e.target.value)}>
                  <option value="">— انتخاب نشده —</option>
                  {pursuerPool.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="im-field">
                <label>مسئول تایید</label>
                <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
                  <option value="">— انتخاب نشده —</option>
                  {approverPool.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="im-row">
              <div className="im-field">
                <label>اولویت</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as ImIssuePriority)}>
                  {IM_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {IM_PRIORITY_LABEL_FA[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="im-field">
                <label>مهلت اقدام (روز)</label>
                <input type="number" min={1} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 1)} />
              </div>
            </div>
            {error && <p style={{ color: 'var(--im-coral)', fontSize: 12, marginBottom: 12 }}>{error}</p>}
            <button className="im-btn im-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={submit} disabled={busy}>
              {busy ? 'در حال ثبت...' : 'ثبت مشکل'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
