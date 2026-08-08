import { useState } from 'react'
import { ShieldAlert, AlertTriangle, ArrowLeft, Sparkles, Clock3, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LogoFull } from '../common/Logo'
import type { ModuleKey } from '../../store/useModuleStore'

const GOLD = '#c9a227'

interface ModuleDef {
  key: ModuleKey
  title: string
  englishTag: string
  description: string
  icon: LucideIcon | null
  accent: string
  status: 'active' | 'soon'
}

const MODULES: ModuleDef[] = [
  {
    key: 'risk',
    title: 'مدیریت ریسک',
    englishTag: 'Risk Management',
    description: 'شناسایی، ارزیابی، پاسخ، پایش و تحلیل روند ریسک‌های پروژه — یک سامانه کنترل ریسک برای پروژه‌های EPC.',
    icon: ShieldAlert,
    accent: '#e74c3c',
    status: 'active',
  },
  {
    key: 'issues',
    title: 'مدیریت مسائل',
    englishTag: 'Issue Management',
    description: 'ثبت، پیگیری و حل مسائل و موانع اجرایی پروژه از بروز تا بسته‌شدن.',
    icon: AlertTriangle,
    accent: '#a78bfa',
    status: 'active',
  },
  {
    key: 'pipepulse',
    title: 'PipePulse',
    englishTag: 'Piping Progress Intelligence',
    description: 'پایش بصری، کنترل پیشرفت، برنامه‌ زمان‌بندی و گزارش‌دهی پروژه‌های پایپینگ.',
    icon: null,
    accent: '#0ea5e9',
    status: 'active',
  },
]

export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [notice, setNotice] = useState<string | null>(null)

  const handleSelect = (m: ModuleDef) => {
    if (m.status === 'active') {
      onEnterModule(m.key)
      return
    }
    setNotice(`ماژول «${m.title}» به‌زودی راه‌اندازی می‌شود`)
    window.clearTimeout((handleSelect as unknown as { t?: number }).t)
    ;(handleSelect as unknown as { t?: number }).t = window.setTimeout(() => setNotice(null), 2600)
  }

  return (
    <div className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden overflow-y-auto p-4 py-10" style={{ background: 'var(--bg-app)' }}>
      <div className="hub-blob hub-blob-a" style={{ background: '#0ea5e9' }} />
      <div className="hub-blob hub-blob-b" style={{ background: '#a78bfa' }} />
      <div className="hub-blob hub-blob-c" style={{ background: '#e74c3c' }} />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
        <div className="hub-fade-in mb-8 text-center" style={{ animationDelay: '0ms' }}>
          <LogoFull width={72} className="mx-auto mb-4 opacity-90" />
          <p className="text-xs font-bold tracking-[0.25em]" style={{ color: GOLD }}>
            PLATFORM SUITE
          </p>
          <h1 className="mt-2 text-xl font-extrabold sm:text-2xl">یک پلتفرم، سه ماژول حرفه‌ای مدیریت پروژه</h1>
          <p className="mt-2 text-sm text-secondary leading-7">برای ورود، یکی از ماژول‌های زیر را انتخاب کنید</p>
        </div>

        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-3">
          {MODULES.map((m, i) => (
            <ModuleCard key={m.key} module={m} index={i} onSelect={() => handleSelect(m)} />
          ))}
        </div>

        <button
          onClick={() => onEnterModule('admin')}
          className="hub-fade-in mt-6 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-secondary hover:bg-white/[0.07] hover:text-current transition-colors"
          style={{ animationDelay: '460ms' }}
        >
          <Users size={13} /> مدیریت کاربران — همه ماژول‌ها
        </button>

        <div
          className="hub-fade-in mt-10 flex flex-col items-center gap-0.5"
          style={{ animationDelay: '520ms' }}
        >
          <p style={{ fontFamily: "'Montserrat', sans-serif" }} className="text-sm font-extrabold tracking-tight text-brand-300">
            PipePulse<sup className="text-[9px] align-super">™</sup>
          </p>
          <p className="text-[10px] font-bold" style={{ color: GOLD }}>
            Developed &amp; Designed by Mahdi Bajelan
          </p>
        </div>
      </div>

      {notice && (
        <div className="hub-toast fixed bottom-8 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-[var(--bg-panel-solid)] px-5 py-2.5 text-xs font-medium shadow-2xl">
          <span className="flex items-center gap-2">
            <Clock3 size={14} className="text-brand-400" />
            {notice}
          </span>
        </div>
      )}
    </div>
  )
}

function ModuleCard({ module: m, index, onSelect }: { module: ModuleDef; index: number; onSelect: () => void }) {
  const Icon = m.icon

  return (
    <button
      onClick={onSelect}
      className="hub-fade-in hub-card group relative flex flex-col items-start overflow-hidden rounded-3xl border p-6 text-right transition-all duration-300"
      style={{
        animationDelay: `${120 + index * 130}ms`,
        borderColor: 'var(--border-soft)',
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-[0.10] blur-3xl transition-opacity duration-300 group-hover:opacity-20"
        style={{ background: m.accent }}
      />

      <div className="mb-4 flex w-full items-center justify-between">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${m.accent}1a`, borderColor: `${m.accent}44` }}
        >
          {Icon ? (
            <Icon size={22} style={{ color: m.accent }} />
          ) : (
            <LogoFull width={26} className="opacity-95" />
          )}
        </div>
        {m.status === 'active' ? (
          <span className="flex items-center gap-1 rounded-full border border-green-400/40 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold text-green-300">
            <Sparkles size={10} /> فعال
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-muted">
            <Clock3 size={10} /> به‌زودی
          </span>
        )}
      </div>

      <p style={{ fontFamily: m.key === 'pipepulse' ? "'Montserrat', sans-serif" : undefined }} className="text-base font-extrabold">
        {m.title}
      </p>
      <p className="mt-0.5 text-[10px] font-medium tracking-wide text-muted" dir="ltr">
        {m.englishTag}
      </p>
      <p className="mt-3 text-xs leading-6 text-secondary">{m.description}</p>

      <div className="mt-5 flex items-center gap-1.5 text-xs font-bold transition-all duration-300 group-hover:gap-2.5" style={{ color: m.accent }}>
        {m.status === 'active' ? 'ورود به ماژول' : 'مشاهده جزئیات'}
        <ArrowLeft size={14} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
      </div>
    </button>
  )
}
