import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { BoxSelect, Check, Contrast, Hand, Loader2, Maximize, Ruler, Save, ScanSearch, Sparkles, SunMedium, Trash2, X, ZoomIn, ZoomOut, Crosshair } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { analyzeFilm, clahe, toGray, DETECTOR_VERSION, type Found } from '../lib/detect'
import { segmentHours } from '../lib/coverage'
import { clockOnFilm } from '../lib/filmplan'
import { learnedCode, pReal, MIN_REAL } from '../lib/learn'
import { aiSamples, currentModel, iou, recordAi } from '../lib/aiSamples'
import { DEFECT_COLOR } from '../lib/rules'
import { CODE_FA, type Code } from '../lib/api1104'
import { codeOf, useQc } from '../lib/useQc'
import { DefectForm, defectRow, newDraft, type DefectDraft } from './DefectForm'
import { fa } from '../lib/useQc'

/** a candidate of the assistant, in the film's own pixels; `p` = share of similar past candidates the interpreters kept */
type Cand = Found & { idx: number; p: number | null; ruleCode: string | null }
type Tool = 'pan' | 'measure' | 'calib' | 'defect'
interface Geo { x1: number; y1: number; x2: number; y2: number }
const dist = (g: Geo) => Math.hypot(g.x2 - g.x1, g.y2 - g.y1)
const box = (g: Geo) => ({ x: Math.min(g.x1, g.x2), y: Math.min(g.y1, g.y2), w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1) })

/**
 * The interpreter's light box: zoom and pan, brightness / contrast / negative and local contrast equalisation (CLAHE),
 * a ruler calibrated on a known length (IQI wire, lead marker), measured marks saved on the film, defect boxes, and the
 * candidate regions of the image-processing assistant — which the interpreter must check and type before anything is
 * recorded. Every defect drawn here is tied to the weld, the round, the pass and that pass's welders.
 */
