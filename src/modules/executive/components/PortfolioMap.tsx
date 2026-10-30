import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, Cylinder, Factory, Flame, FlaskConical, Gauge, Layers, MapPin, Maximize2, Network, RadioTower, Spline, Tag, Waypoints, Building2, type LucideIcon } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import type { MasterProject } from '../../masterdata/types'
import type { PfProjectView } from '../lib/portfolioCore'
import { FACILITY_FA, facilityOf, isLinear, mapHeight, PROVINCES, project, projectPlace, statusOf, STATUS_FA, type Facility, type Status } from '../lib/dashboardCore'
import { classBreaks, classOf, provinceAt, provinceBox, provinceStats, routeProvinces, type ProvinceStat } from '../lib/geoCore'
import { IRAN_PROVINCES } from '../lib/iranProvinces'
import { useTabIndicator } from '../../../components/common/useTabIndicator'
import { faNum, fmtMoney } from './pfUi'

const W = 600
const H = mapHeight(W)
const FULL: VB = [0, 0, W, H]
type VB = [number, number, number, number]

export const FACILITY_ICON: Record<Facility, LucideIcon> = {
  pipeline: Spline, network: Network, compressor: Gauge, refinery: Factory, gas_plant: Flame, petrochem: FlaskConical, storage: Cylinder, control: RadioTower, other: Building2,
}

/** land-acquisition routes (KMZ) of every project the user can read, thinned on the server; one read per session */
let routesPromise: Promise<Map<string, { km: number; demo: boolean; points: [number, number][] }>> | null = null
function loadRoutes() {
  routesPromise ??= Promise.resolve(supabase.rpc('pf_route_lines')).then(({ data, error }) => {
    if (error) { routesPromise = null; return new Map() }
    return new Map(((data ?? []) as { master_project_id: string; total_km: number | string; is_demo: boolean; points: [number, number][] }[])
      .filter((r) => Array.isArray(r.points) && r.points.length >= 2)
      .map((r) => [r.master_project_id, { km: Number(r.total_km), demo: r.is_demo, points: r.points }]))
  })
  return routesPromise
}

/* ── what the provinces are coloured by ───────────────────────────── */
type Metric = 'count' | 'budget' | 'status'
const METRICS: { key: Metric; label: string }[] = [{ key: 'count', label: 'تعداد پروژه' }, { key: 'budget', label: 'بودجه' }, { key: 'status', label: 'وضعیت' }]
const HUE: Record<Exclude<Metric, 'status'>, string> = { count: '#0d9488', budget: '#6366f1' }
const STEP = [24, 40, 56, 72, 88] // % of the hue mixed into the land colour, class 1 → 5
const SEVERITY: Status[] = ['critical', 'attention', 'good', 'unknown']

type Layer = 'borders' | 'names' | 'lines' | 'facilities'
const LAYERS: { key: Layer; label: string; icon: LucideIcon }[] = [
  { key: 'borders', label: 'مرز استان‌ها', icon: Waypoints },
  { key: 'names', label: 'نام استان‌ها', icon: Tag },
  { key: 'lines', label: 'خطوط لوله', icon: Spline },
  { key: 'facilities', label: 'تأسیسات', icon: Factory },
]
const LAYER_KEY = 'farin.pf.mapLayers.v1'
const METRIC_KEY = 'farin.pf.mapMetric.v1'
function readLayers(): Record<Layer, boolean> {
  const all = { borders: true, names: true, lines: true, facilities: true }
  try { return { ...all, ...JSON.parse(localStorage.getItem(LAYER_KEY) ?? '{}') } } catch { return all }
}
function readMetric(): Metric {
  try { const m = localStorage.getItem(METRIC_KEY); return m === 'budget' || m === 'status' ? m : 'count' } catch { return 'count' }
}

