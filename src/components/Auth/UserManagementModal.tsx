import { useEffect, useState } from 'react'
import { Trash2, UserPlus, Mail, X } from 'lucide-react'
import { Modal } from '../common/Modal'
import { RolePicker } from './AuthGate'
import { useAuthStore } from '../../store/useAuthStore'
import { useMembersStore } from '../../store/useMembersStore'
import { ROLE_LABEL_FA, type UserRole } from '../../types'
import { canManageUsers } from '../../lib/permissions'

export function UserManagementModal({ onClose }: { onClose: () => void }) {
  const myUserId = useAuthStore((s) => s.profile?.id)
  const members = useMembersStore((s) => s.members)
  const invites = useMembersStore((s) => s.invites)
  const loading = useMembersStore((s) => s.loading)
  const invite = useMembersStore((s) => s.invite)
  const cancelInvite = useMembersStore((s) => s.cancelInvite)
  const removeMember = useMembersStore((s) => s.removeMember)
  const changeRole = useMembersStore((s) => s.changeRole)
  const myRole = members.find((m) => m.userId === myUserId)?.role
  const canManage = canManageUsers(myRole, members)

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('contractor')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    setError('')
  }, [showForm])

  const submit = async () => {
    if (!email.trim()) {
      setError('ایمیل را وارد کنید')
      return
    }
    setBusy(true)
    const res = await invite(email.trim(), role)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'خطا در دعوت')
      return
    }
    setEmail('')
    setError('')
    setShowForm(false)
  }

  return (
    <Modal title="اعضای پروژه" subtitle="افرادی که به این پروژه دعوت شده‌اند و به داده‌های آن دسترسی دارند" onClose={onClose} width="max-w-lg">
      {!canManage && (
        <p className="mb-3 rounded-xl bg-white/[0.03] p-3 text-xs text-muted">
          فقط کارفرمای پروژه می‌تواند عضو جدید دعوت کند یا نقش اعضا را تغییر دهد.
        </p>
      )}

      <div className="space-y-2 mb-3">
        {loading && members.length === 0 && <p className="text-xs text-muted">در حال بارگذاری...</p>}
        {members.map((m) => (
          <div key={m.userId} className="rounded-xl bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.fullName || m.email} {m.userId === myUserId && <span className="text-[10px] text-brand-400">(شما)</span>}
                </p>
                <p className="text-[11px] text-muted truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canManage ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value as UserRole)}
                    className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[11px] outline-none focus:border-brand-400"
                  >
                    {(['contractor', 'consultant', 'owner'] as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL_FA[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{ROLE_LABEL_FA[m.role]}</span>
                )}
                {canManage &&
                  (confirmDeleteId === m.userId ? (
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
                  ))}
              </div>
            </div>
          </div>
        ))}

        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/10 p-3">
            <div className="min-w-0 flex items-center gap-2">
              <Mail size={13} className="text-muted shrink-0" />
              <div className="min-w-0">
                <p className="text-sm truncate">{inv.email}</p>
                <p className="text-[11px] text-muted">دعوت در انتظار پذیرش — {ROLE_LABEL_FA[inv.role]}</p>
              </div>
            </div>
            {canManage && (
              <button onClick={() => cancelInvite(inv.id)} className="shrink-0 text-muted hover:text-red-400 transition-colors" title="لغو دعوت">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {!canManage ? null : !showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-secondary hover:bg-white/5 transition-colors"
        >
          <UserPlus size={15} /> دعوت عضو جدید با ایمیل
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ایمیل</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="person@example.com"
              dir="ltr"
            />
          </label>
          <RolePicker value={role} onChange={setRole} />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-50 transition-colors"
            >
              {busy ? 'در حال ارسال...' : 'ارسال دعوت'}
            </button>
          </div>
          <p className="text-[11px] text-muted leading-5">
            اگر فرد قبلاً در سامانه حساب داشته باشد بلافاصله به پروژه اضافه می‌شود، در غیر این صورت با اولین ورودش دعوت پذیرفته می‌شود.
          </p>
        </div>
      )}
    </Modal>
  )
}
