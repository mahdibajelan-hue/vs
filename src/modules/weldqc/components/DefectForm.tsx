import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { DEFAULT_PASS, DEFECT_FA, DEFECT_TYPES, PASS_FA, type DefectType, type Pass } from '../lib/rules'
import { PASSES } from '../lib/analytics'
import type { QcWeld } from '../repo'
import { useQc } from '../lib/useQc'

export interface DefectDraft { type: DefectType; lengthMm: string; depthMm: string; positionMm: string; pass: Pass; note: string; bbox: { x: number; y: number; w: number; h: number } | null; detectedBy: 'manual' | 'ai'; confidence: number | null }
export const newDraft = (p: Partial<DefectDraft> = {}): DefectDraft => { const type = p.type ?? 'slag_inclusion'; return { type, lengthMm: '', depthMm: '', positionMm: '', pass: DEFAULT_PASS[type], note: '', bbox: null, detectedBy: 'manual', confidence: null, ...p } }
const num = (v: string) => { const x = Number(v.replace('٫', '.').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))); return Number.isFinite(x) && x >= 0 ? x : 0 }

/**
 * One defect: its type, size and place along the weld, and the pass it belongs to. The welders are not typed — they are
 * the stamps the welding report recorded for that pass of this weld.
 */
export function DefectForm({ weld, init, onSave, onCancel }: { weld: QcWeld; init: DefectDraft; onSave: (d: { type: DefectType; lengthMm: number; depthMm: number; positionMm: number; pass: Pass; welders: string[]; note: string; bbox: DefectDraft['bbox']; detectedBy: 'manual' | 'ai'; confidence: number | null }) => Promise<boolean>; onCancel: () => void }) {
  const q = useQc()
  const [d, setD] = useState(init)
  const [busy, setBusy] = useState(false)
  const [passTouched, setPassTouched] = useState(false)
  const welders = weld.stampsBy[d.pass]
  const needDepth = d.type === 'internal_undercut' || d.type === 'external_undercut' || d.type === 'hi_lo' || d.type === 'crack'
  const save = async () => { setBusy(true); const ok = await onSave({ type: d.type, lengthMm: num(d.lengthMm), depthMm: num(d.depthMm), positionMm: num(d.positionMm), pass: d.pass, welders, note: d.note.trim(), bbox: d.bbox, detectedBy: d.detectedBy, confidence: d.confidence }); setBusy(false); if (ok) onCancel() }
  return (
    <form className="wq-form wq-defect-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label className="is-wide"><span>نوع عیب</span>
        <select value={d.type} onChange={(e) => { const t = e.target.value as DefectType; setD({ ...d, type: t, pass: passTouched ? d.pass : DEFAULT_PASS[t] }) }}>{DEFECT_TYPES.map((t) => <option key={t} value={t}>{DEFECT_FA[t]}</option>)}</select></label>
      <label><span>طول (mm)</span><input inputMode="decimal" value={d.lengthMm} onChange={(e) => setD({ ...d, lengthMm: e.target.value })} placeholder="۰" /></label>
      <label><span>{d.type === 'hi_lo' ? 'اختلاف لبه‌ها (mm)' : 'عمق (mm)'}{needDepth ? '' : ' — اختیاری'}</span><input inputMode="decimal" value={d.depthMm} onChange={(e) => setD({ ...d, depthMm: e.target.value })} placeholder="۰" /></label>
      <label><span>فاصله از نقطهٔ مرجع (mm)</span><input inputMode="decimal" value={d.positionMm} onChange={(e) => setD({ ...d, positionMm: e.target.value })} placeholder="۰" /></label>
      <label><span>پاس جوش</span><select value={d.pass} onChange={(e) => { setPassTouched(true); setD({ ...d, pass: e.target.value as Pass }) }}>{PASSES.map((p) => <option key={p} value={p}>{PASS_FA[p]}</option>)}</select></label>
      <div className="is-wide wq-welders-of">
        <span>جوشکار(ان) این پاس — از گزارش جوشکاری</span>
        {welders.length ? <p>{welders.map((w) => <b key={w} className="ps-code">{w}{q.nameOf(w) !== w ? ` · ${q.nameOf(w)}` : ''}</b>)}</p> : <p className="ps-hint is-warn">مهر جوشکار این پاس در گزارش جوشکاری ثبت نشده؛ عیب ثبت می‌شود ولی به جوشکاری نسبت داده نمی‌شود.</p>}
      </div>
      <label className="is-wide"><span>توضیح</span><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="مثلاً موقعیت ساعتی، شمارهٔ فیلم" /></label>
      {d.detectedBy === 'ai' && <p className="is-wide ps-meta">نامزد پیشنهادی پردازش تصویر (امتیاز {Math.round((d.confidence ?? 0) * 100).toLocaleString('fa-IR')}٪) — نوع و اندازه را خودتان بررسی و اصلاح کنید.</p>}
      <div className="is-wide wq-form-actions">
        <button type="submit" className="ps-btn is-primary" disabled={busy}><Save size={14} aria-hidden /> ثبت عیب</button>
        <button type="button" className="ps-btn is-ghost" onClick={onCancel}><X size={14} aria-hidden /> انصراف</button>
      </div>
    </form>
  )
}
