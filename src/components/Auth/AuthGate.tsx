import { useState, type ReactNode } from 'react'
import { Check, Eye, EyeOff, KeyRound, Mail, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_DESCRIPTION_FA, ROLE_LABEL_FA, type UserRole } from '../../types'
import { LogoFull } from '../common/Logo'
import { ProfileForm } from './ProfileForm'

export function AuthGate({ children }: { children: ReactNode }) {
  const authLoading = useAuthStore((s) => s.authLoading)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const profileLoading = useAuthStore((s) => s.profileLoading)
  const profile = useAuthStore((s) => s.profile)

  if (authLoading || (isAuthed && profileLoading)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 size={26} className="animate-spin text-brand-400" />
      </div>
    )
  }
  if (!isAuthed) return <AuthScreen />
  if (profile && !profile.profileCompleted) {
    return (
      <Shell title="تکمیل مشخصات" subtitle="قبل از ادامه، لطفاً مشخصات خود را تکمیل کنید">
        <ProfileForm mode="forced" />
      </Shell>
    )
  }
  return <>{children}</>
}

export function Shell({
  title,
  subtitle,
  children,
  wide,
  panelClassName = '',
}: {
  title: string
  subtitle: string
  children: ReactNode
  wide?: boolean
  panelClassName?: string
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-4 overflow-y-auto">
      <div className={`glass-panel w-full ${wide ? 'max-w-lg' : 'max-w-sm'} rounded-3xl p-8 my-4 ${panelClassName}`}>
        <LogoFull width={180} className="mx-auto mb-4" />
        <h1 className="mb-1 text-center text-lg font-extrabold">{title}</h1>
        <p className="mb-6 text-center text-sm text-secondary leading-6">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-secondary">{label}</span>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input pl-9"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
          tabIndex={-1}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </label>
  )
}

export function RolePicker({
  value,
  onChange,
  roles = ['contractor', 'consultant', 'owner'],
}: {
  value: UserRole
  onChange: (r: UserRole) => void
  roles?: UserRole[]
}) {
  return (
    <div className="space-y-1.5">
      {roles.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-right transition-colors ${
            value === r ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
          }`}
        >
          <span
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${value === r ? 'border-brand-400 bg-brand-400' : 'border-white/20'}`}
          />
          <span>
            <p className="text-sm font-medium">{ROLE_LABEL_FA[r]}</p>
            <p className="text-[11px] text-muted">{ROLE_DESCRIPTION_FA[r]}</p>
          </span>
        </button>
      ))}
    </div>
  )
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

function AuthScreen() {
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [exiting, setExiting] = useState(false)

  const busy = status === 'submitting' || status === 'success'

  const submit = async () => {
    if (busy) return
    setError('')
    if (!email.trim() || !password) {
      setError('ایمیل و رمز عبور را وارد کنید')
      return
    }
    setStatus('submitting')
    const res = await signIn(email.trim(), password)
    if (!res.ok) {
      setError(res.error ?? 'ورود ناموفق بود')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 450)
      return
    }
    setStatus('success')
    setTimeout(() => setExiting(true), 500)
  }

  const fieldStateClass =
    status === 'success' ? '!border-green-400/70 !bg-green-500/10 !text-green-200' : status === 'error' ? 'auth-shake !border-red-400/70' : ''

  return (
    <Shell
      title="ورود به سامانه"
      subtitle="PipePulse یک پلتفرم هوشمند برای پایش بصری، کنترل پیشرفت، مدیریت ریسک و پیش‌بینی عملکرد پروژه‌های پایپینگ است؛ از برنامه‌ریزی هر Line تا اجرای واقعی و گزارش‌دهی مدیریتی."
      panelClassName={exiting ? 'auth-card-exit' : ''}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">ایمیل</span>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={busy}
              className={`input pl-9 transition-all duration-300 ${fieldStateClass}`}
              placeholder="person@example.com"
              dir="ltr"
              autoFocus
            />
            <Mail size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
        <PasswordField label="رمز عبور" value={password} onChange={setPassword} placeholder="حداقل ۶ کاراکتر" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors duration-300 ${
            status === 'success' ? 'bg-green-500' : 'bg-brand-500 hover:bg-brand-400'
          }`}
        >
          {status === 'success' ? (
            <>
              <Check size={16} className="auth-success-check" /> ورود موفق
            </>
          ) : status === 'submitting' ? (
            'در حال بررسی...'
          ) : (
            <>
              <KeyRound size={15} /> ورود
            </>
          )}
        </button>
      </div>

      <div className="mt-6 flex flex-col items-center gap-0.5 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
        <p style={{ fontFamily: "'Montserrat', sans-serif" }} className="text-lg font-extrabold tracking-tight text-brand-300">
          PipePulse<sup className="text-[10px] align-super">™</sup>
        </p>
        <p className="text-[10px] text-muted">Developed &amp; Designed by Mahdi Bajelan</p>
      </div>
    </Shell>
  )
}
