import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The one icon button every header shortcut is built from: same size, radius, border and press feedback everywhere.
 * `tone="danger"` is reserved for sign-out.
 */
export function ToolbarButton({ label, tone = 'default', badge, children, className = '', ...rest }: { label: string; tone?: 'default' | 'danger'; badge?: number; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`tb-btn ${tone === 'danger' ? 'tb-btn-danger' : ''} ${className}`}
      {...rest}
    >
      {children}
      {badge != null && badge > 0 && <span className="tb-badge">{badge > 99 ? '۹۹+' : badge.toLocaleString('fa-IR')}</span>}
    </button>
  )
}
