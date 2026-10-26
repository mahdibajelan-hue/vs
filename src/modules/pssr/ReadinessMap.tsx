import type { CSSProperties, KeyboardEvent } from 'react'
import { Route as RouteIcon } from 'lucide-react'
import { useModuleStore } from '../../store/useModuleStore'
import { formatJalali } from '../../lib/jalali'
import { usePssrStore } from './store/usePssrStore'
import { STAGE_COLOR, STAGE_FA, STAGE_ORDER, type SystemStatus } from './lib/pssrCore'
import type { PssrSystem } from './types'

const fa = (n: number) => n.toLocaleString('fa-IR')
const W = 1000, PAD = 40, RAIL_Y = 92
const STATION_KM = 0.4

/** km axis step that gives 5–10 ticks */
const niceStep = (max: number) => [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 10) ?? 1000

/**
 * «نقشهٔ آمادگی» — the route drawn along its chainage with every commissioning system coloured by its stage (from
 * mechanical completion to under gas), stations as diamonds, open category-A punches as red badges, and the gas-in
 * schedule underneath. «نمایش روی دوقلوی دیجیتال» opens the 3D twin with the same colouring on the real route.
 */
export function ReadinessMap({ statusOf, onOpen }: { statusOf: Map<string, SystemStatus>; onOpen: (id: string) => void }) {
  const systems = usePssrStore((s) => s.systems)
  const placed = systems.filter((s) => s.kmFrom != null)
  const unplaced = systems.filter((s) => s.kmFrom == null)
  const maxKm = Math.max(10, ...placed.map((s) => s.kmTo ?? (s.kmFrom ?? 0) + STATION_KM))
  const step = niceStep(maxKm)
  const axisMax = Math.ceil(maxKm / step) * step
  const x = (km: number) => PAD + (km / axisMax) * (W - 2 * PAD)
  const isStation = (s: PssrSystem) => s.kmTo == null || s.kmTo - (s.kmFrom ?? 0) < 1
  const key = (id: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id) } }
  const present = STAGE_ORDER.filter((st) => systems.some((s) => statusOf.get(s.id)?.stage === st))
  const today = new Date().toISOString().slice(0, 10)
  const schedule = [...systems].sort((a, b) => (a.targetGasIn ?? '9999').localeCompare(b.targetGasIn ?? '9999'))

  return (
    <div className="ps-stack">
      <section className="ps-card ps-map">
        <header className="ps-card-head">
          <b><RouteIcon size={15} /> نقشهٔ آمادگی مسیر</b>
          <button type="button" className="ps-btn is-primary" onClick={() => useModuleStore.getState().enterModule('pipelinedigitaltwin', undefined, 'pssr')}>نمایش روی دوقلوی دیجیتال</button>
        </header>
        {placed.length ? (
          <div className="ps-map-scroll">
            <svg viewBox={`0 0 ${W} 170`} className="ps-map-svg" style={{ direction: 'ltr' }} role="img" aria-label="سیستم‌های راه‌اندازی در طول مسیر">
              <rect x={PAD} y={RAIL_Y - 7} width={W - 2 * PAD} height={14} rx={7} className="ps-map-rail" />
              {placed.filter((s) => !isStation(s)).map((s) => {
                const st = statusOf.get(s.id)!
                const x1 = x(s.kmFrom!), x2 = x(s.kmTo!)
                return (
                  <g key={s.id} className={`ps-map-sys ${st.stage === 'gasin' ? 'is-live-op' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={key(s.id)} style={{ '--c': STAGE_COLOR[st.stage] } as CSSProperties}>
                    <title>{`${s.code} — ${s.name}: ${STAGE_FA[st.stage]} · آمادگی ${st.readiness}٪`}</title>
                    <rect x={x1} y={RAIL_Y - 9} width={Math.max(4, x2 - x1)} height={18} rx={5} fill={STAGE_COLOR[st.stage]} />
                    <line x1={x1} x2={x1} y1={RAIL_Y - 18} y2={RAIL_Y + 18} className="ps-map-tick" />
                    <line x1={x2} x2={x2} y1={RAIL_Y - 18} y2={RAIL_Y + 18} className="ps-map-tick" />
                    <text x={(x1 + x2) / 2} y={RAIL_Y - 26} textAnchor="middle" className="ps-map-code">{s.code}</text>
                    <text x={(x1 + x2) / 2} y={RAIL_Y + 5} textAnchor="middle" className="ps-map-in">{`${fa(st.readiness)}٪`}</text>
                    {st.punches.A.open > 0 && <Badge x={(x1 + x2) / 2 + 34} y={RAIL_Y - 30} n={st.punches.A.open} />}
                  </g>
                )
              })}
              {placed.filter(isStation).map((s) => {
                const st = statusOf.get(s.id)!
                const cx = x(s.kmFrom!)
                return (
                  <g key={s.id} className="ps-map-sys" role="button" tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={key(s.id)}>
                    <title>{`${s.code} — ${s.name}: ${STAGE_FA[st.stage]}`}</title>
                    <rect x={cx - 11} y={RAIL_Y - 11} width={22} height={22} transform={`rotate(45 ${cx} ${RAIL_Y})`} fill={STAGE_COLOR[st.stage]} className="ps-map-station" />
                    <text x={cx} y={RAIL_Y + 40} textAnchor="middle" className="ps-map-code">{s.code}</text>
                    {st.punches.A.open > 0 && <Badge x={cx + 16} y={RAIL_Y - 16} n={st.punches.A.open} />}
                  </g>
                )
              })}
              {Array.from({ length: axisMax / step + 1 }, (_, i) => i * step).map((km) => (
                <g key={km}>
                  <line x1={x(km)} x2={x(km)} y1={RAIL_Y + 50} y2={RAIL_Y + 56} className="ps-map-axis" />
                  <text x={x(km)} y={RAIL_Y + 70} textAnchor="middle" className="ps-map-km">{fa(km)}</text>
                </g>
              ))}
              <text x={W - PAD} y={RAIL_Y + 70} dx={22} textAnchor="start" className="ps-map-km">km</text>
            </svg>
          </div>
        ) : <p className="ps-hint">هیچ سیستمی کیلومتر ندارد؛ برای نمایش روی نقشه، کیلومتر شروع و پایان سیستم‌ها را در پروندهٔ هر سیستم ثبت کنید.</p>}
        <ul className="ps-map-legend">
          {present.map((st) => <li key={st}><i style={{ background: STAGE_COLOR[st] }} />{STAGE_FA[st]}</li>)}
          <li><i className="is-badge" />پانچ A باز</li>
        </ul>
        {unplaced.length > 0 && <p className="ps-hint">بدون کیلومتر (روی نقشه نیست): {unplaced.map((s) => s.code).join('، ')} — کیلومتر را در پروندهٔ سیستم ثبت کنید.</p>}
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>برنامهٔ تزریق گاز</b><small className="ps-meta">به ترتیب تاریخ هدف</small></header>
        <ol className="ps-sched">
          {schedule.map((s) => {
            const st = statusOf.get(s.id)!
            const days = s.targetGasIn ? Math.round((Date.parse(s.targetGasIn) - Date.parse(today)) / 86400000) : null
            const late = days != null && days < 0 && st.stage !== 'live'
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s.id)} style={{ '--c': STAGE_COLOR[st.stage] } as CSSProperties}>
                  <span className="ps-code" dir="ltr">{s.code}</span>
                  <span className="ps-sched-main"><b>{s.name}</b><span className="ps-bar"><span style={{ width: `${st.readiness}%` }} /></span></span>
                  <span className="ps-chip"><i />{STAGE_FA[st.stage]}</span>
                  <span className={`ps-sched-date ${late ? 'is-late' : ''}`}>
                    {s.targetGasIn ? formatJalali(s.targetGasIn) : 'بدون تاریخ'}
                    <small>{st.stage === 'live' ? 'تحت گاز' : days == null ? '' : late ? `${fa(-days)} روز تأخیر` : `${fa(days)} روز مانده`}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="ps-map-badge">
      <circle cx={x} cy={y} r={10} />
      <text x={x} y={y + 4} textAnchor="middle">{fa(n)}</text>
    </g>
  )
}
