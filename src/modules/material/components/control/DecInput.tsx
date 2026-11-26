import { useEffect, useState } from 'react'
import { parseNum } from '../../../../lib/parseNum'

/**
 * Decimal field that keeps what is being typed («۰.», «۲٫۵۰»), accepts Persian digits and the Persian decimal mark, and
 * reports the parsed number. `signed` allows negative values (temperatures): a phone's number pad has no minus key, so a
 * small ± button flips the sign; «−» / «-» typed on a full keyboard works too.
 */
export function DecInput({ value, onValue, label, id, className, placeholder, signed }: { value: number; onValue: (n: number) => void; label?: string; id?: string; className?: string; placeholder?: string; signed?: boolean }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => { if (parseNum(text.replace('−', '-')) !== value) setText(value ? String(value) : '') }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const read = (t: string) => { const n = parseNum(t.replace('−', '-')); return signed ? n : Math.max(0, n) }
  const input = <input id={id} dir="ltr" inputMode="decimal" className={className} value={text} placeholder={placeholder} aria-label={label} onChange={(e) => { setText(e.target.value); onValue(read(e.target.value)) }} />
  if (!signed) return input
  const flip = () => { const t = text.trim(); const next = t.startsWith('-') || t.startsWith('−') ? t.slice(1) : `-${t || ''}`; setText(next); onValue(read(next)) }
  return <span className="dec-signed">{input}<button type="button" className="dec-sign" onClick={flip} aria-label={`تغییر علامت ${label ?? ''} (مثبت / منفی)`} title="مثبت / منفی">±</button></span>
}
