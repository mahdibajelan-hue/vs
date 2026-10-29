import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A sliding indicator behind the selected tab: one element glides between tabs instead of each tab fading its own
 * background, so the eye follows the selection. The first placement (and any resize) is instant; only a change of tab
 * animates. Put the returned `indicator` ref on an absolutely-positioned element inside the `list` (which must be
 * `position: relative`), and give the tabs `position: relative; z-index: 1`.
 */
export function useTabIndicator<L extends HTMLElement = HTMLElement>(active: unknown, selector = '[aria-selected="true"], [aria-current], .is-on') {
  // a callback ref, so a tab list that mounts later (after loading, or on another section) is picked up
  const [box, list] = useState<L | null>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  const placedIn = useRef<L | null>(null)

  useLayoutEffect(() => {
    const ind = indicator.current
    if (!box || !ind) return
    const place = (animate: boolean) => {
      const el = box.querySelector<HTMLElement>(selector)
      if (!el) { ind.style.opacity = '0'; return }
      ind.style.transition = animate ? '' : 'none'
      ind.style.width = `${el.offsetWidth}px`
      ind.style.height = `${el.offsetHeight}px`
      ind.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`
      ind.style.opacity = '1'
      if (!animate) void ind.offsetWidth // commit the jump before transitions come back
    }
    place(placedIn.current === box)
    placedIn.current = box
    // the observer reports once on subscribe; only later reports are real resizes (and must not cut a slide short)
    let first = true
    const ro = new ResizeObserver(() => { if (first) { first = false; return } place(false) })
    ro.observe(box)
    return () => ro.disconnect()
  }, [box, active, selector])

  return { list, indicator }
}
