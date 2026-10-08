import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Mail, RefreshCw } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { displayName, generatePassword, passwordStrength } from '../lib/format'
import { useUserCenterStore } from '../store/useUserCenterStore'
import type { UcUser } from '../types'
import { Avatar, Segmented, useToast } from './ui'

const STRENGTH_COLOR = ['var(--uc-bad)', 'var(--uc-bad)', 'var(--uc-warn)', 'var(--uc-ok)', 'var(--uc-ok)']

export function PasswordInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const strength = passwordStrength(value)
  return (
    <div>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <input className="uc-input" dir={value ? 'ltr' : 'rtl'} style={{ paddingLeft: 40, textAlign: value ? 'left' : 'right', fontFamily: value ? 'var(--font-mono)' : undefined }} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="new-password" autoFocus={autoFocus} />
          <button type="button" className="uc-btn uc-btn-ghost uc-btn-icon" style={{ position: 'absolute', left: 3, top: 3, minHeight: 32 }} onClick={() => setShow((v) => !v)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button type="button" className="uc-btn uc-btn-icon" title="تولید رمز قوی" aria-label="تولید رمز قوی" onClick={() => { onChange(generatePassword()); setShow(true) }}>
          <RefreshCw size={15} />
        </button>
        <button
          type="button"
          className="uc-btn uc-btn-icon"
          title="کپی رمز"
          aria-label="کپی رمز"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? <Check size={15} style={{ color: 'var(--uc-ok)' }} /> : <Copy size={15} />}
        </button>
      </div>
      {value && (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= strength.score ? STRENGTH_COLOR[strength.score] : 'var(--uc-line-2)', transition: 'background-color 0.2s' }} />
            ))}
          </div>
          <span className="uc-eyebrow w-14 text-left">{strength.label}</span>
        </div>
      )}
    </div>
  )
}

/** Reset or set a password: either an e-mailed recovery link, or a new temporary password chosen here. */
export function PasswordDialog({ user, onClose }: { user: UcUser; onClose: () => void }) {
  const setPassword = useUserCenterStore((s) => s.setPassword)
  const sendResetEmail = useUserCenterStore((s) => s.sendResetEmail)
  const notify = useToast()
  const [mode, setMode] = useState<'set' | 'email'>('email')
  const [pw, setPw] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ kind: 'set' | 'email'; password?: string } | null>(null)
  const tooShort = pw.length > 0 && pw.length < 8

  const run = async () => {
    setBusy(true)
    const res = mode === 'set' ? await setPassword(user.id, pw) : await sendResetEmail(user.email)
    setBusy(false)
    if (!res.ok) {
      notify(res.error ?? 'انجام نشد', 'bad')
      return
    }
    setDone({ kind: mode, password: mode === 'set' ? pw : undefined })
  }

  return (
    <Modal panelClassName="uc-modal" title="رمز عبور" subtitle={displayName(user)} onClose={() => !busy && onClose()} width="max-w-md" isDirty={!done && (!!pw || ack)}>
      <div className="uc-root" dir="rtl">
        <div className="mb-4 flex items-center gap-3">
          <Avatar user={user} size={38} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold">{displayName(user)}</p>
            <p className="uc-eyebrow truncate" dir="ltr" style={{ textAlign: 'right' }}>{user.email}</p>
          </div>
        </div>

        {done ? (
          <div className="uc-rise">
            <div className="flex items-start gap-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--uc-ok) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--uc-ok) 30%, transparent)' }}>
              <Check size={18} style={{ color: 'var(--uc-ok)', marginTop: 3 }} />
              <div className="min-w-0 text-[13px] leading-7">
                {done.kind === 'email' ? (
                  <>لینک بازیابی رمز به <b dir="ltr">{user.email}</b> ارسال شد. کاربر با باز کردن آن می‌تواند رمز تازه انتخاب کند.</>
                ) : (
                  <>
                    رمز جدید ثبت شد. آن را به‌صورت امن به کاربر بدهید؛ <b>این رمز دوباره نمایش داده نمی‌شود.</b>
                    <div className="mt-2" dir="ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, userSelect: 'all', textAlign: 'left' }}>{done.password}</div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="uc-btn uc-btn-primary" onClick={onClose}>
                بستن
              </button>
            </div>
          </div>
        ) : (
          <>
            <Segmented
              label="روش تغییر رمز"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'email', label: <span className="inline-flex items-center gap-1.5"><Mail size={13} /> ارسال لینک بازیابی</span> },
                { value: 'set', label: <span className="inline-flex items-center gap-1.5"><KeyRound size={13} /> تعیین رمز جدید</span> },
              ]}
            />
            {mode === 'email' ? (
              <p className="mt-4 text-[13px] leading-7" style={{ color: 'var(--uc-ink-2)' }}>
                یک ایمیل حاوی لینک امن تغییر رمز برای کاربر فرستاده می‌شود. رمز فعلی تا زمانی که کاربر رمز تازه را ثبت نکند معتبر می‌ماند و شما هیچ‌وقت رمز او را نمی‌بینید. پیشنهاد می‌شود همین روش را به‌کار ببرید.
              </p>
            ) : (
              <div className="mt-4">
                <label className="uc-label">رمز عبور جدید</label>
                <PasswordInput value={pw} onChange={setPw} placeholder="حداقل ۸ کاراکتر" autoFocus />
                {tooShort && <p className="uc-field-err">رمز عبور باید حداقل ۸ کاراکتر باشد.</p>}
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-7" style={{ color: 'var(--uc-ink-2)' }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 8 }} />
                  می‌دانم که رمز قبلی کاربر بلافاصله بی‌اعتبار می‌شود و این تغییر در تاریخچهٔ حساب ثبت می‌شود.
                </label>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="uc-btn" disabled={busy} onClick={onClose}>
                انصراف
              </button>
              <button className="uc-btn uc-btn-primary" disabled={busy || (mode === 'set' && (pw.length < 8 || !ack))} onClick={run}>
                {busy ? 'در حال انجام…' : mode === 'email' ? 'ارسال لینک بازیابی' : 'ثبت رمز جدید'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
