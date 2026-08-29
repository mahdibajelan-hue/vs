import { useState } from 'react'
import { BadgeCheck, Check, Eye, EyeOff, KeyRound, Loader2, Mail } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'

type Status = 'idle' | 'submitting' | 'success' | 'error'

/** A real, visible box on the page (not a cramped header form) — reuses the same
 * shake/flash-red/flash-green treatment the old split login screen used (`auth-panel-error`,
 * `auth-panel-success`, `auth-success-check`, all still in index.css). Stays mounted through the
 * success state on its own local `dismissed` flag so the green flash + message actually get seen,
 * even though `isAuthed` (and the module cards' unlocked state) flips the instant sign-in
 * resolves. */
export function LoginCard() {
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const submit = async () => {
    if (status === 'submitting' || status === 'success') return
    setError('')
    if (!email.trim() || !password) {
      setError('ایمیل و رمز عبور را وارد کنید')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 500)
      return
    }
    setStatus('submitting')
    const res = await signIn(email.trim(), password)
    if (!res.ok) {
      setError(res.error ?? 'ورود ناموفق بود')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 500)
      return
    }
    setStatus('success')
    setTimeout(() => setDismissed(true), 1700)
  }

  return (
    <div
      className={`hub-fade-in glass-panel mx-auto mb-8 w-full max-w-sm rounded-2xl border p-6 transition-colors duration-300 ${
        status === 'error' ? 'auth-panel-error' : status === 'success' ? 'auth-panel-success' : ''
      }`}
      style={{
        borderColor: status === 'idle' ? 'color-mix(in srgb, var(--radar-green) 45%, var(--border-soft))' : 'var(--border-soft)',
        boxShadow: status === 'idle' ? '0 0 44px color-mix(in srgb, var(--radar-green) 16%, transparent)' : undefined,
        animationDelay: '40ms',
      }}
    >
      {status === 'success' ? (
        <div className="flex flex-col items-center gap-2 py-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/15 text-green-400">
            <Check size={22} className="auth-success-check" />
          </div>
          <p className="text-sm font-bold text-green-300">ورود با موفقیت انجام شد</p>
          <p className="text-xs text-secondary">در حال باز شدن ماژول‌ها...</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-center gap-1.5">
            <BadgeCheck size={14} style={{ color: 'var(--radar-green)' }} />
            <p className="text-sm font-bold">ورود به سامانه</p>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 flex items-baseline gap-1.5 text-xs text-secondary">
                ایمیل <span className="eyebrow-en" dir="ltr">/ Email</span>
              </span>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  disabled={status === 'submitting'}
                  className="input pl-9 focus:!border-[color:var(--radar-green)]"
                  placeholder="person@example.com"
                  dir="ltr"
                  autoFocus
                />
                <Mail size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 flex items-baseline gap-1.5 text-xs text-secondary">
                رمز عبور <span className="eyebrow-en" dir="ltr">/ Password</span>
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  disabled={status === 'submitting'}
                  className="input pl-9"
                  placeholder="حداقل ۶ کاراکتر"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={submit}
              disabled={status === 'submitting'}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg, var(--radar-green), var(--radar-cyan))' }}
            >
              {status === 'submitting' ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={15} />}
              {status === 'submitting' ? 'در حال بررسی...' : 'ورود'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
