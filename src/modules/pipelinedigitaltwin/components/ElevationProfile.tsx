import { useMemo } from 'react'
import { Mountain } from 'lucide-react'
import type { Joint, Route } from '../types'
import { FINAL_STATUS_COLOR } from '../lib/progressEngine'

interface ElevationProfileProps {
  route: Route
  joints: Joint[]
}

const WIDTH = 640
const HEIGHT = 96
const PAD_X = 8
const PAD_TOP = 10
const PAD_BOTTOM = 8

/** Elevation vs. chainage, built directly from the route's own vertices — never a separate/guessed profile. Joints are plotted along the same x-axis so a status cluster can be read against the terrain shape. */
export function ElevationProfile({ route, joints }: ElevationProfileProps) {
  const { linePath, jointDots, minEl, maxEl } = useMemo(() => {
    const elevations = route.points.map((p) => p.elevation ?? 0)
    const minEl = Math.min(...elevations)
    const maxEl = Math.max(...elevations)
    const range = Math.max(1, maxEl - minEl)
    const plotW = WIDTH - PAD_X * 2
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM

    let cum = 0
    const xs: number[] = [0]
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]
      const b = route.points[i]
      cum += Math.hypot(b.lon - a.lon, b.lat - a.lat)
      xs.push(cum)
    }
    const total = cum || 1

    const toX = (d: number) => PAD_X + (d / total) * plotW
    const toY = (el: number) => PAD_TOP + plotH - ((el - minEl) / range) * plotH

    const linePath = route.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(xs[i]).toFixed(1)} ${toY(p.elevation ?? 0).toFixed(1)}`).join(' ')

    const jointDots = joints.map((j) => ({
      x: toX((j.chainageMeters / route.lengthMeters) * total),
      color: FINAL_STATUS_COLOR[j.finalStatus],
    }))

    return { linePath, jointDots, minEl, maxEl }
  }, [route, joints])

  if (!route.hasElevationData) {
    return (
      <div className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-3 text-[11px] text-muted">
        <Mountain size={13} /> این مسیر داده ارتفاع ندارد — پروفایل ارتفاعی قابل نمایش نیست.
      </div>
    )
  }

  return (
    <div className="glass-panel shrink-0 rounded-2xl px-4 py-2.5">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-secondary">
        <span className="flex items-center gap-1.5">
          <Mountain size={13} /> پروفایل ارتفاعی
        </span>
        <span className="num text-muted">
          {Math.round(minEl)}–{Math.round(maxEl)} m
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-16 w-full" preserveAspectRatio="none">
        <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {jointDots.map((d, i) => (
          <circle key={i} cx={d.x} cy={HEIGHT - PAD_BOTTOM + 3} r={1.6} fill={d.color} />
        ))}
      </svg>
    </div>
  )
}
