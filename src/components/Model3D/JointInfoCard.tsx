import { Pencil, X } from 'lucide-react'
import type { Equipment3D, Joint } from '../../types'
import { JOINT_TYPE_LABEL_FA } from '../../types'
import { formatJalali } from '../../lib/jalali'

const DONE_COLOR = '#2ecc71'
const PENDING_COLOR = '#e74c3c'

interface JointInfoCardProps {
  joint: Joint
  lineLabel: string
  equipment3d: Equipment3D[]
  editable: boolean
  onEdit: () => void
  onClose: () => void
}

/**
 * The click-to-open joint popup, shared between the 3D view and the 2D weld map so both stay
 * visually identical. Deliberately a single-line, narrow strip rather than a boxy multi-row card —
 * every field is squeezed onto one row separated by middle-dots, tinted by status (green/red at low
 * opacity) so the status reads at a glance without needing a legend. Notes are left out entirely;
 * "edit" is the way to see/change everything, this is just a fast glance.
 */
export function JointInfoCard({ joint, lineLabel, equipment3d, editable, onEdit, onClose }: JointInfoCardProps) {
  const done = joint.status === 'completed'
  const color = done ? DONE_COLOR : PENDING_COLOR
  const equipmentTag = joint.connectedEquipmentId ? (equipment3d.find((e) => e.id === joint.connectedEquipmentId)?.tag ?? null) : null

  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] shadow-lg backdrop-blur-md"
      style={{ background: done ? 'rgba(46,204,113,0.14)' : 'rgba(231,76,60,0.14)', border: `1px solid ${color}66` }}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="font-bold text-white">
        {JOINT_TYPE_LABEL_FA[joint.jointType]} {joint.jointNumber || `#${joint.sequenceNumber}`}
      </span>
      <Sep />
      <span className="text-white/75">{lineLabel}</span>
      {joint.diameter && (
        <>
          <Sep />
          <span className="num text-white/75">Ø{joint.diameter}</span>
        </>
      )}
      <Sep />
      <span className="font-medium" style={{ color }}>
        {done ? 'تکمیل شده' : 'شروع‌نشده'}
      </span>
      {done && joint.completedDate && (
        <>
          <Sep />
          <span className="num text-white/75">{formatJalali(joint.completedDate)}</span>
        </>
      )}
      {equipmentTag && (
        <>
          <Sep />
          <span className="text-white/75">{equipmentTag}</span>
        </>
      )}
      {editable && (
        <button onClick={onEdit} className="mr-0.5 shrink-0 rounded p-0.5 text-white/80 hover:bg-white/20">
          <Pencil size={10} />
        </button>
      )}
      <button onClick={onClose} className="shrink-0 rounded p-0.5 text-white/80 hover:bg-white/20">
        <X size={10} />
      </button>
    </div>
  )
}

function Sep() {
  return <span className="text-white/25">·</span>
}
