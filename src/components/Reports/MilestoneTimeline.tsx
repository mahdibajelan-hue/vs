import { useState } from 'react'
import { Pencil, Check, ShieldCheck } from 'lucide-react'
import type { Milestone } from '../../types'
import { useCurrentRole } from '../../store/useMembersStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useStore } from '../../store/useStore'
import { canEdit, canApprove, canAudit } from '../../lib/permissions'
import { MilestoneEditModal } from './MilestoneEditModal'
import { MilestoneAuditModal } from './MilestoneAuditModal'

const OWNER_GOLD = '#c9a227'

export function MilestoneTimeline({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const approveMilestoneAsConsultant = useStore((s) => s.approveMilestoneAsConsultant)
  const [showEdit, setShowEdit] = useState(false)
  const [auditingMilestone, setAuditingMilestone] = useState<Milestone | null>(null)

  if (milestones.length === 0) return null

  const canAuditMilestones = canAudit(role) || isAdmin

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

      <div className="flex items-start overflow-x-auto">
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
            <div className="flex flex-col items-center gap-1.5 px-1" style={{ minWidth: 106 }}>
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

              <div className="flex items-center gap-1">
                <ApprovalPill approved={!!m.consultantApprovedAt} label="مشاور" />
                <ApprovalPill approved={!!m.ownerReviewedAt} label="کارفرما" color={OWNER_GOLD} />
              </div>

              <div className="flex h-5 items-center gap-1">
                {canApprove(role) && !m.consultantApprovedAt && (
                  <button
                    onClick={() => approveMilestoneAsConsultant(projectId, m.id)}
                    className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-secondary hover:bg-white/5 transition-colors"
                    title="تایید مشاور"
                  >
                    <Check size={10} /> تایید
                  </button>
                )}
                {canAuditMilestones && m.consultantApprovedAt && (
                  <button
                    onClick={() => setAuditingMilestone(m)}
                    className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-secondary hover:bg-white/5 transition-colors"
                    title="ممیزی کارفرما"
                  >
                    <ShieldCheck size={10} /> ممیزی
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showEdit && <MilestoneEditModal projectId={projectId} milestones={milestones} onClose={() => setShowEdit(false)} />}
      {auditingMilestone && (
        <MilestoneAuditModal projectId={projectId} milestone={auditingMilestone} onClose={() => setAuditingMilestone(null)} />
      )}
    </div>
  )
}

function ApprovalPill({ approved, label, color = '#2ecc71' }: { approved: boolean; label: string; color?: string }) {
  return (
    <span
      className="flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] transition-colors"
      style={
        approved
          ? { background: `${color}22`, color, borderColor: `${color}55` }
          : { background: 'rgba(148,163,184,0.06)', color: 'var(--text-muted)', borderColor: 'var(--border-soft)' }
      }
    >
      {approved ? <Check size={9} /> : <span className="h-1.5 w-1.5 rounded-full border border-current" />}
      {label}
    </span>
  )
}
