import { useMemo } from 'react'
import type { Activity, RouteInfo } from '../types'
import { frontKm } from '../lib/schedule'
import { fmtKm, fmtKmRange } from '../lib/dates'
import { parcelColor, type ColorMode } from '../lib/colors'
import { STATUS_LABEL } from '../lib/status'
import type { Analysis } from '../lib/kpis'

/**
 * The module's signature: the whole route as one ribbon — every parcel a coloured block, a km ruler beneath it, and
 * a dashed line for where each construction front stands today. You see, in one glance, which land the work is about to meet.
 */
export function ChainageRibbon({ route, rows, mode, selectedId, onSelect, activities, today }: { route: RouteInfo; rows: Analysis[]; mode: ColorMode; selectedId: string | null; onSelect: (id: string) => void; activities: Activity[]; today: string }) {
  const pct = (km: number) => ((km - route.startKm) / route.totalKm) * 100
  const ticks = useMemo(() => {
    const out: number[] = []
    const step = route.totalKm > 150 ? 20 : route.totalKm > 40 ? 10 : 5
    for (let km = Math.ceil(route.startKm / step) * step; km <= route.startKm + route.totalKm + 1e-6; km += step) out.push(km)
    return out
  }, [route.startKm, route.totalKm])
  const fronts = activities.map((a) => ({ name: a.name, km: frontKm(a, today) })).filter((f): f is { name: string; km: number } => f.km != null && f.km >= route.startKm && f.km <= route.startKm + route.totalKm)
  return (
    <div className="la-ribbon" dir="ltr">
      <div className="la-ribbon-inner">
        {rows.map((r) => (
          <button
            key={r.parcel.id}
            className="la-ribbon-block"
            aria-pressed={selectedId === r.parcel.id}
            aria-label={`${fmtKmRange(r.parcel.kmStart, r.parcel.kmEnd)} — ${STATUS_LABEL[r.status]}`}
            title={`${fmtKmRange(r.parcel.kmStart, r.parcel.kmEnd)} · ${STATUS_LABEL[r.status]}`}
            onClick={() => onSelect(r.parcel.id)}
            style={{ left: `${pct(r.parcel.kmStart)}%`, width: `calc(${pct(r.parcel.kmEnd) - pct(r.parcel.kmStart)}% - 2px)`, background: parcelColor(r, mode), opacity: selectedId && selectedId !== r.parcel.id ? 0.6 : 1 }}
          >
            {!r.released && (r.early.state === 'action_required' || r.crit.level === 'critical') && <span aria-hidden style={{ position: 'absolute', top: -6, left: '50%', width: 9, height: 9, borderRadius: '50%', background: '#ef4444', border: '2px solid var(--la-surface)', transform: 'translateX(-50%)' }} />}
          </button>
        ))}
        {ticks.map((km) => (
          <div key={km} className="la-ribbon-tick" style={{ left: `${pct(km)}%` }}><span>{fmtKm(km).replace('+000', '')}</span></div>
        ))}
        {fronts.map((f) => (
          <div key={f.name} className="la-front" style={{ left: `${pct(f.km)}%` }}><span className="la-km">{f.name}</span></div>
        ))}
      </div>
    </div>
  )
}
