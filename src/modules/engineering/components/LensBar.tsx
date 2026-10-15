import { useMemo, useState } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { LENS_LABEL_FA, lensOf, type EngLens } from '../lib/roles'

/** The viewer's lens (contractor / consultant / employer) from their project roles; a manager can preview any lens. */
export function useLens(projectId: string): { lens: EngLens; real: EngLens; setLens: (l: EngLens) => void; canSwitch: boolean } {
  const all = useExecutionStore((s) => s.roles)
  const uid = useAuthStore((s) => s.profile?.id)
  const admin = useAuthStore((s) => !!s.profile?.isAdmin)
  const real = useMemo(() => admin ? 'manager' as EngLens : lensOf(all.filter((r) => r.projectId === projectId && r.userId === uid && r.active).map((r) => r.role)), [all, uid, projectId, admin])
  const [pick, setPick] = useState<EngLens | null>(null)
  const canSwitch = real === 'manager'
  return { lens: canSwitch && pick ? pick : real, real, setLens: setPick, canSwitch }
}

export function LensBar({ lens, setLens, canSwitch, real }: { lens: EngLens; setLens: (l: EngLens) => void; canSwitch: boolean; real: EngLens }) {
  const opts: EngLens[] = ['contractor', 'consultant', 'employer', 'manager']
  return (
    <div className="mt-pills no-print" role="tablist" aria-label="نمای نقش">
      <span className="im-helper" style={{ margin: 0, alignSelf: 'center' }}>نمای {canSwitch ? 'آزمایشی نقش' : 'شما'}:</span>
      {canSwitch ? opts.map((o) => <button key={o} role="tab" aria-selected={lens === o} className={`mt-pill${lens === o ? ' on' : ''}`} onClick={() => setLens(o)}>{LENS_LABEL_FA[o]}</button>) : <span className="mt-pill on">{LENS_LABEL_FA[real]}</span>}
    </div>
  )
}
