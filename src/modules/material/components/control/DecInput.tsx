import { useEffect, useState } from 'react'
import { parseNum } from '../../../finance/components/fn'

/** Decimal field that keeps what is being typed («۰.», «۲٫۵۰»), accepts Persian digits and the Persian decimal mark, and reports the parsed number. */
export function DecInput({ value, onValue, label, id, className, placeholder }: { value: number; onValue: (n: number) => void; label?: string; id?: string; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => { if (parseNum(text) !== value) setText(value ? String(value) : '') }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <input id={id} dir="ltr" inputMode="decimal" className={className} value={text} placeholder={placeholder} aria-label={label} onChange={(e) => { setText(e.target.value); onValue(Math.max(0, parseNum(e.target.value))) }} />
}
