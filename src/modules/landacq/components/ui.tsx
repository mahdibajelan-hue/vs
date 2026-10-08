import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, GripHorizontal, X } from 'lucide-react'
import { Modal } from '../platform'
import type { CriticalityLevel } from '../types'
import { LEVEL_COLOR, LEVEL_LABEL } from '../lib/labels'
import { STATUS_COLOR, STATUS_LABEL, type DisplayStatus } from '../lib/status'
import { useState } from 'react'

export function Badge({ color, children, title }: { color?: string; children: ReactNode; title?: string }) {
  return (
    <span className="la-badge" title={title} style={color ? ({ '--c': color } as React.CSSProperties) : undefined}>
      {children}
    </span>
  )
}

export function LevelBadge({ level, score }: { level: CriticalityLevel; score?: number }) {
  return (
    <Badge color={LEVEL_COLOR[level]} title={`Criticality ${score ?? ''}`}>
      <i /> {LEVEL_LABEL[level]}
      {score != null && <span className="la-num" style={{ opacity: 0.8 }}>{score.toLocaleString('fa-IR')}</span>}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge color={status === 'review' ? 'var(--la-ink-2)' : STATUS_COLOR[status]}>
      <i style={status === 'review' ? { background: STATUS_COLOR.review, boxShadow: '0 0 0 1px var(--la-line-2)' } : undefined} /> {STATUS_LABEL[status]}
    </Badge>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="la-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="la-label">{label}</span>
      {children}
      {hint && <p className="la-hint">{hint}</p>}
    </label>
  )
}

export function Card({ title, hint, action, children, className = '', pad = true }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`la-card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <div className="min-w-0">
            {title && <h3 className="la-title">{title}</h3>}
            {hint && <p className="la-eyebrow mt-0.5 leading-6">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-4' : ''} style={title || action ? { paddingTop: pad ? 12 : 0 } : undefined}>
        {children}
      </div>
    </section>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--la-surface-3)', color: 'var(--la-ink-2)' }}>
        {icon}
      </span>
      <p className="text-[13.5px] font-bold">{title}</p>
      {text && <p className="la-eyebrow max-w-md leading-7">{text}</p>}
      {action}
    </div>
  )
}

/** Where the floating panel was left, shared by every panel so the next parcel opens in the same place. */
let lastPos: { x: number; y: number } | null = null

/**
 * A floating work panel: it can be dragged by its title and resized from the corner, its body scrolls on its own, and —
 * unlike a modal — clicking the page or the map behind it does not close it. Only «ذخیره و بستن» / «بستن» do.
 * (Edits are saved as each field is left, so «ذخیره و بستن» first commits the field being typed in.)
 */
export function Drawer({ title, subtitle, onClose, children, footer, badge }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; badge?: ReactNode }) {
  const [pos, setPos] = useState(() => lastPos ?? { x: 16, y: 72 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const clamp = (x: number, y: number) => ({ x: Math.max(-300, Math.min(window.innerWidth - 120, x)), y: Math.max(0, Math.min(window.innerHeight - 48, y)) })
  const down = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    const next = clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy)
    lastPos = next
    setPos(next)
  }
  const saveAndClose = () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    // let the blur handlers write their value before the panel unmounts
    setTimeout(onClose, 0)
  }
  return createPortal(
    <div className="la-root" dir="rtl" style={{ background: 'transparent' }}>
      <aside className="la-drawer" role="dialog" aria-label="پنل جزئیات" style={{ left: pos.x, top: pos.y }}>
        <header className="flex cursor-move touch-none select-none items-start justify-between gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--la-line)' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <GripHorizontal size={14} aria-hidden style={{ color: 'var(--la-ink-2)' }} />
              <h2 className="m-0 text-[15px] font-bold">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="la-eyebrow mt-1 leading-6">{subtitle}</p>}
          </div>
          <button className="la-btn la-btn-ghost la-btn-icon" onClick={saveAndClose} aria-label="بستن">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--la-line)' }}>
          {footer}
          <button className="la-btn" onClick={saveAndClose}>بستن</button>
          <button className="la-btn la-btn-primary" onClick={saveAndClose}>ذخیره و بستن</button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ title, description, confirmLabel, tone = 'danger', onConfirm, onClose }: { title: string; description: ReactNode; confirmLabel: string; tone?: 'danger' | 'primary'; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={() => !busy && onClose()} width="max-w-md">
      <div className="la-root" dir="rtl">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--la-bad) 14%, transparent)', color: 'var(--la-bad)' }}>
            <AlertTriangle size={17} />
          </span>
          <div className="text-[13px] leading-7" style={{ color: 'var(--la-ink-2)' }}>{description}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="la-btn" disabled={busy} onClick={onClose}>انصراف</button>
          <button className={`la-btn ${tone === 'danger' ? 'la-btn-danger' : 'la-btn-primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>
            {busy ? 'در حال انجام…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** A dismissible banner line for the last failed operation. */
export function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, [message, onClose])
  return (
    <div className="la-toast" role="alert">
      <AlertTriangle size={15} style={{ color: 'var(--la-bad)', flexShrink: 0 }} />
      <span className="leading-6">{message}</span>
      <button className="la-btn la-btn-ghost la-btn-icon" style={{ minWidth: 26, minHeight: 26 }} onClick={onClose} aria-label="بستن"><X size={13} /></button>
    </div>
  )
}
