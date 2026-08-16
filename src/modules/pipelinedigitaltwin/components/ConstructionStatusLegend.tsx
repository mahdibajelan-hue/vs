import { FINAL_STATUS_COLOR, FINAL_STATUS_LABEL_FA } from '../lib/progressEngine'
import type { JointFinalStatus } from '../types'

const ORDER: JointFinalStatus[] = ['completed', 'in_progress', 'ncr', 'not_started']

/** The 3D view's own real status palette (lib/progressEngine.ts) — never a separate decorative legend that could drift from what the pipe/joint colors actually mean. */
export function ConstructionStatusLegend() {
  return (
    <div className="absolute bottom-3 right-3 z-10 rounded-xl border border-white/10 bg-[rgba(10,14,20,0.82)] px-3 py-2.5 backdrop-blur-md">
      <p className="mb-1.5 text-[9px] font-bold tracking-wide text-secondary">وضعیت ساخت</p>
      <div className="space-y-1">
        {ORDER.map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-[10px] text-white/85">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FINAL_STATUS_COLOR[status] }} />
            {FINAL_STATUS_LABEL_FA[status]}
          </div>
        ))}
      </div>
    </div>
  )
}
