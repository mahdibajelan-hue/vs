import type { ProjectGate, ProjectStage } from '../types'
import { GATE_STATUS_LABEL_FA, STAGE_LABEL_FA, type StageKey } from '../types'
import { STATUS_COLOR } from './ui'

/** The lifecycle strip: IDEA → PRE-PROJECT → … → CLOSE-OUT with the current stage highlighted.
 *
 * Scrolls horizontally rather than wrapping — eleven stages wrapped onto three lines stop reading
 * as a sequence, which is the one thing this component exists to communicate. */
export function LifecycleStepper({
  stages, currentStageKey, gates, onSelectStage, selectedStageKey,
}: {
  stages: ProjectStage[]
  currentStageKey: string
  gates: ProjectGate[]
  onSelectStage?: (stageKey: string) => void
  selectedStageKey?: string
}) {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence)
  const currentIndex = ordered.findIndex((s) => s.stageKey === currentStageKey)

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch gap-1">
        {ordered.map((stage, i) => {
          const isCurrent = stage.stageKey === currentStageKey
          const isPast = currentIndex >= 0 && i < currentIndex
          const isSelected = selectedStageKey === stage.stageKey
          const gate = gates.find((g) => g.stageKey === stage.stageKey)

          const bg = isCurrent
            ? 'rgba(59,130,246,0.14)'
            : isPast
              ? 'rgba(12,163,12,0.10)'
              : 'transparent'
          const borderColor = isSelected
            ? '#3b82f6'
            : isCurrent
              ? 'rgba(59,130,246,0.55)'
              : 'var(--border-soft)'

          return (
            <li key={stage.stageKey} className="min-w-[104px] flex-1">
              <button
                type="button"
                onClick={() => onSelectStage?.(stage.stageKey)}
                className="h-full w-full rounded-lg border px-2 py-2 text-right transition-colors hover:brightness-110"
                style={{ background: bg, borderColor, cursor: onSelectStage ? 'pointer' : 'default' }}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="text-[9px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                  {gate && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      title={`${gate.name} — ${GATE_STATUS_LABEL_FA[gate.status]}`}
                      style={{
                        background:
                          gate.status === 'approved' ? STATUS_COLOR.green
                          : gate.status === 'blocked' || gate.status === 'rejected' ? STATUS_COLOR.red
                          : gate.status === 'ready' ? '#3b82f6'
                          : STATUS_COLOR.yellow,
                      }}
                    />
                  )}
                </div>
                <div className={`truncate text-[11px] leading-tight ${isCurrent ? 'font-extrabold' : 'font-medium'}`}>
                  {stage.nameFa || STAGE_LABEL_FA[stage.stageKey as StageKey] || stage.stageKey}
                </div>
                {isCurrent && <div className="mt-0.5 text-[9px] text-brand-400">مرحله جاری</div>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
