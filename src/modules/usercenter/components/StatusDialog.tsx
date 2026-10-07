import { useState } from 'react'
import { Modal } from '../../../components/common/Modal'
import { STATUS_HINT, STATUS_LABEL, type AccountStatus, type UcUser } from '../types'
import { displayName } from '../lib/format'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { Avatar, StatusBadge, useToast } from './ui'

const ORDER: AccountStatus[] = ['active', 'disabled', 'blocked']

/** Change an account's status (فعال / غیرفعال / مسدود) — always with an explanation, and a reason for anything but «فعال». */
export function StatusDialog({ user, initial, onClose }: { user: UcUser; initial?: AccountStatus; onClose: () => void }) {
  const setStatus = useUserCenterStore((s) => s.setStatus)
  const myId = useAuthStore((s) => s.profile?.id)
  const notify = useToast()
  const [target, setTarget] = useState<AccountStatus>(initial ?? (user.accountStatus === 'active' ? 'disabled' : 'active'))
  const [reason, setReason] = useState(user.accountStatus === target ? user.statusReason : '')
  const [busy, setBusy] = useState(false)
  const isSelf = user.id === myId
  const needsReason = target !== 'active'
  const unchanged = target === user.accountStatus
  const disabled = busy || unchanged || isSelf || (needsReason && !reason.trim())

  const submit = async () => {
    setBusy(true)
    const res = await setStatus(user.id, target, needsReason ? reason : '')
    setBusy(false)
    if (!res.ok) {
      notify(res.error ?? 'تغییر وضعیت انجام نشد', 'bad')
      return
    }
    notify(res.warning ?? `وضعیت حساب «${displayName(user)}» به «${STATUS_LABEL[target]}» تغییر کرد`, res.warning ? 'warn' : 'ok')
    onClose()
  }

  return (
    <Modal title="تغییر وضعیت حساب" subtitle={displayName(user)} onClose={() => !busy && onClose()} width="max-w-md">
      <div className="uc-root" dir="rtl">
        <div className="mb-4 flex items-center gap-3">
          <Avatar user={user} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold">{displayName(user)}</p>
            <p className="uc-eyebrow truncate" dir="ltr" style={{ textAlign: 'right' }}>{user.email}</p>
          </div>
          <StatusBadge status={user.accountStatus} />
        </div>

        {isSelf && <p className="mb-3 rounded-xl px-3 py-2 text-[12.5px] leading-7" style={{ background: 'color-mix(in srgb, var(--uc-warn) 12%, transparent)', color: 'var(--uc-warn)' }}>وضعیت حساب خودتان را نمی‌توانید تغییر دهید.</p>}

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="وضعیت جدید">
          {ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={target === s}
              onClick={() => setTarget(s)}
              className="flex items-start gap-3 rounded-xl p-3 text-right"
              style={{ border: `1px solid ${target === s ? 'var(--uc-accent)' : 'var(--uc-line)'}`, background: target === s ? 'var(--uc-accent-soft)' : 'var(--uc-surface-2)', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}
            >
              <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: `2px solid ${target === s ? 'var(--uc-accent)' : 'var(--uc-line-2)'}`, background: target === s ? 'var(--uc-accent)' : 'transparent' }} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-bold">
                  {STATUS_LABEL[s]} {user.accountStatus === s && <span className="uc-eyebrow">(وضعیت فعلی)</span>}
                </span>
                <span className="uc-eyebrow mt-0.5 block leading-6">{STATUS_HINT[s]}</span>
              </span>
            </button>
          ))}
        </div>

        {needsReason && (
          <div className="mt-4">
            <label className="uc-label">
              دلیل {target === 'blocked' ? 'مسدودسازی' : 'غیرفعال‌سازی'} <span style={{ color: 'var(--uc-bad)' }}>*</span>
            </label>
            <textarea className="uc-input uc-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: پایان همکاری، درخواست مدیر پروژه، فعالیت مشکوک…" />
            <p className="uc-hint">دلیل در تاریخچهٔ تغییرات کاربر ثبت می‌شود.</p>
          </div>
        )}
        {target !== 'active' && <p className="uc-hint mt-3">کاربر از این لحظه امکان ورود ندارد و نشست‌های جاری او به‌زودی منقضی می‌شود. دسترسی‌ها و سوابق او حذف نمی‌شود.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="uc-btn" disabled={busy} onClick={onClose}>
            انصراف
          </button>
          <button className={`uc-btn ${target === 'active' ? 'uc-btn-primary' : target === 'blocked' ? 'uc-btn-danger' : 'uc-btn-warn'}`} disabled={disabled} onClick={submit}>
            {busy ? 'در حال انجام…' : target === 'active' ? 'فعال‌سازی حساب' : target === 'blocked' ? 'مسدود کردن کاربر' : 'غیرفعال‌سازی حساب'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
