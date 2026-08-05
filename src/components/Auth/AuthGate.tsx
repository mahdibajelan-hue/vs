import { useState, type ReactNode } from 'react'
import { Check, Eye, EyeOff, KeyRound, User } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_DESCRIPTION_FA, ROLE_LABEL_FA, type UserRole } from '../../types'
import { LogoFull } from '../common/Logo'

export function AuthGate({ children }: { children: ReactNode }) {
  const hasAccounts = useAuthStore((s) => s.accounts.length > 0)
  const isAuthed = useAuthStore((s) => s.isAuthed)

  if (!hasAccounts) return <SetupScreen />
  if (!isAuthed) return <LoginScreen />
  return <>{children}</>
}

function Shell({
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
    <div className="flex h-screen w-screen items-center justify-center p-4">
      <div className={`glass-panel w-full ${wide ? 'max-w-lg' : 'max-w-sm'} rounded-3xl p-8 ${panelClassName}`}>
        <LogoFull width={180} className="mx-auto mb-4" />
        <h1 className="mb-1 text-center text-lg font-extrabold">{title}</h1>
        <p className="mb-6 text-center text-sm text-secondary leading-6">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

function PasswordField({
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

export function RolePicker({ value, onChange }: { value: UserRole; onChange: (r: UserRole) => void }) {
  const roles: UserRole[] = ['contractor', 'consultant', 'owner']
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

function SetupScreen() {
  const setupFirstAccount = useAuthStore((s) => s.setupFirstAccount)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('contractor')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!fullName.trim()) return setError('نام و نام خانوادگی را وارد کنید')
    if (!username.trim()) return setError('نام کاربری را وارد کنید')
    if (password.length < 4) return setError('رمز عبور باید حداقل ۴ کاراکتر باشد')
    if (password !== confirm) return setError('رمز عبور و تکرار آن یکسان نیستند')
    setError('')
    await setupFirstAccount({ username: username.trim(), password, fullName: fullName.trim(), role })
  }

  return (
    <Shell title="راه‌اندازی اولین حساب کاربری" subtitle="این حساب اولین کاربر سامانه است — بعداً می‌توانید حساب‌های دیگر (پیمانکار، مشاور، کارفرما) را هم اضافه کنید" wide>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام و نام خانوادگی</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="مثلاً مهدی باجلان" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کاربری</span>
          <div className="relative">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input pl-9" placeholder="مثلاً admin" />
            <User size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
        <div>
          <p className="mb-1.5 text-xs text-secondary">نقش شما</p>
          <RolePicker value={role} onChange={setRole} />
        </div>
        <PasswordField label="رمز عبور" value={password} onChange={setPassword} placeholder="حداقل ۴ کاراکتر" />
        <PasswordField label="تکرار رمز عبور" value={confirm} onChange={setConfirm} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={submit}
          className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
        >
          ایجاد حساب و ورود
        </button>
        <p className="text-[11px] text-muted leading-5 pt-1">
          حساب‌ها به‌صورت محلی در همین مرورگر ذخیره می‌شوند. برای اینکه چند نفر روی دستگاه‌های مختلف با نقش‌های
          متفاوت کار کنند، از خروجی/ورودی JSON پروژه (کنار لیست پروژه‌ها) برای انتقال داده استفاده کنید.
        </p>
      </div>
    </Shell>
  )
}

type LoginStatus = 'idle' | 'submitting' | 'success' | 'error'

function LoginScreen() {
  const verifyPassword = useAuthStore((s) => s.verifyPassword)
  const commitLogin = useAuthStore((s) => s.commitLogin)
  const accounts = useAuthStore((s) => s.accounts)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<LoginStatus>('idle')
  const [exiting, setExiting] = useState(false)

  const busy = status === 'submitting' || status === 'success'

  const submit = async () => {
    if (busy) return
    setError('')
    setStatus('submitting')
    const ok = await verifyPassword(username.trim(), password)
    if (!ok) {
      setError('نام کاربری یا رمز عبور اشتباه است')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 450)
      return
    }
    setStatus('success')
    setTimeout(() => setExiting(true), 500)
    setTimeout(() => commitLogin(username.trim()), 850)
  }

  const fieldStateClass =
    status === 'success' ? '!border-green-400/70 !bg-green-500/10 !text-green-200' : status === 'error' ? 'auth-shake !border-red-400/70' : ''

  return (
    <Shell
      title="ورود به سامانه"
      subtitle={`سامانه پایش پیشرفت ایزومتریک لوله‌کشی${accounts.length ? ` — ${accounts.length} حساب فعال` : ''}`}
      panelClassName={exiting ? 'auth-card-exit' : ''}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کاربری</span>
          <div className="relative">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={busy}
              className={`input pl-9 transition-all duration-300 ${fieldStateClass}`}
              placeholder="نام کاربری"
              autoFocus
            />
            <User size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">رمز عبور</span>
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={busy}
              className={`input pl-9 transition-all duration-300 ${fieldStateClass}`}
              placeholder="رمز عبور"
            />
            <KeyRound size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
        {status === 'error' && error && <p className="text-xs text-red-400">{error}</p>}
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
            'ورود'
          )}
        </button>
      </div>
    </Shell>
  )
}
