import { useState } from 'react'
import { Award, BarChart3, Briefcase, Calculator, CheckCircle2, Radar as RadarIcon, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { SignOutButton } from './SignOutButton'
import { ProjectRadarPage } from './radar/ProjectRadarPage'

const GOLD = '#c9a227'

interface HomeCard {
  key: 'radar' | ModuleKey
  title: string
  englishTag: string
  teaser: string
  icon: LucideIcon
  accent: string
  hero?: boolean
}

/** The six top-level entry points (spec: strategic/cross-cutting modules live here; the
 * per-project operational modules — Risk, Issues, Finance, PipePulse, ... — live one level down,
 * inside Project Radar's own sidebar, scoped to whichever project the radar is showing). */
const HOME_CARDS: HomeCard[] = [
  {
    key: 'radar',
    title: 'رادار پروژه‌ها',
    englishTag: 'Project Radar',
    teaser: 'مرکز فرماندهی هر پروژه — سیگنال‌ها، چرخه عمر، گیت‌ها و قرارداد در یک نگاه',
    icon: RadarIcon,
    accent: 'var(--radar-green)',
    hero: true,
  },
  {
    key: 'executive',
    title: 'مدیریت پرتفولیو',
    englishTag: 'Portfolio Management',
    teaser: 'دید تجمیعی سلامت، ریسک و مالی کل سبد پروژه‌ها به تفکیک طرح و پورتفولیو',
    icon: Briefcase,
    accent: '#6366f1',
  },
  {
    key: 'reporting',
    title: 'گزارش هوشمند و تحلیل',
    englishTag: 'Intelligent Reporting',
    teaser: 'تجمیع زنده داده از همه ماژول‌ها، هشدار زودهنگام و مرکز تصمیم',
    icon: BarChart3,
    accent: '#2dd4bf',
  },
  {
    key: 'competency',
    title: 'ارزیابی شایستگی عوامل فنی',
    englishTag: 'Competency Assessment',
    teaser: 'مصاحبه ساختاریافته و امتیازدهی مدیران و عوامل فنی پروژه',
    icon: Award,
    accent: '#a855f7',
  },
  {
    key: 'estimator',
    title: 'برآورد پروژه‌ها',
    englishTag: 'Project Cost Estimator',
    teaser: 'ماشین‌حساب برآورد مالی EPC خط لوله، ساختار شکست هزینه و تحلیل حساسیت',
    icon: Calculator,
    accent: '#F2B705',
  },
  {
    key: 'admin',
    title: 'مدیریت کاربران',
    englishTag: 'User & Access Management',
    teaser: 'مدیریت کاربران، نقش‌ها و دسترسی یکپارچه به همه ماژول‌ها',
    icon: Users,
    accent: GOLD,
  },
]

export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [radarOpen, setRadarOpen] = useState(false)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  if (radarOpen) {
    return <ProjectRadarPage onBack={() => setRadarOpen(false)} onEnterModule={onEnterModule} />
  }

  const visibleCards = HOME_CARDS.filter((c) => c.key === 'radar' || hasModuleAccess(accessibleModules, c.key as ModuleKey))

  const handleSelect = (card: HomeCard) => {
    if (card.key === 'radar') {
      setRadarOpen(true)
      return
    }
    onEnterModule(card.key)
  }

  return (
    <div className="relative min-h-screen w-screen overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="hub-blob hub-blob-a" style={{ background: '#0ea5e9' }} />
      <div className="hub-blob hub-blob-b" style={{ background: '#a78bfa' }} />
      <div className="hub-blob hub-blob-c" style={{ background: '#e74c3c' }} />

      <header className="hub-grid-topbar hub-fade-in flex items-center justify-between border-b px-6 py-4 sm:px-10" style={{ borderColor: 'var(--border-soft)', animationDelay: '0ms' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'rgba(201,162,39,0.35)', background: 'rgba(201,162,39,0.08)' }}>
            <span className="rasta-wordmark text-base" style={{ fontWeight: 800 }}>
              R
            </span>
          </div>
          <div className="leading-tight">
            <p className="rasta-wordmark text-xl" style={{ fontWeight: 800 }}>
              RASTA
            </p>
            <p className="eyebrow-en" dir="ltr">
              Integrated Project Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <p className="text-xs font-bold tracking-[0.25em]" style={{ color: GOLD }}>
              PLATFORM SUITE
            </p>
            <div className="rasta-brokenline">
              <span className="rasta-brokenline-seg" />
              <span className="rasta-brokenline-dot" />
              <span className="rasta-brokenline-seg is-reverse" />
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <div className="hub-fade-in mb-10 text-center" style={{ animationDelay: '80ms' }}>
          <h1 className="text-3xl font-extrabold sm:text-4xl">پلتفرم یکپارچه مدیریت و کنترل پروژه</h1>
          <p className="eyebrow-en mt-2" dir="ltr">
            Unified Project Management & Control Platform
          </p>
          <p className="mt-3 text-sm text-secondary">یک محیط را برای ورود انتخاب کنید</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCards.map((card, i) => (
            <HomeModuleCard key={card.key} card={card} index={i} onSelect={() => handleSelect(card)} />
          ))}
        </div>

        <p className="hub-fade-in mt-12 text-center text-[11px] text-muted" style={{ animationDelay: '500ms' }}>
          © {new Date().getFullYear()} RASTA — Developed &amp; Designed by Mahdi Bajelan
        </p>
      </main>
    </div>
  )
}

function HomeModuleCard({ card, index, onSelect }: { card: HomeCard; index: number; onSelect: () => void }) {
  const Icon = card.icon
  return (
    <button
      onClick={onSelect}
      className={`hub-grid-card hub-fade-in group flex flex-col rounded-[1.25rem] border p-6 text-right ${card.hero ? 'sm:col-span-2 lg:col-span-3' : ''}`}
      style={{
        borderColor: card.hero ? 'color-mix(in srgb, var(--radar-green) 45%, var(--border-soft))' : 'var(--border-soft)',
        boxShadow: card.hero ? '0 0 32px color-mix(in srgb, var(--radar-green) 12%, transparent)' : undefined,
        animationDelay: `${120 + index * 70}ms`,
        // @ts-expect-error -- custom property consumed by .hub-grid-card:focus-visible
        '--card-accent': card.accent,
      }}
    >
      <div className="hub-grid-card-glow" style={{ background: card.accent }} />

      <div className="relative z-10 mb-4 flex items-start justify-between">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-110"
          style={{ background: `color-mix(in srgb, ${card.accent} 16%, transparent)`, borderColor: `color-mix(in srgb, ${card.accent} 40%, transparent)` }}
        >
          <Icon size={26} style={{ color: card.accent }} />
        </div>
        {card.hero && (
          <span
            className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold"
            style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 45%, transparent)', color: 'var(--radar-green)', background: 'color-mix(in srgb, var(--radar-green) 10%, transparent)' }}
          >
            <CheckCircle2 size={11} /> مرکز فرماندهی
          </span>
        )}
      </div>

      <p className="relative z-10 text-lg font-extrabold">{card.title}</p>
      <p className="eyebrow-en relative z-10 mt-0.5" dir="ltr">
        {card.englishTag}
      </p>
      <p className="relative z-10 mt-3 text-[12px] leading-6 text-secondary">{card.teaser}</p>
    </button>
  )
}
