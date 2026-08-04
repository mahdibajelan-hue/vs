import { useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Modal } from '../common/Modal'
import { RolePicker } from './AuthGate'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_LABEL_FA, type UserRole } from '../../types'

export function UserManagementModal({ onClose }: { onClose: () => void }) {
  const accounts = useAuthStore((s) => s.accounts)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const addAccount = useAuthStore((s) => s.addAccount)
  const removeAccount = useAuthStore((s) => s.removeAccount)

  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('contractor')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const submit = async () => {
    if (!fullName.trim() || !username.trim() || password.length < 4) {
      setError('نام، نام کاربری و رمز عبور (حداقل ۴ کاراکتر) را کامل کنید')
      return
    }
    const res = await addAccount({ username: username.trim(), password, fullName: fullName.trim(), role })
    if (!res.ok) {
      setError(res.error ?? 'خطا در ایجاد حساب')
      return
    }
    setFullName('')
    setUsername('')
    setPassword('')
    setError('')
    setShowForm(false)
  }

  return (
    <Modal title="مدیریت کاربران" subtitle="حساب‌های پیمانکار، مشاور و کارفرما را اینجا مدیریت کنید" onClose={onClose} width="max-w-lg">
      <div className="space-y-2 mb-3">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
            <div>
              <p className="text-sm font-medium">
                {a.fullName} {a.id === currentUserId && <span className="text-[10px] text-brand-400">(شما)</span>}
              </p>
              <p className="text-[11px] text-muted">
                {a.username} — {ROLE_LABEL_FA[a.role]}
              </p>
            </div>
            {accounts.length > 1 &&
              (confirmDeleteId === a.id ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => removeAccount(a.id)} className="text-xs text-red-400 hover:underline">
                    تایید حذف
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-secondary hover:underline">
                    انصراف
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(a.id)} className="text-muted hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              ))}
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-secondary hover:bg-white/5 transition-colors"
        >
          <UserPlus size={15} /> افزودن کاربر جدید
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">نام و نام خانوادگی</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">نام کاربری</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" />
            </label>
          </div>
          <RolePicker value={role} onChange={setRole} />
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">رمز عبور</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="حداقل ۴ کاراکتر" />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button onClick={submit} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
              ایجاد حساب
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
