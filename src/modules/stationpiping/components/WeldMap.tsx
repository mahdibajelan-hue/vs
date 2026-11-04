import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CheckCircle2, Crosshair, Flame, MapPin, Minus, Plus, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { todayTehran } from '../../../lib/today'
import { useSpStore } from '../store/useSpStore'
import { COAT_TYPES, NDT_FA, type Weld } from '../lib/spCore'
import { drawingUrl, type StationRec } from '../repo'
import { fa, jd } from '../StationPipingApp'
import { WeldForm } from './StationPage'

/** the marker's label: the weld number's trailing digits («MLV-01-W016» → «16»), the full number is in its tooltip */
const shortNo = (no: string) => { const m = /(\d+)\D*$/.exec(no); return m ? String(Number(m[1])) : no.slice(-4) }
/** a weld's state on the map: not welded / welded (radiography pending) / accepted (blasting or coating to do) / rejected /
 * finished (blasted, and coated when buried; an above-ground joint is finished with the painting) */
const STATE = (w: Weld) => (!w.weldDate ? 'todo' : w.ndtResult === 'rejected' ? 'bad' : w.ndtResult === 'pending' ? 'ndt' : w.blastDate && (!w.buried || w.coatDate) ? 'fin' : 'ok')
const STATE_UI = {
  todo: { label: 'زده‌نشده', color: '#94a3b8' }, ndt: { label: 'در انتظار رادیوگرافی', color: '#3b82f6' }, ok: { label: 'قبول — در انتظار زنگ‌زدایی / عایق', color: '#22c55e' },
  bad: { label: 'مردود / تعمیر', color: '#ef4444' }, fin: { label: 'تکمیل (زنگ‌زدایی و عایق)', color: '#0e7490' },
} as const

/**
 * The weld map: a station drawing (image) with every weld marked where it is. Pick a weld from the list and click on the
 * drawing to place it; click a marker to see it and record welding / NDT. Colours follow the weld's state.
 */
