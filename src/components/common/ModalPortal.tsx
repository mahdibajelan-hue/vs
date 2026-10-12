import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a dialog at the end of <body> inside a theme wrapper (`.im-root.im-portal`, `display: contents`), so it is positioned against the
 * viewport — never against an ancestor that has a transform / backdrop-filter / clipped height — and still sees the module's CSS variables.
 * Every `.im-modal` inside can be dragged by its header (`.im-modal-head`) so it can be moved away from what it covers.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let drag: { el: HTMLElement; x: number; y: number; ox: number; oy: number; r: DOMRect } | null = null
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      const head = t.closest('.im-modal-head')
      const el = head?.closest('.im-modal') as HTMLElement | null
      if (!head || !el || t.closest('button, input, select, textarea, a')) return
      const [ox, oy] = (el.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0)
      drag = { el, x: e.clientX, y: e.clientY, ox, oy, r: el.getBoundingClientRect() }
      el.classList.add('is-dragging')
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = Math.min(window.innerWidth - 60 - drag.r.left, Math.max(60 - drag.r.right, e.clientX - drag.x))
      const dy = Math.min(window.innerHeight - 48 - drag.r.top, Math.max(-drag.r.top, e.clientY - drag.y))
      drag.el.style.translate = `${drag.ox + dx}px ${drag.oy + dy}px`
    }
    const up = () => { drag?.el.classList.remove('is-dragging'); drag = null }
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { root.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(<div ref={ref} className="im-root im-portal" dir="rtl">{children}</div>, document.body)
}
