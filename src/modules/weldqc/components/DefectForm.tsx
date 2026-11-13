import { useMemo, useState } from 'react'
import { Save, X } from 'lucide-react'
import { CODES, CODE_FA, CODE_NEEDS, CODE_PASS, CODE_TYPE, positionOfClock, quadrantOf, type Code } from '../lib/api1104'
import { PASS_FA, type Pass } from '../lib/rules'
import { PASSES, QUAD_FA, weldersAt, type CrewRow } from '../lib/crew'
import type { QcWeld } from '../repo'
import { fa, useQc } from '../lib/useQc'

export interface DefectDraft { code: Code; lengthMm: string; widthMm: string; depthMm: string; clock: string; pass: Pass; densityOver: boolean; note: string; bbox: { x: number; y: number; w: number; h: number } | null; detectedBy: 'manual' | 'ai'; confidence: number | null; aiCode: string | null }
export const newDraft = (p: Partial<DefectDraft> = {}): DefectDraft => { const code = p.code ?? 'ESI'; return { code, lengthMm: '', widthMm: '', depthMm: '', clock: '', pass: CODE_PASS[code], densityOver: false, note: '', bbox: null, detectedBy: 'manual', confidence: null, aiCode: null, ...p } }
export const toNum = (v: string) => { const x = Number(v.replace('٫', '.').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))); return v.trim() !== '' && Number.isFinite(x) && x >= 0 ? x : null }
export interface DefectSave { code: Code; type: string; lengthMm: number; widthMm: number | null; depthMm: number; clock: number | null; quadrant: number | null; positionMm: number; pass: Pass; welders: string[]; densityOver: boolean; note: string; bbox: DefectDraft['bbox']; detectedBy: 'manual' | 'ai'; confidence: number | null; aiAction: '' | 'accepted' | 'modified' }

/** the row the database takes from a saved form */
export const defectRow = (d: DefectSave, extra: Record<string, unknown>) => ({
  ...extra, defect_type: d.type, code: d.code, length_mm: d.lengthMm, width_mm: d.widthMm, depth_mm: d.depthMm, clock: d.clock, quadrant: d.quadrant, position_mm: d.positionMm,
  pass: d.pass, welders: d.welders, density_over: d.densityOver, bbox: d.bbox, detected_by: d.detectedBy, confidence: d.confidence, ai_action: d.aiAction, note: d.note,
})

/**
 * One imperfection, in API 1104's own terms: its code, length (and width for slag and clusters, depth for undercut,
 * offset for Hi-Lo), clock position and the pass. The welders are not typed — they are the welders of that pass in that
 * quadrant (recorded crew, else the half from the welding report, else the whole pass).
 */
