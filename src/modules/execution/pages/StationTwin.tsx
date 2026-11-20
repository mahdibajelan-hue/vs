import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Crosshair, ImageUp, Minus, Move, Pause, Pencil, Play, Plus, Route, Sparkles, SquarePlus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useCsStore } from '../store/useCsStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { EQ_KINDS, EQ_STEPS, SPOOL_STAGE_FA, inchDia } from '../lib/csCore'
import { PACK_COLOR, asOf, autoLayout, dateRange, eqColor, extentOf, lineColor, progressColor, twinState, type ColorMode, type PlotShape } from '../lib/csTwin'
import { Chip } from '../../finance/components/fn'
import { Empty, fa, pct } from '../components/common'
import { todayTehran } from '../../../lib/today'
import { jalaliText } from '../lib/periods'

const MODES: { id: ColorMode; label: string }[] = [{ id: 'progress', label: 'پیشرفت' }, { id: 'welding', label: 'جوش و NDT' }, { id: 'testing', label: 'تست‌پک' }, { id: 'quality', label: 'کیفیت' }]
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/**
 * دوقلوی دیجیتال ایستگاه — the plot plan coloured from the station registers. Areas, equipment footprints and line runs
 * show progress, welding / NDT, test packs or open quality issues; the date slider replays the site day by day. The team
 * draws the layout once (or starts from the automatic one) by dragging shapes into place.
 */
