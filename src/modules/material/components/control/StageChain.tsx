import type { ItemStage, StageDef } from '../../types'
import { STAGE_STATUS_LABEL_FA } from '../../types'
import { fmtD } from '../../../finance/components/fn'

/** The supply stages of one item as a row of chips: green approved, amber waiting for a decision, red rejected, dashed not applicable. A red bar marks a stage past its planned date. */
export function StageChain({ stages, defs, today, onPick }: { stages: ItemStage[]; defs: StageDef[]; today: string; onPick?: (s: ItemStage) => void }) {
  const order = new Map(defs.map((d) => [d.key, d]))
  const sorted = [...stages].filter((s) => order.has(s.stageKey)).sort((a, b) => order.get(a.stageKey)!.sort - order.get(b.stageKey)!.sort)
  return (
    <div className="mt-chain" role="list">
      {sorted.map((s) => {
        const d = order.get(s.stageKey)!
        const late = s.applicable && s.status !== 'approved' && !!s.plannedDate && s.plannedDate < today
        return (
          <button key={s.id} type="button" role="listitem" className={`mt-chip ${s.applicable ? s.status : 'na'}${late ? ' late' : ''}`} onClick={() => onPick?.(s)}
            title={`${d.title} — ${s.applicable ? STAGE_STATUS_LABEL_FA[s.status] : `غیرقابل‌اعمال: ${s.naReason}`}${s.plannedDate ? ` · برنامه ${fmtD(s.plannedDate)}` : ''}`}>
            <b>{d.title}</b>
            <span>{s.applicable ? `${s.weight.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪` : 'غیرقابل‌اعمال'}</span>
          </button>
        )
      })}
    </div>
  )
}
