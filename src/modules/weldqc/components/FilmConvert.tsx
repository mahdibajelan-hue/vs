import { useEffect, useRef, useState } from 'react'
import { Check, FileImage, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { decodeTiff, enhance, isTiff, levels, metrics, shrink, type Enhance, type Metrics, type Wide } from '../lib/filmio'
import type { Gray } from '../lib/detect'
import { fa } from '../lib/useQc'

export interface Converted { display: Blob; displayName: string; original: File; keepOriginal: boolean; width: number; height: number; metrics: Metrics }
const MAX_SIDE = 8000
const tick = () => new Promise((r) => setTimeout(r, 20))

async function readAny(f: File): Promise<Wide> {
  if (isTiff(f.name, f.type)) return decodeTiff(await f.arrayBuffer())
  const bmp = await createImageBitmap(f)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0)
  const rgba = x.getImageData(0, 0, c.width, c.height).data, d = new Uint8Array(c.width * c.height)
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000
  return { w: c.width, h: c.height, d, bits: 8 }
}
function toCanvas(g: Gray): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h
  const x = c.getContext('2d')!, id = x.createImageData(g.w, g.h)
  for (let i = 0; i < g.d.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g.d[i]; id.data[i * 4 + 3] = 255 }
  x.putImageData(id, 0, 0); return c
}

/**
 * مبدل فیلم — before a film is stored: a TIFF (8 or 16-bit) or any image is read, its density range stretched to the
 * screen, optionally cleaned (noise), given local contrast (CLAHE) and sharpened; the image-quality figures give a
 * first read. The viewable copy (WebP) is what the light box opens; a TIFF original is kept unchanged beside it.
 */
