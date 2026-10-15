import { useEffect, useState } from 'react'
import { User, X } from 'lucide-react'
import { NOT_QUALIFIED_LABEL } from '../lib/competencyModel'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { OpenToWorkRing } from './OpenToWorkRing'

/**
 * The candidate's personnel photo for every staff view of the assessment — panelists included. Before
 * this, a panelist's stages (profile / documents / panel / interview) showed the photo only as a small
 * preview inside the documents stage; the prominent one lived on the lead-only results page, so most
 * judges never saw it. Readable by the whole team (and, as the current photo, by any signed-in user)
 * through comp_docs_staff_can_read (schema.sql Section 55).
 */
export function CandidatePhoto({
  path,
  size = 56,
  className = '',
  openToWork = false,
  link = true,
  notQualified = false,
}: {
  path: string | null | undefined
  size?: number
  className?: string
  openToWork?: boolean
  /** false → plain image (no full-size link), so a click falls through to the surrounding row/button. */
  link?: boolean
  /** Final verdict is «عدم تأیید صلاحیت» → red mark on the photo corner. */
  notQualified?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setUrl(null)
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])

  const box = (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-purple-400/30 bg-purple-500/10 text-purple-300 ${className}`}
      style={{ width: size, height: size }}
    >
      {url ? <img src={url} alt="عکس پرسنلی نامزد" className="h-full w-full object-cover" /> : <User size={Math.round(size * 0.42)} />}
    </span>
  )

  const photo = url && link ? (
    <a href={url} target="_blank" rel="noopener noreferrer" title="نمایش عکس در اندازه کامل">
      {box}
    </a>
  ) : (
    box
  )
  const ringed = openToWork ? (
    <OpenToWorkRing active size={size} shape="circle">
      {photo}
    </OpenToWorkRing>
  ) : (
    photo
  )
  if (!notQualified) return ringed
  return (
    <span className="relative inline-flex shrink-0">
      {ringed}
      <RejectMark size={size} />
    </span>
  )
}

/** Red ✕ Reject stamp straddling the bottom edge of a photo (final verdict: not qualified). */
export function RejectMark({ size, className = '' }: { size: number; className?: string }) {
  const fs = Math.max(7, Math.round(size * 0.15))
  return (
    <span
      role="img"
      aria-label={NOT_QUALIFIED_LABEL}
      title={NOT_QUALIFIED_LABEL}
      dir="ltr"
      className={`pointer-events-none absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-px whitespace-nowrap rounded-full bg-red-600 font-black uppercase leading-none tracking-wide text-white shadow ring-1 ring-black/40 ${className}`}
      style={{ fontSize: fs, padding: `${Math.round(fs * 0.22)}px ${Math.round(fs * 0.45)}px` }}
    >
      <X size={fs + 1} strokeWidth={3.5} aria-hidden />
      Reject
    </span>
  )
}