export function StationTwin({ projectId }: { projectId: string }) {
  const st = useCsStore()
  const can = useExecutionStore((s) => s.can)
  const write = can(projectId, 'record') || can(projectId, 'review')
  useEffect(() => { void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  const regs = useMemo(() => ({ lines: st.lines, spools: st.spools, welds: st.welds, equipment: st.equipment, packs: st.packs, inspections: st.inspections }), [st.lines, st.spools, st.welds, st.equipment, st.packs, st.inspections])
  const today = todayTehran()
  const range = useMemo(() => dateRange(regs), [regs])
  const first = range.from && range.from < today ? range.from : today
  const span = Math.max(1, daysBetween(first, today))
  const [dayIdx, setDayIdx] = useState<number | null>(null) // null = today
  const day = dayIdx == null ? today : addDays(first, dayIdx)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setDayIdx((i) => { const n = (i ?? 0) + Math.max(1, Math.round(span / 60)); if (n >= span) { setPlaying(false); return null } return n }), 120)
    return () => clearInterval(t)
  }, [playing, span])
  const state = useMemo(() => twinState(day === today ? regs : asOf(regs, day)), [regs, day, today])

  const [mode, setMode] = useState<ColorMode>('progress')
  const [sel, setSel] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const shapes = useMemo(() => st.plot.filter((s) => !s.archived).sort((a, b) => a.z - b.z), [st.plot])
  const missing = useMemo(() => autoLayout(regs, st.plot), [regs, st.plot])

  // view box (site metres), pan and zoom
  const ext = useMemo(() => extentOf(shapes), [shapes])
  const [vb, setVb] = useState(ext)
  const fitted = useRef(false)
  useEffect(() => { if (!fitted.current && shapes.length) { setVb(ext); fitted.current = true } }, [ext, shapes.length])
  const svgRef = useRef<SVGSVGElement>(null)
  const toSvg = (cx: number, cy: number) => { const s = svgRef.current; if (!s) return [0, 0] as [number, number]; const p = s.createSVGPoint(); p.x = cx; p.y = cy; const q = p.matrixTransform(s.getScreenCTM()!.inverse()); return [q.x, q.y] as [number, number] }
  const zoom = (k: number, at?: [number, number]) => setVb((v) => { const [ax, ay] = at ?? [v.x + v.w / 2, v.y + v.h / 2]; const w = Math.min(Math.max(v.w * k, 8), ext.w * 6), h = (w / v.w) * v.h; return { x: ax - ((ax - v.x) * w) / v.w, y: ay - ((ay - v.y) * h) / v.h, w, h } })
  useEffect(() => {
    const s = svgRef.current; if (!s) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e.clientX, e.clientY)) }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // dragging: the background pans; in edit mode a shape moves (or resizes from its corner handle)
  type Drag = { kind: 'pan' | 'move' | 'size'; id?: string; start: [number, number]; orig: { x: number; y: number; w: number; h: number; points: [number, number][] }; moved: boolean }
  const drag = useRef<Drag | null>(null)
  const [live, setLive] = useState<Record<string, Partial<PlotShape>>>({})
  const shapeOf = (s: PlotShape): PlotShape => ({ ...s, ...(live[s.id] ?? {}) })
  const [route, setRoute] = useState<{ id: string; pts: [number, number][] } | null>(null)
  const down = (e: RPointerEvent, kind: Drag['kind'], s?: PlotShape) => {
    if (route) return
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId)
    const p = kind === 'pan' ? [e.clientX, e.clientY] as [number, number] : toSvg(e.clientX, e.clientY)
    drag.current = { kind, id: s?.id, start: p, orig: s ? { x: s.x, y: s.y, w: s.w, h: s.h, points: s.points } : { ...vb, points: [] }, moved: false }
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return
    if (d.kind === 'pan') {
      const s = svgRef.current!.getBoundingClientRect(), k = vb.w / s.width
      const dx = (e.clientX - d.start[0]) * k, dy = (e.clientY - d.start[1]) * k
      if (Math.abs(dx) + Math.abs(dy) > 0.2) d.moved = true
      setVb((v) => ({ ...v, x: d.orig.x - dx, y: d.orig.y - dy })); return
    }
    const [px, py] = toSvg(e.clientX, e.clientY), dx = px - d.start[0], dy = py - d.start[1]
    if (Math.abs(dx) + Math.abs(dy) > 0.3) d.moved = true
    const snap = (v: number) => Math.round(v * 2) / 2
    const keepRatio = d.kind === 'size' && !!shapes.find((x) => x.id === d.id)?.imagePath // the plan image keeps its proportions
    const nw = Math.max(2, snap(d.orig.w + dx))
    setLive((m) => ({ ...m, [d.id!]: d.kind === 'size' ? { w: nw, h: keepRatio && d.orig.w ? Math.round((nw * d.orig.h) / d.orig.w * 10) / 10 : Math.max(2, snap(d.orig.h + dy)) } : d.orig.points.length ? { points: d.orig.points.map(([x, y]) => [snap(x + dx), snap(y + dy)] as [number, number]) } : { x: snap(d.orig.x + dx), y: snap(d.orig.y + dy) } }))
  }
  const up = async () => {
    const d = drag.current; drag.current = null
    if (!d || d.kind === 'pan') { if (d && !d.moved) setSel(null); return }
    if (!d.moved) { setSel(d.id!); return }
    const patch = live[d.id!]
    if (patch) { await st.save('plot', projectId, { id: d.id, ...patch }); setLive((m) => { const n = { ...m }; delete n[d.id!]; return n }) }
  }
  const clickCanvas = (e: React.MouseEvent) => { if (!route) return; const [x, y] = toSvg(e.clientX, e.clientY); setRoute((r) => (r ? { ...r, pts: [...r.pts, [Math.round(x * 2) / 2, Math.round(y * 2) / 2]] } : r)) }
  const finishRoute = async () => { if (route && route.pts.length >= 2) await st.save('plot', projectId, { id: route.id, points: route.pts }); setRoute(null) }

  // the real plot plan under the shapes: a private image, shown through a short-lived signed link
  const site = shapes.find((s) => s.kind === 'site')
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    if (!site?.imagePath) { setImgUrl(null); return }
    void supabase.storage.from('cs-plot').createSignedUrl(site.imagePath, 3600).then(({ data }) => { if (on) setImgUrl(data?.signedUrl ?? null) })
    return () => { on = false }
  }, [site?.imagePath])
  const fileRef = useRef<HTMLInputElement>(null)
  const [upErr, setUpErr] = useState<string | null>(null)
  const uploadPlan = async (f: File) => {
    setUpErr(null)
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setUpErr('فقط تصویر PNG، JPG یا WebP؛ PDF را ابتدا به تصویر تبدیل کنید.'); return }
    if (f.size > 15 * 1024 * 1024) { setUpErr('حجم تصویر بیش از ۱۵ مگابایت است.'); return }
    const dims = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 4, h: 3 }); im.src = URL.createObjectURL(f) })
    const path = `${projectId}/plot-${Date.now()}.${f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'}`
    const { error } = await supabase.storage.from('cs-plot').upload(path, f, { contentType: f.type, upsert: false })
    if (error) { setUpErr(`بارگذاری نشد: ${error.message}`); return }
    // the image keeps its proportions over the site boundary; resize the boundary to set the scale
    const w = site?.w || Math.max(ext.w, 100)
    const patch = { imagePath: path, imageOpacity: site?.imageOpacity ?? 0.55, w, h: Math.round((w * dims.h) / dims.w * 10) / 10 }
    if (site) await st.save('plot', projectId, { id: site.id, ...patch })
    else await st.save('plot', projectId, { kind: 'site', label: 'محدودهٔ ایستگاه', x: 0, y: 0, z: -1, points: [], ...patch })
    fitted.current = false
  }
  const runAuto = async () => {
    if (!missing.length) return
    if (!window.confirm(`${fa(missing.length)} شکل (ناحیه، تجهیز، لاین) از روی ثبت‌ها چیده شود؟ شکل‌های کشیده‌شده جابه‌جا نمی‌شوند.`)) return
    await st.importRows('plot', projectId, missing as unknown as Record<string, unknown>[])
    fitted.current = false
  }
  const addArea = async () => {
    const name = window.prompt('نام ناحیه (مثلاً «واحد کمپرسور ۱»):')?.trim(); if (!name) return
    await st.save('plot', projectId, { kind: 'area', areaName: name, label: name, x: vb.x + vb.w / 2 - 15, y: vb.y + vb.h / 2 - 10, w: 30, h: 20, z: 0, points: [] })
  }

  if (st.plotMissing) return <Empty>جدول نقشهٔ جانمایی (میگریشن 052) هنوز روی این پایگاه داده نصب نشده است.</Empty>
  if (!st.lines.length && !st.equipment.length) return <Empty>دوقلوی دیجیتال از ثبت‌های ایستگاه ساخته می‌شود؛ ابتدا لاین‌ها و تجهیزات را در «ایستگاه» ثبت کنید.</Empty>

  const lineById = new Map(st.lines.map((l) => [l.id, l])), eqById = new Map(st.equipment.map((e) => [e.id, e]))
  const selShape = shapes.find((s) => s.id === sel)
  const fsArea = Math.max(1.4, Math.min(3.2, vb.w / 60)), fsSmall = fsArea * 0.62
  return (
    <div className="tw">
      <div className="tw-bar no-print">
        <div className="im-seg" role="radiogroup" aria-label="رنگ‌آمیزی">{MODES.map((m) => <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>)}</div>
        <div className="tw-time">
          <button className="im-btn im-btn-sm" onClick={() => { if (!playing && dayIdx == null) setDayIdx(0); setPlaying((p) => !p) }} aria-label={playing ? 'توقف' : 'بازپخش پیشرفت'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <input type="range" min={0} max={span} value={dayIdx ?? span} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setDayIdx(v >= span ? null : v) }} aria-label="تاریخ" />
          <b className="tw-date">{jalaliText(day)}{day === today ? ' (امروز)' : ''}</b>
        </div>
        {write && <div className="tw-edit">
          {missing.length > 0 && <button className="im-btn im-btn-sm" onClick={() => void runAuto()}><Sparkles size={13} /> چیدمان خودکار ({fa(missing.length)})</button>}
          <button className={`im-btn im-btn-sm ${edit ? 'im-btn-primary' : ''}`} aria-pressed={edit} onClick={() => { setEdit((x) => !x); setRoute(null) }}><Pencil size={13} /> {edit ? 'پایان ویرایش نقشه' : 'ویرایش نقشه'}</button>
          {edit && <button className="im-btn im-btn-sm" onClick={() => void addArea()}><SquarePlus size={13} /> ناحیه</button>}
          {edit && <><button className="im-btn im-btn-sm" onClick={() => fileRef.current?.click()}><ImageUp size={13} /> {site?.imagePath ? 'تعویض تصویر پلات‌پلن' : 'تصویر پلات‌پلن'}</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadPlan(f) }} /></>}
          {edit && site?.imagePath && <label className="tw-opacity">شفافیت تصویر<input type="range" min={10} max={100} value={Math.round((site.imageOpacity ?? 0.55) * 100)} onChange={(e) => { const v = Number(e.target.value) / 100; setLive((m) => ({ ...m, [site.id]: { ...(m[site.id] ?? {}), imageOpacity: v } })) }} onPointerUp={(e) => void st.save('plot', projectId, { id: site.id, imageOpacity: Number((e.target as HTMLInputElement).value) / 100 })} /></label>}
          {edit && site?.imagePath && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('تصویر پلات‌پلن از زیر نقشه برداشته شود؟ (فایل در بایگانی می‌ماند)')) void st.save('plot', projectId, { id: site.id, imagePath: null }) }}>برداشتن تصویر</button>}
          {upErr && <span className="tw-err" role="alert">{upErr}</span>}
        </div>}
      </div>

      <div className="tw-body">
        <div className={`tw-canvas ${edit ? 'is-edit' : ''} ${route ? 'is-route' : ''}`}>
          {!shapes.length ? (
            <div className="tw-empty"><b>هنوز نقشه‌ای کشیده نشده است.</b><span>با «چیدمان خودکار» یک نقشهٔ اولیه از ناحیه‌ها، تجهیزات و لاین‌های ثبت‌شده ساخته می‌شود؛ سپس در «ویرایش نقشه» تصویر پلات‌پلن واقعی را زیر نقشه بگذارید و هر شکل را روی جای واقعی‌اش بکشید.</span></div>
          ) : (
            <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="نقشهٔ جانمایی ایستگاه"
              onPointerDown={(e) => down(e, 'pan')} onPointerMove={move} onPointerUp={() => void up()} onClick={clickCanvas} onDoubleClick={() => void finishRoute()}>
              <defs><pattern id="tw-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="currentColor" strokeWidth="0.05" opacity="0.25" /></pattern></defs>
              <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="url(#tw-grid)" className="tw-gridbg" />
              {shapes.map((s0) => {
                const s = shapeOf(s0), on = s.id === sel
                if (s.kind === 'site') return (
                  <g key={s.id}>
                    {imgUrl && <image href={imgUrl} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="none" opacity={s.imageOpacity ?? 0.55} className="tw-plan" />}
                    <rect x={s.x} y={s.y} width={s.w} height={s.h} className="tw-site" onPointerDown={edit ? (e) => down(e, 'move', s) : undefined} />
                    {edit && <rect x={s.x + s.w - 2.4} y={s.y + s.h - 2.4} width={2.4} height={2.4} className="tw-handle" onPointerDown={(e) => down(e, 'size', s)} />}
                  </g>
                )
                if (s.kind === 'area') {
                  const a = state.areas.get(s.areaName), c = mode === 'progress' ? progressColor(a?.pct ?? 0) : a?.issues && mode === 'quality' ? '#ef4444' : '#64748b'
                  return (
                    <g key={s.id} className={`tw-area ${on ? 'on' : ''}`} onPointerDown={(e) => (edit ? down(e, 'move', s) : (e.stopPropagation(), setSel(s.id)))}>
                      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={1.2} style={{ fill: c, stroke: c }} />
                      <text x={s.x + s.w - 1.5} y={s.y + fsArea + 1} fontSize={fsArea} textAnchor="end" className="tw-label">{s.label || s.areaName}</text>
                      {a && <text x={s.x + 1.5} y={s.y + fsArea + 1} fontSize={fsArea} className="tw-pct">{pct(a.pct, 0)}</text>}
                      {edit && <rect x={s.x + s.w - 1.6} y={s.y + s.h - 1.6} width={1.6} height={1.6} className="tw-handle" onPointerDown={(e) => down(e, 'size', s)} />}
                    </g>
                  )
                }
                if (s.kind === 'line') {
                  const ls = state.lines.get(s.refId ?? ''), c = lineColor(ls, mode), pts = (route?.id === s.id ? route.pts : s.points).map((p) => p.join(',')).join(' ')
                  return (
                    <g key={s.id} className={`tw-line ${on ? 'on' : ''}`} onPointerDown={(e) => (edit ? down(e, 'move', s) : (e.stopPropagation(), setSel(s.id)))}>
                      <polyline points={pts} className="tw-line-hit" />
                      <polyline points={pts} style={{ stroke: c }} className="tw-line-run" />
                    </g>
                  )
                }
                if (s.kind === 'equipment') {
                  const es = state.equipment.get(s.refId ?? ''), c = eqColor(es, mode)
                  return (
                    <g key={s.id} className={`tw-eq ${on ? 'on' : ''}`} onPointerDown={(e) => (edit ? down(e, 'move', s) : (e.stopPropagation(), setSel(s.id)))}>
                      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={0.6} style={{ fill: c }} />
                      {es && es.pct > 0 && es.pct < 1 && <rect x={s.x} y={s.y + s.h - 0.7} width={s.w * es.pct} height={0.7} className="tw-eq-bar" />}
                      <text x={s.x + s.w / 2} y={s.y + s.h / 2 + fsSmall / 3} fontSize={fsSmall} textAnchor="middle" className="tw-eq-tag">{s.label}</text>
                      {es?.issues ? <circle cx={s.x + s.w} cy={s.y} r={0.9} className="tw-issue" /> : null}
                      {edit && <rect x={s.x + s.w - 1.2} y={s.y + s.h - 1.2} width={1.2} height={1.2} className="tw-handle" onPointerDown={(e) => down(e, 'size', s)} />}
                    </g>
                  )
                }
                return <text key={s.id} x={s.x} y={s.y} fontSize={fsSmall} className="tw-label">{s.label}</text>
              })}
            </svg>
          )}
          {shapes.length > 0 && <div className="tw-zoom no-print">
            <button className="im-btn im-btn-sm" onClick={() => zoom(1 / 1.3)} aria-label="بزرگ‌نمایی"><Plus size={14} /></button>
            <button className="im-btn im-btn-sm" onClick={() => zoom(1.3)} aria-label="کوچک‌نمایی"><Minus size={14} /></button>
            <button className="im-btn im-btn-sm" onClick={() => setVb(ext)} aria-label="نمای کامل"><Crosshair size={14} /></button>
          </div>}
          {route && <div className="tw-hint"><Route size={14} /> نقاط مسیر را روی نقشه بزنید؛ با دوبار کلیک یا «پایان مسیر» ذخیره می‌شود. <button className="im-btn im-btn-sm im-btn-primary" onClick={() => void finishRoute()}>پایان مسیر</button><button className="im-btn im-btn-sm" onClick={() => setRoute(null)}>انصراف</button></div>}
          {edit && !route && <div className="tw-hint"><Move size={14} /> شکل‌ها را بکشید؛ گوشهٔ ناحیه و تجهیز اندازه را تغییر می‌دهد. هر جابه‌جایی همان لحظه ذخیره می‌شود.</div>}
          <Legend mode={mode} />
        </div>

        <aside className="tw-side im-card" aria-live="polite">
          <div className="tw-overall"><span>پیشرفت ناحیه‌ها در {jalaliText(day)}</span><b>{pct(state.overall)}</b></div>
          {!selShape ? <AreaList state={state} onPick={(name) => setSel(shapes.find((s) => s.kind === 'area' && s.areaName === name)?.id ?? null)} />
            : selShape.kind === 'area' ? <AreaCard name={selShape.areaName} state={state} lines={st.lines} equipment={st.equipment} onClose={() => setSel(null)} />
            : selShape.kind === 'line' ? <LineCard line={lineById.get(selShape.refId ?? '')} s={state.lines.get(selShape.refId ?? '')} welds={st.welds} spools={st.spools} edit={edit} onRoute={() => setRoute({ id: selShape.id, pts: [] })} onClose={() => setSel(null)} />
            : selShape.kind === 'equipment' ? <EqCard eq={eqById.get(selShape.refId ?? '')} s={state.equipment.get(selShape.refId ?? '')} day={day} inspections={st.inspections} onClose={() => setSel(null)} /> : null}
        </aside>
      </div>
    </div>
  )
}

