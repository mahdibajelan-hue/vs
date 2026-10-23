import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

/**
 * The one button every header shortcut is built from. With a `caption` it is a labelled shortcut: a coloured icon chip
 * (`accent`) over a short word, so people see what it does without hovering. Without one it is the plain square icon button.
 * `attention` gives the chip a short ring pulse (e.g. the inbox when something is waiting). `tone="danger"` is for sign-out.
 */
export function ToolbarButton({ label, caption, accent, attention, tone = 'default', badge, children, className = '', style, ...rest }: { label: string; caption?: string; accent?: string; attention?: boolean; tone?: 'default' | 'danger'; badge?: number; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const badgeEl = badge != null && badge > 0 && <span className="tb-badge" dir="ltr">{badge > 99 ? '۹۹+' : badge.toLocaleString('fa-IR')}</span>
  if (caption) return (
    <button type="button" title={label} aria-label={label} className={`tb-act ${className}`} data-attn={attention || undefined} style={{ ...(accent ? { ['--acc' as string]: accent } : {}), ...style } as CSSProperties} {...rest}>
      <span className="tb-ico" aria-hidden>{children}{badgeEl}</span>
      <span className="tb-cap" aria-hidden>{caption}</span>
    </button>
  )
  return (
    <button type="button" title={label} aria-label={label} className={`tb-btn ${tone === 'danger' ? 'tb-btn-danger' : ''} ${className}`} style={style} {...rest}>
      {children}
      {badgeEl}
    </button>
  )
}
