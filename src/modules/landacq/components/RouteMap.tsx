import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import type { Activity, RouteInfo } from '../types'
import { fit, pointAt, polyline, schematicGeometry, slice } from '../lib/geometry'
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
}) {
  const hasGeo = route.geometry.length >= 2
  const pts = useMemo(() => (hasGeo ? route.geometry : schematicGeometry(route.totalKm)), [hasGeo, route.geometry, route.totalKm])
  const line = useMemo(() => polyline(pts), [pts])
  const [box, setBox] = useState({ w: W, h: height })
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null)
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
      const k = Math.max(0.8, Math.min(12, v.k * f))
      const r = k / v.k
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }
    })
  }
  const reset = () => setView({ k: 1, x: 0, y: 0 })

  const onDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onUp = () => {
    drag.current = null
  }
  const tipRow = tip ? rows.find((r) => r.parcel.id === tip.id) : null

  return (
    <div className="la-map" ref={wrap} style={{ height }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label="نقشهٔ مسیر و وضعیت تحصیل اراضی" onClick={() => !drag.current?.moved && onSelect(null)}>
        <defs>
          <pattern id="la-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--la-grid)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={box.w} height={box.h} fill="url(#la-grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
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
                  if (!drag.current?.moved) onSelect(r.parcel.id)
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
          {selectedId && segs.filter((s) => s.r.parcel.id === selectedId).map(({ d }) => (
            <path key="sel" d={d} fill="none" stroke="var(--la-ink)" strokeWidth={13} strokeOpacity={0.25} strokeLinecap="butt" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          ))}
          {segs.filter(({ r }) => !r.released && (r.early.state === 'action_required' || r.crit.level === 'critical')).map(({ r, mid }) => (
            <g key={`p${r.parcel.id}`} className="la-pin" transform={`translate(${mid[0]} ${mid[1]}) scale(${1 / view.k})`}>
              {r.early.state === 'action_required' && <circle className="la-pulse" r={7} fill="#ef4444" />}
              <circle r={5} fill="#ef4444" stroke="var(--la-map)" strokeWidth={2} />
            </g>
          ))}
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
