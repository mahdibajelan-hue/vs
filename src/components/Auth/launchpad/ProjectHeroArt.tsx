/**
 * The emblem under the sign-in card: a project-controls "drawing sheet" — a Gantt schedule with its
 * critical path, the planned-vs-actual S-curve climbing over it, a milestone and a radar sweep.
 * Pure SVG on its own navy plate, so it reads the same on the dark and the light page. Decorative.
 */
export function ProjectHeroArt({ className = '' }: { className?: string }) {
  const bars: { x: number; y: number; w: number; c: 'a' | 'b'; d: number }[] = [
    { x: 34, y: 34, w: 74, c: 'a', d: 0 }, { x: 76, y: 52, w: 92, c: 'a', d: 1 }, { x: 128, y: 70, w: 70, c: 'b', d: 2 },
    { x: 168, y: 88, w: 96, c: 'a', d: 3 }, { x: 214, y: 106, w: 78, c: 'b', d: 4 },
  ]
  return (
    <figure className={`hero-art mx-auto w-full max-w-sm ${className}`} aria-hidden="true">
      <svg viewBox="0 0 340 214" className="block h-auto w-full" role="presentation">
        <defs>
          <linearGradient id="ha-plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#12294d" /><stop offset="1" stopColor="#0a1730" /></linearGradient>
          <linearGradient id="ha-a" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#34d399" /></linearGradient>
          <linearGradient id="ha-b" x1="0" x2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
          <linearGradient id="ha-curve" x1="0" x2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#c9a227" /></linearGradient>
          <radialGradient id="ha-glow"><stop offset="0" stopColor="#c9a227" stopOpacity=".55" /><stop offset="1" stopColor="#c9a227" stopOpacity="0" /></radialGradient>
          <pattern id="ha-grid" width="17" height="17" patternUnits="userSpaceOnUse"><path d="M17 0H0V17" fill="none" stroke="#7dd3fc" strokeOpacity=".09" strokeWidth=".6" /></pattern>
          <clipPath id="ha-clip"><rect x="0" y="0" width="340" height="214" rx="18" /></clipPath>
        </defs>
        <g clipPath="url(#ha-clip)">
          <rect width="340" height="214" fill="url(#ha-plate)" />
          <rect width="340" height="214" fill="url(#ha-grid)" />
          {/* radar rings behind the schedule */}
          <g fill="none" stroke="#38bdf8" strokeOpacity=".16">
            <circle cx="272" cy="150" r="22" /><circle cx="272" cy="150" r="46" /><circle cx="272" cy="150" r="72" strokeDasharray="3 5" />
          </g>
          <g className="ha-sweep"><path d="M272 150 L272 78 A72 72 0 0 1 331 109 Z" fill="#22d3ee" fillOpacity=".10" /></g>
          {/* time axis */}
          <path d="M26 172 H318" stroke="#94a3b8" strokeOpacity=".45" strokeWidth="1" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <path key={i} d={`M${40 + i * 36} 172 v5`} stroke="#94a3b8" strokeOpacity=".45" />)}
          {/* Gantt bars */}
          {bars.map((b, i) => (
            <g key={i} className="ha-bar" style={{ ['--d' as string]: `${b.d * 110}ms` }}>
              <rect x={b.x} y={b.y} width={b.w} height="11" rx="5.5" fill={`url(#ha-${b.c})`} />
              <rect x={b.x} y={b.y} width={b.w * 0.58} height="11" rx="5.5" fill="#fff" fillOpacity=".22" />
            </g>
          ))}
          {/* dependencies / critical path */}
          <path d="M108 39.5 H118 Q124 39.5 124 45 V52.5 M168 57.5 H176 Q182 57.5 182 63 V75 M198 75.5 H206 Q212 75.5 212 81 V93 M264 93.5 H272 Q278 93.5 278 99 V111" fill="none" stroke="#e2e8f0" strokeOpacity=".7" strokeWidth="1.3" strokeLinejoin="round" />
          {/* S-curve: planned (dashed) and actual */}
          <path d="M30 168 C 92 164, 120 150, 160 118 S 262 56, 312 46" fill="none" stroke="#94a3b8" strokeOpacity=".7" strokeWidth="1.4" strokeDasharray="4 4" />
          <path className="ha-curve" d="M30 168 C 90 166, 124 154, 160 124 S 236 80, 262 72" fill="none" stroke="url(#ha-curve)" strokeWidth="3" strokeLinecap="round" pathLength="1" />
          {/* today marker + milestone */}
          <g className="ha-pulse"><circle cx="262" cy="72" r="14" fill="url(#ha-glow)" /></g>
          <circle cx="262" cy="72" r="4.6" fill="#fff" stroke="#c9a227" strokeWidth="2" />
          <path d="M262 76 V172" stroke="#c9a227" strokeOpacity=".5" strokeDasharray="2 3" />
          <path d="M312 36 l7 7 -7 7 -7 -7 z" fill="#c9a227" stroke="#fde68a" strokeWidth=".8" />
          <path d="M312 50 V172" stroke="#c9a227" strokeOpacity=".3" strokeDasharray="2 3" />
        </g>
        <rect x=".6" y=".6" width="338.8" height="212.8" rx="17.5" fill="none" stroke="#38bdf8" strokeOpacity=".5" />
      </svg>
    </figure>
  )
}
