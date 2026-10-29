import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Cylinder, Factory, Flame, FlaskConical, Gauge, MapPin, Network, RadioTower, Spline, Tag, Waypoints, Building2, type LucideIcon } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import type { MasterProject } from '../../masterdata/types'
import type { PfProjectView } from '../lib/portfolioCore'
import { FACILITY_FA, facilityOf, isLinear, mapHeight, PROVINCES, project, projectPlace, statusOf, STATUS_FA, type Facility, type Status } from '../lib/dashboardCore'
import { IRAN_PROVINCES } from '../lib/iranProvinces'
import { faNum } from './pfUi'

const W = 600
const H = mapHeight(W)

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

type Layer = 'borders' | 'names' | 'lines' | 'facilities'
const LAYERS: { key: Layer; label: string; icon: LucideIcon }[] = [
  { key: 'borders', label: 'مرز استان‌ها', icon: Waypoints },
  { key: 'names', label: 'نام استان‌ها', icon: Tag },
  { key: 'lines', label: 'خطوط لوله', icon: Spline },
  { key: 'facilities', label: 'تأسیسات', icon: Factory },
]
const LAYER_KEY = 'farin.pf.mapLayers.v1'
function readLayers(): Record<Layer, boolean> {
  const all = { borders: true, names: true, lines: true, facilities: true }
  try { return { ...all, ...JSON.parse(localStorage.getItem(LAYER_KEY) ?? '{}') } } catch { return all }
}

