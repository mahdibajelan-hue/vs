import { useEffect, useState } from 'react'
import { Droplets, Loader2 } from 'lucide-react'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { HYDRO_LAYER_LEGEND, loadHydroLayer, type HydroLayerSpan } from '../../testing/integration/layer'

/**
 * «لایهٔ آزمون هیدرواستاتیک»: the line cut into its hydrotest sections (from the testing module), each painted by the
 * stage its test has reached — planned, cleaning, filling … accepted — and red when it failed.
 */
export function HydroLayerToggle({ on, onToggle, onSpans }: { on: boolean; onToggle: () => void; onSpans: (s: HydroLayerSpan[] | null) => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [spans, setSpans] = useState<HydroLayerSpan[]>([])

  useEffect(() => {
    if (!on) { onSpans(null); setNote(null); return }
    if (!projectId) { onSpans(null); setNote('ابتدا یک پروژه را از رادار انتخاب کنید.'); return }
    let alive = true
    setBusy(true)
    loadHydroLayer(projectId)
      .then((s) => {
        if (!alive) return
        if (!s) { onSpans(null); setSpans([]); setNote('قطعه‌بندی هیدروتست هنوز در ماژول آزمایش‌ها ذخیره نشده است.'); return }
        onSpans(s); setSpans(s); setNote(null)
      })
      .catch(() => { if (alive) { onSpans(null); setNote('خواندن داده‌های هیدروتست انجام نشد.') } })
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, projectId])

  const present = new Set<string>(spans.map((s) => (s.failed ? 'failed' : s.stage)))
  const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })
  return (
    <div className="glass-panel flex flex-col gap-1.5 rounded-xl px-3 py-2">
      <button onClick={onToggle} aria-pressed={on} className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: on ? '#0ea5e9' : undefined }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Droplets size={13} />} لایهٔ آزمون هیدرواستاتیک
      </button>
      {on && spans.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[10px]">
            {HYDRO_LAYER_LEGEND.filter((l) => present.has(l.key)).map((l) => (
              <li key={l.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />{l.label}</li>
            ))}
          </ul>
          <ul className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto p-0 text-[10px] text-secondary">
            {spans.map((s) => (
              <li key={s.code} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <b dir="ltr">{s.code}</b>
                <span className="num">کیلومتر {fa(s.startMeters / 1000)} تا {fa(s.endMeters / 1000)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {on && note && <p className="m-0 text-[10px] text-muted">{note}</p>}
    </div>
  )
}
