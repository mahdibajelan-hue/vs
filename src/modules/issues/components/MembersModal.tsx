import { useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { EMPTY_MEMBERS, useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_ROLES, IM_ROLE_LABEL_FA, type ImUserRole } from '../types'

export function MembersModal({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const myUserId = useAuthStore((s) => s.profile?.id)
  const members = useIssuesMembersStore((s) => s.membersByProject[projectId] ?? EMPTY_MEMBERS)
  const addMember = useIssuesMembersStore((s) => s.addMember)
  const removeMember = useIssuesMembersStore((s) => s.removeMember)
  const changeRole = useIssuesMembersStore((s) => s.changeRole)

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ImUserRole>('pursuer')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim()) {
      setError('ایمیل را وارد کنید')
      return
    }
    setBusy(true)
    const res = await addMember(projectId, email.trim(), role)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'خطا در افزودن عضو')
      return
    }
    setEmail('')
    setError('')
    setShowForm(false)
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal">
        <div className="im-modal-head">
          <div className="im-modal-title">اعضای «{projectName}»</div>
          <button className="im-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="im-grid" style={{ marginBottom: 14 }}>
          {members.map((m) => (
            <div key={m.userId} className="im-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {m.fullName || m.email} {m.userId === myUserId && <span style={{ fontSize: 10, color: 'var(--im-coral)' }}>(شما)</span>}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--im-muted)' }}>{m.email}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <select value={m.role} onChange={(e) => changeRole(projectId, m.userId, e.target.value as ImUserRole)} style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}>
                    {IM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {IM_ROLE_LABEL_FA[r]}
                      </option>
                    ))}
                  </select>
                  {confirmDeleteId === m.userId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button style={{ fontSize: 11, color: 'var(--im-coral)' }} onClick={() => removeMember(projectId, m.userId)}>
                        تایید حذف
                      </button>
                      <button style={{ fontSize: 11, color: 'var(--im-muted-2)' }} onClick={() => setConfirmDeleteId(null)}>
                        انصراف
                      </button>
                    </div>
                  ) : (
                    members.length > 1 && (
                      <button style={{ color: 'var(--im-muted)' }} onClick={() => setConfirmDeleteId(m.userId)}>
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="im-btn im-btn-ghost"
            style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--im-line-2)' }}
          >
            <UserPlus size={15} /> افزودن عضو با ایمیل
          </button>
        ) : (
          <div style={{ border: '1px solid var(--im-line-2)', borderRadius: 14, padding: 12 }}>
            <div className="im-field">
              <label>ایمیل</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" dir="ltr" />
            </div>
            <div className="im-field" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {IM_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="im-row"
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${role === r ? 'rgba(245,178,72,0.5)' : 'var(--im-line-2)'}`,
                    background: role === r ? 'rgba(245,178,72,0.1)' : 'transparent',
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    justifyContent: 'flex-start',
                    textAlign: 'right',
                  }}
                >
                  {IM_ROLE_LABEL_FA[r]}
                </button>
              ))}
            </div>
            {error && <p style={{ fontSize: 12, color: 'var(--im-coral)' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setShowForm(false)}>
                انصراف
              </button>
              <button className="im-btn im-btn-primary im-btn-sm" onClick={submit} disabled={busy}>
                {busy ? 'در حال افزودن...' : 'افزودن'}
              </button>
            </div>
            <p className="im-helper">فرد باید پیش‌تر حداقل یک‌بار با همین ایمیل وارد سامانه شده باشد.</p>
          </div>
        )}
      </div>
    </div>
  )
}
