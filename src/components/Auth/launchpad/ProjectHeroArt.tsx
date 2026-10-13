import { useEffect, useRef, useState } from 'react'

/**
 * The emblem under the sign-in card: a Gantt schedule with its critical path, the planned-vs-actual
 * S-curve climbing over it, a milestone and a radar sweep — drawn straight on the page background
 * (no plate), in mid-tone colours that read on the dark and the light page. The animation starts when
 * the emblem scrolls into view and runs slowly enough to be watched. Decorative.
 */
export function ProjectHeroArt({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [play, setPlay] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setPlay(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPlay(true); io.disconnect() } }, { threshold: 0.55 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const bars: { x: number; y: number; w: number; c: number; d: number }[] = [
    { x: 34, y: 34, w: 74, c: 0, d: 0 }, { x: 76, y: 52, w: 92, c: 1, d: 1 }, { x: 128, y: 70, w: 70, c: 2, d: 2 },
    { x: 168, y: 88, w: 96, c: 3, d: 3 }, { x: 214, y: 106, w: 78, c: 4, d: 4 },
  ]
  const fills: [string, string][] = [['#38bdf8', '#6366f1'], ['#34d399', '#a3e635'], ['#fbbf24', '#f97316'], ['#f472b6', '#a855f7'], ['#fb7185', '#f59e0b']]
  return (
    <figure className={`hero-art mx-auto w-full max-w-sm${play ? ' ha-play' : ''} ${className}`} aria-hidden="true">
      <svg ref={ref} viewBox="0 0 340 214" className="block h-auto w-full" role="presentation">
        <defs>
          {fills.map(([c0, c1], i) => <linearGradient key={i} id={`ha-g${i}`} x1="0" x2="1"><stop offset="0" stopColor={c0} /><stop offset="1" stopColor={c1} /></linearGradient>)}
          <linearGradient id="ha-curve" x1="0" x2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#c9a227" /></linearGradient>
          <radialGradient id="ha-glow"><stop offset="0" stopColor="#c9a227" stopOpacity=".55" /><stop offset="1" stopColor="#c9a227" stopOpacity="0" /></radialGradient>
        </defs>
        <g>
          {/* radar rings behind the schedule */}
          <g fill="none" stroke="#0ea5e9" strokeOpacity=".4">
            <circle cx="272" cy="150" r="22" /><circle cx="272" cy="150" r="46" /><circle cx="272" cy="150" r="72" strokeDasharray="3 5" />
          </g>
          <g className="ha-sweep"><path d="M272 150 L272 78 A72 72 0 0 1 331 109 Z" fill="#0ea5e9" fillOpacity=".18" /></g>
          {/* time axis */}
          <path d="M26 172 H318" stroke="#64748b" strokeOpacity=".75" strokeWidth="1" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <path key={i} d={`M${40 + i * 36} 172 v5`} stroke="#64748b" strokeOpacity=".75" />)}
          {/* Gantt bars */}
          {bars.map((b, i) => (
            <g key={i} className="ha-bar" style={{ ['--d' as string]: `${400 + b.d * 520}ms` }}>
              <rect x={b.x} y={b.y} width={b.w} height="11" rx="5.5" fill={`url(#ha-g${b.c})`} />
              <rect x={b.x} y={b.y} width={b.w * 0.58} height="11" rx="5.5" fill="#fff" fillOpacity=".22" />
            </g>
          ))}
          {/* dependencies / critical path */}
          <path d="M108 39.5 H118 Q124 39.5 124 45 V52.5 M168 57.5 H176 Q182 57.5 182 63 V75 M198 75.5 H206 Q212 75.5 212 81 V93 M264 93.5 H272 Q278 93.5 278 99 V111" fill="none" stroke="#64748b" strokeOpacity=".85" strokeWidth="1.4" strokeLinejoin="round" />
          {/* S-curve: planned (dashed) and actual */}
          <path d="M30 168 C 92 164, 120 150, 160 118 S 262 56, 312 46" fill="none" stroke="#64748b" strokeOpacity=".8" strokeWidth="1.4" strokeDasharray="4 4" />
          <path className="ha-curve" d="M30 168 C 90 166, 124 154, 160 124 S 236 80, 262 72" fill="none" stroke="url(#ha-curve)" strokeWidth="3" strokeLinecap="round" pathLength="1" />
          {/* today marker + milestone */}
          <g className="ha-pulse"><circle cx="262" cy="72" r="14" fill="url(#ha-glow)" /></g>
          <circle cx="262" cy="72" r="4.6" fill="#fff" stroke="#c9a227" strokeWidth="2" />
          <path d="M262 76 V172" stroke="#c9a227" strokeOpacity=".5" strokeDasharray="2 3" />
          <path d="M312 36 l7 7 -7 7 -7 -7 z" fill="#c9a227" stroke="#fde68a" strokeWidth=".8" />
          <path d="M312 50 V172" stroke="#c9a227" strokeOpacity=".3" strokeDasharray="2 3" />
        </g>
      </svg>
    </figure>
  )
}
