import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X } from 'lucide-react'
import { HELP, type HelpEntry } from '../lib/help'

const ROWS: [keyof HelpEntry, string][] = [['what', 'چه می‌کند'], ['when', 'کی استفاده کنیم'], ['needs', 'چه چیزی لازم است'], ['result', 'نتیجه'], ['changes', 'آیا چیزی را تغییر می‌دهد؟'], ['example', 'مثال'], ['warn', 'هشدار / محدودیت']]

/** «؟» — a small popover explaining one control. Opens by click, touch or Enter/Space; closes with Esc, a click outside or the close button. */
export function Hint({ id, label }: { id: string; label?: string }) {
  const e = HELP[id]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const r = btn.current?.getBoundingClientRect()
    if (r) { const w = Math.min(340, window.innerWidth - 24); setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 120), left: Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)) }) }
    const off = (ev: MouseEvent) => { const t = ev.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    pop.current?.focus()
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!e) return null
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} aria-label={label ?? `راهنما: ${e.title}`} aria-expanded={open} aria-haspopup="dialog" title="راهنما"
        style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: 9, color: 'var(--im-accent, #0ea5e9)', background: 'color-mix(in srgb, var(--im-accent, #0ea5e9) 14%, transparent)', verticalAlign: 'middle', marginInline: 4, flex: 'none' }}>
        <HelpCircle size={13} aria-hidden />
      </button>
      {open && pos && createPortal(
        <div ref={pop} role="dialog" aria-label={e.title} tabIndex={-1} dir="rtl"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 400, width: Math.min(340, window.innerWidth - 24), maxHeight: '60vh', overflow: 'auto', padding: '12px 14px', borderRadius: 12, background: 'var(--bg-panel-solid, #fff)', color: 'var(--im-text, inherit)', border: '1px solid var(--im-line, rgba(148,163,184,.4))', boxShadow: '0 18px 40px -14px rgba(0,0,0,.5)', fontSize: 12, lineHeight: 1.85, textAlign: 'start', outline: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 13 }}>{e.title}</b><button type="button" onClick={() => setOpen(false)} aria-label="بستن" style={{ all: 'unset', cursor: 'pointer', opacity: 0.7 }}><X size={14} /></button></div>
          <div style={{ display: 'grid', gap: 5, marginTop: 4 }}>
            {ROWS.map(([k, l]) => e[k] ? <div key={k}><span style={{ fontWeight: 700, color: k === 'warn' ? '#d97706' : 'var(--im-accent, #0ea5e9)' }}>{l}: </span><span>{e[k]}</span></div> : null)}
          </div>
        </div>, document.body)}
    </>
  )
}
