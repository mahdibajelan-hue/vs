import { useId, useMemo, useState } from 'react'
import { ENGAGEMENT_ORDER, ATTITUDE_COLOR, ATTITUDE_FA, ENGAGEMENT_FA, QUADRANT_FA, type Quadrant } from '../types'
import type { StakeholderView } from '../lib/stakeholderCore'

/**
 * نقشهٔ مداری ذینفعان — the project as a glowing core and every active stakeholder on an orbit around it:
 * the orbit is the stakeholder's power (closer = more powerful), the sector its strategy quadrant, the node size its
 * interest, the colour its attitude. The link to the core is as bright as the current engagement and dashed while the
 * stakeholder is below the desired level; stakeholders that need attention ping.
 */
const C = 300
const RADIUS: Record<number, number> = { 5: 104, 4: 150, 3: 196, 2: 238, 1: 276 }
/** sectors in degrees (0 = east, clockwise, SVG coordinates) — high power at the top, high interest on the right */
const SECTOR: Record<Quadrant, [number, number]> = { manage: [-88, -2], satisfy: [-178, -92], inform: [2, 88], monitor: [92, 178] }
const rad = (d: number) => (d * Math.PI) / 180
const pt = (r: number, d: number): [number, number] => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))]
const arc = (r: number, a: number, b: number) => { const [x1, y1] = pt(r, a), [x2, y2] = pt(r, b); return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}` }
const wedge = (r: number, a: number, b: number) => { const [x1, y1] = pt(r, a), [x2, y2] = pt(r, b); return `M${C},${C} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z` }
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function StakeholderOrbit({ views, onOpen, projectLabel }: { views: StakeholderView[]; onOpen: (id: string) => void; projectLabel: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [hover, setHover] = useState<string | null>(null)
  const nodes = useMemo(() => {
    const act = views.filter((v) => v.s.active)
    const out: { v: StakeholderView; x: number; y: number; r: number; deg: number }[] = []
    for (const q of Object.keys(SECTOR) as Quadrant[]) {
      const list = act.filter((v) => v.quadrant === q).sort((a, b) => b.s.interest - a.s.interest || a.s.code.localeCompare(b.s.code))
      const [a, b] = SECTOR[q]
      list.forEach((v, i) => {
        // spread along the sector; stakeholders on the same orbit are shifted so they do not sit on top of each other
        const deg = list.length === 1 ? (a + b) / 2 : a + 8 + ((b - a - 16) * i) / (list.length - 1)
        const [x, y] = pt(RADIUS[v.s.power] ?? 196, deg)
        out.push({ v, x, y, r: 7 + v.s.interest * 2.2, deg })
      })
    }
    return out
  }, [views])
  const labels = nodes.length <= 16
  const lit = (id: string) => !hover || hover === id

  return (
    <div className="sh-orbit">
      <svg viewBox="-30 -30 660 660" role="img" aria-label="نقشهٔ مداری ذینفعان پروژه">
        <defs>
          <radialGradient id={`core${uid}`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#f5f3ff" />
            <stop offset=".35" stopColor="#a78bfa" />
            <stop offset=".75" stopColor="#6366f1" stopOpacity=".55" />
            <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`bg${uid}`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity=".2" />
            <stop offset=".6" stopColor="#0ea5e9" stopOpacity=".06" />
            <stop offset="1" stopColor="#0ea5e9" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`sweep${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity=".28" />
          </linearGradient>
          <filter id={`glow${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={C} cy={C} r="296" fill={`url(#bg${uid})`} />
        {/* strategy sectors */}
        {(Object.keys(SECTOR) as Quadrant[]).map((q) => {
          const [a, b] = SECTOR[q]
          return (
            <g key={q} style={{ ['--c' as string]: QUADRANT_FA[q].color }}>
              <path d={wedge(288, a, b)} className="sh-orb-sector" />
              <path d={arc(292, a + 3, b - 3)} className="sh-orb-sector-arc" />
            </g>
          )
        })}
        {/* orbits (power) */}
        {[5, 4, 3, 2, 1].map((p) => <circle key={p} cx={C} cy={C} r={RADIUS[p]} className="sh-orb-ring" />)}
        {[5, 4, 3, 2, 1].map((p) => <text key={p} x={C + 4} y={C - RADIUS[p] - 4} className="sh-orb-ring-t">قدرت {p.toLocaleString('fa-IR')}</text>)}
        <line x1={C} y1="12" x2={C} y2="588" className="sh-orb-axis" />
        <line x1="12" y1={C} x2="588" y2={C} className="sh-orb-axis" />

        {/* HUD */}
        <g className="sh-orb-spin">
          <path d={`M${C},${C} L${C + 288},${C} A288,288 0 0 0 ${pt(288, -38)[0]},${pt(288, -38)[1]} Z`} fill={`url(#sweep${uid})`} />
        </g>
        <g className="sh-orb-spin is-slow">
          <circle cx={C} cy={C} r="250" className="sh-orb-dash" />
        </g>
        {Array.from({ length: 90 }, (_, i) => {
          const d = i * 4, [x1, y1] = pt(292, d), [x2, y2] = pt(i % 5 ? 286 : 280, d)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="sh-orb-tick" />
        })}

        {/* links to the core */}
        {nodes.map(({ v, x, y }) => {
          const level = ENGAGEMENT_ORDER.indexOf(v.s.current)
          return (
            <line key={`l${v.s.id}`} x1={C} y1={C} x2={x} y2={y} className={`sh-orb-link${v.gap > 0 ? ' is-gap' : ''}${lit(v.s.id) ? '' : ' is-dim'}${hover === v.s.id ? ' is-on' : ''}`}
              style={{ ['--c' as string]: ATTITUDE_COLOR[v.s.attitude], ['--o' as string]: String(0.18 + level * 0.14) }} />
          )
        })}

        {/* core */}
        <circle cx={C} cy={C} r="46" fill={`url(#core${uid})`} className="sh-orb-core-glow" />
        <circle cx={C} cy={C} r="30" className="sh-orb-core" />
        <text x={C} y={C - 2} className="sh-orb-core-t">پروژه</text>
        <text x={C} y={C + 13} className="sh-orb-core-s">{short(projectLabel, 14)}</text>

        {/* stakeholders */}
        {nodes.map(({ v, x, y, r }) => {
          const ping = v.alerts.length > 0 && v.attention >= 55
          const below = y > C
          return (
            <g key={v.s.id} className={`sh-orb-node${lit(v.s.id) ? '' : ' is-dim'}${hover === v.s.id ? ' is-on' : ''}`} style={{ ['--c' as string]: ATTITUDE_COLOR[v.s.attitude] }}
              role="button" tabIndex={0} aria-label={`${v.s.name}: قدرت ${v.s.power}، علاقه ${v.s.interest}، ${ATTITUDE_FA[v.s.attitude]}، تعامل ${ENGAGEMENT_FA[v.s.current]}`}
              onClick={() => onOpen(v.s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(v.s.id) } }}
              onMouseEnter={() => setHover(v.s.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(v.s.id)} onBlur={() => setHover(null)}>
              {ping && <><circle cx={x} cy={y} r={r} className="sh-orb-ping" /><circle cx={x} cy={y} r={r} className="sh-orb-ping is-2" /></>}
              <circle cx={x} cy={y} r={r + 5} className="sh-orb-halo" />
              <circle cx={x} cy={y} r={r} className="sh-orb-dot" filter={`url(#glow${uid})`} />
              <text x={x} y={y + 4} className="sh-orb-dot-t">{v.s.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</text>
              {(labels || hover === v.s.id) && (
                <g className="sh-orb-label">
                  <rect x={x - 76} y={below ? y + r + 6 : y - r - 28} width="152" height="21" rx="10.5" />
                  <text x={x} y={below ? y + r + 20.5 : y - r - 13.5}>{short(v.s.name, 22)}</text>
                </g>
              )}
            </g>
          )
        })}

        {/* sector names */}
        {(Object.keys(SECTOR) as Quadrant[]).map((q) => {
          const [a, b] = SECTOR[q], m = (a + b) / 2, [x, y] = pt(322, m)
          return <text key={q} x={x} y={y} className="sh-orb-sector-t" style={{ ['--c' as string]: QUADRANT_FA[q].color }}>{QUADRANT_FA[q].name}</text>
        })}
      </svg>
      <div className="sh-orb-legend">
        <span><i className="is-ring" /> نزدیک‌تر به مرکز: قدرت بیشتر</span>
        <span><i className="is-size" /> بزرگ‌تر: علاقهٔ بیشتر</span>
        <span><i className="is-dash" /> خط‌چین: پایین‌تر از سطح مطلوب</span>
        <span><i className="is-ping" /> حلقهٔ تپنده: نیازمند توجه</span>
      </div>
    </div>
  )
}
