import type { CSSProperties, ReactNode } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  ClipboardCheck,
  Compass,
  Eye,
  Gavel,
  Handshake,
  HardHat,
  ListChecks,
  OctagonAlert,
  Package,
  Paperclip,
  Ruler,
  ShieldCheck,
  Target,
  TriangleAlert,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { FINDING_KIND_SHORT, MISSION_STATUS_LABEL, MISSION_STATUS_TONE, PRIORITY_LABEL, type FindingKind, type MissionStatus, type Priority, type Tone } from '../types'
import { faNum } from '../lib/fa'

export const KIND_ICON: Record<FindingKind, LucideIcon> = {
  issue: OctagonAlert,
  risk: TriangleAlert,
  action: ClipboardCheck,
  commitment: Handshake,
  decision: Gavel,
  progress: TrendingUp,
  observation: Eye,
}

export const TOPIC_ICON: Record<string, LucideIcon> = {
  Compass, TrendingUp, Ruler, Package, HardHat, ShieldCheck, BadgeCheck, AlertTriangle: TriangleAlert, Handshake, Target, ListChecks, Paperclip,
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  info: 'ms-pill-info',
  warn: 'ms-pill-warn',
  bad: 'ms-pill-bad',
  good: 'ms-pill-good',
  accent: 'ms-pill-accent',
}

export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`ms-pill ${TONE_CLASS[tone]}`} title={title}>
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: MissionStatus }) {
  return <Pill tone={MISSION_STATUS_TONE[status]}>{MISSION_STATUS_LABEL[status]}</Pill>
}

export function KindBadge({ kind, compact }: { kind: FindingKind; compact?: boolean }) {
  const Icon = KIND_ICON[kind]
  return (
    <span className={`ms-pill ms-pill-kind ms-k-${kind}`}>
      <Icon size={12} aria-hidden />
      {compact ? null : FINDING_KIND_SHORT[kind]}
    </span>
  )
}

const SEV_COLOR: Record<Priority, string> = { low: 'var(--ms-teal)', medium: 'var(--ms-warn)', high: 'var(--ms-orange)', critical: 'var(--ms-bad)' }

export function SeverityDot({ severity, withLabel }: { severity: Priority; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: SEV_COLOR[severity] }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: SEV_COLOR[severity] }} aria-hidden />
      {withLabel ? PRIORITY_LABEL[severity] : <span className="sr-only">{PRIORITY_LABEL[severity]}</span>}
    </span>
  )
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`ms-card ${className}`} style={style}>
      {children}
    </section>
  )
}

export function SectionHead({ eyebrow, title, action, sub }: { eyebrow?: string; title: string; action?: ReactNode; sub?: string }) {
  return (
    <header className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="ms-eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-[15px] font-extrabold leading-7">{title}</h2>
        {sub && <p className="ms-muted mt-0.5 text-[11.5px] leading-6">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="ms-label">{label}</label>
      {children}
      {hint && <p className="ms-hint">{hint}</p>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>
        <Icon size={22} aria-hidden />
      </span>
      <p className="text-[14px] font-extrabold">{title}</p>
      {text && <p className="ms-ink2 max-w-sm text-[12.5px] leading-7">{text}</p>}
      {action}
    </div>
  )
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div role="alert" className="mx-auto mb-3 flex max-w-6xl items-start gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'color-mix(in srgb, var(--ms-bad) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-bad) 40%, transparent)' }}>
      <AlertCircle size={16} className="mt-1 shrink-0" style={{ color: 'var(--ms-bad)' }} aria-hidden />
      <p className="flex-1 leading-7">{message}</p>
      <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={onClose}>
        بستن
      </button>
    </div>
  )
}

/** A dashboard number. `plain` is the neutral default; `alert` takes its hue only while there is something to see
 *  (value > 0); `hero` is the one big number of the page, in the accent colour. */
export function Kpi({ label, value, sub, onClick, icon: Icon, hue, variant = 'plain', attn }: { label: string; value: ReactNode; sub?: string; onClick?: () => void; icon?: LucideIcon; hue?: string; variant?: 'plain' | 'alert' | 'hero'; attn?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`ms-kpi ${variant === 'alert' ? 'is-alert' : variant === 'hero' ? 'is-hero' : ''}`} style={{ '--h': hue ?? 'var(--ms-accent)' } as CSSProperties}>
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-1.5">
          <span className="ms-kpi-label text-[12px] font-bold leading-5">{label}</span>
          {attn && <span className="ms-kpi-dot" aria-label="نیازمند اقدام" />}
        </span>
        {Icon && <span className="ms-kpi-badge"><Icon size={16} aria-hidden /></span>}
      </span>
      <span className="ms-kpi-value mt-1 text-[28px] font-black leading-9">
        {value}
      </span>
      {sub && <span className="ms-kpi-sub text-[11px] font-medium leading-5">{sub}</span>}
    </Tag>
  )
}

/** Circular score gauge, 0-100. */
export function ScoreGauge({ value, size = 96, label, neutral }: { value: number | null; size?: number; label?: string; neutral?: boolean }) {
  const stroke = Math.max(6, Math.round(size / 11))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  const color = value == null ? 'var(--ms-muted)' : neutral ? 'var(--ms-accent)' : v >= 80 ? 'var(--ms-good)' : v >= 60 ? 'var(--ms-warn)' : 'var(--ms-bad)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'امتیاز'} ${value == null ? 'نامشخص' : faNum(Math.round(v))} از ۱۰۰`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle className="ms-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-black" style={{ fontSize: size * 0.3, color }}>
          {value == null ? '—' : faNum(Math.round(v))}
        </span>
        {label && (
          <span className="ms-muted mt-1 font-bold" style={{ fontSize: Math.max(9, size * 0.11) }}>
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

export function Meter({ value, tone }: { value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const bg = tone === 'good' ? 'var(--ms-good)' : tone === 'warn' ? 'var(--ms-warn)' : tone === 'bad' ? 'var(--ms-bad)' : 'var(--ms-accent)'
  return (
    <div className="ms-bar" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: bg }} />
    </div>
  )
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/)
  const ini = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold" style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)', border: '1px solid color-mix(in srgb, var(--ms-accent) 35%, transparent)' }} aria-hidden>
      {ini || '؟'}
    </span>
  )
}
