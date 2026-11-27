import { useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface PipeOpt { value: string; label: string }

/**
 * Pipe number of a row, picked from the pipes the project registered (delivery records): a list opens on focus or on
 * the arrow, narrows as you type, and a pick fills the row's length and thickness. Typing a number that is not in the
 * list is still possible — the register check flags it.
 */
export function PipePick({ value, options, onText, label, disabled, empty, spec }: { value: string; options: PipeOpt[]; onText: (v: string) => void; label: string; disabled?: boolean; empty: string; /** the picked pipe's facts, shown small and read-only under the number */ spec?: string }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLSpanElement>(null)
  const q = value.trim().toLowerCase()
  const list = useMemo(() => (q && options.some((o) => o.value.toLowerCase() === q) ? options : options.filter((o) => !q || o.value.toLowerCase().includes(q))).slice(0, 60), [options, q])
  const pick = (v: string) => { onText(v); setOpen(false) }
  return (
    <span className="pp" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <span className="pp-box">
      <input value={value} disabled={disabled} dir="ltr" aria-label={label} role="combobox" aria-expanded={open} aria-autocomplete="list" placeholder="انتخاب لوله…"
          onFocus={() => setOpen(true)} onChange={(e) => { onText(e.target.value); setOpen(true); setHi(0) }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) } else if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); pick(list[hi].value) } else if (e.key === 'Escape') setOpen(false) }} />
        {!disabled && <button type="button" className="pp-arrow" tabIndex={-1} aria-label={`فهرست ${label}`} onClick={() => setOpen((o) => !o)}><ChevronDown size={14} /></button>}
      </span>
      {spec && <small className="pp-spec">{spec}</small>}
      {open && !disabled && (
        <span className="pp-list" role="listbox">
          {list.length === 0 ? <span className="pp-empty">{empty}</span> : list.map((o, i) => (
            <button key={o.value} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'on' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}>
              <b dir="ltr">{o.value}</b>{o.label && <small>{o.label}</small>}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
