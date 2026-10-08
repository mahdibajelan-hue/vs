import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, ImageUp, Loader2, PenLine, Save } from 'lucide-react'
import { clearSlabs } from '../../lib/imageTools'

const W = 640
const H = 220

/** Crops the drawing to its ink bounds (plus padding), scales it down and returns a transparent PNG data URL. */
function exportPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 8
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(canvas.width - sx, maxX - minX + pad * 2)
  const sh = Math.min(canvas.height - sy, maxY - minY + pad * 2)
  const scale = Math.min(1, 420 / sw)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

/**
 * Draw (mouse, touch or pen) or upload a handwritten sample signature. `onSave` receives a cropped transparent
 * PNG data URL. When a saved signature exists it is shown with a «تغییر امضا» button instead of the blank pad.
 */
export function SignaturePad({
  value,
  onSave,
  saving = false,
  saveLabel = 'ذخیره امضا',
}: {
  value: string | null
  onSave: (png: string) => void | Promise<void>
  saving?: boolean
  saveLabel?: string
}) {
  const [editing, setEditing] = useState(!value)
  const [hasInk, setHasInk] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!value) setEditing(true)
  }, [value])

  const clear = useCallback(() => {
    const c = canvasRef.current
    c?.getContext('2d')?.clearRect(0, 0, W, H)
    setHasInk(false)
    setError('')
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
    setHasInk(true)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const p = pos(e)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.quadraticCurveTo(last.current.x, last.current.y, (last.current.x + p.x) / 2, (last.current.y + p.y) / 2)
    ctx.stroke()
    last.current = p
  }
  const up = () => {
    drawing.current = false
    last.current = null
  }

  const upload = (file: File) => {
    setError('')
    const img = new Image()
    img.onload = () => {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      // Flatten on white first: a transparent PNG has rgb(0,0,0) under its transparent pixels, which the
      // darkness test below would otherwise read as solid black ink (black blocks around the signature).
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
      const k = Math.min(W / img.width, H / img.height, 1)
      const w = img.width * k
      const h = img.height * k
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
      // Scanned/photographed signatures have a white paper background: make it transparent.
      const px = ctx.getImageData(0, 0, W, H)
      clearSlabs(px.data, W, H) // letterbox bars baked into the picture are not ink
      for (let i = 0; i < px.data.length; i += 4) {
        if (px.data[i + 3] === 0) continue
        const lum = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3
        if (lum > 215) px.data[i + 3] = 0
        else px.data[i + 3] = Math.min(255, (215 - lum) * 4)
        px.data[i] = px.data[i + 1] = px.data[i + 2] = 17
      }
      ctx.putImageData(px, 0, 0)
      URL.revokeObjectURL(img.src)
      setHasInk(true)
    }
    img.onerror = () => setError('این فایل تصویر معتبری نیست.')
    img.src = URL.createObjectURL(file)
  }

  const save = async () => {
    const c = canvasRef.current
    const png = c ? exportPng(c) : null
    if (!png) {
      setError('ابتدا امضا را بکشید یا تصویر آن را بارگذاری کنید.')
      return
    }
    await onSave(png)
    setEditing(false)
    clear()
  }

  if (!editing && value) {
    return (
      <div className="space-y-2">
        <div className="flex h-24 items-center justify-center rounded-xl border border-white/10 bg-white">
          <img src={value} alt="امضای ثبت‌شده" className="max-h-20 max-w-full object-contain" />
        </div>
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-[11.5px] text-secondary hover:underline">
          <PenLine size={13} aria-hidden /> تغییر امضا
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="w-full cursor-crosshair rounded-xl border border-dashed border-white/25 bg-white"
        style={{ touchAction: 'none', aspectRatio: `${W} / ${H}` }}
        aria-label="کادر امضا — با انگشت یا ماوس بکشید"
      />
      <p className="text-[11px] text-muted">با انگشت، قلم یا ماوس داخل کادر امضا کنید، یا تصویر امضای خود را بارگذاری کنید.</p>
      {error && <p className="text-[11.5px] text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving || !hasInk} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-400 disabled:opacity-40">
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Save size={13} aria-hidden />} {saveLabel}
        </button>
        <button type="button" onClick={clear} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
          <Eraser size={13} aria-hidden /> پاک کردن
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
          <ImageUp size={13} aria-hidden /> بارگذاری تصویر
        </button>
        {value && (
          <button type="button" onClick={() => { setEditing(false); clear() }} className="text-[11.5px] text-muted hover:underline">انصراف</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
