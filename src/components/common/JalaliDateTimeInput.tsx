import { JalaliDateInput } from './JalaliDateInput'

/**
 * A Jalali date with a time of day, for fields that were `<input type="datetime-local">`. The value keeps that input's
 * format (local `YYYY-MM-DDTHH:mm`), so the callers' parsing is unchanged; only what the person sees and picks is Jalali.
 * `max` (same format) caps the value, e.g. a meeting that cannot be in the future.
 */
export function JalaliDateTimeInput({ value, onChange, max, label }: { value: string; onChange: (v: string) => void; max?: string; label?: string }) {
  const date = value.slice(0, 10), time = value.slice(11, 16)
  const emit = (d: string, t: string) => {
    if (!d) { onChange(''); return }
    let v = `${d}T${t || '08:00'}`
    if (max && v > max) v = max
    onChange(v)
  }
  return (
    <span className="jdt" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 6.5rem', gap: '.35rem', alignItems: 'center' }}>
      <JalaliDateInput value={date} onChange={(d) => emit(d, time)} />
      <input type="time" dir="ltr" aria-label={label ? `ساعت ${label}` : 'ساعت'} value={time} disabled={!date} onChange={(e) => emit(date, e.target.value)} />
    </span>
  )
}
