import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { faNum } from '../lib/fa'

export interface LayerItem {
  key: string
  label: ReactNode
  count: number
}

/**
 * One map layer: a master checkbox (all on / all off) and a drop-down to switch the individual kinds on and off.
 * The master shows a dash while only some of the kinds are visible.
 */
export function LayerMenu({ title, total, items, selected, onChange }: { title: string; total: number; items: LayerItem[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const master = useRef<HTMLInputElement>(null)
  const usable = items.filter((i) => i.count > 0)
  const on = usable.filter((i) => selected.has(i.key)).length
  const all = usable.length > 0 && on === usable.length
  useEffect(() => {
    if (master.current) master.current.indeterminate = on > 0 && !all
  }, [on, all])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const flip = (k: string) => {
    const n = new Set(selected)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    onChange(n)
  }
  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ border: '1px solid var(--la-line)', background: 'var(--la-surface-2)' }}>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
          <input ref={master} type="checkbox" checked={all} disabled={usable.length === 0} onChange={() => onChange(all ? new Set() : new Set(usable.map((i) => i.key)))} />
          {title} <span className="la-num" style={{ color: 'var(--la-ink-2)' }}>({faNum(total)})</span>
        </label>
        <button type="button" className="la-btn la-btn-ghost la-btn-icon" style={{ minWidth: 26, minHeight: 26 }} aria-expanded={open} aria-label={`گزینه‌های ${title}`} disabled={usable.length === 0} onClick={() => setOpen(!open)}>
          <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        </button>
      </div>
      {open && (
        <ul className="la-card absolute z-30 m-0 mt-1 flex max-h-72 min-w-[230px] list-none flex-col gap-0.5 overflow-y-auto p-2" style={{ boxShadow: '0 12px 32px rgba(0,0,0,.35)' }}>
          {usable.map((i) => (
            <li key={i.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-[var(--la-surface-3)]">
                <input type="checkbox" checked={selected.has(i.key)} onChange={() => flip(i.key)} />
                <span className="flex flex-1 items-center gap-1.5">{i.label}</span>
                <span className="la-num" style={{ color: 'var(--la-ink-2)' }}>{faNum(i.count)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
