/**
 * Prominent "competency approved" medal — a small badge or plain checkmark on the personnel card
 * went unnoticed (people scan the whole card, not one corner of it), so this is a proper
 * award-medal shape: a gold medallion with a green ribbon tail, pinned to the corner of the
 * personnel card at a size and contrast that can't be missed.
 */
export function ApprovalMedal({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const dims = size === 'lg' ? { medal: 88, font: 10 } : { medal: 46, font: 6.5 }
  return (
    <div className="pointer-events-none select-none" style={{ width: dims.medal, filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))' }}>
      <svg viewBox="0 0 100 132" width={dims.medal} height={(dims.medal * 132) / 100}>
        <defs>
          <linearGradient id="medal-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="medal-ribbon-l" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id="medal-ribbon-r" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <polygon points="30,8 46,58 14,58" fill="url(#medal-ribbon-l)" />
        <polygon points="70,8 86,58 54,58" fill="url(#medal-ribbon-r)" />
        <polygon points="30,8 24,24 46,58 46,42" fill="#000" opacity="0.12" />
        <circle cx="50" cy="70" r="35" fill="url(#medal-gold)" stroke="#fffbeb" strokeWidth="2" />
        <circle cx="50" cy="70" r="27.5" fill="none" stroke="#fffbeb" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2.5 3" />
        <polyline points="37,70 47,80 65,58" fill="none" stroke="#7c2d12" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <text x="50" y="122" textAnchor="middle" fontSize={dims.font} fontWeight="800" fill="#fde68a" fontFamily="Vazirmatn, sans-serif">
          تایید صلاحیت
        </text>
      </svg>
    </div>
  )
}
