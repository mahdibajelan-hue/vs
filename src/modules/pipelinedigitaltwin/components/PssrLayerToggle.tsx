import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { loadPssrLayer, PSSR_LAYER_LEGEND, type PssrLayerSpan } from '../../pssr/integration/layer'

/**
 * «لایهٔ آمادگی راه‌اندازی (PSSR)»: paints each commissioning system's stretch by its stage — from mechanical completion
 * to under gas — read from the PSSR module for the project in context. Systems without a chainage are named below.
 */
export function PssrLayerToggle({ on, onToggle, onSpans }: { on: boolean; onToggle: () => void; onSpans: (s: PssrLayerSpan[] | null) => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [spans, setSpans] = useState<PssrLayerSpan[]>([])

  useEffect(() => {
    if (!on) { onSpans(null); setNote(null); return }
    if (!projectId) { onSpans(null); setNote('ابتدا یک پروژه را از رادار انتخاب کنید.'); return }
    let alive = true
    setBusy(true)
    loadPssrLayer(projectId)
      .then((r) => {
        if (!alive) return
        if (!r || !r.spans.length) { onSpans(null); setSpans([]); setNote(r ? 'هیچ سیستم PSSR کیلومتر شروع ندارد.' : 'برای این پروژه هنوز سیستمی در ماژول PSSR تعریف نشده است.'); return }
        onSpans(r.spans); setSpans(r.spans)
        setNote(r.unplaced.length ? `بدون کیلومتر (روی خط نیست): ${r.unplaced.join('، ')}` : null)
      })
      .catch(() => { if (alive) { onSpans(null); setNote('خواندن داده‌های PSSR انجام نشد.') } })
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, projectId])

  const present = new Set(spans.map((s) => s.stage))
  return (
    <div className="glass-panel flex flex-col gap-1.5 rounded-xl px-3 py-2">
      <button onClick={onToggle} aria-pressed={on} className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: on ? '#f97316' : undefined }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} لایهٔ آمادگی راه‌اندازی (PSSR)
      </button>
      {on && spans.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[10px]">
            {PSSR_LAYER_LEGEND.filter((l) => present.has(l.stage)).map((l) => (
              <li key={l.stage} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: l.color }} />{l.label}</li>
            ))}
            <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: PSSR_GAP_COLOR }} />بدون سیستم</li>
          </ul>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[10px] text-secondary">
            {[...spans].sort((a, b) => a.startMeters - b.startMeters).map((s) => (
              <li key={s.code} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <b dir="ltr">{s.code}</b>
                <span className="num">کیلومتر {(s.startMeters / 1000).toLocaleString('fa-IR')}{s.endMeters - s.startMeters > 500 ? ` تا ${(s.endMeters / 1000).toLocaleString('fa-IR')}` : ''}</span>
                {s.openA > 0 && <span style={{ color: '#ef4444' }}>· {s.openA.toLocaleString('fa-IR')} پانچ A</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {on && note && <p className="m-0 text-[10px] text-muted">{note}</p>}
    </div>
  )
}

export const PSSR_GAP_COLOR = '#334155'