export function FilmViewer({ filmId, weld, readOnly, onClose }: { filmId: string; weld: repo.QcWeld; readOnly: boolean; onClose: () => void }) {
  const st = useWqStore()
  const film = st.films.find((f) => f.id === filmId)!
  const defects = useMemo(() => st.defects.filter((d) => d.filmId === filmId && !d.removed), [st.defects, filmId])
  const marks = useMemo(() => st.marks.filter((m) => m.filmId === filmId), [st.marks, filmId])
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null), [err, setErr] = useState('')
  const [enh, setEnh] = useState<HTMLCanvasElement | null>(null), [useEnh, setUseEnh] = useState(false), [enhBusy, setEnhBusy] = useState(false)
  const [bri, setBri] = useState(100), [con, setCon] = useState(100), [inv, setInv] = useState(false)
  const [tool, setTool] = useState<Tool>('pan')
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 })
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [drag, setDrag] = useState<Geo | null>(null)
  const [hover, setHover] = useState<number | null>(null) // x of the pointer on the film, for the clock read-out
  const [pending, setPending] = useState<{ tool: Tool; g: Geo } | null>(null)
  const [calMm, setCalMm] = useState('')
  const [cands, setCands] = useState<Cand[] | null>(null), [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<{ decisions: number; learned: boolean; cv: number | null; hidden: number } | null>(null)
  const [draft, setDraft] = useState<DefectDraft | null>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const ppm = film?.pxPerMm ?? null
  const q = useQc()
  const row = q.byId.get(weld.id)
  /** the clock position of a point of the film when its segment is written as hours («12-3», «3-6») */
  const clockAt = (x: number): string => {
    // by the film's place on the circumference (start, length) and the diameter; older films: the segment written as hours
    const byPlace = img && row?.odMm ? clockOnFilm(film, x, img.width, ppm, row.odMm) : null
    if (byPlace != null) return String(byPlace)
    const hrs = segmentHours(film?.segment ?? '')
    if (!hrs || !img) return ''
    const [a, b] = hrs, span = ((b - a + 12) % 12) || 12
    return String(Math.round(((a + (x / img.width) * span) % 12) * 10) / 10)
  }
  const canWrite = !readOnly && st.caps.submit

  // load the film through a short-lived signed link
  useEffect(() => {
    let off = false
    void (async () => {
      const url = await repo.signedUrl(film.displayPath ?? film.path)
      if (!url) { setErr('دسترسی به فایل فیلم ممکن نشد.'); return }
      const im = new Image(); im.crossOrigin = 'anonymous'
      im.onload = () => { if (!off) setImg(im) }; im.onerror = () => { if (!off) setErr('تصویر قابل خواندن نیست (فرمت پشتیبانی‌نشده یا فایل خراب). فرمت‌های JPG، PNG و WebP پشتیبانی می‌شوند.') }
      im.src = url
    })()
    return () => { off = true }
  }, [film.path])

  // fit the canvas to its box
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const fit = useCallback(() => { if (!img) return; const s = Math.min(size.w / img.width, size.h / img.height) * 0.96; setView({ s, tx: (size.w - img.width * s) / 2, ty: (size.h - img.height * s) / 2 }) }, [img, size])
  useEffect(() => { fit() }, [fit])

  useEffect(() => {
    const c = cv.current; if (!c || !img) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr)
    const x = c.getContext('2d')!; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height)
    x.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty)
    x.imageSmoothingEnabled = view.s < 2
    x.filter = `brightness(${bri}%) contrast(${con}%)${inv ? ' invert(1)' : ''}`
    x.drawImage(useEnh && enh ? enh : img, 0, 0)
    x.filter = 'none'
    const lw = 2 / view.s, fs = 13 / view.s
    x.font = `700 ${fs}px Vazirmatn, sans-serif`; x.textBaseline = 'bottom'
    const label = (t: string, px: number, py: number, color: string) => { const w = x.measureText(t).width + 8 / view.s; x.fillStyle = color; x.fillRect(px, py - fs - 4 / view.s, w, fs + 4 / view.s); x.fillStyle = '#fff'; x.fillText(t, px + 4 / view.s, py - 1 / view.s) }
    for (const d of defects) if (d.bbox) { const c2 = DEFECT_COLOR[d.type]; x.strokeStyle = c2; x.lineWidth = lw; x.setLineDash([]); x.strokeRect(d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h); label(`${codeOf(d) || '?'} ${fa(d.lengthMm, 1)}mm`, d.bbox.x, d.bbox.y, c2) }
    for (const m of marks) { const g = m.geom, c2 = m.kind === 'calib' ? '#22c55e' : '#38bdf8'; x.strokeStyle = c2; x.lineWidth = lw; x.setLineDash(m.kind === 'calib' ? [6 / view.s, 4 / view.s] : []); x.beginPath(); x.moveTo(g.x1, g.y1); x.lineTo(g.x2, g.y2); x.stroke(); label(m.label, Math.min(g.x1, g.x2), Math.min(g.y1, g.y2), c2) }
    if (cands) cands.forEach((k, i) => { x.strokeStyle = '#facc15'; x.lineWidth = lw; x.setLineDash([5 / view.s, 3 / view.s]); x.strokeRect(k.x, k.y, k.w, k.h); label(`${String(i + 1)}${k.code ? ' ' + k.code : ''}`.replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[+n]), k.x, k.y, '#a16207') })
    if (draft?.bbox && !drag) { const b = draft.bbox; x.setLineDash([]); x.lineWidth = lw; x.strokeStyle = '#f43f5e'; x.strokeRect(b.x, b.y, b.w, b.h); label('عیب جدید', b.x, b.y, '#be123c') }
    const g = drag ?? pending?.g, t = drag ? tool : pending?.tool
    if (g && t) {
      x.setLineDash([]); x.lineWidth = lw
      if (t === 'defect') { x.strokeStyle = '#f43f5e'; const b = box(g); x.strokeRect(b.x, b.y, b.w, b.h) }
      else { x.strokeStyle = t === 'calib' ? '#22c55e' : '#38bdf8'; x.beginPath(); x.moveTo(g.x1, g.y1); x.lineTo(g.x2, g.y2); x.stroke(); label(ppm && t === 'measure' ? `${fa(dist(g) / ppm, 1)} mm` : `${fa(dist(g))} px`, g.x2, g.y2, t === 'calib' ? '#15803d' : '#0369a1') }
    }
  }, [img, enh, useEnh, view, size, bri, con, inv, defects, marks, cands, drag, pending, tool, ppm, draft])

  const toImg = (e: RPointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s } }
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'pan' || e.button === 1) { pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; return }
    const p = toImg(e); setPending(null); setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (pan.current) { const p = pan.current; setView((v) => ({ ...v, tx: p.tx + e.clientX - p.x, ty: p.ty + e.clientY - p.y })); return }
    const p = toImg(e)
    if (drag) setDrag({ ...drag, x2: p.x, y2: p.y })
    else if (img) setHover(p.x >= 0 && p.x <= img.width ? p.x : null)
  }
  const up = () => {
    if (pan.current) { pan.current = null; return }
    if (!drag) return
    const g = drag; setDrag(null)
    if (dist(g) < 3) return
    if (tool === 'defect') {
      const b = box(g)
      setDraft(newDraft({ bbox: b, lengthMm: ppm ? (Math.max(b.w, b.h) / ppm).toFixed(1) : '', clock: clockAt(b.x + b.w / 2) }))
    } else setPending({ tool, g })
  }
  const zoom = (k: number, cx = size.w / 2, cy = size.h / 2) => setView((v) => { const s = Math.min(40, Math.max(0.05, v.s * k)); return { s, tx: cx - ((cx - v.tx) * s) / v.s, ty: cy - ((cy - v.ty) * s) / v.s } })
  useEffect(() => {
    const c = cv.current; if (!c) return
    const w = (e: WheelEvent) => { e.preventDefault(); const r = c.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top) }
    c.addEventListener('wheel', w, { passive: false }); return () => c.removeEventListener('wheel', w)
  })
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (draft) setDraft(null); else if (pending) setPending(null); else onClose() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [draft, pending, onClose])

  const pixels = (maxSide: number) => {
    const k = Math.min(1, maxSide / Math.max(img!.width, img!.height)), w = Math.max(1, Math.round(img!.width * k)), h = Math.max(1, Math.round(img!.height * k))
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img!, 0, 0, w, h)
    return { k, w, h, data: x.getImageData(0, 0, w, h).data }
  }
  const toggleEnh = () => {
    if (enh) { setUseEnh((u) => !u); return }
    setEnhBusy(true)
    setTimeout(() => {
      try {
        const p = pixels(2400), g = clahe(toGray(p.data, p.w, p.h)), c = document.createElement('canvas'); c.width = p.w; c.height = p.h
        const x = c.getContext('2d')!, id = x.createImageData(p.w, p.h)
        for (let i = 0; i < g.d.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g.d[i]; id.data[i * 4 + 3] = 255 }
        x.putImageData(id, 0, 0)
        // drawn at the film's own size so marks and boxes stay where they are
        const full = document.createElement('canvas'); full.width = img!.width; full.height = img!.height; full.getContext('2d')!.drawImage(c, 0, 0, img!.width, img!.height)
        setEnh(full); setUseEnh(true)
      } catch { st.run('', async () => { throw new Error('پردازش تصویر در این مرورگر ممکن نشد.') }) }
      setEnhBusy(false)
    }, 30)
  }
  /** the assistant: find the bead, measure what stands out of the film's grain, rank it by what the interpreters decided before */
  const runAi = () => {
    setAiBusy(true)
    setTimeout(() => void (async () => {
      try {
        const p = pixels(2000)
        const a = analyzeFilm(toGray(p.data, p.w, p.h))
        const [{ model, decisions }, past] = await Promise.all([currentModel(), aiSamples()])
        const mine = past.filter((r) => r.filmId === film.id && r.bbox)
        let hidden = 0
        const found: Cand[] = a.items.map((c, idx) => {
          const pr = model && c.f.cnr > 0 ? pReal(model, c.f) : null, lc = model && c.code ? learnedCode(model, c.f) : null
          const code = lc && lc.code !== c.code ? (lc.code as Found['code']) : c.code
          const why = lc && lc.code !== c.code ? `${c.why} — طبق ${fa(lc.votes)} از ${fa(lc.of)} تصمیم قبلی مفسران برای نشانه‌های مشابه، «${CODE_FA[lc.code as Code] ?? lc.code}» پیشنهاد می‌شود` : c.why
          return { ...c, code, why, ruleCode: c.code, p: pr, confidence: pr == null ? c.confidence : Math.round(((c.confidence + 2 * pr) / 3) * 100) / 100, idx, x: c.x / p.k, y: c.y / p.k, w: c.w / p.k, h: c.h / p.k, lengthPx: c.lengthPx / p.k, widthPx: c.widthPx / p.k }
        }).filter((c) => {
          // already decided on this film (a recorded defect, or a candidate dismissed before): not shown again
          const done = defects.some((d) => d.bbox && iou(d.bbox, c) > 0.3) || mine.some((r) => r.action === 'dismissed' && iou(r.bbox!, c) > 0.5)
          if (done) hidden++
          return !done
        }).sort((x, y) => Number(y.inBead) - Number(x.inBead) || y.confidence - x.confidence)
        setCands(found); setAiNote({ decisions, learned: !!model, cv: model?.cv ?? null, hidden })
        if (canWrite) void repo.updateFilm(film.id, { ai: { at: new Date().toISOString(), band: !!a.band, version: a.version, items: found.map((c) => ({ code: c.code, why: c.why, confidence: c.confidence, clock: clockAt(c.x + c.w / 2) ? Number(clockAt(c.x + c.w / 2)) : null, bbox: { x: c.x, y: c.y, w: c.w, h: c.h }, action: '' })) } })
      } catch { setCands([]); setAiNote(null) }
      setAiBusy(false)
    })(), 30)
  }
  /** record what the interpreter did with candidate `idx` of the last run — on the film (for the passport) and in the learning record */
  const markAi = (c: Cand, action: 'accepted' | 'modified' | 'dismissed', finalCode: string | null, defectId: string | null) => {
    const cur = useWqStore.getState().films.find((f) => f.id === film.id)?.ai
    const k = cur?.items.findIndex((it) => iou(it.bbox, c) > 0.9) ?? -1
    const jobs: Promise<unknown>[] = [recordAi({ project_id: st.projectId, weld_id: weld.id, film_id: film.id, detector: DETECTOR_VERSION, bbox: { x: c.x, y: c.y, w: c.w, h: c.h }, feats: c.f, ai_code: c.code, confidence: c.confidence, action, final_code: finalCode, defect_id: defectId, by_name: st.me() })]
    if (cur && k >= 0) jobs.push(repo.updateFilm(film.id, { ai: { ...cur, items: cur.items.map((it, i) => (i === k ? { ...it, action } : it)) } }))
    void st.run(action === 'dismissed' ? 'پیشنهاد دستیار رد شد و در سابقهٔ یادگیری ثبت شد' : 'پیشنهاد دستیار ثبت شد', () => Promise.all(jobs))
  }
  const [aiCand, setAiCand] = useState<Cand | null>(null)

  const saveCalib = async () => {
    const mm = Number(calMm.replace('٫', '.')); if (!pending || !(mm > 0)) return
    const pxPerMm = dist(pending.g) / mm
    const ok = await st.run(`مقیاس فیلم ثبت شد: هر میلی‌متر ${fa(pxPerMm, 2)} پیکسل`, async () => {
      await repo.updateFilm(film.id, { px_per_mm: pxPerMm })
      await repo.addMark({ project_id: st.projectId!, film_id: film.id, kind: 'calib', geom: pending.g, label: `مرجع ${fa(mm, 1)} mm` })
    })
    if (ok) { setPending(null); setCalMm('') }
  }
  const saveMeasure = async () => {
    if (!pending) return
    const ok = await st.run('اندازه روی فیلم ذخیره شد', () => repo.addMark({ project_id: st.projectId!, film_id: film.id, kind: 'line', geom: pending.g, label: ppm ? `${fa(dist(pending.g) / ppm, 1)} mm` : `${fa(dist(pending.g))} px` }))
    if (ok) setPending(null)
  }

  const TOOLS: { k: Tool; label: string; icon: typeof Hand; write?: boolean }[] = [
    { k: 'pan', label: 'جابه‌جایی', icon: Hand }, { k: 'measure', label: 'خط‌کش', icon: Ruler },
    { k: 'calib', label: 'کالیبره', icon: Crosshair, write: true }, { k: 'defect', label: 'کادر عیب', icon: BoxSelect, write: true },
  ]

  return (
    <div className="wq-viewer" role="dialog" aria-modal="true" aria-label={`تفسیر فیلم ${film.fileName}`}>
      <header className="wq-viewer-top">
        <span className="wq-viewer-title"><ScanSearch size={16} aria-hidden /><b>{film.segment ? `فیلم ${film.segment}` : film.fileName}</b><small>{film.examType}{film.round ? fa(film.round) : ''}{film.seq ? ` · فیلم ${fa(film.seq)}` : ''} · {ppm ? `کالیبره: ${fa(ppm, 2)} px/mm` : 'کالیبره نشده — اندازه‌ها به پیکسل'}</small></span>
        {hover != null && clockAt(hover) !== '' && <span className="wq-clock-read" aria-live="off">ساعت <b>{fa(Number(clockAt(hover)), 1)}</b>{film.startMm != null && img ? <small> · {fa(ppm ? hover / ppm : film.lenMm ? (hover / img.width) * film.lenMm : 0)} mm از ابتدای فیلم</small> : null}</span>}
        <button type="button" className="ps-btn is-ghost" onClick={onClose} aria-label="بستن"><X size={16} aria-hidden /> بستن</button>
      </header>
      <div className="wq-viewer-tools" role="toolbar" aria-label="ابزارهای تفسیر">
        <div className="wq-seg">{TOOLS.filter((t) => !t.write || canWrite).map(({ k, label, icon: I }) => <button key={k} type="button" aria-pressed={tool === k} onClick={() => { setTool(k); setPending(null) }}><I size={15} aria-hidden />{label}</button>)}</div>
        <div className="wq-seg">
          <button type="button" onClick={() => zoom(1.25)} aria-label="بزرگ‌نمایی"><ZoomIn size={15} aria-hidden /></button>
          <button type="button" onClick={() => zoom(0.8)} aria-label="کوچک‌نمایی"><ZoomOut size={15} aria-hidden /></button>
          <button type="button" onClick={fit} aria-label="اندازهٔ کامل"><Maximize size={15} aria-hidden /></button>
        </div>
        <label className="wq-range"><SunMedium size={14} aria-hidden /><span className="sr-only">روشنایی</span><input type="range" min={30} max={220} value={bri} onChange={(e) => setBri(+e.target.value)} aria-label="روشنایی" /></label>
        <label className="wq-range"><Contrast size={14} aria-hidden /><span className="sr-only">کنتراست</span><input type="range" min={30} max={300} value={con} onChange={(e) => setCon(+e.target.value)} aria-label="کنتراست" /></label>
        <div className="wq-seg">
          <button type="button" aria-pressed={inv} onClick={() => setInv(!inv)}>نگاتیو</button>
          <button type="button" aria-pressed={useEnh} onClick={toggleEnh} disabled={enhBusy || !img}>{enhBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} بهبود کنتراست محلی</button>
          {canWrite && <button type="button" onClick={runAi} disabled={aiBusy || !img}>{aiBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ScanSearch size={14} aria-hidden />} نواحی مشکوک</button>}
        </div>
      </div>
      <div className="wq-viewer-body">
        <div className="wq-stage" ref={wrap} data-tool={tool}>
          {err ? <p className="wq-stage-msg">{err}</p> : !img ? <p className="wq-stage-msg"><Loader2 size={18} className="animate-spin" aria-hidden /> بارگذاری فیلم…</p> : null}
          <canvas ref={cv} style={{ width: size.w, height: size.h }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="تصویر فیلم رادیوگرافی" />
        </div>
        <aside className="wq-viewer-side">
          {pending?.tool === 'calib' && (
            <div className="wq-panel is-calib"><b>طول واقعی این خط چند میلی‌متر است؟</b><p className="ps-meta">روی یک طول معلوم خط بکشید: فاصلهٔ نشانه‌های سربی، طول سیم IQI یا عرض جوش اندازه‌گیری‌شده.</p>
              <div className="wq-inline"><input inputMode="decimal" value={calMm} onChange={(e) => setCalMm(e.target.value)} placeholder="مثلاً ۵۰" aria-label="طول به میلی‌متر" autoFocus /><button type="button" className="ps-btn is-ok" onClick={() => void saveCalib()} disabled={!(Number(calMm) > 0)}><Check size={14} aria-hidden /> ثبت مقیاس</button></div></div>
          )}
          {pending?.tool === 'measure' && (
            <div className="wq-panel"><b>{ppm ? `${fa(dist(pending.g) / ppm, 2)} mm` : `${fa(dist(pending.g))} پیکسل`}</b>{!ppm && <p className="ps-meta">برای اندازه به میلی‌متر، ابتدا فیلم را کالیبره کنید.</p>}
              {canWrite && <button type="button" className="ps-btn" onClick={() => void saveMeasure()}><Save size={14} aria-hidden /> ذخیره روی فیلم</button>}</div>
          )}
          {draft && <div className="wq-panel"><b>عیب جدید روی این فیلم</b>
            <DefectForm weld={weld} crew={row?.crew ?? []} odMm={row?.odMm ?? null} init={draft} onCancel={() => { setDraft(null); setAiCand(null) }} onSave={async (d) => {
              let id: string | null = null
              const ok = await st.run(`«${CODE_FA[d.code]}» ثبت شد`, async () => { id = await repo.addDefect(defectRow(d, { project_id: st.projectId, weld_id: weld.id, film_id: film.id, round: film.round, created_name: st.me() })) })
              if (!ok) return ok
              if (aiCand) { markAi(aiCand, d.code !== aiCand.code ? 'modified' : 'accepted', d.code, id); setCands((c) => c?.filter((x) => x.idx !== aiCand.idx) ?? null); setAiCand(null) }
              // drawn by hand on a film the assistant had analysed and it had nothing there: a miss, kept for the record
              else if (d.bbox && film.ai && !(cands ?? []).some((c) => iou(c, d.bbox!) > 0.3)) void recordAi({ project_id: st.projectId, weld_id: weld.id, film_id: film.id, detector: film.ai.version ?? '', bbox: d.bbox, feats: null, ai_code: null, confidence: null, action: 'missed', final_code: d.code, defect_id: id, by_name: st.me() }).catch(() => undefined)
              return ok
            }} /></div>}
          {cands && !draft && (
            <div className="wq-panel is-ai"><b><ScanSearch size={15} aria-hidden /> {cands.length ? `${fa(cands.length)} ناحیهٔ مشکوک` : 'ناحیهٔ مشکوکی پیدا نشد'}</b>
              <p className="ps-meta">دستیار نوار جوش را پیدا می‌کند و فقط نواحی‌ای را نشان می‌دهد که از دانه‌بندی همین فیلم بیرون می‌زنند؛ برای هر مورد کد احتمالی و دلیل آن می‌آید. تشخیص قطعی نیست و هر مورد را باید خودتان بررسی کنید.{aiNote?.hidden ? ` ${fa(aiNote.hidden)} مورد که قبلاً دربارهٔ آن تصمیم گرفته‌اید دوباره نشان داده نشد.` : ''}</p>
              {aiNote && <p className={`wq-learn ${aiNote.learned ? 'is-on' : ''}`}><Sparkles size={13} aria-hidden /> {aiNote.learned ? `رتبه‌بندی با یادگیری از ${fa(aiNote.decisions)} تصمیم قبلی مفسران${aiNote.cv != null ? ` (هم‌خوانی با تصمیم‌های دیده‌نشده ${fa(aiNote.cv * 100)}٪)` : ''}` : `یادگیری هنوز فعال نیست: ${fa(aiNote.decisions)} تصمیم ثبت شده؛ با ${fa(MIN_REAL)} تصمیم (تأیید و رد) رتبه‌بندی از تصمیم‌های شما یاد می‌گیرد.`}</p>}
              <ol className="wq-cands">{cands.map((c, i) => (
                <li key={`${c.x}-${c.y}`} className={!c.inBead || (c.p != null && c.p < 0.2) ? 'is-out' : ''}><span><b>{fa(i + 1)}. {c.code ? CODE_FA[c.code as Code] : 'بدون کد'}</b> · {ppm ? `${fa(c.lengthPx / ppm, 1)} mm` : `${fa(c.lengthPx)} px`} · {fa(c.confidence * 100)}٪{c.f.cnr ? ` · CNR ${fa(c.f.cnr, 1)}` : ''}<small>{c.why}{c.p != null && c.p < 0.2 ? ' — مفسران موارد مشابه را بیشتر رد کرده‌اند' : ''}</small></span>
                  <button type="button" className="ps-btn is-ok" onClick={() => { setAiCand(c); setDraft(newDraft({ code: (c.code ?? 'ISI') as Code, aiCode: c.code, bbox: { x: c.x, y: c.y, w: c.w, h: c.h }, lengthMm: ppm ? (c.lengthPx / ppm).toFixed(1) : '', widthMm: ppm ? (c.widthPx / ppm).toFixed(1) : '', clock: clockAt(c.x + c.w / 2), detectedBy: 'ai', confidence: c.confidence })) }}>بررسی و ثبت</button>
                  <button type="button" className="ps-btn is-ghost" onClick={() => { markAi(c, 'dismissed', null, null); setCands(cands.filter((x) => x.idx !== c.idx)) }} aria-label="رد این ناحیه (هشدار کاذب)" title="هشدار کاذب — رد"><X size={14} aria-hidden /></button></li>
              ))}</ol>
              <button type="button" className="ps-btn is-ghost" onClick={() => setCands(null)}>بستن فهرست</button>
            </div>
          )}
          <div className="wq-panel"><b>عیوب این فیلم</b>
            {defects.length ? <ul className="wq-mini">{defects.map((d) => <li key={d.id}><i style={{ background: DEFECT_COLOR[d.type] }} />{codeOf(d) ? CODE_FA[codeOf(d) as Code] : d.type} · {fa(d.lengthMm, 1)} mm{d.clock != null ? ` · ساعت ${fa(d.clock, 1)}` : ''}</li>)}</ul> : <p className="ps-meta">هنوز عیبی روی این فیلم ثبت نشده.</p>}
          </div>
          {marks.length > 0 && <div className="wq-panel"><b>نشانه‌ها</b><ul className="wq-mini">{marks.map((m) => <li key={m.id}><i style={{ background: m.kind === 'calib' ? '#22c55e' : '#38bdf8' }} />{m.label}{canWrite && <button type="button" className="ps-x" aria-label="حذف نشانه" onClick={() => void st.run('نشانه برداشته شد', () => repo.removeMark(m.id))}><Trash2 size={13} aria-hidden /></button>}</li>)}</ul></div>}
          <p className="ps-meta wq-viewer-help">چرخ ماوس: بزرگ‌نمایی · ابزار «جابه‌جایی»: کشیدن تصویر · Esc: بستن</p>
        </aside>
      </div>
    </div>
  )
}
