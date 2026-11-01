/**
 * The page's figure: a field engineer in work coveralls and a white IGEDC hard hat, one hand raised toward the
 * holographic health ring beside him. Drawn as one inline SVG so it scales with the panel and takes the page's light.
 * Decorative: the information is in the ring, so the figure is hidden from assistive technology.
 */
export function Engineer({ tone }: { tone: string }) {
  return (
    <svg className="phc-eng" viewBox="0 0 260 420" aria-hidden focusable="false">
      <defs>
        <linearGradient id="phcSuit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a5f" />
          <stop offset="1" stopColor="#0f1f38" />
        </linearGradient>
        <linearGradient id="phcSuitLit" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#2b5683" />
          <stop offset=".6" stopColor="#1b3557" />
          <stop offset="1" stopColor="#13284a" />
        </linearGradient>
        <linearGradient id="phcHelmet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfd8e3" />
        </linearGradient>
        <linearGradient id="phcSkin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c58c67" />
          <stop offset="1" stopColor="#e2ad86" />
        </linearGradient>
        <radialGradient id="phcFloor" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={tone} stopOpacity=".45" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="phcBeam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5eead4" stopOpacity=".55" />
          <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* floor glow and projector disc */}
      <ellipse cx="128" cy="404" rx="96" ry="12" fill="url(#phcFloor)" />

      {/* legs */}
      <path d="M96 262 L90 392 L114 392 L124 280 L134 392 L158 392 L154 262 Z" fill="url(#phcSuit)" />
      <path d="M90 330 L114 330 M134 330 L158 330" stroke="#d9f99d" strokeWidth="5" opacity=".85" />
      <path d="M90 338 L114 338 M134 338 L158 338" stroke="#cbd5e1" strokeWidth="2" opacity=".7" />
      {/* boots */}
      <path d="M84 388 h34 v12 h-40 q0 -8 6 -12 Z" fill="#111827" />
      <path d="M130 388 h34 q8 4 8 12 h-42 Z" fill="#111827" />

      {/* torso */}
      <path d="M84 138 Q124 122 166 138 L172 270 L80 270 Z" fill="url(#phcSuitLit)" />
      {/* zipper and chest pocket */}
      <path d="M125 140 L125 268" stroke="#0b1629" strokeWidth="2" />
      <rect x="133" y="160" width="24" height="18" rx="3" fill="#16304f" stroke="#2c5584" />
      <text x="145" y="172.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#7dd3fc" fontFamily="system-ui, sans-serif">IGEDC</text>
      {/* reflective bands */}
      <path d="M82 214 L170 214" stroke="#d9f99d" strokeWidth="6" opacity=".85" />
      <path d="M82 222 L170 222" stroke="#cbd5e1" strokeWidth="2" opacity=".7" />
      {/* belt */}
      <rect x="80" y="252" width="92" height="10" fill="#0b1629" />
      <rect x="118" y="252" width="14" height="10" fill="#64748b" />

      {/* left arm, down, holding a tablet */}
      <path d="M86 142 Q66 150 64 196 L60 246 L76 248 L84 200 Z" fill="url(#phcSuit)" />
      <path d="M62 226 L78 228" stroke="#d9f99d" strokeWidth="5" opacity=".8" />
      <rect x="44" y="236" width="34" height="46" rx="4" fill="#0b1629" stroke="#38bdf8" strokeOpacity=".5" transform="rotate(-8 61 259)" />
      <path d="M50 254 l8 -6 l6 8 l8 -12" fill="none" stroke="#5eead4" strokeWidth="1.6" transform="rotate(-8 61 259)" />
      <circle cx="66" cy="246" r="7" fill="url(#phcSkin)" />

      {/* right arm, raised toward the hologram */}
      <path d="M162 140 Q186 146 198 170 L222 128 L236 138 L210 190 Q200 204 186 196 L166 178 Z" fill="url(#phcSuitLit)" />
      <path d="M200 150 L214 160" stroke="#d9f99d" strokeWidth="5" opacity=".8" />
      {/* hand, open palm */}
      <path d="M222 126 q2 -14 10 -16 q4 -1 4 4 l-2 10 q6 -10 10 -8 q3 2 0 8 l-6 10 q-6 8 -14 6 Z" fill="url(#phcSkin)" />
      {/* projection beam from the palm */}
      <path d="M238 112 L260 40 L260 150 Z" fill="url(#phcBeam)" opacity=".6" />

      {/* neck and head */}
      <rect x="114" y="112" width="22" height="18" rx="6" fill="url(#phcSkin)" />
      <path d="M108 128 Q125 140 142 128 L140 138 Q125 146 110 138 Z" fill="#16304f" />
      <ellipse cx="125" cy="92" rx="25" ry="28" fill="url(#phcSkin)" />
      <path d="M100 96 q-2 -8 2 -14 l4 20 Z" fill="#3b2a20" />
      {/* safety glasses, catching the hologram light */}
      <path d="M104 92 Q125 86 148 92 L146 101 Q136 106 127 100 Q118 106 106 101 Z" fill="#0b1629" opacity=".85" />
      <path d="M130 93 L146 95" stroke="#5eead4" strokeWidth="1.4" opacity=".9" />
      {/* hard hat — white, IGEDC */}
      <path d="M96 78 Q98 44 125 42 Q154 42 156 78 Z" fill="url(#phcHelmet)" />
      <path d="M124 42 Q127 58 126 78" stroke="#b6c2d1" strokeWidth="3" fill="none" />
      <path d="M88 78 Q125 70 164 78 Q166 84 160 86 Q125 80 90 86 Q86 84 88 78 Z" fill="#e2e8f0" />
      <rect x="104" y="58" width="44" height="11" rx="2.5" fill="#0c4a6e" />
      <text x="126" y="66.6" textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing=".6" fill="#ffffff" fontFamily="system-ui, sans-serif">IGEDC</text>
      {/* rim light on the hologram side */}
      <path d="M156 78 Q158 60 150 50" stroke="#5eead4" strokeWidth="1.6" fill="none" opacity=".7" />
      <path d="M168 142 L174 268" stroke="#5eead4" strokeWidth="1.4" opacity=".45" />
    </svg>
  )
}
