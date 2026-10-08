import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, GripHorizontal, X } from 'lucide-react'
import { HELP, type HelpKey } from '../lib/help'

let lastPos: { x: number; y: number } | null = null

/** A floating, draggable explanation box. It stays open (no scrim, no outside-click close) until its own × is pressed. */
function HelpPanel({ topic, onClose }: { topic: HelpKey; onClose: () => void }) {
  const t = HELP[topic]
  const [pos, setPos] = useState(() => lastPos ?? { x: Math.max(12, window.innerWidth - 440), y: 90 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const down = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    const next = { x: Math.max(-200, Math.min(window.innerWidth - 100, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 48, e.clientY - drag.current.dy)) }
    lastPos = next
    setPos(next)
  }
  return createPortal(
    <div className="la-root" dir="rtl" style={{ background: 'transparent' }}>
      <aside role="dialog" aria-label={`راهنما: ${t.title}`} className="la-help" style={{ left: pos.x, top: pos.y }}>
        <header className="flex cursor-move touch-none select-none items-start justify-between gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--la-line)' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          <h2 className="m-0 flex items-center gap-2 text-[13.5px] font-bold"><GripHorizontal size={14} aria-hidden style={{ color: 'var(--la-ink-2)' }} /> <CircleHelp size={15} aria-hidden style={{ color: 'var(--la-accent)' }} /> {t.title}</h2>
          <button className="la-btn la-btn-ghost la-btn-icon" style={{ minWidth: 28, minHeight: 28 }} onClick={onClose} aria-label="بستن راهنما"><X size={15} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-[12.5px] leading-7">
          <p className="m-0 font-semibold">{t.purpose}</p>
          {t.steps && <Block title="روش انجام" items={t.steps} ordered />}
          {t.how && <Block title="چطور حساب می‌شود" items={t.how} />}
          {t.tips && <Block title="نکته" items={t.tips} />}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function Block({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  const L = ordered ? 'ol' : 'ul'
  return (
    <section className="mt-3">
      <p className="la-eyebrow m-0 font-bold">{title}</p>
      <L className="m-0 mt-1 ps-5" style={{ color: 'var(--la-ink-2)', listStyle: ordered ? 'decimal' : 'disc' }}>
        {items.map((s) => <li key={s}>{s}</li>)}
      </L>
    </section>
  )
}

/** The “?” next to a title: opens the explanation of that part as a floating box. */
export function HelpButton({ topic, label, className = '' }: { topic: HelpKey; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`la-help-btn ${className}`} aria-label={`راهنما: ${HELP[topic].title}`} aria-expanded={open} title="راهنما" onClick={() => setOpen((v) => !v)}>
        <CircleHelp size={14} aria-hidden />
        {label && <span>{label}</span>}
      </button>
      {open && <HelpPanel topic={topic} onClose={() => setOpen(false)} />}
    </>
  )
}
