import { useMemo } from 'react'
import { Pencil, X } from 'lucide-react'
import type { Equipment3D, Joint } from '../../types'
import { JOINT_TYPE_LABEL_FA } from '../../types'
import { formatJalali } from '../../lib/jalali'
import { DIM_COLOR, SPOOL_COMPLETE_COLOR } from '../../lib/model3dColoring'

const JOINT_COLOR_DONE = '#2ecc71'
const JOINT_COLOR_PENDING = '#e74c3c'
const NODE_RADIUS = 15
const COL_SPACING = 92
const ROW_SPACING = 86
const PADDING = 46
const NODES_PER_ROW = 7

interface WeldMap2DProps {
  /** Already filtered to one line and sorted by sequenceNumber. */
  joints: Joint[]
  lineLabel: string
  equipment3d: Equipment3D[]
  selectedJointId: string | null
  onSelectJoint: (jointId: string | null) => void
  onEditJoint: (joint: Joint) => void
  editable: boolean
}

/**
 * Auto-drawn 2D "weld map" for a line — a snake-laid-out chain of joint nodes connected by spool
 * segments, built entirely from joint order/status data (never from the 3D model's mesh geometry).
 * This is the fix for stations where the Navisworks export merges many spools into one mesh, making
 * mesh-based spool selection impossible: the diagram doesn't care what the underlying mesh looks
 * like, only which joints exist and their sequence. Node/edge pixel positions are plain SVG
 * coordinates (no responsive scaling), so the click-to-open detail card can anchor to a node with
 * simple left/top math instead of a 3D-to-screen projection.
 */
export function WeldMap2D({ joints, lineLabel, equipment3d, selectedJointId, onSelectJoint, onEditJoint, editable }: WeldMap2DProps) {
  const { positions, width, height } = useMemo(() => {
    const pos = joints.map((_, i) => {
      const row = Math.floor(i / NODES_PER_ROW)
      const posInRow = i % NODES_PER_ROW
      const leftToRight = row % 2 === 0
      const col = leftToRight ? posInRow : NODES_PER_ROW - 1 - posInRow
      return { x: PADDING + col * COL_SPACING, y: PADDING + row * ROW_SPACING }
    })
    const rows = Math.max(1, Math.ceil(joints.length / NODES_PER_ROW))
    return {
      positions: pos,
      width: PADDING * 2 + (NODES_PER_ROW - 1) * COL_SPACING,
      height: PADDING * 2 + (rows - 1) * ROW_SPACING,
    }
  }, [joints])

  if (joints.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted">هنوز اتصالی برای این خط ثبت نشده است</div>
  }

  const selectedIndex = selectedJointId ? joints.findIndex((j) => j.id === selectedJointId) : -1
  const selectedJoint = selectedIndex >= 0 ? joints[selectedIndex] : null
  const selectedPos = selectedIndex >= 0 ? positions[selectedIndex] : null

  return (
    <div className="relative h-full w-full overflow-auto rounded-2xl" style={{ background: '#11151c' }}>
      <div className="relative" style={{ width, height, margin: '0 auto' }}>
        <svg width={width} height={height} className="absolute inset-0">
          {joints.slice(0, -1).map((joint, i) => {
            const next = joints[i + 1]
            const p1 = positions[i]
            const p2 = positions[i + 1]
            const complete = joint.status === 'completed' && next.status === 'completed'
            return (
              <line
                key={joint.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={complete ? SPOOL_COMPLETE_COLOR : DIM_COLOR}
                strokeWidth={4}
                strokeLinecap="round"
              />
            )
          })}
          {joints.map((joint, i) => {
            const p = positions[i]
            const done = joint.status === 'completed'
            const selected = joint.id === selectedJointId
            return (
              <g
                key={joint.id}
                onClick={() => onSelectJoint(selected ? null : joint.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={selected ? NODE_RADIUS + 4 : NODE_RADIUS}
                  fill={done ? JOINT_COLOR_DONE : '#1c2230'}
                  stroke={selected ? '#ffffff' : done ? JOINT_COLOR_DONE : JOINT_COLOR_PENDING}
                  strokeWidth={selected ? 3 : 2.5}
                />
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={done ? '#0b1120' : '#e5e7eb'}>
                  {joint.jointNumber || joint.sequenceNumber}
                </text>
              </g>
            )
          })}
        </svg>

        {selectedJoint && selectedPos && (
          <div
            className="glass-panel absolute z-10 w-60 -translate-x-1/2 -translate-y-[calc(100%+16px)] rounded-2xl p-3 text-xs"
            style={{ left: selectedPos.x, top: selectedPos.y }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold">
                  {JOINT_TYPE_LABEL_FA[selectedJoint.jointType]} {selectedJoint.jointNumber || `#${selectedJoint.sequenceNumber}`}
                </p>
                <p className="text-[10px] text-muted">{lineLabel}</p>
              </div>
              <button onClick={() => onSelectJoint(null)} className="shrink-0 rounded-lg p-1 text-secondary hover:bg-white/10">
                <X size={13} />
              </button>
            </div>
            <span
              className="mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: selectedJoint.status === 'completed' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                color: selectedJoint.status === 'completed' ? JOINT_COLOR_DONE : JOINT_COLOR_PENDING,
              }}
            >
              {selectedJoint.status === 'completed' ? 'تکمیل شده' : 'شروع‌نشده'}
            </span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-secondary">
              <span>قطر: {selectedJoint.diameter || '—'}</span>
              <span>ضخامت: {selectedJoint.thickness || '—'}</span>
              {selectedJoint.completedDate && <span className="col-span-2">تاریخ تکمیل: {formatJalali(selectedJoint.completedDate)}</span>}
              {selectedJoint.connectedEquipmentId && (
                <span className="col-span-2">تجهیز: {equipment3d.find((e) => e.id === selectedJoint.connectedEquipmentId)?.tag ?? '—'}</span>
              )}
              {selectedJoint.notes && <span className="col-span-2 truncate">یادداشت: {selectedJoint.notes}</span>}
            </div>
            {editable && (
              <button
                onClick={() => onEditJoint(selectedJoint)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-brand-500/15 px-2 py-1.5 text-[10px] font-medium text-brand-300 hover:bg-brand-500/25"
              >
                <Pencil size={11} /> ویرایش اتصال
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