function Legend({ mode }: { mode: ColorMode }) {
  const items: [string, string][] = mode === 'progress' ? [['#64748b', 'شروع‌نشده'], [progressColor(0.3), 'در جریان'], [progressColor(0.7), 'پیشرفته'], ['#10b981', 'کامل']]
    : mode === 'welding' ? [['#94a3b8', 'فیت‌آپ'], ['#f59e0b', 'جوش یا NDT ناتمام'], ['#10b981', 'جوش و NDT کامل'], ['#ef4444', 'جوش ردشده']]
    : mode === 'testing' ? [[PACK_COLOR.none, 'بدون تست‌پک'], [PACK_COLOR.open, 'در حال تکمیل'], [PACK_COLOR.ready, 'آمادهٔ آزمون'], [PACK_COLOR.tested, 'آزمون‌شده'], [PACK_COLOR.reinstated, 'بازگردانی‌شده']]
    : [['#10b981', 'بدون مورد باز'], ['#f59e0b', 'منتظر NDT'], ['#ef4444', 'رد یا بازرسی ردشده']]
  return <div className="tw-legend">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
}
function AreaList({ state, onPick }: { state: ReturnType<typeof twinState>; onPick: (name: string) => void }) {
  const list = [...state.areas.entries()].sort((a, b) => a[1].pct - b[1].pct)
  return (
    <div className="tw-list">
      <p className="sub">روی ناحیه، تجهیز یا لاین بزنید تا جزئیاتش دیده شود. کمترین پیشرفت بالاتر:</p>
      {list.map(([name, a]) => <button key={name} type="button" className="tw-row" onClick={() => onPick(name)}><span>{name}{a.issues ? <Chip tone="bad">{fa(a.issues)}</Chip> : null}</span><span className="tw-bar-mini"><i style={{ width: `${a.pct * 100}%`, background: progressColor(a.pct) }} /></span><b>{pct(a.pct, 0)}</b></button>)}
    </div>
  )
}
const CardHead = ({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) => (
  <header className="tw-card-head"><div><b dir="auto">{title}</b>{sub && <span className="sub">{sub}</span>}</div><button className="im-btn im-btn-sm" onClick={onClose} aria-label="بستن"><X size={13} /></button></header>
)
function AreaCard({ name, state, lines, equipment, onClose }: { name: string; state: ReturnType<typeof twinState>; lines: { id: string; area: string; lineNo: string; archived: boolean }[]; equipment: { id: string; area: string; tag: string; archived: boolean }[]; onClose: () => void }) {
  const a = state.areas.get(name)
  const ls = lines.filter((l) => !l.archived && l.area === name), es = equipment.filter((e) => !e.archived && e.area === name)
  return (
    <div className="tw-card">
      <CardHead title={name} sub={a ? `${fa(a.lines)} لاین · ${fa(a.equipment)} تجهیز · ${fa(a.inchDia, 0)} اینچ‌قطر` : 'ثبتی به این ناحیه وصل نیست'} onClose={onClose} />
      {a && <div className="tw-big"><b>{pct(a.pct)}</b><span>پیشرفت ناحیه (پایپینگ به اینچ‌قطر و میانگین تجهیزات)</span></div>}
      {es.map((e) => { const s = state.equipment.get(e.id); return <div key={e.id} className="tw-row static"><span className="fn-code" dir="ltr">{e.tag}</span><span className="tw-bar-mini"><i style={{ width: `${(s?.pct ?? 0) * 100}%`, background: progressColor(s?.pct ?? 0) }} /></span><b>{pct(s?.pct ?? 0, 0)}</b></div> })}
      {ls.slice(0, 30).map((l) => { const s = state.lines.get(l.id); return <div key={l.id} className="tw-row static"><span className="fn-code" dir="ltr">{l.lineNo}</span><span className="tw-bar-mini"><i style={{ width: `${(s?.pct ?? 0) * 100}%`, background: progressColor(s?.pct ?? 0) }} /></span><b>{pct(s?.pct ?? 0, 0)}</b></div> })}
    </div>
  )
}
function LineCard({ line, s, welds, spools, edit, onRoute, onClose }: { line?: { id: string; lineNo: string; service: string; sizeIn: number; ndtPct: number }; s?: ReturnType<typeof twinState>['lines'] extends Map<string, infer V> ? V : never; welds: { lineId: string; sizeIn: number; archived: boolean }[]; spools: { lineId: string; stage: keyof typeof SPOOL_STAGE_FA; archived: boolean }[]; edit: boolean; onRoute: () => void; onClose: () => void }) {
  if (!line || !s) return <div className="tw-card"><CardHead title="لاین پیدا نشد" onClose={onClose} /></div>
  const id = welds.filter((w) => w.lineId === line.id && !w.archived).reduce((n, w) => n + inchDia(w as never), 0)
  const stages = spools.filter((x) => x.lineId === line.id && !x.archived).reduce<Record<string, number>>((m, x) => ({ ...m, [x.stage]: (m[x.stage] ?? 0) + 1 }), {})
  return (
    <div className="tw-card">
      <CardHead title={line.lineNo} sub={`${line.service || 'لاین'} · ${fa(line.sizeIn, 2)}″ · NDT ${pct(line.ndtPct / 100, 0)}`} onClose={onClose} />
      <div className="tw-big"><b>{pct(s.pct)}</b><span>پیشرفت جوش ({fa(id, 1)} اینچ‌قطر)</span></div>
      <dl className="tw-dl">
        <dt>سرجوش</dt><dd>{fa(s.welded)} از {fa(s.welds)} جوش‌شده</dd>
        <dt>NDT</dt><dd>{fa(s.accepted)} قبول{s.rejected ? ` · ${fa(s.rejected)} رد` : ''}{s.waitingNdt ? ` · ${fa(s.waitingNdt)} منتظر` : ''}</dd>
        <dt>اسپول</dt><dd>{s.spools ? Object.entries(stages).map(([k, n]) => `${SPOOL_STAGE_FA[k as keyof typeof SPOOL_STAGE_FA]} ${fa(n)}`).join('، ') : '—'}</dd>
        <dt>تست‌پک</dt><dd>{s.pack ? <><span className="fn-code" dir="ltr">{s.pack.packNo}</span> <i className="tw-dot" style={{ background: PACK_COLOR[s.packState] }} /> {({ none: '—', open: 'در حال تکمیل', ready: 'آمادهٔ آزمون', tested: 'آزمون‌شده', reinstated: 'بازگردانی‌شده' })[s.packState]}</> : 'بدون تست‌پک'}</dd>
        {s.issues > 0 && <><dt>موارد باز کیفی</dt><dd><Chip tone="bad">{fa(s.issues)}</Chip></dd></>}
      </dl>
      {edit && <button className="im-btn im-btn-sm" onClick={onRoute}><Route size={13} /> کشیدن مسیر لاین روی نقشه</button>}
    </div>
  )
}
function EqCard({ eq, s, day, inspections, onClose }: { eq?: { id: string; tag: string; title: string; kind: string; weightT: number | null; steps: Record<string, string> }; s?: { pct: number; next: string | null; issues: number }; day: string; inspections: { subjectId: string | null; itpKey: string; result: string; inspDate: string; archived: boolean }[]; onClose: () => void }) {
  if (!eq || !s) return <div className="tw-card"><CardHead title="تجهیز پیدا نشد" onClose={onClose} /></div>
  const ins = inspections.filter((i) => i.subjectId === eq.id && !i.archived && i.inspDate <= day)
  return (
    <div className="tw-card">
      <CardHead title={eq.tag} sub={[eq.title, EQ_KINDS[eq.kind], eq.weightT ? `${fa(eq.weightT)} تن` : ''].filter(Boolean).join(' · ')} onClose={onClose} />
      <div className="tw-big"><b>{pct(s.pct)}</b><span>نصب</span></div>
      <ol className="tw-steps">{EQ_STEPS.map((x) => { const d = eq.steps[x.key]; const done = !!d && d <= day; return <li key={x.key} className={done ? 'done' : ''}><i />{x.fa}<span>{done ? jalaliText(d) : '—'}</span></li> })}</ol>
      {ins.length > 0 && <p className="sub">بازرسی‌ها: {ins.map((i) => (i.result === 'accept' ? 'قبول' : i.result === 'reject' ? 'رد' : 'در انتظار')).join('، ')}</p>}
    </div>
  )
}
