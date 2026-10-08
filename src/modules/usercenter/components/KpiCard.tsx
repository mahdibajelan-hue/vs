import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { faNum } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

/** A colourful quick-filter tile: gradient icon, animated number, short caption. */
export function KpiCard({ icon: Icon, color, label, value, sub, pressed, onClick, index }: { icon: LucideIcon; color: string; label: string; value: number; sub: string; pressed: boolean; onClick: () => void; index: number }) {
  const n = useCountUp(value)
  return (
    <button className="uc-kpi" aria-pressed={pressed} onClick={onClick} style={{ '--k': color, '--i': index } as CSSProperties}>
      <span className="uc-kpi-icon"><Icon size={19} aria-hidden /></span>
      <span className="uc-kpi-label">{label}</span>
      <span className="uc-kpi-value">{faNum(n)}</span>
      <span className="uc-kpi-sub">{sub}</span>
    </button>
  )
}
