import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_DESCRIPTION_FA, ROLE_LABEL_FA, type UserRole } from '../../types'
import { LogoFull } from '../common/Logo'

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

