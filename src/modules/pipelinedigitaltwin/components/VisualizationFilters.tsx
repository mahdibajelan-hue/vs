import type { Joint, JointFinalStatus } from '../types'
import { FINAL_STATUS_COLOR, FINAL_STATUS_LABEL_FA } from '../lib/progressEngine'

const OPTIONS: (JointFinalStatus | 'all')[] = ['all', 'not_started', 'in_progress', 'ncr', 'completed']

interface VisualizationFiltersProps {
  joints: Joint[]
  value: JointFinalStatus | 'all'
  onChange: (v: JointFinalStatus | 'all') => void
}

/** Highlights joints matching one construction-status at a time on the 3D view — a real filter over the live joint data, not a separate display mode. */
export function VisualizationFilters({ joints, value, onChange }: VisualizationFiltersProps) {
  return (
    <div className="glass-panel flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl px-3 py-2">
      <FilterChip label="همه" color="#94a3b8" count={joints.length} active={value === 'all'} onClick={() => onChange('all')} />
      {OPTIONS.slice(1).map((status) => (
        <FilterChip
          key={status}
          label={FINAL_STATUS_LABEL_FA[status as JointFinalStatus]}
          color={FINAL_STATUS_COLOR[status as JointFinalStatus]}
          count={joints.filter((j) => j.finalStatus === status).length}
          active={value === status}
          onClick={() => onChange(status)}
        />
      ))}
    </div>
  )
}

function FilterChip({ label, color, count, active, onClick }: { label: string; color: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
      style={{ borderColor: active ? color : 'var(--border-soft)', background: active ? `${color}22` : 'transparent', color: active ? color : undefined }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
      <span className="num text-muted">{count}</span>
    </button>
  )
}
