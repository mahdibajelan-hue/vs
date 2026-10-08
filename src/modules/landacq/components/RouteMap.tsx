import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, LocateFixed, Minus, Plus, Undo2 } from 'lucide-react'
import type { Activity, Crossing, RouteInfo } from '../types'
import { CROSSING, CROSSING_STATUS_COLOR, STATION, type CrossingState } from '../lib/facilities'
import { STATUS_COLOR } from '../lib/status'
import { fit, pointAt, polyline, schematicGeometry, slice, type LonLat } from '../lib/geometry'
import { BASEMAPS, visibleTiles, type Basemap } from '../lib/tiles'
import { fmtAreaM2, fmtLength, pathLength, polygonAreaLonLat } from '../lib/measure'
import { fromUtm } from '../lib/utm'
import { fmtKm, fmtKmRange } from '../lib/dates'
import { frontKm } from '../lib/schedule'
import { parcelColor, type ColorMode } from '../lib/colors'
import { STATUS_LABEL } from '../lib/status'
import { LEVEL_LABEL } from '../lib/labels'
import type { Analysis } from '../lib/kpis'

const W = 1000

export function RouteMap({
  route,
  rows,
  mode,
  selectedId,
  onSelect,
  activities = [],
  today,
  height = 440,
  showFronts = true,
  basemap = 'none',
  tool = 'none',
  showPlots = true,
  plotRows,
  stations = [],
  crossings = [],
  onSelectCrossing,
}: {
  route: RouteInfo
  rows: Analysis[]
  mode: ColorMode
  selectedId: string | null
  onSelect: (id: string | null) => void
  activities?: Activity[]
  today: string
  height?: number
  showFronts?: boolean
  /** Optional satellite / street tiles under the route (needs real coordinates). */
  basemap?: Basemap
  /** Rough surveying tools: click to add points. */
  tool?: 'none' | 'length' | 'area'
  showPlots?: boolean
  /** Parcels whose cadastral plots are drawn (default: the route parcels in `rows`). */
  plotRows?: Analysis[]
  /** Station sites (parcels of kind 'station') to mark on the map. */
  stations?: Analysis[]
  crossings?: { c: Crossing; st: CrossingState }[]
  onSelectCrossing?: (id: string) => void
}) {
  const hasGeo = route.geometry.length >= 2
  const pts = useMemo(() => (hasGeo ? route.geometry : schematicGeometry(route.totalKm)), [hasGeo, route.geometry, route.totalKm])
  const line = useMemo(() => polyline(pts), [pts])
  const [box, setBox] = useState({ w: W, h: height })
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null)
  /** A pan just ended: the click that follows it must not select / measure. */
  const movedRef = useRef(false)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || W, h: el.clientHeight || height }))
    ro.observe(el)
    setBox({ w: el.clientWidth || W, h: el.clientHeight || height })
    return () => ro.disconnect()
  }, [height])

  // non-passive wheel so the page does not scroll while zooming the map
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const proj = useMemo(() => fit(pts, box.w, box.h, 36), [pts, box.w, box.h])
  const frac = (km: number) => (km - route.startKm) / route.totalKm

  const segs = useMemo(
    () =>
      rows.map((r) => {
        const path = slice(line, frac(r.parcel.kmStart), frac(r.parcel.kmEnd)).map(proj)
        const mid = proj(pointAt(line, frac((r.parcel.kmStart + r.parcel.kmEnd) / 2)))
        return { r, d: path.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), mid }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, line, proj, route.startKm, route.totalKm],
  )
  const base = useMemo(() => pts.map(proj).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), [pts, proj])
  const ticks = useMemo(() => {
    const out: { km: number; p: [number, number] }[] = []
    const step = route.totalKm > 150 ? 20 : 10
    for (let km = Math.ceil(route.startKm / step) * step; km <= route.startKm + route.totalKm + 1e-6; km += step) out.push({ km, p: proj(pointAt(line, frac(km))) })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, proj, route.startKm, route.totalKm])
  const fronts = useMemo(
    () => (showFronts ? activities.map((a) => ({ a, km: frontKm(a, today) })).filter((f): f is { a: Activity; km: number } => f.km != null && f.km >= route.startKm && f.km <= route.startKm + route.totalKm).map((f) => ({ name: f.a.name, km: f.km, p: proj(pointAt(line, frac(f.km))) })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, today, line, proj, showFronts, route.startKm, route.totalKm],
  )

  function zoomAt(f: number, cx: number, cy: number) {
    setView((v) => {
      const k = Math.max(0.8, Math.min(800, v.k * f))
      const r = k / v.k
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }
    })
  }
  const reset = () => setView({ k: 1, x: 0, y: 0 })

  const onDown = (e: React.PointerEvent) => {
    movedRef.current = false
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true
      movedRef.current = true
      // capture only once it is a real pan, so plain clicks still reach the parcel under the cursor
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    }
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onUp = () => {
    drag.current = null
  }
  const live = hasGeo
  const tiles = useMemo(() => (live && basemap !== 'none' ? visibleTiles(proj, box, view, basemap) : []), [live, basemap, proj, box, view])
  // cadastral plots: UTM corners -> lon/lat -> screen (pre-zoom) coordinates, with the owner's name at the centroid
  const plotShapes = useMemo(
    () =>
      live && showPlots
        ? (plotRows ?? rows).flatMap((r) =>
            r.parcel.plots.filter((x) => x.corners.length >= 3).map((x) => {
              const ll = x.corners.map((c) => fromUtm(c[0], c[1], x.zone, x.north) as LonLat)
              const px = ll.map(proj)
              const cx = px.reduce((a, q) => a + q[0], 0) / px.length
              const cy = px.reduce((a, q) => a + q[1], 0) / px.length
              return { id: x.id, parcelId: r.parcel.id, label: x.ownerName || x.plotNo || '', d: px.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ') + ' Z', cx, cy, color: parcelColor(r, mode) }
            }),
          )
        : [],
    [live, showPlots, plotRows, rows, proj, mode],
  )
  // station and crossing markers: explicit coordinates when given, else the chainage point on the route line
  const markers = useMemo(() => {
    const at = (km: number, lon: number | null, lat: number | null) => (lon != null && lat != null ? proj([lon, lat]) : proj(pointAt(line, frac(km))))
    return {
      stations: stations.map((r) => ({ r, p: at(r.parcel.kmStart, r.parcel.siteLon, r.parcel.siteLat) })),
      crossings: crossings.map((x) => ({ x, p: at(x.c.km, null, null) })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, crossings, line, proj, route.startKm, route.totalKm])
  // measuring
  const [mpts, setMpts] = useState<LonLat[]>([])
  useEffect(() => setMpts([]), [tool])
  const addMeasure = (e: React.MouseEvent) => {
    if (movedRef.current || !wrap.current || !live) return
    const rect = wrap.current.getBoundingClientRect()
    setMpts((m) => [...m, proj.invert([(e.clientX - rect.left - view.x) / view.k, (e.clientY - rect.top - view.y) / view.k])])
  }
  const mpx = mpts.map(proj)
  const mLen = pathLength(mpts, tool === 'area')
  const mArea = tool === 'area' ? polygonAreaLonLat(mpts) : 0
  const tipRow = tip ? rows.find((r) => r.parcel.id === tip.id) : null

  return (
    <div className="la-map" ref={wrap} style={{ height }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label="نقشهٔ مسیر و وضعیت تحصیل اراضی" onClick={(e) => (tool !== 'none' ? addMeasure(e) : !movedRef.current && onSelect(null))} style={{ cursor: tool !== 'none' ? 'crosshair' : undefined }}>
        <defs>
          <pattern id="la-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--la-grid)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={box.w} height={box.h} fill="url(#la-grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {tiles.map((t) => <image key={t.key} href={t.url} x={t.x} y={t.y} width={t.w} height={t.h} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />)}
          {tiles.length > 0 && <path d={base} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          <path d={base} fill="none" stroke="var(--la-line-2)" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {segs.map(({ r, d }) => (
            <path key={`c${r.parcel.id}`} d={d} fill="none" stroke="var(--la-map)" strokeWidth={10} strokeLinecap="butt" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
          {segs.map(({ r, d }) => {
            const sel = r.parcel.id === selectedId
            return (
              <path
                key={r.parcel.id}
                className="la-seg-line"
                d={d}
                fill="none"
                stroke={parcelColor(r, mode)}
                strokeWidth={sel ? 10 : 7}
                strokeLinecap="butt"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={selectedId && !sel ? 0.55 : 1}
                onClick={(e) => {
                  e.stopPropagation()
                  if (tool !== 'none') return addMeasure(e)
                  if (!movedRef.current) onSelect(r.parcel.id)
                }}
                onPointerEnter={(e) => {
                  const rect = wrap.current!.getBoundingClientRect()
                  setTip({ id: r.parcel.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
                onPointerMove={(e) => {
                  const rect = wrap.current!.getBoundingClientRect()
                  setTip({ id: r.parcel.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
                onPointerLeave={() => setTip(null)}
              />
            )
          })}
          {plotShapes.map((x) => (
            <g key={x.id} onClick={(e) => { e.stopPropagation(); if (tool !== 'none') addMeasure(e); else if (!movedRef.current) onSelect(x.parcelId) }} style={{ cursor: 'pointer' }}>
              <path d={x.d} fill={x.color} fillOpacity={0.4} stroke={x.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              {x.label && view.k >= 1.6 && <text x={x.cx} y={x.cy} textAnchor="middle" fontSize={11 / view.k} fontWeight={700} fill="var(--la-ink)" stroke="var(--la-map)" strokeWidth={3 / view.k} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{x.label}</text>}
            </g>
          ))}
          {mpx.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {tool === 'area' && mpx.length >= 3 && <polygon points={mpx.map((q) => q.join(',')).join(' ')} fill="#f59e0b" fillOpacity={0.22} />}
              <polyline points={(tool === 'area' && mpx.length >= 3 ? [...mpx, mpx[0]] : mpx).map((q) => q.join(',')).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={2.2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              {mpx.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={4 / view.k} fill="#fff" stroke="#f59e0b" strokeWidth={2 / view.k} />)}
            </g>
          )}
          {selectedId && segs.filter((s) => s.r.parcel.id === selectedId).map(({ d }) => (
            <path key="sel" d={d} fill="none" stroke="var(--la-ink)" strokeWidth={13} strokeOpacity={0.25} strokeLinecap="butt" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          ))}
          {segs.filter(({ r }) => !r.released && (r.early.state === 'action_required' || r.crit.level === 'critical')).map(({ r, mid }) => (
            <g key={`p${r.parcel.id}`} className="la-pin" transform={`translate(${mid[0]} ${mid[1]}) scale(${1 / view.k})`}>
              {r.early.state === 'action_required' && <circle className="la-pulse" r={7} fill="#ef4444" />}
              <circle r={5} fill="#ef4444" stroke="var(--la-map)" strokeWidth={2} />
            </g>
          ))}
          {markers.crossings.map(({ x, p }) => (
            <g key={x.c.id} transform={`translate(${p[0]} ${p[1]}) scale(${1 / view.k})`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (tool !== 'none') addMeasure(e); else if (!movedRef.current) onSelectCrossing?.(x.c.id) }}>
              <title>{`${CROSSING[x.c.crossingType].label}${x.c.name ? ` ${x.c.name}` : ''} · KM ${fmtKm(x.c.km)}`}</title>
              <path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill={CROSSING[x.c.crossingType].color} stroke={x.st.status === 'critical' || x.st.status === 'attention' ? CROSSING_STATUS_COLOR[x.st.status] : '#fff'} strokeWidth={x.st.status === 'critical' || x.st.status === 'attention' ? 3 : 1.6} />
              {x.st.ready && <circle r={3} fill="#fff" />}
            </g>
          ))}
          {markers.stations.map(({ r, p }) => {
            const t = r.parcel.stationType
            const col = t ? STATION[t].color : '#94a3b8'
            return (
              <g key={r.parcel.id} transform={`translate(${p[0]} ${p[1] - 16 / view.k}) scale(${1 / view.k})`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (tool !== 'none') addMeasure(e); else if (!movedRef.current) onSelect(r.parcel.id) }}>
                <title>{`${t ? STATION[t].label : 'ایستگاه'} · KM ${fmtKm(r.parcel.kmStart)} · ${STATUS_LABEL[r.status]}`}</title>
                <rect x={-13} y={-10} width={26} height={20} rx={5} fill={col} stroke={r.parcel.id === selectedId ? 'var(--la-ink)' : '#fff'} strokeWidth={r.parcel.id === selectedId ? 3 : 1.6} />
                <rect x={-13} y={7} width={26} height={4} rx={2} fill={STATUS_COLOR[r.status]} stroke="#fff" strokeWidth={1} />
                <text y={4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none', fontFamily: 'var(--font-mono)' }}>{t ? STATION[t].short : 'ST'}</text>
              </g>
            )
          })}
          {[...fronts].sort((a, b) => a.km - b.km).map((f, i) => (
            <g key={f.name} className="la-pin" transform={`translate(${f.p[0]} ${f.p[1]}) scale(${1 / view.k})`}>
              <circle r={4.5} fill="var(--la-surface)" stroke="var(--la-ink)" strokeWidth={2} />
              <text x={9} y={-7 - (i % 6) * 12} fontSize={10.5} fontWeight={600} fill="var(--la-ink)" stroke="var(--la-map)" strokeWidth={3} paintOrder="stroke" direction="ltr">{f.name} · {fmtKm(f.km)}</text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t.km} className="la-pin" transform={`translate(${t.p[0]} ${t.p[1]}) scale(${1 / view.k})`}>
              <circle r={2.4} fill="var(--la-ink-2)" />
              <text x={0} y={-12} textAnchor="middle" fontSize={10} fill="var(--la-ink-2)" stroke="var(--la-map)" strokeWidth={3} paintOrder="stroke" style={{ fontFamily: 'var(--font-mono)' }}>{t.km}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="la-map-ctl">
        <button className="la-btn la-btn-icon" onClick={() => zoomAt(1.4, box.w / 2, box.h / 2)} aria-label="بزرگ‌نمایی"><Plus size={15} /></button>
        <button className="la-btn la-btn-icon" onClick={() => zoomAt(1 / 1.4, box.w / 2, box.h / 2)} aria-label="کوچک‌نمایی"><Minus size={15} /></button>
        <button className="la-btn la-btn-icon" onClick={reset} aria-label="نمای کامل مسیر"><LocateFixed size={15} /></button>
      </div>
      {tool !== 'none' && hasGeo && (
        <div className="la-map-measure" role="status">
          <b>{tool === 'length' ? 'خط‌کش طول' : 'اندازه‌گیری مساحت'}</b>
          {mpts.length < (tool === 'area' ? 3 : 2) ? <span>برای شروع روی نقشه کلیک کنید{tool === 'area' ? ' (حداقل ۳ نقطه)' : ''}</span> : tool === 'length' ? <span>طول: <b>{fmtLength(mLen)}</b></span> : <span>مساحت: <b>{fmtAreaM2(mArea)}</b> · محیط: <b>{fmtLength(mLen)}</b></span>}
          <span className="la-eyebrow">محاسبهٔ تقریبی؛ برای کار حقوقی از برداری رسمی استفاده کنید.</span>
          <span className="flex gap-1.5">
            <button className="la-btn la-btn-sm" onClick={() => setMpts((m) => m.slice(0, -1))} disabled={!mpts.length}><Undo2 size={13} /> برگشت</button>
            <button className="la-btn la-btn-sm" onClick={() => setMpts([])} disabled={!mpts.length}><Eraser size={13} /> پاک کردن</button>
          </span>
        </div>
      )}
      {tiles.length > 0 && <span className="la-map-credit">{BASEMAPS[basemap as Exclude<Basemap, 'none'>].credit}</span>}
      {!hasGeo && <span className="la-badge" style={{ position: 'absolute', insetInlineEnd: 10, top: 10, background: 'var(--la-surface)' }}>نمای شماتیک — مختصات مسیر ثبت نشده</span>}
      {tip && tipRow && (
        <div className="la-map-tip" style={{ left: Math.min(tip.x + 14, box.w - 250), top: Math.max(8, tip.y - 70) }}>
          <b className="la-km block">{fmtKmRange(tipRow.parcel.kmStart, tipRow.parcel.kmEnd)}</b>
          <span>{tipRow.parcel.code} · {STATUS_LABEL[tipRow.status]}</span>
          <span className="block" style={{ color: 'var(--la-muted)' }}>Criticality {LEVEL_LABEL[tipRow.crit.level]} ({tipRow.crit.score})</span>
        </div>
      )}
    </div>
  )
}
