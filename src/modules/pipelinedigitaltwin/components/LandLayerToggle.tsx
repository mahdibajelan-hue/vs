import { useEffect, useState } from 'react'
import { Loader2, Sprout } from 'lucide-react'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { LAND_LAYER_LEGEND, loadLandLayer, type LandLayerSpan } from '../../landacq/integration/layer'

/**
 * «لایهٔ تحصیل اراضی»: recolours the pipe by the land status of each stretch (free / acquiring / at risk / critical /
 * natural / governmental / needs review). The data comes from the Land Acquisition module for the project selected in the
 * platform context — the twin itself stores nothing about land.
 */
export function LandLayerToggle({ onSpans }: { onSpans: (s: LandLayerSpan[] | null) => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!on) { onSpans(null); setNote(null); return }
    if (!projectId) { onSpans(null); setNote('ابتدا یک پروژه را از رادار انتخاب کنید.'); return }
    let alive = true
    setBusy(true)
    loadLandLayer(projectId)
      .then((spans) => { if (!alive) return; onSpans(spans); setNote(spans ? null : 'برای این پروژه هنوز قطعه‌ای در ماژول تحصیل اراضی ثبت نشده است.') })
      .catch(() => { if (alive) { onSpans(null); setNote('خواندن داده‌های تحصیل اراضی انجام نشد.') } })
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, projectId])

  return (
    <div className="glass-panel flex flex-col gap-1.5 rounded-xl px-3 py-2">
      <button onClick={() => setOn((v) => !v)} aria-pressed={on} className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: on ? '#d6a24a' : undefined }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sprout size={13} />} لایهٔ تحصیل اراضی
      </button>
      {on && !note && (
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[10px]">
          {LAND_LAYER_LEGEND.map((l) => (
            <li key={l.status} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />{l.label}</li>
          ))}
        </ul>
      )}
      {on && note && <p className="m-0 text-[10px] text-muted">{note}</p>}
    </div>
  )
}
