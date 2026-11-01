import { useId } from 'react'
import { BicepsFlexed, Bone, Brain, HeartPulse, ShieldPlus, Waypoints, Wind, type LucideIcon } from 'lucide-react'
import { DEF, STATUS_COLOR, STATUS_FA, type HealthResult, type OrganKey, type OrganScore } from '../lib/healthCore'
import { fa } from './parts'

export const ORGAN_META: Record<OrganKey, { name: string; role: string; icon: LucideIcon }> = {
  brain: { name: 'مغز', role: 'مدیریت و تصمیم‌گیری', icon: Brain },
  heart: { name: 'قلب', role: 'برنامه‌ریزی و کنترل پروژه', icon: HeartPulse },
  lungs: { name: 'ریه‌ها', role: 'تأمین کالا و تجهیزات', icon: Wind },
  muscles: { name: 'عضلات', role: 'پیمانکار و توان اجرایی', icon: BicepsFlexed },
  skeleton: { name: 'اسکلت', role: 'ساختار قرارداد و سازمان', icon: Bone },
  nerves: { name: 'سیستم عصبی', role: 'ارتباطات و جریان اطلاعات', icon: Waypoints },
  immune: { name: 'سیستم ایمنی', role: 'مدیریت ریسک', icon: ShieldPlus },
}
export const ORGAN_ORDER: OrganKey[] = ['brain', 'heart', 'lungs', 'nerves', 'muscles', 'skeleton', 'immune']

/** where an organ's alarm ring sits, in body coordinates (240 × 520) */
const ANCHOR: Record<OrganKey, [number, number]> = {
  brain: [120, 38], heart: [129, 168], lungs: [101, 160], nerves: [120, 236], muscles: [60, 182], skeleton: [100, 366], immune: [151, 218],
}

/* the left half of the body, mirrored for the right: one path filled (closed on the centre line), the same path stroked */
const HALF = 'M120,14 C105,14 96,26 96,42 C96,56 100,66 107,72 C109,74 110,77 110,80 L110,86 C109,93 106,96 98,99 C86,103 70,105 61,113 C52,121 49,134 49,150 C47,172 45,192 43,214 C41,236 39,256 37,278 C36,290 34,300 33,310 C30,320 29,334 33,342 C37,349 44,347 46,338 C48,326 51,316 53,306 C57,284 61,262 65,240 C68,222 70,206 73,190 C75,176 77,162 79,152 C80,176 80,200 82,222 C84,238 80,252 77,268 C74,294 75,322 78,350 C80,380 83,400 84,420 C84,446 82,470 83,492 C83,500 78,506 80,512 L104,512 C106,502 104,494 104,486 C104,462 106,440 108,420 C110,398 113,370 115,336 C116,320 118,308 120,302'
const CONTOURS = [
  'M118,104 C108,102 92,104 72,110', 'M120,120 C110,113 94,112 84,122 C86,136 100,144 118,142', 'M62,114 C72,120 76,136 72,152',
  'M52,158 C56,178 60,196 66,212', 'M46,224 C50,250 50,270 48,296', 'M109,150 L109,242', 'M110,172 L120,172', 'M110,194 L120,194', 'M110,216 L120,216',
  'M84,170 C92,190 96,214 100,240', 'M84,252 C96,270 108,286 118,300', 'M82,322 C92,350 98,380 102,412', 'M107,318 C105,350 104,380 106,410',
  'M90,421 C96,427 104,427 108,421', 'M86,440 C80,460 84,480 88,496',
]
const BONES = [
  'M62,118 L56,212', 'M55,218 L44,300', 'M58,218 L50,300', 'M98,302 L100,414', 'M98,428 L96,500', 'M90,430 L88,498',
  'M90,250 C96,246 108,252 116,262', 'M96,262 C92,276 100,292 120,296', 'M118,104 C108,103 92,105 70,111',
  ...Array.from({ length: 7 }, (_, i) => `M118,${118 + i * 12} C104,${112 + i * 12} 90,${118 + i * 12} 87,${132 + i * 12}`),
]
const MUSCLES = [
  'M62,112 C72,116 78,132 74,150 C66,150 56,140 54,130 C55,122 58,116 62,112 Z',
  'M54,156 C62,164 66,190 66,210 C60,214 54,200 50,180 C49,168 50,160 54,156 Z',
  'M82,318 C94,330 102,370 104,412 C96,416 88,404 84,380 C80,356 80,334 82,318 Z',
  'M86,436 C92,446 94,470 90,492 C84,488 80,466 82,448 Z',
  'M86,124 C96,116 110,116 118,124 C116,136 104,142 92,138 C88,134 86,130 86,124 Z',
]
const NERVES = ['M118,108 C100,112 70,118 60,140 C56,170 52,220 46,300', 'M118,296 C110,330 104,380 100,420 C98,450 96,480 94,504', 'M118,160 C108,162 98,166 90,172', 'M118,200 C108,202 98,206 90,212']
const LYMPH: [number, number][] = [[104, 92], [136, 92], [80, 150], [160, 150], [98, 286], [142, 286], [112, 100], [128, 100]]

