import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { getCompDocSignedUrl } from '../lib/compStorage'

/**
 * The candidate's personnel photo for every staff view of the assessment — panelists included. Before
 * this, a panelist's stages (profile / documents / panel / interview) showed the photo only as a small
 * preview inside the documents stage; the prominent one lived on the lead-only results page, so most
 * judges never saw it. Readable by the whole team (and, as the current photo, by any signed-in user)
 * through comp_docs_staff_can_read (schema.sql Section 55).
 */
export function CandidatePhoto({ path, size = 56, className = '' }: { path: string | null | undefined; size?: number; className?: string }) {
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

  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" title="نمایش عکس در اندازه کامل">
      {box}
    </a>
  ) : (
    box
  )
}