export function WeldMap({ station }: { station: StationRec }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const images = st.drawings.filter((d) => d.stationId === station.id && d.filePath && (d.mime ?? '').startsWith('image/'))
  const [did, setDid] = useState<string | null>(() => images.find((d) => d.kind === 'weld_map')?.id ?? images[0]?.id ?? null)
  const drawing = images.find((d) => d.id === did) ?? null
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [placing, setPlacing] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [edit, setEdit] = useState<Weld | null>(null)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => { let alive = true; setUrl(null); if (drawing?.filePath) drawingUrl(drawing.filePath).then((u) => { if (alive) setUrl(u) }).catch(() => {}); return () => { alive = false } }, [drawing?.filePath])
  const welds = st.welds.filter((w) => w.stationId === station.id)
  const onMap = welds.filter((w) => w.drawingId === drawing?.id && w.x != null && w.y != null)
  const unplaced = welds.filter((w) => !(w.drawingId === drawing?.id && w.x != null)).filter((w) => !q || w.weldNo.toLowerCase().includes(q.toLowerCase()))
  const counts = useMemo(() => { const c = { todo: 0, ndt: 0, ok: 0, bad: 0, fin: 0 }; for (const w of onMap) c[STATE(w)]++; return c }, [onMap])
  const focused = welds.find((w) => w.id === focus) ?? null

  if (!images.length) return (
    <section className="ps-card"><p className="ps-hint"><MapPin size={14} /> برای نقشهٔ جوش، در بخش «نقشه‌ها» یک تصویر (PNG / JPG / SVG) از نقشهٔ پایپینگ یا Weld Map این ایستگاه بارگذاری کنید. فایل‌های PDF و DWG فقط برای مشاهده نگه داشته می‌شوند.</p></section>
  )
  const place = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || !drawing) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    const w = welds.find((z) => z.id === placing); if (!w) return
    if (await st.saveWeld({ ...w, drawingId: drawing.id, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 }, email)) { setFocus(w.id); setPlacing(unplaced.find((z) => z.id !== w.id)?.id ?? null) }
  }
  return (
    <div className="spx-map-layout">
      <section className="ps-card spx-map-card">
        <header className="ps-card-head">
          <b><MapPin size={15} /> نقشهٔ جوش</b>
          <select value={drawing?.id ?? ''} onChange={(e) => { setDid(e.target.value); setFocus(null) }} aria-label="نقشه">{images.map((d) => <option key={d.id} value={d.id}>{d.number ? `${d.number} — ` : ''}{d.title}</option>)}</select>
          <span className="spx-zoom"><button type="button" className="ps-btn is-ghost" aria-label="کوچک‌نمایی" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><Minus size={13} /></button><b>{fa(zoom * 100)}٪</b><button type="button" className="ps-btn is-ghost" aria-label="بزرگ‌نمایی" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><Plus size={13} /></button></span>
        </header>
        <div className="spx-map-legend">{(Object.keys(STATE_UI) as (keyof typeof STATE_UI)[]).map((k) => <span key={k}><i style={{ background: STATE_UI[k].color }} />{STATE_UI[k].label} {fa(counts[k])}</span>)}</div>
        {placing && <p className="spx-placing"><Crosshair size={14} /> جای جوش «{welds.find((w) => w.id === placing)?.weldNo}» را روی نقشه کلیک کنید. <button type="button" className="ps-btn is-ghost" onClick={() => setPlacing(null)}>انصراف</button></p>}
        <div className="spx-map-scroll">
          <div ref={boxRef} className={`spx-map${placing ? ' is-placing' : ''}`} style={{ width: `${zoom * 100}%` }} onClick={place}>
            {url ? <img src={url} alt={drawing?.title ?? 'نقشه'} draggable={false} /> : <div className="spx-map-loading">در حال بارگذاری نقشه…</div>}
            {onMap.map((w) => { const s = STATE(w); return (
              <button key={w.id} type="button" className={`spx-pin${focus === w.id ? ' is-focus' : ''}`} style={{ left: `${(w.x as number) * 100}%`, top: `${(w.y as number) * 100}%`, '--c': STATE_UI[s].color } as CSSProperties}
                onClick={(e) => { e.stopPropagation(); if (!placing) setFocus(w.id) }} title={`${w.weldNo} · ${STATE_UI[s].label}`} aria-label={`جوش ${w.weldNo}`}><span>{shortNo(w.weldNo)}</span></button>
            ) })}
          </div>
        </div>
      </section>

      <aside className="ps-card spx-map-side">
        {focused ? (
          <div className="spx-focus">
            <header><b dir="ltr">{focused.weldNo}</b><span className="spx-ndt" style={{ color: STATE_UI[STATE(focused)].color }}>{STATE_UI[STATE(focused)].label}</span></header>
            <dl>
              <div><dt>قطر / نوع</dt><dd>{fa(focused.sizeIn, 2)}″ · {focused.jointType}</dd></div>
              <div><dt>جوشکار</dt><dd dir="ltr">{focused.welder || '—'}</dd></div>
              <div><dt>تاریخ جوش</dt><dd>{jd(focused.weldDate)}</dd></div>
              <div><dt>NDT</dt><dd>{focused.ndtMethod} · {NDT_FA[focused.ndtResult]}{focused.ndtDate ? ` · ${jd(focused.ndtDate)}` : ''}</dd></div>
              {focused.repairs > 0 && <div><dt>تعمیر</dt><dd>{fa(focused.repairs)} بار</dd></div>}
              <div><dt>موقعیت</dt><dd>{focused.buried ? 'مدفون' : 'روزمینی'}</dd></div>
              <div><dt>زنگ‌زدایی</dt><dd>{jd(focused.blastDate)}</dd></div>
              {focused.buried && <div><dt>عایق سرجوش</dt><dd>{jd(focused.coatDate)}{focused.coatType ? ` · ${focused.coatType.split(' (')[0]}` : ''}</dd></div>}
            </dl>
            <div className="spx-focus-actions">
              {!focused.weldDate && <button type="button" className="ps-btn is-primary" onClick={() => st.patchWelds([focused.id], { weld_date: todayTehran() }, 'جوشکاری امروز ثبت شد')}><Flame size={13} /> جوشکاری امروز</button>}
              {focused.weldDate && focused.ndtResult !== 'accepted' && <button type="button" className="ps-btn" onClick={() => st.patchWelds([focused.id], { ndt_date: todayTehran(), ndt_result: 'accepted' }, 'NDT قبول ثبت شد')}><CheckCircle2 size={13} /> NDT قبول</button>}
              {focused.weldDate && focused.ndtResult !== 'rejected' && <button type="button" className="ps-btn" onClick={() => st.patchWelds([focused.id], { ndt_date: todayTehran(), ndt_result: 'rejected', repairs: focused.repairs + 1 }, 'NDT مردود ثبت شد')}><XCircle size={13} /> NDT مردود</button>}
              {focused.weldDate && focused.ndtResult !== 'pending' && focused.ndtResult !== 'rejected' && !focused.blastDate && <button type="button" className="ps-btn" onClick={() => st.patchWelds([focused.id], { blast_date: todayTehran() }, 'زنگ‌زدایی سرجوش ثبت شد')}><Sparkles size={13} /> زنگ‌زدایی امروز</button>}
              {focused.buried && focused.blastDate && !focused.coatDate && <button type="button" className="ps-btn" onClick={() => st.patchWelds([focused.id], { coat_date: todayTehran(), coat_type: focused.coatType || COAT_TYPES[0] }, 'عایق‌کاری سرجوش ثبت شد')}><ShieldCheck size={13} /> عایق سرجوش امروز</button>}
              <button type="button" className="ps-btn is-ghost" onClick={() => setEdit(focused)}>ویرایش کامل</button>
              <button type="button" className="ps-btn is-ghost" onClick={() => setPlacing(focused.id)}><Crosshair size={13} /> جابه‌جایی</button>
              <button type="button" className="ps-btn is-ghost" onClick={() => setFocus(null)}>بستن</button>
            </div>
          </div>
        ) : (
          <>
            <b className="spx-side-title">جوش‌های علامت‌نخورده روی این نقشه ({fa(unplaced.length)})</b>
            <input className="spx-search" placeholder="جستجوی شمارهٔ جوش" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو" />
            {welds.length === 0 ? <p className="ps-hint">ابتدا در «خطوط و جوش‌ها» جوش‌ها را ثبت کنید.</p> : (
              <ul className="spx-unplaced">{unplaced.slice(0, 200).map((w) => <li key={w.id}><button type="button" aria-pressed={placing === w.id} onClick={() => setPlacing(placing === w.id ? null : w.id)}><Crosshair size={13} /> <b dir="ltr">{w.weldNo}</b><small>{fa(w.sizeIn, 2)}″ · {STATE_UI[STATE(w)].label}</small></button></li>)}</ul>
            )}
          </>
        )}
      </aside>
      {edit && <div className="spx-map-edit"><WeldForm station={station} w={edit} onClose={() => setEdit(null)} /></div>}
    </div>
  )
}
