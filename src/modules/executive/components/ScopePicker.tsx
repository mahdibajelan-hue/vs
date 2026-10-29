import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, X, type LucideIcon } from 'lucide-react'
import { faNum } from './pfUi'
import './scopePicker.css'

export interface ScopeOption { id: string; label: string; count: number }

/**
 * A labelled pill that opens a listbox: caption above the value, a project count beside each option, keyboard
 * (arrows, Home/End, Enter, Escape) and outside-click close. Replaces a bare <select> where the choice frames a page.
 */
export function ScopePicker({ icon: Icon, caption, allLabel, value, options, onChange, tone }: {
  icon: LucideIcon; caption: string; allLabel: string; value: string | null; options: ScopeOption[]; onChange: (id: string | null) => void; tone: string
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const items: (ScopeOption & { all?: boolean })[] = [{ id: '', label: allLabel, count: options.reduce((n, o) => n + o.count, 0), all: true }, ...options]
  const current = options.find((o) => o.id === value)

  useEffect(() => {
    if (!open) return
    setHi(Math.max(0, items.findIndex((i) => (i.all ? !value : i.id === value))))
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => { const it = items[i]; onChange(it.all ? null : it.id); setOpen(false) }
  const onKey = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0) }
    else if (e.key === 'End') { e.preventDefault(); setHi(items.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(hi) }
  }

  return (
    <div className={`sp${open ? ' is-open' : ''}${value ? ' is-set' : ''}`} ref={ref} style={{ ['--c' as string]: tone }}>
      <button type="button" className="sp-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}>
        <span className="sp-ic" aria-hidden><Icon size={15} /></span>
        <span className="sp-txt"><small>{caption}</small><b>{current?.label ?? allLabel}</b></span>
        <ChevronDown size={15} className="sp-chev" aria-hidden />
      </button>
      {value && <button type="button" className="sp-clear" aria-label={`پاک کردن ${caption}`} onClick={() => onChange(null)}><X size={12} /></button>}
      {open && (
        <ul id={listId} role="listbox" aria-label={caption} className="sp-list" aria-activedescendant={`${listId}-${hi}`}>
          {items.map((it, i) => {
            const sel = it.all ? !value : it.id === value
            return (
              <li key={it.id || 'all'} id={`${listId}-${i}`} role="option" aria-selected={sel} className={`${i === hi ? 'is-hi' : ''}${it.all ? ' is-all' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(i) }}>
                <span className="sp-check" aria-hidden>{sel && <Check size={13} />}</span>
                <span className="sp-label">{it.label}</span>
                <span className="sp-count">{faNum(it.count)} پروژه</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
