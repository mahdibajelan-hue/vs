import { forwardRef, useRef, useState } from 'react'
import { ShieldAlert, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Clock3, Users, BarChart3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../store/useModuleStore'

const GOLD = '#c9a227'

interface ModuleDef {
  key: ModuleKey
  title: string
  englishTag: string
  teaser: string
  description: string
  icon: LucideIcon
  accent: string
  status: 'active' | 'soon'
}

const MODULES: ModuleDef[] = [
  {
    key: 'risk',
    title: 'مدیریت ریسک',
    englishTag: 'Risk Management',
    teaser: 'شناسایی و کنترل ریسک‌های پروژه',
    description: 'شناسایی، ارزیابی، پاسخ، پایش و تحلیل روند ریسک‌های پروژه — یک سامانه کنترل ریسک برای پروژه‌های EPC.',
    icon: ShieldAlert,
    accent: '#e74c3c',
    status: 'active',
  },
  {
    key: 'issues',
    title: 'مدیریت مسائل',
    englishTag: 'Issue Management',
    teaser: 'پیگیری مسائل و موانع اجرایی',
    description: 'ثبت، پیگیری و حل مسائل و موانع اجرایی پروژه از بروز تا بسته‌شدن.',
    icon: AlertTriangle,
    accent: '#a78bfa',
    status: 'active',
  },
  {
    key: 'pipepulse',
    title: 'PipePulse',
    englishTag: 'Piping Progress Intelligence',
    teaser: 'پایش بصری پیشرفت پایپینگ',
    description: 'پایش بصری، کنترل پیشرفت، برنامه‌ زمان‌بندی و گزارش‌دهی پروژه‌های پایپینگ.',
    icon: Sparkles,
    accent: '#0ea5e9',
    status: 'active',
  },
  {
    key: 'reporting',
    title: 'گزارش‌گیری هوشمند',
    englishTag: 'Intelligent Reporting',
    teaser: 'گزارش‌های یکپارچه از همه ماژول‌ها',
    description: 'تجمیع داده از ریسک، مسائل، PipePulse و کاربران در گزارش‌های روزانه، هفتگی و مدیریتی — به‌زودی.',
    icon: BarChart3,
    accent: '#2dd4bf',
    status: 'soon',
  },
  {
    key: 'admin',
    title: 'مدیریت کاربران',
    englishTag: 'User Management',
    teaser: 'دسترسی کاربران در همه ماژول‌ها',
    description: 'تعریف کاربران، نقش‌ها و دسترسی آن‌ها در ریسک، مسائل و PipePulse — از یک محیط واحد.',
    icon: Users,
    accent: GOLD,
    status: 'active',
  },
]

export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const noticeTimer = useRef<number | undefined>(undefined)

  const activeIndex = hoverIndex ?? focusIndex

  const handleSelect = (m: ModuleDef) => {
    if (m.status === 'active') {
      onEnterModule(m.key)
      return
    }
    setNotice(`ماژول «${m.title}» به‌زودی راه‌اندازی می‌شود`)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  const focusCard = (index: number) => {
    const clamped = Math.max(0, Math.min(MODULES.length - 1, index))
    cardRefs.current[clamped]?.focus()
    cardRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  // Document is dir="rtl": the first card sits visually rightmost, so ArrowRight steps
  // toward the previous index (further right) and ArrowLeft steps toward the next one.
  const handleCarouselKeyDown = (e: React.KeyboardEvent) => {
    const current = focusIndex ?? 0
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusCard(current - 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusCard(current + 1)
    }
  }

  return (
    <div className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden overflow-y-auto p-4 py-10" style={{ background: 'var(--bg-app)' }}>
      <div className="hub-blob hub-blob-a" style={{ background: '#0ea5e9' }} />
      <div className="hub-blob hub-blob-b" style={{ background: '#a78bfa' }} />
      <div className="hub-blob hub-blob-c" style={{ background: '#e74c3c' }} />

      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center">
        <div className="hub-fade-in mb-9 flex flex-col items-center text-center" style={{ animationDelay: '0ms' }}>
          <p className="text-xs font-bold tracking-[0.3em]" style={{ color: GOLD }}>
            PLATFORM SUITE
          </p>
          <h1 className="rasta-wordmark mt-2 text-5xl sm:text-6xl">RASTA</h1>
          <p className="mt-3 text-base font-bold sm:text-lg">پلتفرم یکپارچه مدیریت و کنترل پروژه</p>

          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="rasta-brokenline">
              <span className="rasta-brokenline-seg" />
              <span className="rasta-brokenline-dot" />
              <span className="rasta-brokenline-seg is-reverse" />
            </div>
            <p dir="ltr" className="text-xs font-medium tracking-wide text-secondary sm:text-sm">
              From Data to Insight. From Insight to Action.
            </p>
          </div>

          <img
            src="/signature-mahdi.png"
            alt="Mahdi Bajelan"
            className="mt-6 h-auto w-28 opacity-85 sm:w-32"
            draggable={false}
          />
        </div>

        <div className="relative w-full">
          <button
            aria-label="ماژول قبلی"
            onClick={() => focusCard((focusIndex ?? 0) - 1)}
            className="hub-arrow-btn absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border p-2 sm:flex"
            style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}
          >
            <ChevronRight size={18} />
          </button>
          <button
            aria-label="ماژول بعدی"
            onClick={() => focusCard((focusIndex ?? 0) + 1)}
            className="hub-arrow-btn absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border p-2 sm:flex"
            style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}
          >
            <ChevronLeft size={18} />
          </button>

          <div
            className="hub-carousel px-1 sm:px-12"
            role="listbox"
            aria-label="ماژول‌های پلتفرم"
            onKeyDown={handleCarouselKeyDown}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {MODULES.map((m, i) => (
              <ModuleCard
                key={m.key}
                ref={(el) => {
                  cardRefs.current[i] = el
                }}
                module={m}
                index={i}
                isActive={activeIndex === i}
                isDimmed={activeIndex !== null && activeIndex !== i}
                onSelect={() => handleSelect(m)}
                onMouseEnter={() => setHoverIndex(i)}
                onFocus={() => setFocusIndex(i)}
                onBlur={() => setFocusIndex(null)}
              />
            ))}
          </div>
        </div>

        <p className="hub-fade-in mt-1 text-[11px] text-muted" style={{ animationDelay: '560ms' }}>
          © {new Date().getFullYear()} RASTA — Developed &amp; Designed by Mahdi Bajelan
        </p>
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

interface ModuleCardProps {
  module: ModuleDef
  index: number
  isActive: boolean
  isDimmed: boolean
  onSelect: () => void
  onMouseEnter: () => void
  onFocus: () => void
  onBlur: () => void
}

const PARTICLE_OFFSETS = [18, 42, 66, 86]

function ModuleCardImpl(
  { module: m, index, isActive, isDimmed, onSelect, onMouseEnter, onFocus, onBlur }: ModuleCardProps,
  ref: React.Ref<HTMLButtonElement>,
) {
  const Icon = m.icon

  return (
    <button
      ref={ref}
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`hub-fade-in hub-card-v2 ${isActive ? 'is-active' : ''} ${isDimmed ? 'is-dimmed' : ''} group overflow-hidden rounded-3xl border text-right`}
      style={{
        animationDelay: `${120 + index * 90}ms`,
        borderColor: isActive ? `${m.accent}55` : 'var(--border-soft)',
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        // @ts-expect-error -- custom property consumed by .hub-card-v2:focus-visible
        '--card-accent': m.accent,
      }}
    >
      <div className="hub-card-glow" style={{ background: m.accent }} />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)` }}
      />

      {isActive &&
        PARTICLE_OFFSETS.map((left, i) => (
          <span
            key={left}
            className="hub-particle"
            style={{ left: `${left}%`, background: m.accent, animationDelay: `${i * 0.5}s` }}
          />
        ))}

      {/* Separate element for the idle "breathing" animation — keeping it off the outer
          button avoids the CSS `animation` shorthand here clobbering the button's own
          `hub-fade-in` entrance animation (both would otherwise target the same property). */}
      <div className="hub-card-breathe flex h-full flex-col items-start p-6">
        <div className="mb-4 flex w-full items-center justify-between">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110"
            style={{ background: `${m.accent}1a`, borderColor: `${m.accent}44` }}
          >
            <Icon size={22} style={{ color: m.accent }} />
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
        <p className="mt-2 text-xs leading-6 text-secondary">{m.teaser}</p>

        <div className="hub-desc-reveal w-full">
          <div>
            <p className="pt-2 text-xs leading-6 text-secondary">{m.description}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs font-bold transition-all duration-300 group-hover:gap-2.5" style={{ color: m.accent }}>
          {m.status === 'active' ? 'ورود به ماژول' : 'مشاهده جزئیات'}
          <ArrowLeft size={14} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
        </div>
      </div>
    </button>
  )
}

const ModuleCard = forwardRef(ModuleCardImpl)
