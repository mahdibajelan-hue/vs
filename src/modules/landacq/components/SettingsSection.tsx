import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** A settings block with its own colour: a tinted icon chip, a title with a one-line explanation, and a body that can be folded away. */
export function SettingsSection({ icon, color, title, hint, children, defaultOpen = true, className = '', badge }: { icon: ReactNode; color: string; title: string; hint?: string; children: ReactNode; defaultOpen?: boolean; className?: string; badge?: ReactNode }) {
  return (
    <details className={`la-sec ${className}`} open={defaultOpen} style={{ '--c': color } as React.CSSProperties}>
      <summary>
        <span className="la-sec-icon" aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold leading-6">{title}</span>
          {hint && <span className="la-eyebrow block leading-5">{hint}</span>}
        </span>
        {badge}
        <ChevronDown size={16} className="la-sec-chev" aria-hidden />
      </summary>
      <div className="la-sec-body">{children}</div>
    </details>
  )
}
