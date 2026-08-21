import type { Milestone } from '../../types'

export function ReportMilestonesMini({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${milestones.length}, 1fr)` }}>
      {milestones.map((m) => (
        <div key={m.id} className="flex flex-col items-center text-center gap-1">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-extrabold" style={{ border: `2.5px solid ${m.color}`, color: m.color }}>
            {m.percentComplete}%
          </div>
          <p className="text-[9px] leading-tight" style={{ color: '#334155' }}>
            {m.label}
          </p>
        </div>
      ))}
    </div>
  )
}
