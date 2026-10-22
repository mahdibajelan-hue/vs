import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useSupervisionStore } from '../store/useSupervisionStore'
import type { ReactNode } from 'react'
import { fa, monthLabel, sameYm, shiftYm, thisMonth, type Ym } from '../lib/svMonth'

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

/** Months in [from, to] whose report is signed (their days are read-only). */
export function useLockedIn(from: string, to: string) {
  return useSupervisionStore((s) => Object.values(s.signoffs).filter((x) => x.status !== 'open' && x.from <= to && x.to >= from).map((x) => x.month).sort().map((k) => fa(monthLabel({ jy: +k.slice(0, 4), jm: +k.slice(5, 7) }))).join('، '))
}

export function LockNote({ months, onReport }: { months: string; onReport?: () => void }) {
  if (!months) return null
  return (
    <div className="sv-lock" role="status">
      <Lock size={15} />
      <span>گزارش {months} امضا شده و روزهایش قفل است؛ برای اصلاح باید در «گزارش ماه» آن را «بازگشت برای اصلاح» کنید.</span>
      {onReport && <button className="im-ghostlink" onClick={onReport}>رفتن به گزارش</button>}
    </div>
  )
}
