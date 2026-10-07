import type { CSSProperties } from 'react'
import { Check, FileCheck2, NotebookPen, Plane, Send, UserCheck, Wallet, type LucideIcon } from 'lucide-react'
import { STEPS, STEP_OWNER, stepIndex } from '../lib/workflow'
import type { MissionStatus } from '../types'

/** One icon per workflow step (same order as STEPS): request · executive approval · tickets · visit & report · report approval · claim. */
const STEP_ICON: LucideIcon[] = [Send, UserCheck, Plane, NotebookPen, FileCheck2, Wallet]

/**
 * The mission's six-step timeline. Done = green with the step's own icon and a tick, current = accent (orange when the
 * mission was sent back), upcoming = quiet outline. Motion is state indication only: nodes and connectors stagger in once
 * on mount (transform/opacity), and the current step carries a slow ring. `compact` is the icon-only version for list rows.
 */
export function MissionTimeline({ status, compact }: { status: MissionStatus; compact?: boolean }) {
  const idx = stepIndex(status)
  if (idx < 0) return null
  const sentBack = status === 'returned' || status === 'revision_requested'
  return (
    <ol className={`ms-tl ${compact ? 'is-compact' : ''}`} aria-label="مراحل مأموریت">
      {STEPS.map((label, i) => {
        const state = i < idx ? 'done' : i === idx ? 'now' : 'todo'
        const Icon = STEP_ICON[i]
        return (
          <li
            key={label}
            className={`ms-tl-step is-${state} ${state === 'now' && sentBack ? 'is-warn' : ''}`}
            style={{ '--i': i } as CSSProperties}
            aria-current={state === 'now' ? 'step' : undefined}
            title={`${label} · ${STEP_OWNER[i]}`}
          >
            <span className="ms-tl-node">
              <Icon size={compact ? 12 : 17} aria-hidden />
              {state === 'done' && !compact && <span className="ms-tl-tick"><Check size={9} strokeWidth={3.5} aria-hidden /></span>}
            </span>
            {!compact && (
              <span className="ms-tl-label">
                {label}
                <small>{STEP_OWNER[i]}</small>
              </span>
            )}
            {i < STEPS.length - 1 && <span className="ms-tl-link" aria-hidden><i /></span>}
          </li>
        )
      })}
    </ol>
  )
}
