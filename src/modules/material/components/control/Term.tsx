import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY } from '../../lib/control/glossary'

/** A word with a «؟» next to it: click (or Enter) opens its plain-language meaning. Safe inside table headers and tabs — it never triggers the control around it. */
export function Term({ k, children }: { k: string; children: ReactNode }) {
  const def = GLOSSARY[k]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  useEffect(() => {
    if (!open) return
    const off = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.mt-pop')) setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', off)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', off) }
  }, [open])
  if (!def) return <>{children}</>
  const toggle = (e: { stopPropagation: () => void; preventDefault: () => void }) => { e.stopPropagation(); e.preventDefault(); const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: Math.min(Math.max(8, r.left + r.width / 2 - 140), window.innerWidth - 296), y: r.bottom + 6 }); setOpen((v) => !v) }
  return (
    <span className="mt-term" ref={ref}>
      {children}
      <span role="button" tabIndex={0} className="mt-q" aria-label={`توضیح: ${def.title}`} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e) }}>؟</span>
      {open && createPortal(<div className="im-root im-portal" dir="rtl"><span className="mt-pop" role="tooltip" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}><b>{def.title}</b>{def.body}</span></div>, document.body)}
    </span>
  )
}
