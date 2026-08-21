import { useMemo } from 'react'
import type { Equipment3D, Joint } from '../../types'
import { DIM_COLOR, SPOOL_COMPLETE_COLOR } from '../../lib/model3dColoring'
import { JointInfoCard } from './JointInfoCard'

const JOINT_COLOR_DONE = '#2ecc71'
const JOINT_COLOR_PENDING = '#e74c3c'
const NODE_RADIUS = 15
const COL_SPACING = 92
const ROW_SPACING = 86
const PADDING_SIDE = 60
const PADDING_BOTTOM = 60
// Generous headroom above the first row — the detail card opens above whichever node was
// clicked, and without real room here it gets clipped by the scroll container's top edge (a
// scrollable box only grows to reveal overflow past its "far" edges, never above y=0).
const PADDING_TOP = 90
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
 * simple left/top math instead of a 3D-to-screen projection. Every connector is drawn strictly
 * horizontal or vertical (the snake layout never needs a diagonal), and rendered as a double-line
 * "pipe" stroke so turns read as elbows — real branch/tee topology (a joint spanning two lines, or
 * an equipment nozzle drawn as an actual T) isn't modeled yet, so it isn't drawn.
 */
export function WeldMap2D({ joints, lineLabel, equipment3d, selectedJointId, onSelectJoint, onEditJoint, editable }: WeldMap2DProps) {
  const { positions, width, height } = useMemo(() => {
    const pos = joints.map((_, i) => {
      const row = Math.floor(i / NODES_PER_ROW)
      const posInRow = i % NODES_PER_ROW
      const leftToRight = row % 2 === 0
      const col = leftToRight ? posInRow : NODES_PER_ROW - 1 - posInRow
      return { x: PADDING_SIDE + col * COL_SPACING, y: PADDING_TOP + row * ROW_SPACING }
    })
    const rows = Math.max(1, Math.ceil(joints.length / NODES_PER_ROW))
    return {
      positions: pos,
      width: PADDING_SIDE * 2 + (NODES_PER_ROW - 1) * COL_SPACING,
      height: PADDING_TOP + PADDING_BOTTOM + (rows - 1) * ROW_SPACING,
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
            const color = complete ? SPOOL_COMPLETE_COLOR : DIM_COLOR
            return (
              <g key={joint.id}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeOpacity={0.28} strokeWidth={9} strokeLinecap="round" />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              </g>
            )
          })}
          {joints.map((joint, i) => {
            const p = positions[i]
            const done = joint.status === 'completed'
            const selected = joint.id === selectedJointId
            return (
              <g key={joint.id} onClick={() => onSelectJoint(selected ? null : joint.id)} style={{ cursor: 'pointer' }}>
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
          <div className="absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)]" style={{ left: selectedPos.x, top: selectedPos.y }}>
            <JointInfoCard
              joint={selectedJoint}
              lineLabel={lineLabel}
              equipment3d={equipment3d}
              editable={editable}
              onEdit={() => onEditJoint(selectedJoint)}
              onClose={() => onSelectJoint(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
