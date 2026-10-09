import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { IM_PRIORITY_LABEL_FA, type ImIssue, type ImIssuePriority, type ImStage } from '../types'
import { IM_STAGE_LABEL_FA, IM_STAGE_COARSE, stageOf } from '../lib/imModel'
import { resolutionSla, slaColor } from '../lib/imSla'
import { todayIso } from '../lib/issueRing'

export function StageChip({ stage }: { stage: ImStage }) {
  return <span className={`im-status-tag im-st-${IM_STAGE_COARSE[stage]}`}>{IM_STAGE_LABEL_FA[stage]}</span>
}

export function SeverityChip({ level }: { level: ImIssuePriority }) {
  return (
    <span className={`im-chip im-pr-${level}`}>
      <span className="im-chip-dot" style={{ background: 'currentColor' }} />
      {IM_PRIORITY_LABEL_FA[level]}
    </span>
  )
}

export function SlaBadge({ issue }: { issue: ImIssue }) {
  const r = resolutionSla(issue, todayIso())
  if (r.state === 'na') return null
  return (
    <span className="im-chip" style={{ color: slaColor(r.state) }} title={`${r.elapsedPct}٪ از مهلت مصرف شده`}>
      {r.label}
    </span>
  )
}

export function IssueCode({ issue }: { issue: ImIssue }) {
  return <span className="im-code">{issue.code ?? '—'}</span>
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div className="im-seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Kpi({ label, value, hint, tone, icon: Icon, color, index = 0 }: { label: string; value: ReactNode; hint?: string; tone?: 'bad' | 'good' | 'warn'; icon?: LucideIcon; color?: string; index?: number }) {
  const c = color ?? (tone === 'bad' ? 'var(--im-coral)' : tone === 'good' ? 'var(--im-mint)' : tone === 'warn' ? 'var(--im-amber)' : 'var(--im-accent)')
  return (
    <div className={`im-stat-card ${tone === 'bad' ? 'warn' : ''}`} title={hint} style={{ ['--c' as string]: c, ['--i' as string]: index }}>
      {Icon && <span className="im-stat-ico"><Icon size={16} aria-hidden /></span>}
      <div className="im-num" style={tone === 'good' ? { color: 'var(--im-mint)' } : tone === 'warn' ? { color: 'var(--im-amber)' } : undefined}>{value}</div>
      <div className="im-lbl">{label}</div>
    </div>
  )
}

export { stageOf }
