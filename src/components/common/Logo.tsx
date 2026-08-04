/**
 * App mark: a bold flame (gas/energy) rising from a burner nozzle (piping),
 * with a small signal node (digital transformation) at its tip and a
 * checkmark badge (project management / progress) at its base — reused
 * everywhere the old "IP" glyph used to be.
 */
export function Logo({ size = 36, rounded = true, className = '' }: { size?: number; rounded?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="لوگوی سامانه پایش پیشرفت ایزومتریک لوله‌کشی"
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="62%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="logoFlame" x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
      </defs>

      <rect width="40" height="40" rx={rounded ? 10 : 0} fill="url(#logoBg)" />

      {/* burner nozzle — piping */}
      <rect x="14.5" y="30.5" width="11" height="3.6" rx="1.3" fill="#cbd5e1" />

      {/* flame — gas / energy (lucide flame glyph, drawn as a bold gradient stroke) */}
      <g transform="translate(9.2,4.3) scale(1.42)">
        <path
          d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"
          fill="none"
          stroke="url(#logoFlame)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* digital-transformation signal node */}
      <circle cx="29.5" cy="8" r="2.6" fill="none" stroke="#67e8f9" strokeWidth="1.4" />
      <circle cx="29.5" cy="8" r="1.1" fill="#22d3ee" />

      {/* project-management progress badge */}
      <circle cx="30.5" cy="30.5" r="5.3" fill="#16a34a" stroke="#0c4a6e" strokeWidth="1.2" />
      <path d="M27.9 30.6l1.7 1.7 3.3-3.6" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
