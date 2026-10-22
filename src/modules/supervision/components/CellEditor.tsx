import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** A small panel pinned under (or above) the tapped grid cell. Rendered in a portal so the grid's scroll box and the page's entry animation cannot clip or shift it. */
export function CellPopover({ anchor, title, onClose, children }: { anchor: HTMLElement; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect(), w = box.current?.offsetWidth ?? 300, h = box.current?.offsetHeight ?? 220
      const below = r.bottom + 8 + h < window.innerHeight
      setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6), left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) })
    }
    place()
    const ro = new ResizeObserver(place)
    if (box.current) ro.observe(box.current)
    window.addEventListener('resize', place)
    return () => { ro.disconnect(); window.removeEventListener('resize', place) }
  }, [anchor])
  useEffect(() => {
    const down = (e: PointerEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !anchor.contains(t)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor.focus() } }
    const scroll = (e: Event) => { if (box.current && e.target instanceof Node && box.current.contains(e.target)) return; onClose() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    document.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); document.removeEventListener('scroll', scroll, true) }
  }, [anchor, onClose])
  return createPortal(
    <div className="im-root sv-root sv-portal" dir="rtl">
      <div ref={box} className="sv-pop" role="dialog" aria-label={typeof title === 'string' ? title : 'ویرایش روز'} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
        <div className="sv-pop-head"><div>{title}</div><button className="sv-iconbtn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="بستن"><X size={14} /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
