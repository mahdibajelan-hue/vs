import { useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { useAuthStore } from '../../../store/useAuthStore'
import { useRiskMembersStore } from '../store/useRiskMembersStore'
import { RM_ROLES, RM_ROLE_LABEL_FA, type RmUserRole } from '../types'

export function RmMembersModal({ projectName, onClose }: { projectName: string; onClose: () => void }) {
  const myUserId = useAuthStore((s) => s.profile?.id)
  const members = useRiskMembersStore((s) => s.members)
  const addMember = useRiskMembersStore((s) => s.addMember)
  const removeMember = useRiskMembersStore((s) => s.removeMember)
  const changeRole = useRiskMembersStore((s) => s.changeRole)

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RmUserRole>('team_member')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim()) {
      setError('ایمیل را وارد کنید')
      return
    }
    setBusy(true)
    const res = await addMember(email.trim(), role)
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
    <Modal title={`اعضای پروژه «${projectName}»`} subtitle="نقش هر عضو، سطح دسترسی او را در این پروژه تعیین می‌کند" onClose={onClose} width="max-w-lg">
      <div className="space-y-2 mb-3">
        {members.map((m) => (
          <div key={m.userId} className="rounded-xl bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.fullName || m.email} {m.userId === myUserId && <span className="text-[10px] text-red-400">(شما)</span>}
                </p>
                <p className="text-[11px] text-muted truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value as RmUserRole)}
                  className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[11px] outline-none focus:border-red-400"
                >
                  {RM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {RM_ROLE_LABEL_FA[r]}
                    </option>
                  ))}
                </select>
                {confirmDeleteId === m.userId ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => removeMember(m.userId)} className="text-xs text-red-400 hover:underline">
                      تایید حذف
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-secondary hover:underline">
                      انصراف
                    </button>
                  </div>
                ) : (
                  members.length > 1 && (
                    <button onClick={() => setConfirmDeleteId(m.userId)} className="text-muted hover:text-red-400 transition-colors">
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-secondary hover:bg-white/5 transition-colors"
        >
          <UserPlus size={15} /> افزودن عضو با ایمیل
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ایمیل</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="person@example.com" dir="ltr" />
          </label>
          <div className="space-y-1.5">
            {RM_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-right transition-colors ${
                  role === r ? 'border-red-400/50 bg-red-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                }`}
              >
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${role === r ? 'border-red-400 bg-red-400' : 'border-white/20'}`} />
                <span className="text-sm font-medium">{RM_ROLE_LABEL_FA[r]}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50 transition-colors">
              {busy ? 'در حال افزودن...' : 'افزودن'}
            </button>
          </div>
          <p className="text-[11px] text-muted leading-5">فرد باید پیش‌تر حداقل یک‌بار با همین ایمیل وارد سامانه شده باشد.</p>
        </div>
      )}
    </Modal>
  )
}
