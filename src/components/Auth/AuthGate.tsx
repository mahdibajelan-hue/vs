import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

export function AuthGate({ children }: { children: ReactNode }) {
  const isSetup = useAuthStore((s) => s.isSetup)
  const isAuthed = useAuthStore((s) => s.isAuthed)

  if (!isSetup) return <SetupScreen />
  if (!isAuthed) return <LoginScreen />
  return <>{children}</>
}

function Shell({ icon: Icon, title, subtitle, children }: { icon: typeof Lock; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30">
          <Icon size={24} />
        </div>
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

function SetupScreen() {
  const setup = useAuthStore((s) => s.setup)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!username.trim()) return setError('نام کاربری را وارد کنید')
    if (password.length < 4) return setError('رمز عبور باید حداقل ۴ کاراکتر باشد')
    if (password !== confirm) return setError('رمز عبور و تکرار آن یکسان نیستند')
    setError('')
    await setup(username.trim(), password)
  }

  return (
    <Shell icon={ShieldCheck} title="راه‌اندازی حساب کاربری" subtitle="برای اولین بار، یک نام کاربری و رمز عبور برای این سامانه انتخاب کنید">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کاربری</span>
          <div className="relative">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input pl-9" placeholder="مثلاً admin" />
            <User size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
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
          این قفل به‌صورت محلی در همین مرورگر ذخیره می‌شود و برای جلوگیری از دسترسی تصادفی دیگران است، نه یک سامانه امنیتی سازمانی.
        </p>
      </div>
    </Shell>
  )
}

function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const storedUsername = useAuthStore((s) => s.username)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    const ok = await login(username.trim(), password)
    if (!ok) setError('نام کاربری یا رمز عبور اشتباه است')
  }

  return (
    <Shell icon={Lock} title="ورود به سامانه" subtitle={`سامانه پایش پیشرفت ایزومتریک لوله‌کشی${storedUsername ? ` — ${storedUsername}` : ''}`}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کاربری</span>
          <div className="relative">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="input pl-9"
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
              className="input pl-9"
              placeholder="رمز عبور"
            />
            <KeyRound size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={submit}
          className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
        >
          ورود
        </button>
      </div>
    </Shell>
  )
}