const path = (pts: [number, number][]) => pts.map(([lng, lat], i) => { const [x, y] = project(lng, lat, W); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}` }).join('')
const provincePaths = IRAN_PROVINCES.map((p) => ({ name: p.name, d: p.rings.map((r) => `${path(r)}Z`).join(''), label: project(p.label[0], p.label[1], W) }))
/** a few degrees of latitude / longitude, drawn faintly over the sea for a sense of place */
const graticule = [...[26, 28, 30, 32, 34, 36, 38].map((lat) => path([[43.8, lat], [63.5, lat]])), ...[46, 50, 54, 58, 62].map((lng) => path([[lng, 24.9], [lng, 39.9]]))].join('')

/** the province, framed with some margin and at the map's own aspect ratio */
function frameOf(name: string): VB {
  const b = provinceBox(name)
  if (!b) return FULL
  const [x0, y0] = project(b[0], b[3], W), [x1, y1] = project(b[2], b[1], W)
  let w = (x1 - x0) * 1.5, h = (y1 - y0) * 1.5
  if (w / h > W / H) h = w * (H / W); else w = h * (W / H)
  w = Math.max(w, W / 6); h = w * (H / W)
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]
}
const ease = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2) // strong ease-in-out: the camera moves across the screen

interface Mark { v: PfProjectView; facility: Facility; status: Status; x: number; y: number; place: string; provinces: { name: string; share: number }[]; route: { d: string; km: number; demo: boolean; ends: [number, number][] } | null; from: 'route' | 'location' | 'name' }

/**
 * Iran by province, coloured by the number of projects, their budget or their worst status. Pipelines are drawn from
 * their land-acquisition KMZ routes and point facilities as symbols. Hovering a province shows its totals; choosing one
 * (on the map or in the list beside it) moves the camera to it and lists its projects.
 */
export function PortfolioMap({ views, byId, footer }: { views: PfProjectView[]; byId: Map<string, MasterProject>; footer?: ReactNode }) {
  const updateProject = useMasterDataStore((s) => s.updateProject)
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof loadRoutes>> | null>(null)
  const [layers, setLayers] = useState(readLayers)
  const [metric, setMetricState] = useState<Metric>(readMetric)
  const [sel, setSel] = useState<string | null>(null)
  const [province, setProvince] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  /** the tooltip appears only while the pointer is over the map, not when a province is highlighted from the list */
  const [tip, setTip] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [vb, setVb] = useState<VB>(FULL)
  const vbRef = useRef<VB>(FULL)
  const frame = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const seg = useTabIndicator<HTMLDivElement>(metric)

  useEffect(() => { let live = true; void loadRoutes().then((r) => { if (live) setRoutes(r) }); return () => { live = false } }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  /** on a narrow screen the whole map shrinks; symbols and names keep a readable size instead */
  const [grow, setGrow] = useState(1)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setGrow(Math.min(1.7, Math.max(1, W / Math.max(1, e.contentRect.width)))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const toggle = (k: Layer) => setLayers((l) => { const n = { ...l, [k]: !l[k] }; try { localStorage.setItem(LAYER_KEY, JSON.stringify(n)) } catch { /* private mode */ } return n })
  const setMetric = (m: Metric) => { setMetricState(m); try { localStorage.setItem(METRIC_KEY, m) } catch { /* private mode */ } }

  /** move the camera; instant when the user prefers less motion */
  const flyTo = useCallback((to: VB) => {
    cancelAnimationFrame(frame.current)
    const from = vbRef.current
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) { vbRef.current = to; setVb(to); return }
    const t0 = performance.now(), dur = 560
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t)
      const next = from.map((f, i) => f + (to[i] - f) * e) as VB
      vbRef.current = next; setVb(next)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [])
  const choose = useCallback((name: string | null) => {
    setProvince(name); setSel(null)
    flyTo(name ? frameOf(name) : FULL)
  }, [flyTo])

  const { marks, missing } = useMemo(() => {
    const marks: Mark[] = [], missing: PfProjectView[] = []
    const seen = new Map<string, number>()
    for (const v of views) {
      const p = byId.get(v.input.id)
      const facility = facilityOf(v.input.name, p?.projectType ?? '')
      const r = routes?.get(v.input.id)
      if (r) {
        const mid = r.points[Math.floor(r.points.length / 2)]
        const [x, y] = project(mid[0], mid[1], W)
        marks.push({ v, facility: isLinear(facility) ? facility : 'pipeline', status: statusOf(v), x, y, place: `${faNum(Math.round(r.km))} کیلومتر`, from: 'route', provinces: routeProvinces(r.points), route: { d: path(r.points), km: r.km, demo: r.demo, ends: [project(r.points[0][0], r.points[0][1], W), project(r.points[r.points.length - 1][0], r.points[r.points.length - 1][1], W)] } })
        continue
      }
      const at = projectPlace({ location: p?.location, name: v.input.name })
      if (!at) { missing.push(v); continue }
      const i = seen.get(at.place.name) ?? 0; seen.set(at.place.name, i + 1)
      const [x, y] = project(at.place.lng, at.place.lat, W)
      const prov = provinceAt(at.place.lng, at.place.lat) ?? at.place.province
      marks.push({ v, facility, status: statusOf(v), x: x + (i ? Math.cos(i * 2.4) * 14 : 0), y: y + (i ? Math.sin(i * 2.4) * 14 : 0), place: `${at.place.name} (${at.place.province})`, from: at.from, provinces: [{ name: prov, share: 1 }], route: null })
    }
    return { marks, missing }
  }, [views, byId, routes])

  const stats = useMemo(() => provinceStats(marks.map((m) => ({ id: m.v.input.id, status: m.status, budget: m.v.bac, provinces: m.provinces }))), [marks])
  const max = useMemo(() => Math.max(0, ...[...stats.values()].map((s) => (metric === 'budget' ? s.budget : s.count))), [stats, metric])
  const breaks = useMemo(() => classBreaks(max), [max])
  const fillOf = (s: ProvinceStat | undefined): string | undefined => {
    if (!s) return undefined
    if (metric === 'status') return s.worst ? `color-mix(in srgb, ${STATUS_FA[s.worst].tone} 62%, var(--pm-land))` : undefined
    const c = classOf(metric === 'budget' ? s.budget : s.count, breaks)
    return c ? `color-mix(in srgb, ${HUE[metric]} ${STEP[c - 1]}%, var(--pm-land))` : undefined
  }
  const ranked = useMemo(() => [...stats.values()].sort((a, b) => metric === 'status'
    ? SEVERITY.indexOf(a.worst ?? 'unknown') - SEVERITY.indexOf(b.worst ?? 'unknown') || b.count - a.count
    : metric === 'budget' ? b.budget - a.budget || b.count - a.count : b.count - a.count || b.budget - a.budget), [stats, metric])

  const k = W / vb[2] / grow // map units per screen pixel, so symbols stay the same size on screen
  const picked = marks.find((m) => m.v.input.id === sel)
  const usedFacilities = [...new Set(marks.map((m) => m.facility))]
  const lines = marks.filter((m) => m.route)
  const inProvince = province ? marks.filter((m) => m.provinces.some((p) => p.name === province)) : []
  const hoverStat = hover ? stats.get(hover) : undefined
  const provStat = province ? stats.get(province) : undefined

  /** the tooltip follows the pointer through its own style, so moving the mouse does not re-render the map */
  const moveTip = (e: React.PointerEvent) => {
    const box = stageRef.current?.getBoundingClientRect(), tip = tipRef.current
    if (!box || !tip) return
    const x = e.clientX - box.left, y = e.clientY - box.top
    const flip = x > box.width - 200
    tip.style.transform = `translate(${flip ? x - tip.offsetWidth - 14 : x + 14}px, ${Math.max(4, y - 18)}px)`
  }
  const metricValue = (s: ProvinceStat) => (metric === 'budget' ? fmtMoney(s.budget) : `${faNum(s.count)} پروژه`)
  const rankMax = Math.max(1, ...ranked.map((s) => (metric === 'budget' ? s.budget : s.count)))

  return (
    <div className="pm">
      <div className="pm-bar">
        <div ref={seg.list} className="pm-seg" role="tablist" aria-label="رنگ استان‌ها بر پایهٔ">
          <span ref={seg.indicator} className="tab-ind pm-seg-ind" aria-hidden />
          {METRICS.map((m) => <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
        </div>
        <details className="pm-layer-menu">
          <summary><Layers size={13} aria-hidden /> لایه‌ها</summary>
          <div role="group" aria-label="لایه‌های نقشه">
            {LAYERS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" className="pm-layer" aria-pressed={layers[key]} onClick={() => toggle(key)}><Icon size={13} aria-hidden />{label}</button>
            ))}
          </div>
        </details>
      </div>

      <div className="pm-stage">
        <div className="pm-frame" ref={stageRef} onPointerMove={tip ? moveTip : undefined}>
          <svg viewBox={vb.map((n) => n.toFixed(2)).join(' ')} role="img" aria-label="نقشهٔ ایران به تفکیک استان با خطوط لوله و تأسیسات پروژه‌ها"
            style={{ '--k': k } as CSSProperties} onClick={(e) => { if (e.target === e.currentTarget) choose(null) }}>
            <defs>
              <filter id="pmShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy={3 / k} stdDeviation={5 / k} floodColor="#0f172a" floodOpacity=".22" /></filter>
            </defs>
            <path className="pm-grat" d={graticule} />
            <g className={`pm-land${layers.borders ? ' has-borders' : ''}${province ? ' is-focus' : ''}`} filter="url(#pmShadow)">
              {provincePaths.map((p) => {
                const s = stats.get(p.name), fill = fillOf(s)
                return (
                  <path key={p.name} d={p.d} className={`${s ? 'has-data' : ''}${province === p.name ? ' is-sel' : ''}${hover === p.name ? ' is-hover' : ''}`}
                    style={fill ? { fill } : undefined} tabIndex={s ? 0 : -1} role={s ? 'button' : undefined}
                    aria-label={s ? `${p.name}: ${faNum(s.count)} پروژه` : p.name}
                    onPointerEnter={(e) => { setHover(p.name); setTip(true); moveTip(e) }} onPointerLeave={() => { setTip(false); setHover((h) => (h === p.name ? null : h)) }}
                    onClick={(e) => { e.stopPropagation(); choose(province === p.name ? null : p.name) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(province === p.name ? null : p.name) } }} />
                )
              })}
            </g>
            {layers.names && (
              <g className="pm-names" aria-hidden style={{ fontSize: `${(province ? 9.5 : 7) / k}px` }}>
                {provincePaths.map((p) => <text key={p.name} x={p.label[0]} y={p.label[1]} className={stats.has(p.name) ? 'has-data' : ''}>{p.name}</text>)}
              </g>
            )}
            {layers.lines && (
              <g className="pm-lines">
                {lines.map((m, i) => (
                  <g key={m.v.input.id} className={`pm-line${sel === m.v.input.id ? ' is-on' : ''}`} style={{ '--c': STATUS_FA[m.status].tone, '--d': `${i * 120}ms` } as CSSProperties} onClick={(e) => { e.stopPropagation(); setSel(m.v.input.id) }}>
                    <path className="pm-line-hit" d={m.route!.d} />
                    <path className="pm-line-glow" d={m.route!.d} />
                    <path className="pm-line-case" d={m.route!.d} />
                    <path className="pm-line-ink" d={m.route!.d} pathLength={1} />
                    {m.route!.ends.map(([x, y], j) => <circle key={j} className="pm-line-end" cx={x} cy={y} r={2.8 / k} />)}
                    <title>{`${m.v.input.name}: ${m.place}`}</title>
                  </g>
                ))}
              </g>
            )}
            {layers.facilities && (
              <g className="pm-marks">
                {marks.filter((m) => !m.route).map((m, i) => {
                  const Icon = FACILITY_ICON[m.facility]
                  return (
                    <g key={m.v.input.id} className={`pm-mark is-${m.status}${sel === m.v.input.id ? ' is-on' : ''}`} style={{ '--c': STATUS_FA[m.status].tone, '--d': `${200 + i * 60}ms` } as CSSProperties}
                      transform={`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) scale(${(1 / k).toFixed(4)})`} tabIndex={0} role="button" aria-label={`${m.v.input.name}، ${FACILITY_FA[m.facility]}، ${STATUS_FA[m.status].label}`}
                      onClick={(e) => { e.stopPropagation(); setSel(m.v.input.id) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(m.v.input.id) } }}>
                      {m.status === 'critical' && <circle className="pm-pulse" r={11} />}
                      <circle className="pm-badge" r={10.5} />
                      <Icon x={-6} y={-6} width={12} height={12} strokeWidth={2.2} className="pm-ic" aria-hidden />
                      <title>{`${m.v.input.name}، ${m.place}`}</title>
                    </g>
                  )
                })}
              </g>
            )}
            {layers.lines && lines.map((m) => sel === m.v.input.id ? <circle key="sel" className="pm-sel" cx={m.x} cy={m.y} r={7 / k} style={{ '--c': STATUS_FA[m.status].tone } as CSSProperties} /> : null)}
          </svg>

          {province && <button type="button" className="pm-reset" onClick={() => choose(null)}><Maximize2 size={13} aria-hidden /> کل کشور</button>}

          <div className="pm-legend" aria-label="راهنمای رنگ">
            {metric === 'status'
              ? <ul className="pm-legend-cats">{(['critical', 'attention', 'good', 'unknown'] as Status[]).map((s) => <li key={s}><i style={{ background: STATUS_FA[s].tone }} />{STATUS_FA[s].label}</li>)}</ul>
              : <>
                  <div className="pm-ramp">{STEP.map((p, i) => <i key={i} style={{ background: `color-mix(in srgb, ${HUE[metric]} ${p}%, var(--pm-land))` }} />)}</div>
                  <div className="pm-ramp-x"><span>{metric === 'budget' ? '۰' : '۱'}</span><span>{metric === 'budget' ? fmtMoney(breaks[4], '') : faNum(breaks[4])}</span></div>
                </>}
            {usedFacilities.length > 0 && <ul className="pm-legend-ic">{usedFacilities.map((f) => { const Icon = FACILITY_ICON[f]; return <li key={f} title={FACILITY_FA[f]}><Icon size={12} aria-hidden /><span>{FACILITY_FA[f]}</span></li> })}</ul>}
          </div>

          <div ref={tipRef} className={`pm-tip${hover && tip ? ' is-on' : ''}`} role="presentation">
            {hover && <>
              <b>{hover}</b>
              {hoverStat ? <>
                <span className="pm-tip-row"><span>پروژه</span><b>{faNum(hoverStat.count)}</b></span>
                <span className="pm-tip-row"><span>بودجه</span><b>{fmtMoney(hoverStat.budget)}</b></span>
                <span className="pm-tip-bar">{SEVERITY.map((s) => hoverStat.byStatus[s] ? <i key={s} style={{ flexGrow: hoverStat.byStatus[s], background: STATUS_FA[s].tone }} title={STATUS_FA[s].label} /> : null)}</span>
              </> : <small>پروژه‌ای ثبت نشده است</small>}
            </>}
          </div>
        </div>

        <aside className="pm-side" aria-live="polite">
          {province ? (
            <div className="pm-prov" key={province}>
              <button type="button" className="pm-back" onClick={() => choose(null)}><ChevronLeft size={14} aria-hidden className="pm-back-ic" /> همهٔ استان‌ها</button>
              <h4>{province}</h4>
              <div className="pm-prov-kpi">
                <span><small>پروژه</small><b>{faNum(provStat?.count ?? 0)}</b></span>
                <span><small>بودجه</small><b>{fmtMoney(provStat?.budget ?? 0)}</b></span>
              </div>
              {provStat && <span className="pm-tip-bar is-wide">{SEVERITY.map((s) => provStat.byStatus[s] ? <i key={s} style={{ flexGrow: provStat.byStatus[s], background: STATUS_FA[s].tone }} title={`${STATUS_FA[s].label}: ${faNum(provStat.byStatus[s])}`} /> : null)}</span>}
              <ul className="pm-plist">
                {inProvince.length === 0 && <li className="pm-empty">پروژه‌ای در این استان ثبت نشده است.</li>}
                {inProvince.map((m) => { const Icon = FACILITY_ICON[m.facility]; return (
                  <li key={m.v.input.id}>
                    <button type="button" className={sel === m.v.input.id ? 'is-on' : ''} style={{ '--c': STATUS_FA[m.status].tone } as CSSProperties} onClick={() => setSel(m.v.input.id)}>
                      <span className="pm-plist-ic"><Icon size={13} aria-hidden /></span>
                      <span className="pm-plist-name">{m.v.input.name}</span>
                      <b>{m.v.input.snapshot ? `${faNum(m.v.input.snapshot.actual, 0)}٪` : '—'}</b>
                    </button>
                  </li>
                ) })}
              </ul>
            </div>
          ) : (
            <div className="pm-rank">
              <p className="pm-side-h">{metric === 'budget' ? 'بودجه به تفکیک استان' : metric === 'status' ? 'استان‌ها به ترتیب وضعیت' : 'پروژه‌ها به تفکیک استان'}</p>
              {ranked.length === 0 && <p className="pm-empty">موقعیت هیچ پروژه‌ای ثبت نشده است.</p>}
              <ol>
                {ranked.slice(0, 9).map((s, i) => (
                  <li key={s.name} style={{ '--i': i } as CSSProperties}>
                    <button type="button" onClick={() => choose(s.name)} onPointerEnter={() => setHover(s.name)} onPointerLeave={() => setHover(null)}>
                      <span className="pm-rank-name">{s.worst && <i style={{ background: STATUS_FA[s.worst].tone }} />}{s.name}</span>
                      <span className="pm-rank-v">{metricValue(s)}</span>
                      <span className="pm-rank-bar"><i style={{ transform: `scaleX(${(metric === 'budget' ? s.budget : s.count) / rankMax})`, background: metric === 'status' && s.worst ? STATUS_FA[s.worst].tone : HUE[metric === 'budget' ? 'budget' : 'count'] }} /></span>
                    </button>
                  </li>
                ))}
              </ol>
              {ranked.length > 9 && <p className="pm-more">و {faNum(ranked.length - 9)} استان دیگر؛ روی نقشه بزنید.</p>}
            </div>
          )}
        </aside>
      </div>

      {picked ? (
        <div className="pm-pick" style={{ '--c': STATUS_FA[picked.status].tone } as CSSProperties}>
          <span className="pm-pick-ic">{(() => { const I = FACILITY_ICON[picked.facility]; return <I size={16} aria-hidden /> })()}</span>
          <div><b>{picked.v.input.name}</b><small>{FACILITY_FA[picked.facility]} · {picked.place}{picked.provinces.length > 1 ? ` · ${faNum(picked.provinces.length)} استان` : ''}{picked.route?.demo ? ' · مسیر نمونه' : ''}{picked.from === 'name' ? ' · محل از عنوان پروژه' : ''}</small></div>
          <span className="pm-pick-p"><b>{picked.v.input.snapshot ? `${faNum(picked.v.input.snapshot.actual, 0)}٪` : '—'}</b><small>{STATUS_FA[picked.status].label}</small></span>
        </div>
      ) : <p className="pd-note"><MapPin size={12} /> روی استان، خط یا نماد هر پروژه بزنید. خطوط لوله از مسیر KMZ ثبت‌شده در تحصیل اراضی رسم شده‌اند و پروژهٔ خطی در همهٔ استان‌های مسیرش شمرده می‌شود.</p>}

      {missing.length > 0 && (
        <details className="pd-missing">
          <summary>{faNum(missing.length)} پروژه موقعیت یا مسیر ثبت‌شده ندارند. ثبت استان</summary>
          <ul>{missing.map((v) => (
            <li key={v.input.id}><span>{v.input.name}</span>
              <select aria-label={`استان ${v.input.name}`} disabled={saving === v.input.id} defaultValue="" onChange={async (e) => { if (!e.target.value) return; setSaving(v.input.id); await updateProject(v.input.id, { location: `استان ${e.target.value}` }); setSaving(null) }}>
                <option value="">انتخاب استان</option>{PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select></li>
          ))}</ul>
          <p className="pd-note">استان در «موقعیت» داده‌های پایهٔ پروژه ذخیره می‌شود. خط لوله با بارگذاری KMZ در ماژول تحصیل اراضی رسم می‌شود.</p>
        </details>
      )}
      {footer}
    </div>
  )
}
