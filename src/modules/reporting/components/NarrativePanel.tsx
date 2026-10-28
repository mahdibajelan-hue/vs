import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import type { EvidenceReport } from '../lib/evidenceReport'
import { guardNarrative, narrativeItems, type NarrativeSentence } from '../lib/narrativeGuard'

/**
 * Optional machine phrasing of the report. Shown only when a model is configured; every sentence is checked by
 * guardNarrative (and by the edge function) — rejected sentences are counted, never shown. The engine's own text above
 * stays authoritative.
 */
export function NarrativePanel({ report, onAccepted }: { report: EvidenceReport; onAccepted?: (s: NarrativeSentence[]) => void }) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ accepted: NarrativeSentence[]; rejected: number } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    void supabase.functions.invoke('rp-narrate', { body: { task: 'ping' } }).then(({ data }) => setAvailable(!!(data as { available?: boolean } | null)?.available)).catch(() => setAvailable(false))
  }, [])
  useEffect(() => { setResult(null) }, [report])

  if (!available) return null
  const run = async () => {
    setBusy(true); setFailed(null)
    const items = narrativeItems(report)
    const { data, error } = await supabase.functions.invoke('rp-narrate', { body: { task: 'narrate', items } })
    setBusy(false)
    const d = data as { available?: boolean; sentences?: NarrativeSentence[]; rejected?: number; error?: string } | null
    if (error || !d?.available) { setFailed(error?.message ?? d?.error ?? 'بدون پاسخ'); return }
    const g = guardNarrative(d.sentences ?? [], items)
    setResult({ accepted: g.accepted, rejected: (d.rejected ?? 0) + g.rejected.length })
    onAccepted?.(g.accepted)
  }
  return (
    <div className="ev-ai">
      <header>
        <span className="flex items-center gap-1"><Sparkles size={13} /> جمله‌بندی ماشینی (پیشنهادی)</span>
        <button type="button" onClick={() => void run()} disabled={busy} className="flex items-center gap-1 rounded-lg border border-violet-400/40 px-2 py-1 text-[11px] font-bold text-violet-300 disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {result ? 'جمله‌بندی دوباره' : 'پیشنهاد جمله‌بندی'}
        </button>
      </header>
      {failed && <p className="mt-1 text-[11px] text-muted">سرویس جمله‌بندی پاسخ نداد ({failed})؛ متن موتور گزارش معتبر است.</p>}
      {result && (
        <>
          {result.accepted.length ? (
            <ul>{result.accepted.map((s, i) => <li key={i}>{s.text}<span className="ev-refs">[{s.refs.join(', ')}]</span></li>)}</ul>
          ) : <p className="mt-1 text-[11px] text-muted">هیچ جمله‌ای از کنترل عبور نکرد.</p>}
          <p className="mt-1.5 text-[10.5px] text-muted">هر جمله به شناسهٔ یافته‌ها ارجاع می‌دهد و فقط عددهای همان یافته‌ها را دارد. {result.rejected ? `${result.rejected.toLocaleString('fa-IR')} جملهٔ دیگر به‌خاطر عدد بی‌پشتوانه، ارجاع نادرست یا ادعای قطعی کنار گذاشته شد.` : ''} این متن جایگزین گزارش نیست.</p>
        </>
      )}
    </div>
  )
}
