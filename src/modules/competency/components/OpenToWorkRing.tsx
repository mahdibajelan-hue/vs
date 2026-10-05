import type { ReactNode } from 'react'
import type { WorkStatus } from '../types'

/** LinkedIn-style "Open to work" green. */
export const OPEN_TO_WORK_GREEN = '#3f9b2f'

/**
 * Wraps a candidate photo in a LinkedIn-style «Open to work» ring when `active`. A circular photo gets
 * an SVG ring with the words curved along its lower arc; a rounded-square photo (the credential card)
 * gets the same ring plus a straight banner across the bottom edge. Below ~52px there is no room for
 * legible text, so only the ring is drawn (the accessible label still names the state).
 */
export function OpenToWorkRing({
  active,
  size,
  shape = 'circle',
  radius = 20,
  className = '',
  children,
}: {
  active: boolean
  size: number
  shape?: 'circle' | 'square'
  /** Corner radius (px) of the photo when shape is 'square'. */
  radius?: number
  className?: string
  children: ReactNode
}) {
  if (!active) return <>{children}</>
  const label = 'آماده به کار (Open to work)'

  if (shape === 'square') {
    return (
      <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} title={label} role="img" aria-label={label}>
        {children}
        <span className="pointer-events-none absolute inset-0" style={{ borderRadius: radius, boxShadow: `0 0 0 4px ${OPEN_TO_WORK_GREEN}`, zIndex: 2 }} />
        <span
          className="pointer-events-none absolute flex items-center justify-center text-white"
          style={{
            zIndex: 3,
            left: -4,
            right: -4,
            bottom: -4,
            height: 24,
            background: OPEN_TO_WORK_GREEN,
            borderRadius: `0 0 ${radius + 4}px ${radius + 4}px`,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '0.09em',
            direction: 'ltr',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          OPEN TO WORK
        </span>
      </div>
    )
  }

  const showText = size >= 52
  const ring = Math.max(3, Math.round(size * 0.055))
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} title={label} role="img" aria-label={label}>
      <div className="absolute flex items-center justify-center overflow-hidden rounded-full" style={{ inset: ring }}>
        {children}
      </div>
      <svg viewBox="0 0 100 100" width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
        <defs>
          <path id={`otw-arc-${size}`} d="M 15 67 A 40 40 0 0 0 85 67" />
        </defs>
        <circle cx="50" cy="50" r={50 - (ring / size) * 50} fill="none" stroke={OPEN_TO_WORK_GREEN} strokeWidth={(ring / size) * 100} />
        {showText && (
          <>
            <path d="M 12.5 66 A 41 41 0 0 0 87.5 66" fill="none" stroke={OPEN_TO_WORK_GREEN} strokeWidth="17" />
            <text fill="#fff" fontSize="9.2" fontWeight="800" letterSpacing="0.9" textAnchor="middle" style={{ fontFamily: 'system-ui, sans-serif' }}>
              <textPath href={`#otw-arc-${size}`} startOffset="50%">
                OPEN TO WORK
              </textPath>
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

/** Compact status chip for list rows: «Open to work» or «شاغل در پروژه …». Renders nothing for 'none'. */
export function WorkStatusChip({ status, projectName, className = '' }: { status: WorkStatus; projectName: string; className?: string }) {
  if (status === 'open_to_work') {
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-400/40 ${className}`} dir="ltr">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: OPEN_TO_WORK_GREEN }} aria-hidden />
        Open to work
      </span>
    )
  }
  if (status === 'on_project') {
    return (
      <span className={`inline-flex max-w-[11rem] shrink-0 items-center truncate rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 ring-1 ring-sky-400/40 ${className}`} title={`شاغل در پروژه ${projectName}`}>
        <span className="truncate">شاغل در پروژه {projectName}</span>
      </span>
    )
  }
  return null
}
