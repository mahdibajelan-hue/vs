import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, BadgeCheck, Check, Eye, EyeOff, HeartHandshake, KeyRound, Mail, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_DESCRIPTION_FA, ROLE_LABEL_FA, type UserRole } from '../../types'
import { LogoFull } from '../common/Logo'

const LOGIN_COPY = {
  title: 'ورود به سامانه RASTA',
  titleEn: 'RASTA Login',
  subtitle:
    'پلتفرم یکپارچه مدیریت و کنترل پروژه‌های EPC — PipePulse، مدیریت ریسک، مدیریت مسائل و گزارش‌گیری هوشمند، همه از یک حساب کاربری.',
}

const ABOUT_CARDS = [
  {
    icon: Sparkles,
    title: 'درباره سامانه',
    titleEn: 'About RASTA',
    text: 'پلتفرم یکپارچه مدیریت و کنترل پروژه‌های EPC — از پایش اجرا تا ریسک، مسائل و تصمیم مدیریتی، در یک سامانه واحد.',
  },
  {
    icon: HeartHandshake,
    title: 'خدمات و پشتیبانی',
    titleEn: 'Support',
    text: 'پشتیبانی مستقیم توسعه‌دهنده برای رفع مشکلات، آموزش استفاده و توسعه قابلیت‌های جدید بر اساس نیاز پروژه.',
  },
  {
    icon: RefreshCw,
    title: 'به‌روزرسانی مستمر',
    titleEn: 'Continuous Updates',
    text: 'توسعه فعال و افزوده‌شدن پیوسته ماژول‌ها و قابلیت‌های تازه بر اساس بازخورد کاربران واقعی پروژه.',
  },
  {
    icon: ShieldCheck,
    title: 'طراحی و توسعه',
    titleEn: 'Design & Development',
    text: 'طراحی، معماری و توسعه توسط مهدی باجلان — اختصاصی برای نیازهای کنترل پروژه‌های زیرساختی و انرژی.',
  },
]

// مدیریت کاربران هر سه ماژول را کنترل می‌کند، پس فقط ادمین سامانه اجازه ورود دارد — کاربران
// دیگر همین‌جا رد و از سیستم خارج می‌شوند، نه فقط با یک پیام داخل صفحه. RootApp نمایشش می‌دهد
// وقتی activeModule === 'admin' و کاربر جاری ادمین نیست.
export function AdminOnlyBlock({ onBack }: { onBack: () => void }) {
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    signOut()
  }, [signOut])

  return (
    <Shell title="دسترسی محدود" subtitle="ورود به «مدیریت کاربران» فقط برای ادمین سامانه امکان‌پذیر است. در حال خروج خودکار از این حساب...">
      <button
        onClick={onBack}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-secondary hover:bg-white/5 transition-colors"
      >
        <ArrowRight size={15} /> بازگشت به ماژول‌ها
      </button>
    </Shell>
  )
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
  label: ReactNode
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

export function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [exiting, setExiting] = useState(false)

  const busy = status === 'submitting' || status === 'success'
  const copy = LOGIN_COPY

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
    <div className={`auth-split-shell ${exiting ? 'auth-card-exit' : ''}`}>
      <div className="auth-form-panel">
        <div className={`glass-panel w-full max-w-sm rounded-3xl p-8 ${status === 'error' ? 'auth-panel-error' : status === 'success' ? 'auth-panel-success' : ''}`}>
          <LogoFull width={170} className="mx-auto mb-4" />
          <div className="mb-1 flex items-center justify-center gap-1.5">
            <BadgeCheck size={14} className="text-brand-400" />
            <h1 className="text-center text-lg font-extrabold">{copy.title}</h1>
          </div>
          <p className="eyebrow-en mb-3 text-center" dir="ltr">
            {copy.titleEn}
          </p>
          <p className="mb-6 text-center text-sm text-secondary leading-6">{copy.subtitle}</p>

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
                  disabled={busy}
                  className={`input pl-9 transition-all duration-300 ${fieldStateClass}`}
                  placeholder="person@example.com"
                  dir="ltr"
                  autoFocus
                />
                <Mail size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              </div>
            </label>
            <PasswordField
              label={
                <span className="flex items-baseline gap-1.5">
                  رمز عبور <span className="eyebrow-en" dir="ltr">/ Password</span>
                </span>
              }
              value={password}
              onChange={setPassword}
              placeholder="حداقل ۶ کاراکتر"
            />
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
                  <Check size={16} className="auth-success-check" /> ورود با موفقیت انجام شد
                </>
              ) : status === 'submitting' ? (
                'در حال بررسی...'
              ) : (
                <>
                  <KeyRound size={15} /> ورود <span className="eyebrow-en" dir="ltr">/ Sign In</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-6 flex flex-col items-center gap-0.5 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="rasta-wordmark text-lg" style={{ fontWeight: 800 }}>
              RASTA
            </p>
            <p className="text-[10px] font-bold" style={{ color: '#c9a227' }}>
              Developed &amp; Designed by Mahdi Bajelan
            </p>
          </div>
        </div>
      </div>

      <AuthIntroPanel />
    </div>
  )
}

function AuthIntroPanel() {
  return (
    <div className="auth-intro-panel">
      <div className="hub-blob hub-blob-a" style={{ background: '#0ea5e9' }} />
      <div className="hub-blob hub-blob-b" style={{ background: '#c9a227' }} />

      <div className="relative z-10 mx-auto w-full max-w-lg">
        <p className="eyebrow-en" style={{ color: '#c9a227' }}>
          Integrated Project Management Platform
        </p>
        <h2 className="rasta-wordmark mt-1.5 text-4xl">RASTA</h2>
        <p className="mt-3 text-lg font-extrabold leading-8">پلتفرم یکپارچه مدیریت و کنترل پروژه‌های EPC</p>
        <p className="mt-2.5 text-sm leading-7 text-secondary">
          از پایش بصری پیشرفت اجرا (PipePulse) تا مدیریت ریسک، پیگیری مسائل اجرایی و گزارش‌گیری هوشمند مدیریتی — همه در یک پلتفرم واحد و متصل به هم، طراحی‌شده برای پروژه‌های زیرساختی و انرژی.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ABOUT_CARDS.map(({ icon: Icon, title, titleEn, text }) => (
            <div key={titleEn} className="auth-about-card">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-400/30 bg-brand-500/10">
                  <Icon size={15} className="text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="eyebrow-en" dir="ltr">
                    {titleEn}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-secondary">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-center gap-2">
          <div className="rasta-brokenline">
            <span className="rasta-brokenline-seg" />
            <span className="rasta-brokenline-dot" />
            <span className="rasta-brokenline-seg is-reverse" />
          </div>
          <p dir="ltr" className="text-xs font-medium tracking-wide text-secondary">
            From Data to Insight. From Insight to Action.
          </p>
        </div>
      </div>
    </div>
  )
}
