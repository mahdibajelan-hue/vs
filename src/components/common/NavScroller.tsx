import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Wraps a module's tab bar that may be wider than the screen: an arrow appears on each side that still has hidden tabs and
 * scrolls the bar by about a screenful of tabs (RTL aware). The bar is the wrapper's first child; it keeps its own look.
 */
export function NavScroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ start: false, end: false })
  const bar = () => (Array.from(ref.current?.children ?? []).find((c) => c.tagName !== 'STYLE' && !c.classList.contains('nsc-btn')) as HTMLElement | undefined) ?? null
  const measure = useCallback(() => {
    const el = bar(); if (!el) return
    const max = el.scrollWidth - el.clientWidth, pos = Math.abs(el.scrollLeft) // RTL: scrollLeft runs 0 → negative
    setMore({ start: pos > 2, end: max - pos > 2 })
  }, [])
  useEffect(() => {
    const el = bar(); if (!el) return
    measure(); el.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null; ro?.observe(el)
    // tabs added later (badges, permissions) change the width too
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null; mo?.observe(el, { childList: true, subtree: true })
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); ro?.disconnect(); mo?.disconnect() }
  }, [measure])
  const go = (dir: 1 | -1) => { const el = bar(); if (!el) return; const rtl = getComputedStyle(el).direction === 'rtl'; el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.6) * (rtl ? -1 : 1), behavior: 'smooth' }) }
  return (
    <div ref={ref} className="nsc">
      <style>{`.nsc{position:relative;min-width:0;max-width:100%}.nsc-btn{position:absolute;top:0;bottom:0;z-index:3;width:44px;display:flex;align-items:center;border:0;padding:0 4px;cursor:pointer;background:transparent;color:var(--im-text,var(--text-primary,#e2e8f0))}
.nsc-btn span{display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:var(--im-panel,var(--bg-panel-solid,#0f172a));border:1px solid var(--im-line,rgba(148,163,184,.3));box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .14s ease-out}
.nsc-btn:hover span{transform:scale(1.08)}.nsc-btn:active span{transform:scale(.94)}
.nsc-s{inset-inline-start:0;justify-content:flex-start}
.nsc-e{inset-inline-end:0;justify-content:flex-end}
@media print{.nsc-btn{display:none}}`}</style>
      {children}
      {more.start && <button type="button" className="nsc-btn nsc-s" aria-label={`${label}: بخش‌های قبلی`} onClick={() => go(-1)}><span><ChevronRight size={16} /></span></button>}
      {more.end && <button type="button" className="nsc-btn nsc-e" aria-label={`${label}: بخش‌های بعدی`} onClick={() => go(1)}><span><ChevronLeft size={16} /></span></button>}
    </div>
  )
}
