import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { Milestone } from '../../types'
import { useCurrentRole } from '../../store/useMembersStore'
import { canEdit } from '../../lib/permissions'
import { MilestoneEditModal } from './MilestoneEditModal'

export function MilestoneTimeline({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const role = useCurrentRole()
  const [showEdit, setShowEdit] = useState(false)

  if (milestones.length === 0) return null

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold">مراحل کلی پروژه (Milestones)</p>
        {canEdit(role) && (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
          >
            <Pencil size={13} /> ویرایش مراحل
          </button>
        )}
      </div>

      <div className="flex items-start">
        {milestones.map((m, i) => (
          <div key={m.id} className="flex flex-1 items-start">
            {i > 0 && (
              <div
                className="mt-8 h-[3px] flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${milestones[i - 1].color}, ${m.color})`,
                  opacity: 0.7,
                }}
              />
            )}
            <div className="flex flex-col items-center gap-2 px-1" style={{ minWidth: 96 }}>
              <div
                className="relative h-16 w-16 rounded-full shrink-0"
                style={{
                  background: `conic-gradient(${m.color} ${m.percentComplete * 3.6}deg, rgba(148,163,184,0.15) 0deg)`,
                }}
              >
                <div
                  className="absolute inset-[3px] rounded-full flex items-center justify-center"
                  style={{ background: 'var(--bg-panel-solid)' }}
                >
                  <span className="text-sm font-extrabold num" style={{ color: m.color }}>
                    {m.percentComplete}%
                  </span>
                </div>
              </div>
              <p className="text-center text-xs font-medium leading-5">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {showEdit && <MilestoneEditModal projectId={projectId} milestones={milestones} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