export function DefectForm({ weld, crew, odMm, init, onSave, onCancel }: { weld: QcWeld; crew: CrewRow[]; odMm: number | null; init: DefectDraft; onSave: (d: DefectSave) => Promise<boolean>; onCancel: () => void }) {
  const q = useQc()
  const [d, setD] = useState(init)
  const [busy, setBusy] = useState(false)
  const [passTouched, setPassTouched] = useState(false)
  const need = CODE_NEEDS[d.code]
  const clock = toNum(d.clock)
  const quad = clock != null && clock <= 12 ? quadrantOf(clock) : null
  const who = useMemo(() => weldersAt(d.pass, quad, crew, weld.sides), [d.pass, quad, crew, weld.sides])
  const save = async () => {
    setBusy(true)
    const len = toNum(d.lengthMm) ?? 0
    const ok = await onSave({
      code: d.code, type: CODE_TYPE[d.code], lengthMm: len, widthMm: toNum(d.widthMm), depthMm: toNum(d.depthMm) ?? 0, clock: clock != null && clock <= 12 ? clock : null, quadrant: quad,
      positionMm: clock != null && odMm ? Math.round(positionOfClock(clock, odMm)) : 0, pass: d.pass, welders: who.keys.length ? who.keys : PASSES.flatMap((p) => weld.stampsBy[p]).filter((x, i, a) => a.indexOf(x) === i),
      densityOver: d.densityOver, note: d.note.trim(), bbox: d.bbox, detectedBy: d.detectedBy, confidence: d.confidence, aiAction: d.detectedBy === 'ai' ? (d.aiCode && d.aiCode !== d.code ? 'modified' : 'accepted') : '',
    })
    setBusy(false); if (ok) onCancel()
  }
  const SRC = { crew: 'از ترکیب ثبت‌شدهٔ اکیپ', half: 'از نیمهٔ گزارش جوشکاری (سمت مسیر / کانال)', pass: 'همهٔ جوشکاران این پاس', none: '' }
  return (
    <form className="wq-form wq-defect-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label className="is-wide"><span>نوع ناپیوستگی (کد API 1104)</span>
        <select value={d.code} onChange={(e) => { const c = e.target.value as Code; setD({ ...d, code: c, pass: passTouched ? d.pass : CODE_PASS[c] }) }}>{CODES.map((c) => <option key={c} value={c}>{CODE_FA[c]}</option>)}</select></label>
      <label><span>{d.code === 'CP' ? 'قطر خوشه (mm)' : 'طول (mm)'}</span><input inputMode="decimal" value={d.lengthMm} onChange={(e) => setD({ ...d, lengthMm: e.target.value })} placeholder="۰" /></label>
      {need.width && <label><span>{d.code === 'CP' ? 'بزرگ‌ترین حفره (mm)' : 'عرض (mm)'}</span><input inputMode="decimal" value={d.widthMm} onChange={(e) => setD({ ...d, widthMm: e.target.value })} placeholder="۰" /></label>}
      {need.depth && <label><span>{need.depth === 'offset' ? 'اختلاف لبه‌ها (mm)' : 'عمق (mm)'}</span><input inputMode="decimal" value={d.depthMm} onChange={(e) => setD({ ...d, depthMm: e.target.value })} placeholder="۰" /></label>}
      <label><span>موقعیت ساعتی (۰ تا ۱۲)</span><input inputMode="decimal" value={d.clock} onChange={(e) => setD({ ...d, clock: e.target.value })} placeholder="مثلاً ۶" /></label>
      <label><span>پاس جوش</span><select value={d.pass} onChange={(e) => { setPassTouched(true); setD({ ...d, pass: e.target.value as Pass }) }}>{PASSES.map((p) => <option key={p} value={p}>{PASS_FA[p]}</option>)}</select></label>
      {need.density && <label className="wq-check is-wide"><input type="checkbox" checked={d.densityOver} onChange={(e) => setD({ ...d, densityOver: e.target.checked })} /> تیره‌تر از نازک‌ترین فلز پایهٔ مجاور است</label>}
      <div className="is-wide wq-welders-of">
        <span>جوشکار {quad ? `ربع ${QUAD_FA[quad]}` : 'این پاس'} — {SRC[who.source] || 'ثبت نشده'}{clock != null && odMm ? ` · ${fa(positionOfClock(clock, odMm))} mm از ساعت ۱۲` : ''}</span>
        {who.keys.length ? <p>{who.keys.map((w) => <b key={w} className="ps-code">{w}{q.nameOf(w) !== w ? ` · ${q.nameOf(w)}` : ''}</b>)}</p> : <p className="ps-hint is-warn">جوشکار این پاس ثبت نشده؛ عیب ثبت می‌شود ولی به جوشکاری نسبت داده نمی‌شود.</p>}
      </div>
      <label className="is-wide"><span>توضیح</span><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="مثلاً شمارهٔ فیلم یا جزئیات" /></label>
      {d.detectedBy === 'ai' && <p className="is-wide ps-meta">پیشنهاد دستیار تصویر{d.aiCode ? ` (${d.aiCode})` : ''} — امتیاز {fa((d.confidence ?? 0) * 100)}٪. نوع و اندازه را خودتان بررسی و اصلاح کنید.</p>}
      <div className="is-wide wq-form-actions">
        <button type="submit" className="ps-btn is-primary" disabled={busy}><Save size={14} aria-hidden /> ثبت ناپیوستگی</button>
        <button type="button" className="ps-btn is-ghost" onClick={onCancel}><X size={14} aria-hidden /> انصراف</button>
      </div>
    </form>
  )
}
