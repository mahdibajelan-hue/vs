import { X } from 'lucide-react'
import { JalaliDateInput } from './JalaliDateInput'

/**
 * Shamsi (Jalali) replacements for the browser's `<input type="date">` / `datetime-local`, which show the Gregorian
 * calendar. Values stay ISO (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`) so stores and the database are unchanged.
 */
export function ShamsiDate({ value, onChange, clearable, max, disabled, label }: { value: string; onChange: (iso: string) => void; clearable?: boolean; max?: string; disabled?: boolean; label?: string }) {
  return (
    <div className={`shamsi-field${disabled ? ' is-disabled' : ''}`} aria-label={label} aria-disabled={disabled || undefined}>
      <JalaliDateInput value={value} onChange={(v) => onChange(max && v > max ? max : v)} />
      {clearable && value && !disabled && <button type="button" className="shamsi-clear" onClick={() => onChange('')} aria-label="پاک کردن تاریخ"><X size={13} /></button>}
    </div>
  )
}

export function ShamsiDateTime({ value, onChange, disabled, label }: { value: string; onChange: (iso: string) => void; disabled?: boolean; label?: string }) {
  const date = value.slice(0, 10), time = value.slice(11, 16)
  return (
    <div className="shamsi-dt">
      <ShamsiDate value={date} disabled={disabled} label={label} onChange={(d) => onChange(d ? `${d}T${time || '08:00'}` : '')} />
      <input type="time" dir="ltr" value={time} disabled={disabled || !date} aria-label={label ? `${label} — ساعت` : 'ساعت'} onChange={(e) => onChange(`${date}T${e.target.value || '00:00'}`)} />
    </div>
  )
}
