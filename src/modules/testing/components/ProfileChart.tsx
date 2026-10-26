import { useMemo, type KeyboardEvent } from 'react'
import type { ProfilePoint } from '../lib/htCore'

export interface Band { key: string; from: number; to: number; color: string; label: string; dashed?: boolean; hiKm?: number; loKm?: number }
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const W = 1000, H = 280, L = 54, R = 12, T = 30, B = 46

/**
 * The line's elevation profile with the hydrotest sections laid over it: each section a coloured band (its test stage, or
 * the proposal), its high (▲) and low (▼) point, preferred breaks (valves, stations) as dashed lines and the backfilled
 * stretches (from the digital twin) as a bar under the axis — the picture an engineer checks a sectioning against.
 */
export function ProfileChart({ profile, bands, preferred = [], backfilled = [], onPick, height = H }: { profile: ProfilePoint[]; bands: Band[]; preferred?: { km: number; tag: string }[]; backfilled?: [number, number][]; onPick?: (key: string) => void; height?: number }) {
  const pts = useMemo(() => { const step = Math.max(1, Math.ceil(profile.length / 1400)); return profile.filter((_, i) => i % step === 0 || i === profile.length - 1) }, [profile])
  if (pts.length < 2) return null
  const k0 = pts[0].km, k1 = pts[pts.length - 1].km
  const e0 = Math.min(...pts.map((p) => p.elev)), e1 = Math.max(...pts.map((p) => p.elev))
  const pad = Math.max(20, (e1 - e0) * 0.08)
  const y0 = e0 - pad, y1 = e1 + pad
  const x = (km: number) => L + ((km - k0) / (k1 - k0 || 1)) * (W - L - R)
  const y = (e: number) => T + (1 - (e - y0) / (y1 - y0 || 1)) * (height - T - B)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.elev).toFixed(1)}`).join('')
  const kmStep = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => (k1 - k0) / s <= 10) ?? 200
  const eStep = [10, 20, 50, 100, 200, 250, 500].find((s) => (y1 - y0) / s <= 6) ?? 1000
  const elevAt = (km: number) => { const i = pts.findIndex((p) => p.km >= km); if (i <= 0) return pts[Math.max(0, i)].elev; const a = pts[i - 1], b = pts[i]; return a.elev + ((km - a.km) / (b.km - a.km || 1)) * (b.elev - a.elev) }
  const key = (k: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(k) } }
  return (
    <div className="ht-chart-scroll">
      <svg viewBox={`0 0 ${W} ${height}`} className="ht-chart" style={{ direction: 'ltr' }} role="img" aria-label="پروفیل ارتفاعی خط و قطعه‌های آزمون">
        {Array.from({ length: Math.floor((y1 - y0) / eStep) + 1 }, (_, i) => Math.ceil(y0 / eStep) * eStep + i * eStep).filter((e) => e <= y1).map((e) => (
          <g key={e}><line x1={L} x2={W - R} y1={y(e)} y2={y(e)} className="ht-grid" /><text x={L - 6} y={y(e) + 4} textAnchor="end" className="ht-ax">{fa(e)}</text></g>
        ))}
        {bands.map((b) => (
          <g key={b.key} className={onPick ? 'ht-band is-pick' : 'ht-band'} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onClick={() => onPick?.(b.key)} onKeyDown={onPick ? key(b.key) : undefined}>
            <title>{b.label}</title>
            <rect x={x(b.from)} y={T} width={Math.max(1, x(b.to) - x(b.from))} height={height - T - B} fill={b.color} opacity={0.16} />
            <rect x={x(b.from)} y={T - 14} width={Math.max(1, x(b.to) - x(b.from))} height={8} rx={2} fill={b.color} strokeDasharray={b.dashed ? '3 2' : undefined} />
            <line x1={x(b.to)} x2={x(b.to)} y1={T - 14} y2={height - B} className="ht-cut" />
            {x(b.to) - x(b.from) > 34 && <text x={(x(b.from) + x(b.to)) / 2} y={T - 18} textAnchor="middle" className="ht-band-label">{b.label.split(' ')[0]}</text>}
            {b.hiKm != null && <text x={x(b.hiKm)} y={y(elevAt(b.hiKm)) - 5} textAnchor="middle" className="ht-mark is-hi">▲</text>}
            {b.loKm != null && <text x={x(b.loKm)} y={y(elevAt(b.loKm)) + 13} textAnchor="middle" className="ht-mark is-lo">▼</text>}
          </g>
        ))}
        <path d={`${path}L${x(k1)},${height - B}L${x(k0)},${height - B}Z`} className="ht-area" />
        <path d={path} className="ht-line" />
        {preferred.filter((p) => p.km >= k0 && p.km <= k1).map((p) => (
          <g key={p.tag}><line x1={x(p.km)} x2={x(p.km)} y1={T} y2={height - B} className="ht-pref" /><text x={x(p.km) + 3} y={height - B - 4} className="ht-pref-label">{p.tag}</text></g>
        ))}
        <rect x={L} y={height - B + 6} width={W - L - R} height={5} rx={2} className="ht-bf-bg" />
        {backfilled.map(([a, b], i) => b > k0 && a < k1 && <rect key={i} x={x(Math.max(a, k0))} y={height - B + 6} width={Math.max(1, x(Math.min(b, k1)) - x(Math.max(a, k0)))} height={5} rx={2} className="ht-bf" />)}
        {Array.from({ length: Math.floor((k1 - k0) / kmStep) + 1 }, (_, i) => Math.ceil(k0 / kmStep) * kmStep + i * kmStep).filter((k) => k <= k1).map((k) => (
          <text key={k} x={x(k)} y={height - B + 26} textAnchor="middle" className="ht-ax">{fa(k)}</text>
        ))}
        <text x={W - R} y={height - 6} textAnchor="end" className="ht-ax">km</text>
        <text x={8} y={T - 18} className="ht-ax">m</text>
      </svg>
    </div>
  )
}
