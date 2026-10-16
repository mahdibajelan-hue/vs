import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Wraps a tab bar that may be wider than the screen: arrows appear on the side that still has hidden tabs and scroll the bar (RTL aware). */
export function NavScroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ start: false, end: false })
  const measure = useCallback(() => {
    const el = ref.current?.querySelector('nav'); if (!el) return
    const max = el.scrollWidth - el.clientWidth, pos = Math.abs(el.scrollLeft) // RTL: scrollLeft runs 0 → negative
    setMore({ start: pos > 2, end: max - pos > 2 })
  }, [])
  useEffect(() => {
    const el = ref.current?.querySelector('nav'); if (!el) return
    measure(); el.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null; ro?.observe(el)
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [measure])
  const go = (dir: 1 | -1) => ref.current?.querySelector('nav')?.scrollBy({ left: dir * 260 * (getComputedStyle(ref.current!).direction === 'rtl' ? -1 : 1), behavior: 'smooth' })
  const btn = { position: 'absolute', top: 0, bottom: 0, zIndex: 2, width: 30, display: 'grid', placeItems: 'center', border: 0, cursor: 'pointer', color: '#fff' } as const
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {children}
      {more.start && <button type="button" aria-label={`${label}: قبلی`} onClick={() => go(-1)} style={{ ...btn, insetInlineStart: 0, background: 'linear-gradient(to left, transparent, rgba(8,20,40,.88) 55%)' }}><ChevronRight size={18} /></button>}
      {more.end && <button type="button" aria-label={`${label}: بعدی`} onClick={() => go(1)} style={{ ...btn, insetInlineEnd: 0, background: 'linear-gradient(to right, transparent, rgba(8,20,40,.88) 55%)' }}><ChevronLeft size={18} /></button>}
    </div>
  )
}
