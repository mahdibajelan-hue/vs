import { useId, type ReactNode } from 'react'
import type { WorkStatus } from '../types'

/** LinkedIn-style "Open to work" green. */
export const OPEN_TO_WORK_GREEN = '#3f9b2f'

const BAND_TEXT = '#OPENTOWORK'

/** Point on a circle of radius r around (50,50) in a 100×100 viewBox; angle in degrees, clockwise from 3 o'clock (SVG y points down). */
const pt = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`
}

/**
 * Wraps a candidate photo in LinkedIn's «#OpenToWork» frame when `active`: a green crescent laid over
 * the lower part of the photo (from about 9 o'clock round the bottom to 4 o'clock) with the hashtag
 * running along it. A rounded-square photo (the credential card) gets the same band as a shallow arch
 * across the bottom edge. Below ~52px there is no room for legible text, so only the band is drawn
 * (the accessible label still names the state).
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
  const uid = useId().replace(/:/g, '')
  if (!active) return <>{children}</>
  const label = 'آماده به کار (Open to work)'
  const showText = size >= 52
  const square = shape === 'square'
  const clipId = `otw-clip-${uid}`
  const gradId = `otw-grad-${uid}`
  const arcId = `otw-arc-${uid}`

  const bandPath = square
    ? 'M 0 80 Q 50 60 100 80 L 100 100 L 0 100 Z'
    : `M ${pt(200, 50)} A 50 50 0 0 0 ${pt(28, 50)} L ${pt(28, 32)} A 32 32 0 0 1 ${pt(200, 32)} Z`
  const textPath = square ? 'M 6 94 Q 50 78 94 94' : `M ${pt(203, 44)} A 44 44 0 0 0 ${pt(27, 44)}`

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} title={label} role="img" aria-label={label}>
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: square ? radius : 9999 }}>
        <div className="flex h-full w-full items-center justify-center">{children}</div>
      </div>
      <svg viewBox="0 0 100 100" width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
        <defs>
          <clipPath id={clipId}>{square ? <rect width="100" height="100" rx={(radius / size) * 100} /> : <circle cx="50" cy="50" r="50" />}</clipPath>
          <linearGradient id={gradId} x1="0" y1="0.3" x2="1" y2="1">
            <stop offset="0" stopColor="#2f7a22" />
            <stop offset="1" stopColor="#4f9d2e" />
          </linearGradient>
          <path id={arcId} d={textPath} />
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path d={bandPath} fill={`url(#${gradId})`} stroke={`url(#${gradId})`} strokeWidth="4" strokeLinejoin="round" />
        </g>
        {showText && (
          <text
            fill="#fff"
            fontSize={square ? 8.6 : 10.5}
            fontWeight="800"
            letterSpacing={square ? '0.5' : '0.8'}
            textAnchor="middle"
            direction="ltr"
            style={{ fontFamily: 'system-ui, sans-serif', direction: 'ltr', unicodeBidi: 'isolate' }}
          >
            <textPath href={`#${arcId}`} startOffset="50%">
              {BAND_TEXT}
            </textPath>
          </text>
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