export function AnatomyHologram({ r, active, onHover, onPick }: { r: HealthResult; active: OrganKey | null; onHover: (k: OrganKey | null) => void; onPick: (k: OrganKey) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const o = Object.fromEntries(r.organs.map((x) => [x.key, x])) as Record<OrganKey, OrganScore>
  const c = (k: OrganKey) => STATUS_COLOR[o[k].status]
  const cls = (k: OrganKey) => `phc-org${active ? (active === k ? ' is-on' : ' is-dim') : ''}`
  const hit = (k: OrganKey) => ({ className: cls(k), style: { ['--c' as string]: c(k) }, onClick: () => onPick(k), onMouseEnter: () => onHover(k), onMouseLeave: () => onHover(null) })
  const mirror = 'matrix(-1 0 0 1 240 0)'
  const alarms = ORGAN_ORDER.filter((k) => o[k].status === 'bad' || o[k].status === 'critical')

  return (
    <div className="phc-anat-stage">
      <svg viewBox="0 0 520 600" className="phc-anat-svg" aria-hidden focusable="false">
        <defs>
          <radialGradient id={`body${uid}`} cx=".5" cy=".38" r=".7">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".46" />
            <stop offset=".7" stopColor="#0ea5e9" stopOpacity=".18" />
            <stop offset="1" stopColor="#0369a1" stopOpacity=".05" />
          </radialGradient>
          <linearGradient id={`beam${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#22d3ee" stopOpacity=".35" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`ped${uid}`} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#67e8f9" stopOpacity=".7" />
            <stop offset=".55" stopColor="#0891b2" stopOpacity=".25" />
            <stop offset="1" stopColor="#0891b2" stopOpacity="0" />
          </radialGradient>
          <filter id={`glow${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <g id={`half${uid}`}>
            <path d={`${HALF} Z`} fill={`url(#body${uid})`} />
            <path d={HALF} className="phc-anat-edge" />
            {CONTOURS.map((d, i) => <path key={i} d={d} className="phc-anat-contour" />)}
          </g>
        </defs>

        {/* HUD: radar rings, ticks and a slow sweep behind the body */}
        <g className="phc-anat-hud">
          {[118, 168, 218].map((rr) => <circle key={rr} cx="260" cy="250" r={rr} className="phc-anat-ring" />)}
          <g className="phc-anat-spin">
            <circle cx="260" cy="250" r="236" className="phc-anat-dash" />
            <path d="M260,14 A236,236 0 0 1 464,132" className="phc-anat-arc" />
          </g>
          <g className="phc-anat-spin is-rev">
            <circle cx="260" cy="250" r="194" className="phc-anat-dash is-fine" />
          </g>
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2, r1 = 226, r2 = i % 6 ? 221 : 214
            return <line key={i} x1={260 + r1 * Math.cos(a)} y1={250 + r1 * Math.sin(a)} x2={260 + r2 * Math.cos(a)} y2={250 + r2 * Math.sin(a)} className="phc-anat-tick" />
          })}
          <path d="M18,40 v-22 h22 M502,40 v-22 h-22 M18,470 v22 h22 M502,470 v22 h-22" className="phc-anat-corner" />
        </g>

        {/* light beam and pedestal */}
        <path d="M180,560 L210,40 L310,40 L340,560 Z" fill={`url(#beam${uid})`} className="phc-anat-beam" />
        <g className="phc-anat-ped">
          <ellipse cx="260" cy="562" rx="190" ry="30" fill={`url(#ped${uid})`} />
          <ellipse cx="260" cy="562" rx="160" ry="24" className="phc-ped-ring" />
          <ellipse cx="260" cy="562" rx="124" ry="18" className="phc-ped-ring is-dash" />
          <ellipse cx="260" cy="562" rx="88" ry="12" className="phc-ped-ring is-bright" />
          <ellipse cx="260" cy="562" rx="52" ry="7" className="phc-ped-core" />
        </g>

        <g transform="translate(140 32)">
          {/* body shell */}
          <use href={`#half${uid}`} />
          <use href={`#half${uid}`} transform={mirror} />

          {/* skeleton */}
          <g {...hit('skeleton')}>
            <ellipse cx="120" cy="40" rx="20" ry="24" className="phc-bone" />
            {BONES.map((d, i) => <path key={i} d={d} className="phc-bone" />)}
            <g transform={mirror}>{BONES.map((d, i) => <path key={i} d={d} className="phc-bone" />)}</g>
            {Array.from({ length: 24 }, (_, i) => <rect key={i} x="116.5" y={84 + i * 9} width="7" height="6" rx="1.6" className="phc-vert" />)}
          </g>

          {/* muscles */}
          <g {...hit('muscles')}>
            {MUSCLES.map((d, i) => <path key={i} d={d} className="phc-muscle" />)}
            <g transform={mirror}>{MUSCLES.map((d, i) => <path key={i} d={d} className="phc-muscle" />)}</g>
          </g>

          {/* digestive organs, for anatomy only */}
          <g className="phc-viscera">
            <path d="M92,204 C104,198 120,200 128,206 C122,218 106,224 94,220 C90,214 90,208 92,204 Z" />
            <path d="M132,206 C142,202 150,210 148,222 C146,232 136,236 128,232 C134,224 132,214 132,206 Z" />
            <path d="M98,232 C96,250 98,268 104,276 C116,282 128,282 138,276 C144,266 144,248 142,232 C130,226 110,226 98,232 Z" />
            <path d="M104,240 C112,234 128,234 136,240 C140,248 132,252 120,250 C106,248 100,254 104,260 C110,268 130,268 136,262" className="is-line" />
          </g>

          {/* nerves */}
          <g {...hit('nerves')}>
            <path d="M120,56 L120,298" className="phc-nerve is-cord" />
            {NERVES.map((d, i) => <path key={i} d={d} className="phc-nerve" />)}
            <g transform={mirror}>{NERVES.map((d, i) => <path key={i} d={d} className="phc-nerve" />)}</g>
            <path d="M120,236 L120,298" className="phc-nerve is-pulse" />
          </g>

          {/* lungs and airway */}
          <g {...hit('lungs')}>
            <path d="M120,90 L120,120 M120,120 L109,136 M120,120 L131,136" className="phc-airway" />
            <path d="M114,122 C106,116 94,118 90,132 C86,150 86,176 90,196 C98,202 110,198 116,190 C117,170 117,140 114,122 Z" className="phc-lung" />
            <path d="M126,122 C134,116 146,118 150,132 C154,150 154,176 150,196 C142,202 132,198 126,192 C130,184 132,176 128,168 C126,150 126,136 126,122 Z" className="phc-lung" />
            <path d="M109,136 C104,146 100,158 98,172 M106,146 C100,150 96,152 94,156 M131,136 C136,146 140,158 142,172" className="phc-airway is-fine" />
          </g>

          {/* heart */}
          <g {...hit('heart')}>
            <g className="phc-heart" filter={`url(#glow${uid})`}>
              <path d="M129,158 C125,150 113,152 113,162 C113,172 123,180 129,187 C135,180 147,172 147,162 C147,152 135,150 129,158 Z" transform="rotate(-16 129 168)" />
              <path d="M126,156 C124,146 132,140 139,146" className="phc-aorta" />
            </g>
          </g>

          {/* immune: thymus, spleen, lymph nodes */}
          <g {...hit('immune')}>
            <ellipse cx="120" cy="112" rx="6" ry="5" className="phc-immune-o" />
            <path d="M146,212 C152,208 158,214 156,222 C154,228 148,226 146,220 Z" className="phc-immune-o" />
            {LYMPH.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.8" className="phc-node" />)}
          </g>

          {/* brain */}
          <g {...hit('brain')}>
            <g filter={`url(#glow${uid})`}>
              <path d="M120,20 C134,19 143,29 143,40 C143,51 134,57 120,57 C106,57 97,51 97,40 C97,29 106,19 120,20 Z" className="phc-brain" />
              <path d="M120,21 L120,56 M103,33 c4,-4 8,4 12,0 m10,0 c4,-4 8,4 12,0 M101,42 c5,-4 9,4 14,0 m10,0 c5,-4 9,4 14,0 M106,50 c4,-3 7,3 10,0 m8,0 c4,-3 7,3 10,0" className="phc-gyri" />
            </g>
          </g>

          {/* alarms on organs in poor condition */}
          {alarms.map((k) => (
            <g key={k} className="phc-alarm" style={{ ['--c' as string]: c(k) }}>
              <circle cx={ANCHOR[k][0]} cy={ANCHOR[k][1]} r="9" />
              <circle cx={ANCHOR[k][0]} cy={ANCHOR[k][1]} r="9" className="is-2" />
            </g>
          ))}

          <rect x="20" y="0" width="200" height="2" className="phc-anat-scan" />
        </g>
      </svg>
    </div>
  )
}

/** the organ cards beside the body: icon ring, score, weakest indicator */
export function OrganCards({ r, active, onHover, onPick }: { r: HealthResult; active: OrganKey | null; onHover: (k: OrganKey | null) => void; onPick: (k: OrganKey) => void }) {
  const RR = 21, C = 2 * Math.PI * RR
  return (
    <ul className="phc-ocards">
      {ORGAN_ORDER.map((k, i) => {
        const o = r.organs.find((x) => x.key === k)!
        const m = ORGAN_META[k], Icon = m.icon, col = STATUS_COLOR[o.status]
        const weakest = o.indicators.map((id) => ({ id, s: r.indicators[id]?.score })).filter((x): x is { id: string; s: number } => x.s != null).sort((a, b) => a.s - b.s)[0]
        return (
          <li key={k} style={{ ['--c' as string]: col, ['--i' as string]: i }}>
            <button type="button" className={`phc-ocard${active === k ? ' is-on' : ''}`} onClick={() => onPick(k)} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(k)} onBlur={() => onHover(null)}>
              <span className="phc-ocard-ring">
                <svg viewBox="0 0 52 52" aria-hidden>
                  <circle cx="26" cy="26" r={RR} className="t" />
                  <circle cx="26" cy="26" r={RR} className="v" strokeDasharray={`${(C * (o.score ?? 0)) / 100} ${C}`} transform="rotate(-90 26 26)" />
                </svg>
                <Icon size={19} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="phc-ocard-txt">
                <b>{m.name}</b>
                <small>{m.role}</small>
                {weakest && weakest.s < 80 && <em>ضعیف‌ترین: {DEF[weakest.id].label}</em>}
              </span>
              <span className="phc-ocard-score">
                <strong>{o.score == null ? '—' : fa(o.score)}</strong>
                <small>{STATUS_FA[o.status]}</small>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
