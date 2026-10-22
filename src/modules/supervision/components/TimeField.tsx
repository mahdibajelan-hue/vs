import { fa } from '../lib/svMonth'

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, '0'))

/**
 * 24-hour time as two lists (hour : minute). On a phone each list opens the system wheel — far easier than the
 * browser's time box (12-hour AM/PM, tiny segments). Value is "HH:MM" or '' when empty.
 */
export function TimeField({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id?: string }) {
  const [h, m] = value ? value.split(':') : ['', '']
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES
  const set = (nh: string, nm: string) => onChange(nh === '' ? '' : `${nh}:${nm || '00'}`)
  return (
    <div className="sv-timef" dir="ltr" role="group" aria-label={label}>
      <select id={id} value={h} onChange={(e) => set(e.target.value, m)} aria-label={`${label} — ساعت`}>
        <option value="">--</option>
        {HOURS.map((x) => <option key={x} value={x}>{fa(x)}</option>)}
      </select>
      <span aria-hidden>:</span>
      <select value={m} disabled={!h} onChange={(e) => set(h, e.target.value)} aria-label={`${label} — دقیقه`}>
        {!h && <option value="">--</option>}
        {minutes.map((x) => <option key={x} value={x}>{fa(x)}</option>)}
      </select>
    </div>
  )
}
