import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Circle, Info, type LucideIcon } from 'lucide-react'
import { SEMANTIC_TONE_COLOR, type SemanticTone } from '../types'

const TONE_ICON: Record<SemanticTone, LucideIcon> = {
  good: CheckCircle2,
  attention: AlertTriangle,
  critical: AlertOctagon,
  info: Info,
  neutral: Circle,
}

const TONE_LABEL_FA: Record<SemanticTone, string> = {
  good: 'روی برنامه',
  attention: 'نیازمند توجه',
  critical: 'بحرانی',
  info: 'اطلاعاتی',
  neutral: 'خنثی',
}

/** Icon + label + color together, per the spec's "never rely on color alone" rule. */
export function ToneBadge({ tone, label }: { tone: SemanticTone; label?: string }) {
  const Icon = TONE_ICON[tone]
  const color = SEMANTIC_TONE_COLOR[tone]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
      style={{ color, borderColor: `${color}55`, background: `${color}15` }}
    >
      <Icon size={11} />
      {label ?? TONE_LABEL_FA[tone]}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  sublabel,
  tone = 'neutral',
  trend,
}: {
  label: string
  value: ReactNode
  sublabel?: string
  tone?: SemanticTone
  trend?: string
}) {
  const color = SEMANTIC_TONE_COLOR[tone]
  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold" style={{ color }}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <ToneBadge tone={tone} />
        {trend && <span className="text-[10px] text-muted">{trend}</span>}
      </div>
      {sublabel && <p className="mt-1 text-[10px] text-muted">{sublabel}</p>}
    </div>
  )
}

export function WidgetShell({ title, subtitle, children, dense }: { title: string; subtitle?: string; children: ReactNode; dense?: boolean }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-0.5 text-sm font-bold">{title}</p>
      {subtitle && <p className="mb-3 text-[11px] text-muted">{subtitle}</p>}
      <div className={dense ? 'mt-2' : 'mt-3'}>{children}</div>
    </div>
  )
}

export function EmptyWidgetState({ text }: { text: string }) {
  return <div className="flex h-24 items-center justify-center text-center text-xs text-muted">{text}</div>
}

export function UnmappedNotice({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 text-center">
      <p className="text-xs text-muted">این پروژه به {moduleLabel} نگاشت نشده است</p>
      <p className="text-[10px] text-muted">از بخش «نگاشت پروژه‌ها» در داده پایه اقدام کنید</p>
    </div>
  )
}
