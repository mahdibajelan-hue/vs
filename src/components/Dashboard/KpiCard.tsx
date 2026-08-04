import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  accent?: string
}

export function KpiCard({ label, value, sub, icon: Icon, accent = 'var(--color-brand-400)' }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${accent}1f`, color: accent }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-secondary truncate">{label}</p>
        <p className="text-xl font-extrabold num leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted num truncate">{sub}</p>}
      </div>
    </div>
  )
}
