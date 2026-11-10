import { useEffect, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

const PHONE = '(max-width: 640px)'
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE).matches

/**
 * On a phone a page's filter controls fill the first screen and push the list it filters below the fold.
 * This keeps search visible and folds the rest behind one «فیلترها» button that shows how many are in use.
 * On larger screens nothing changes: `show` is always true and `toggle` renders nothing.
 */
export function usePhoneFilters(active: number) {
  const [phone, setPhone] = useState(isPhone)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggle = phone ? (
    <button type="button" className="ph-filter-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      <SlidersHorizontal size={15} aria-hidden />
      <span>فیلترها{active > 0 ? ` · ${active.toLocaleString('fa-IR')} فعال` : ''}</span>
      <ChevronDown size={15} aria-hidden className="ph-filter-chev" />
    </button>
  ) : null
  return { show: !phone || open, toggle }
}
