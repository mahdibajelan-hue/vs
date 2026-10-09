import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, GripHorizontal, X } from 'lucide-react'
import { HELP, type HelpKey, type HelpTopic } from '../lib/help'

let lastPos: { x: number; y: number } | null = null

/** Floating, draggable explanation box. Stays open (no scrim) until its own × is pressed. */
function HelpPanel({ topic, content, onClose }: { topic?: HelpKey; content?: HelpTopic; onClose: () => void }) {
  const t = content ?? HELP[topic ?? 'hub']
  const [pos, setPos] = useState(() => lastPos ?? { x: Math.max(12, window.innerWidth - 460), y: 96 })
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
    <div className="im-root" dir="rtl" style={{ background: 'transparent', height: 0, overflow: 'visible', display: 'block' }}>
      <aside role="dialog" aria-label={`راهنما: ${t.title}`} className="im-help" style={{ left: pos.x, top: pos.y }}>
        <header className="flex cursor-move touch-none select-none items-start justify-between gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--im-line)' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          <h3 className="m-0 flex items-center gap-2 text-[13.5px] font-bold"><GripHorizontal size={14} aria-hidden style={{ color: 'var(--im-muted)' }} /><CircleHelp size={15} aria-hidden style={{ color: 'var(--im-accent)' }} />{t.title}</h3>
          <button className="im-modal-close" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="بستن راهنما"><X size={15} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-[12.5px] leading-7">
          <p className="m-0 font-semibold">{t.purpose}</p>
          {t.steps && <Block title="روش کار" items={t.steps} ordered />}
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
      <h4>{title}</h4>
      <L style={{ listStyle: ordered ? 'decimal' : 'disc' }}>{items.map((s) => <li key={s}>{s}</li>)}</L>
    </section>
  )
}

/** The «راهنما» button: opens the explanation of one part of the module. */
export function HelpButton({ topic, content, label = 'راهنما' }: { topic?: HelpKey; content?: HelpTopic; label?: string }) {
  const [open, setOpen] = useState(false)
  const t = content ?? HELP[topic ?? 'hub']
  return (
    <>
      <button type="button" className="im-help-btn" aria-label={`راهنما: ${t.title}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <CircleHelp size={14} aria-hidden />{label}
      </button>
      {open && <HelpPanel topic={topic} content={content} onClose={() => setOpen(false)} />}
    </>
  )
}