export function FilmConvert({ files, onDone, onCancel }: { files: File[]; onDone: (out: Converted[]) => Promise<void>; onCancel: () => void }) {
  const [i, setI] = useState(0)
  const [base, setBase] = useState<Gray | null>(null)
  const [step, setStep] = useState('خواندن فایل…')
  const [err, setErr] = useState('')
  const [opt, setOpt] = useState<Enhance>({ denoise: false, clahe: true, sharpen: 0.6 })
  const [m, setM] = useState<Metrics | null>(null)
  const [busy, setBusy] = useState(false)
  const done = useRef<Converted[]>([])
  const view = useRef<HTMLCanvasElement>(null)
  const f = files[i]

  useEffect(() => {
    let off = false
    setBase(null); setErr(''); setM(null)
    void (async () => {
      try {
        setStep(`خواندن ${isTiff(f.name, f.type) ? 'TIFF' : 'تصویر'} (${fa(f.size / 1048576, 1)} مگابایت)…`); await tick()
        const wide = await readAny(f); if (off) return
        setStep(`تنظیم دامنهٔ تیرگی (${wide.bits} بیتی، ${fa(wide.w)}×${fa(wide.h)})…`); await tick()
        let g = levels(wide)
        if (Math.max(g.w, g.h) > MAX_SIDE) g = shrink(g, MAX_SIDE).g
        if (!off) setBase(g)
      } catch (e) { if (!off) setErr(`این فایل خوانده نشد: ${(e as Error).message}. فرمت‌های پشتیبانی‌شده: TIFF (۸ و ۱۶ بیتی، فشرده یا بدون فشرده‌سازی)، JPG، PNG، WebP.`) }
    })()
    return () => { off = true }
  }, [f])

  // preview (on a ≤ 1600 px copy so the controls stay responsive)
  useEffect(() => {
    if (!base) return
    let off = false
    void (async () => {
      setStep('اعمال بهبود…'); await tick()
      const small = shrink(base, 1600).g
      const e = enhance(small, opt)
      if (off) return
      const c = view.current; if (c) { const src = toCanvas(e); c.width = src.width; c.height = src.height; c.getContext('2d')!.drawImage(src, 0, 0) }
      setM(metrics(shrink(e, 1200).g)); setStep('')
    })()
    return () => { off = true }
  }, [base, opt])

  const accept = async () => {
    if (!base) return
    setBusy(true); setStep('ساخت نسخهٔ نمایش با کیفیت کامل…'); await tick()
    const full = enhance(base, opt)
    const blob = await new Promise<Blob>((res, rej) => toCanvas(full).toBlob((b) => (b ? res(b) : rej(new Error('ساخت تصویر ممکن نشد'))), 'image/webp', 0.92))
    done.current.push({ display: blob, displayName: f.name.replace(/\.[^.]+$/, '') + '.webp', original: f, keepOriginal: isTiff(f.name, f.type), width: full.w, height: full.h, metrics: metrics(shrink(full, 1200).g) })
    if (i + 1 < files.length) { setBusy(false); setI(i + 1); return }
    setStep('بارگذاری…'); await onDone(done.current); setBusy(false)
  }
  const V = { good: 'خوب', fair: 'متوسط', poor: 'ضعیف' }
  return (
    <div className="wq-viewer wq-conv" role="dialog" aria-modal="true" aria-label="مبدل و بهبود فیلم">
      <header className="wq-viewer-top">
        <span className="wq-viewer-title"><FileImage size={16} aria-hidden /><b>مبدل و بهبود فیلم</b><small>{f.name} · {fa(i + 1)} از {fa(files.length)}</small></span>
        <button type="button" className="ps-btn is-ghost" onClick={onCancel}><X size={16} aria-hidden /> انصراف</button>
      </header>
      <div className="wq-viewer-body">
        <div className="wq-stage wq-conv-stage">
          {err ? <p className="wq-stage-msg">{err}</p> : !base ? <p className="wq-stage-msg"><Loader2 size={18} className="animate-spin" aria-hidden /> {step}</p> : null}
          <canvas ref={view} className="wq-conv-canvas" style={{ display: base ? 'block' : 'none' }} aria-label="پیش‌نمایش فیلم" />
        </div>
        <aside className="wq-viewer-side">
          <div className="wq-panel"><b><Sparkles size={15} aria-hidden /> بهبود تصویر</b>
            <label className="wq-check"><input type="checkbox" checked={opt.denoise} onChange={(e) => setOpt({ ...opt, denoise: e.target.checked })} /> کاهش نویز (میانهٔ ۳×۳)</label>
            <label className="wq-check"><input type="checkbox" checked={opt.clahe} onChange={(e) => setOpt({ ...opt, clahe: e.target.checked })} /> کنتراست محلی (CLAHE)</label>
            <label className="wq-range-row"><span>تیزی لبه‌ها</span><input type="range" min={0} max={1.6} step={0.2} value={opt.sharpen} onChange={(e) => setOpt({ ...opt, sharpen: +e.target.value })} aria-label="تیزی لبه‌ها" /><em>{fa(opt.sharpen, 1)}</em></label>
            <p className="ps-meta">دامنهٔ تیرگی فیلم (۰٫۵٪ تا ۹۹٫۵٪) خودکار به صفحه کشیده می‌شود؛ {isTiff(f.name, f.type) ? 'فایل TIFF اصلی بدون تغییر کنار نسخهٔ نمایش نگه داشته می‌شود.' : 'فایل اصلی همان نسخهٔ نمایش است.'}</p>
          </div>
          {m && <div className={`wq-panel wq-q-${m.verdict}`}><b>کیفیت تصویر (برآورد خودکار): {V[m.verdict]}</b>
            <ul className="wq-mini"><li>کنتراست: {fa(m.contrast, 1)}</li><li>دامنهٔ تیرگی: {fa(m.range)} از ۲۵۵</li><li>وضوح لبه: {fa(m.sharpness)}</li><li>نویز: {fa(m.noise)}</li></ul>
            {m.notes.length > 0 && <p className="ps-meta">{m.notes.join('؛ ')}. تصمیم دربارهٔ ریتیک یا ریشوت با مفسر است.</p>}</div>}
          <div className="wq-form-actions">
            <button type="button" className="ps-btn is-primary" disabled={!base || busy} onClick={() => void accept()}>{busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : i + 1 < files.length ? <Check size={14} aria-hidden /> : <Upload size={14} aria-hidden />} {busy ? step : i + 1 < files.length ? 'تأیید و فیلم بعدی' : 'تأیید و بارگذاری'}</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
