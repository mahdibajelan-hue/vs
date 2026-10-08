import { useEffect, useState } from 'react'
import { faNum } from '../lib/fa'

const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const group = (n: number | null) => (n == null ? '' : n.toLocaleString('en-US'))

/** A whole-number amount typed with thousands separators; the parent only ever sees a number (or null when empty). */
export function MoneyInput({ value, onChange, placeholder, disabled, ariaLabel }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; disabled?: boolean; ariaLabel?: string }) {
  const [text, setText] = useState(group(value))
  useEffect(() => setText((t) => (Number(latin(t).replace(/,/g, '')) === (value ?? 0) && t !== '' ? t : group(value))), [value])
  return (
    <>
      <input
        className="la-input la-num"
        dir="ltr"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const digits = latin(e.target.value).replace(/[^\d]/g, '')
          const n = digits === '' ? null : Number(digits)
          setText(group(n))
          onChange(n)
        }}
      />
      {value != null && value >= 1e6 && <p className="la-hint la-num">{faNum(value)} ریال</p>}
    </>
  )
}
