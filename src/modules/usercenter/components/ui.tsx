import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { displayName, hueOf, initials } from '../lib/format'
import { STATUS_LABEL, USER_TYPE_LABEL, type AccountStatus, type UcUser, type UserType } from '../types'

// ------------------------------------------------------------------------------------------------ avatar & badges

export function Avatar({ user, size = 36 }: { user: Pick<UcUser, 'fullName' | 'email' | 'avatarUrl' | 'id'>; size?: number }) {
  return (
    <span className="uc-avatar" style={{ width: size, height: size, fontSize: size * 0.36, '--h': hueOf(user.id) } as CSSProperties} aria-hidden>
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user.fullName, user.email)}
    </span>
  )
}

const STATUS_TONE: Record<AccountStatus, string> = { active: 'is-ok', disabled: 'is-warn', blocked: 'is-bad' }
export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`uc-badge ${STATUS_TONE[status]}`}>
      <i /> {STATUS_LABEL[status]}
    </span>
  )
}

export function TypeBadge({ type }: { type: UserType }) {
  return <span className="uc-badge">{USER_TYPE_LABEL[type]}</span>
}

export function Badge({ tone, children, title }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'direct' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span className={`uc-badge ${tone ? `is-${tone}` : ''}`} title={title}>
      {children}
    </span>
  )
}

export function UserName({ user }: { user: Pick<UcUser, 'fullName' | 'email'> }) {
  return <>{displayName(user)}</>
}

// ------------------------------------------------------------------------------------------------ small controls

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="uc-switch" onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="uc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="uc-label">{label}</span>
      {children}
      {error ? <p className="uc-field-err">{error}</p> : hint ? <p className="uc-hint">{hint}</p> : null}
    </label>
  )
}

export function Section({ title, hint, action, children, className = '' }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`uc-card ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="uc-section-title">{title}</h3>
          {hint && <p className="uc-eyebrow mt-0.5 leading-6">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--uc-surface-3)', color: 'var(--uc-ink-2)' }}>
        {icon}
      </span>
      <p className="text-[13.5px] font-bold">{title}</p>
      {text && <p className="uc-eyebrow max-w-sm leading-7">{text}</p>}
      {action}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ popover

export function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', off)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', off)
    }
  }, [open, onClose])
  return ref
}

/** A trigger + anchored menu. `children` is rendered inside the popover and receives a close callback. */
export function Popover({ trigger, children, align = 'end', label }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; label?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className="uc-pop" role="menu" aria-label={label} style={{ top: 'calc(100% + 6px)', [align === 'end' ? 'left' : 'right']: 0 }}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ drawer & dialogs

export function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="uc-root" dir="rtl">
      <div className="uc-scrim" onClick={onClose} />
      <aside className="uc-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--uc-line)' }}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold">{title}</h2>
            {subtitle && <p className="uc-eyebrow mt-0.5 leading-6">{subtitle}</p>}
          </div>
          <button className="uc-btn uc-btn-ghost uc-btn-icon" onClick={onClose} aria-label="بستن">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--uc-line)' }}>
            {footer}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  )
}

/** Sensitive actions (disable, block, reset password, remove access…) always go through this. */
export function ConfirmDialog({
  title,
  description,
  tone = 'warn',
  confirmLabel,
  onConfirm,
  onClose,
  reason,
  children,
}: {
  title: string
  description: ReactNode
  tone?: 'warn' | 'danger' | 'primary'
  confirmLabel: string
  onConfirm: (reason: string) => Promise<void> | void
  onClose: () => void
  /** When set, a reason box is shown; `required` forces a non-empty value. */
  reason?: { label: string; required?: boolean; placeholder?: string }
  children?: ReactNode
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const blocked = !!reason?.required && !text.trim()
  const cls = tone === 'danger' ? 'uc-btn-danger' : tone === 'warn' ? 'uc-btn-warn' : 'uc-btn-primary'
  return (
    <Modal panelClassName="uc-modal" title={title} onClose={() => !busy && onClose()} width="max-w-md">
      <div className="uc-root" dir="rtl">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, var(--uc-${tone === 'primary' ? 'accent' : tone === 'danger' ? 'bad' : 'warn'}) 14%, transparent)`, color: `var(--uc-${tone === 'primary' ? 'accent' : tone === 'danger' ? 'bad' : 'warn'})` }}>
            {tone === 'primary' ? <Info size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div className="min-w-0 flex-1 text-[13px] leading-7" style={{ color: 'var(--uc-ink-2)' }}>
            {description}
          </div>
        </div>
        {children && <div className="mt-3">{children}</div>}
        {reason && (
          <div className="mt-4">
            <label className="uc-label">
              {reason.label}
              {reason.required && <span style={{ color: 'var(--uc-bad)' }}> *</span>}
            </label>
            <textarea className="uc-input uc-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} autoFocus />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="uc-btn" disabled={busy} onClick={onClose}>
            انصراف
          </button>
          <button
            className={`uc-btn ${cls}`}
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(text.trim())
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'در حال انجام…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------------------------------------ toasts

type ToastTone = 'ok' | 'warn' | 'bad'
interface ToastState {
  id: number
  tone: ToastTone
  text: string
}
const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => undefined)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const notify = useCallback((text: string, tone: ToastTone = 'ok') => setToast({ id: Date.now(), tone, text }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.tone === 'ok' ? 3200 : 6500)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div key={toast.id} className={`uc-toast is-${toast.tone}`} role={toast.tone === 'bad' ? 'alert' : 'status'}>
          {toast.tone === 'ok' ? <Check size={15} style={{ color: 'var(--uc-ok)' }} /> : <AlertTriangle size={15} style={{ color: toast.tone === 'bad' ? 'var(--uc-bad)' : 'var(--uc-warn)' }} />}
          <span className="leading-6">{toast.text}</span>
        </div>
      )}
    </ToastContext.Provider>
  )
}
