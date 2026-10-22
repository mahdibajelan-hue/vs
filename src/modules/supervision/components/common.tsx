import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { monthLabel, sameYm, shiftYm, thisMonth, type Ym } from '../lib/svMonth'

/** «‹ مهر ۱۴۰۵ ›» with a jump back to the running month. */
export function MonthNav({ value, onChange }: { value: Ym; onChange: (m: Ym) => void }) {
  return (
    <div className="sv-daybar">
      <button className="sv-iconbtn" onClick={() => onChange(shiftYm(value, -1))} aria-label="ماه قبل"><ChevronRight size={17} /></button>
      <b style={{ minWidth: 112, textAlign: 'center', fontSize: 15 }}>{monthLabel(value)}</b>
      <button className="sv-iconbtn" onClick={() => onChange(shiftYm(value, 1))} aria-label="ماه بعد"><ChevronLeft size={17} /></button>
      {!sameYm(value, thisMonth()) && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => onChange(thisMonth())}>ماه جاری</button>}
    </div>
  )
}

/** Segmented choice whose selected button takes the option's colour (sv-c-<key>). */
export function StatusSeg<T extends string>({ value, options, labels, onChange, disabled, label }: { value: T | null; options: T[]; labels: Record<T, string>; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="sv-status" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} className={`sv-c-${o} ${value === o ? 'on' : ''}`} onClick={() => onChange(o)}>{labels[o]}</button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="im-card im-empty">{children}</div>
}

export function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <p role="status" className="im-helper" style={{ margin: '8px 0 0', color: msg.ok ? 'var(--im-mint)' : 'var(--im-coral)', fontWeight: 700 }}>{msg.text}</p>
}
