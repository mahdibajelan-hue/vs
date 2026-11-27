import { useEffect, useState } from 'react'
import { chainLive, chainParse, chainText } from '../lib/chainage'

/** a kilometre point typed as whole metres (1284) and shown as «1+284»; the value is decimal km */
export function KmInput({ value, onValue, label, disabled, placeholder }: { value: unknown; onValue: (km: number | null) => void; label: string; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState(() => chainText(value))
  useEffect(() => { const p = chainParse(text); const v = value == null || value === '' ? null : Number(value); if (p !== v && !(p == null && !v)) setText(chainText(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="km-in" dir="ltr" inputMode="numeric" disabled={disabled} value={text} aria-label={label} placeholder={placeholder ?? '0+000'}
      title="عدد کامل به متر را بنویسید (مثلاً ۱۲۸۴ یعنی 1+284)؛ علامت + خودکار گذاشته می‌شود"
      onChange={(e) => { const t = chainLive(e.target.value); setText(t); onValue(chainParse(t)) }}
      onBlur={() => setText(chainText(chainParse(text)))} />
  )
}