const path = (pts: [number, number][]) => pts.map(([lng, lat], i) => { const [x, y] = project(lng, lat, W); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}` }).join('')
const provincePaths = IRAN_PROVINCES.map((p) => ({ name: p.name, d: p.rings.map((r) => `${path(r)}Z`).join(''), label: project(p.label[0], p.label[1], W) }))

interface Mark { v: PfProjectView; facility: Facility; status: Status; x: number; y: number; place: string; route: { d: string; km: number; demo: boolean; ends: [number, number][] } | null; from: 'route' | 'location' | 'name' }

/** Iran with province borders and names, pipelines drawn from their land-acquisition KMZ routes, and point facilities as symbols — each layer can be switched off. */
export function PortfolioMap({ views, byId, footer }: { views: PfProjectView[]; byId: Map<string, MasterProject>; footer?: ReactNode }) {
  const updateProject = useMasterDataStore((s) => s.updateProject)
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof loadRoutes>> | null>(null)
  const [layers, setLayers] = useState(readLayers)
  const [sel, setSel] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  useEffect(() => { let live = true; void loadRoutes().then((r) => { if (live) setRoutes(r) }); return () => { live = false } }, [])
  const toggle = (k: Layer) => setLayers((l) => { const n = { ...l, [k]: !l[k] }; try { localStorage.setItem(LAYER_KEY, JSON.stringify(n)) } catch { /* private mode: the choice lasts for this visit */ } return n })

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
        marks.push({ v, facility: isLinear(facility) ? facility : 'pipeline', status: statusOf(v), x, y, place: `${faNum(Math.round(r.km))} کیلومتر`, from: 'route', route: { d: path(r.points), km: r.km, demo: r.demo, ends: [project(r.points[0][0], r.points[0][1], W), project(r.points[r.points.length - 1][0], r.points[r.points.length - 1][1], W)] } })
        continue
      }
      const at = projectPlace({ location: p?.location, name: v.input.name })
      if (!at) { missing.push(v); continue }
      // projects in the same place fan out so every symbol stays clickable
      const i = seen.get(at.place.name) ?? 0; seen.set(at.place.name, i + 1)
      const [x, y] = project(at.place.lng, at.place.lat, W)
      marks.push({ v, facility, status: statusOf(v), x: x + (i ? Math.cos(i * 2.4) * 16 : 0), y: y + (i ? Math.sin(i * 2.4) * 16 : 0), place: `${at.place.name} (${at.place.province})`, from: at.from, route: null })
    }
    return { marks, missing }
  }, [views, byId, routes])

  const picked = marks.find((m) => m.v.input.id === sel)
  const usedFacilities = [...new Set(marks.map((m) => m.facility))]
  const lines = marks.filter((m) => m.route)

  return (
    <div className="pm">
      <div className="pm-layers" role="group" aria-label="لایه‌های نقشه">
        {LAYERS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" className="pm-layer" aria-pressed={layers[key]} onClick={() => toggle(key)}><Icon size={13} aria-hidden />{label}</button>
        ))}
      </div>
      <div className="pm-stage">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نقشهٔ ایران با مرز استان‌ها، خطوط لوله و تأسیسات پروژه‌ها" onClick={(e) => { if (e.target === e.currentTarget) setSel(null) }}>
          <g className={`pm-land${layers.borders ? ' has-borders' : ''}`}>
            {provincePaths.map((p) => <path key={p.name} d={p.d}><title>{p.name}</title></path>)}
          </g>
          {layers.names && <g className="pm-names" aria-hidden>{provincePaths.map((p) => <text key={p.name} x={p.label[0]} y={p.label[1]}>{p.name}</text>)}</g>}
          {layers.lines && (
            <g className="pm-lines">
              {lines.map((m, i) => (
                <g key={m.v.input.id} className={`pm-line${sel === m.v.input.id ? ' is-on' : ''}`} style={{ '--c': STATUS_FA[m.status].tone, '--d': `${i * 120}ms` } as CSSProperties} onClick={() => setSel(m.v.input.id)}>
                  <path className="pm-line-hit" d={m.route!.d} />
                  <path className="pm-line-case" d={m.route!.d} />
                  <path className="pm-line-ink" d={m.route!.d} pathLength={1} />
                  {m.route!.ends.map(([x, y], k) => <circle key={k} className="pm-line-end" cx={x} cy={y} r={2.6} />)}
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
                    transform={`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`} tabIndex={0} role="button" aria-label={`${m.v.input.name} — ${FACILITY_FA[m.facility]} — ${STATUS_FA[m.status].label}`}
                    onClick={() => setSel(m.v.input.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(m.v.input.id) } }}>
                    {m.status === 'critical' && <circle className="pm-pulse" r={11} />}
                    <circle className="pm-badge" r={10} />
                    <Icon x={-6} y={-6} width={12} height={12} strokeWidth={2.2} className="pm-ic" aria-hidden />
                    <title>{`${m.v.input.name} — ${m.place}`}</title>
                  </g>
                )
              })}
            </g>
          )}
          {layers.lines && lines.map((m) => sel === m.v.input.id ? <circle key="sel" className="pm-sel" cx={m.x} cy={m.y} r={7} style={{ '--c': STATUS_FA[m.status].tone } as CSSProperties} /> : null)}
        </svg>
        <aside className="pm-legend" aria-label="راهنمای نقشه">
          <p>وضعیت</p>
          <ul>{(['good', 'attention', 'critical', 'unknown'] as Status[]).map((s) => <li key={s}><i style={{ background: STATUS_FA[s].tone }} />{STATUS_FA[s].label}<b>{faNum(marks.filter((m) => m.status === s).length)}</b></li>)}</ul>
          {usedFacilities.length > 0 && <><p>نماد</p><ul>{usedFacilities.map((f) => { const Icon = FACILITY_ICON[f]; return <li key={f}><Icon size={13} aria-hidden />{FACILITY_FA[f]}</li> })}</ul></>}
        </aside>
      </div>

      {picked ? (
        <div className="pm-pick" style={{ '--c': STATUS_FA[picked.status].tone } as CSSProperties}>
          <span className="pm-pick-ic">{(() => { const I = FACILITY_ICON[picked.facility]; return <I size={16} aria-hidden /> })()}</span>
          <div><b>{picked.v.input.name}</b><small>{FACILITY_FA[picked.facility]} · {picked.place}{picked.route?.demo ? ' · مسیر نمونه' : ''}{picked.from === 'name' ? ' · محل از عنوان پروژه' : ''}</small></div>
          <span className="pm-pick-p"><b>{picked.v.input.snapshot ? `${faNum(picked.v.input.snapshot.actual, 0)}٪` : '—'}</b><small>{STATUS_FA[picked.status].label}</small></span>
        </div>
      ) : <p className="pd-note"><MapPin size={12} /> روی خط یا نماد هر پروژه بزنید. خطوط از مسیر KMZ ثبت‌شده در تحصیل اراضی رسم شده‌اند.</p>}

      {missing.length > 0 && (
        <details className="pd-missing">
          <summary>{faNum(missing.length)} پروژه موقعیت یا مسیر ثبت‌شده ندارند. ثبت استان</summary>
          <ul>{missing.map((v) => (
            <li key={v.input.id}><span>{v.input.name}</span>
              <select aria-label={`استان ${v.input.name}`} disabled={saving === v.input.id} defaultValue="" onChange={async (e) => { if (!e.target.value) return; setSaving(v.input.id); await updateProject(v.input.id, { location: `استان ${e.target.value}` }); setSaving(null) }}>
                <option value="">انتخاب استان</option>{PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select></li>
          ))}</ul>
          <p className="pd-note">استان در «موقعیت» داده پایهٔ پروژه ذخیره می‌شود. خط لوله با بارگذاری KMZ در ماژول تحصیل اراضی رسم می‌شود.</p>
        </details>
      )}
      {footer}
    </div>
  )
}
