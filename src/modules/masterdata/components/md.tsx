import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'

export function PageHead({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-extrabold leading-9">{title}</h2>
        {hint && <p className="md-eyebrow max-w-[62ch]">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="md-label">{label}</span>
      {children}
      {hint && <p className="md-hint">{hint}</p>}
    </label>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[200px] flex-1" style={{ maxWidth: 360 }}>
      <Search size={14} aria-hidden style={{ position: 'absolute', insetInlineStart: 12, top: 12, color: 'var(--md-ink-3)' }} />
      <input className="md-input" style={{ paddingInlineStart: 34 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  )
}

/** A side sheet for creating and editing: slides in, closes with Esc / the scrim / the × — never silently loses the open form on a stray click inside it. */
export function Sheet({ title, hint, onClose, children, footer, wide }: { title: string; hint?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="md-root" dir="rtl">
      <div className="md-scrim" onClick={onClose} />
      <aside className={`md-sheet ${wide ? 'md-sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--md-line)' }}>
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold leading-8">{title}</h3>
            {hint && <p className="md-eyebrow">{hint}</p>}
          </div>
          <button className="md-btn md-btn-ghost md-btn-icon" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3.5" style={{ borderTop: '1px solid var(--md-line)' }}>{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="md-empty">
      <span className="md-avatar" aria-hidden style={{ width: 46, height: 46 }}>{icon}</span>
      <p className="text-[14px] font-bold">{title}</p>
      {text && <p className="md-eyebrow max-w-[48ch]">{text}</p>}
      {action}
    </div>
  )
}

/** Delete in two steps without a dialog: the button turns into «تأیید حذف» for a few seconds. */
export function DeleteButton({ onConfirm, label = 'حذف' }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return armed ? (
    <button className="md-btn md-btn-sm md-btn-danger" onClick={() => { setArmed(false); onConfirm() }}>تأیید حذف</button>
  ) : (
    <button className="md-btn md-btn-sm md-btn-ghost md-btn-danger" onClick={() => setArmed(true)} style={{ borderColor: 'transparent' }}>{label}</button>
  )
}

export const initials = (name: string): string => {
  const parts = name.replace(/[()«»]/g, '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).slice(0, 2) || '؟'
}
export const faNum = (n: number | string): string => (typeof n === 'number' ? n.toLocaleString('fa-IR') : String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]))
