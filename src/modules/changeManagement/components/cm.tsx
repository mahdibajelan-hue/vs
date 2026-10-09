import type { ReactNode } from 'react'
import { STATUS_COLOR, STATUS_FA, type ChangeStatus } from '../types'

export const nf = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'))
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${(Math.round(n * 100) / 100).toLocaleString('en-US')}٪`)
/** Rial amounts read as millions/billions in lists; the exact figure is always available in the detail. */
export const money = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1e12) return `${s}${(a / 1e12).toLocaleString('en-US', { maximumFractionDigits: 2 })} همت`
  if (a >= 1e9) return `${s}${(a / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })} میلیارد`
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} میلیون`
  return `${s}${a.toLocaleString('en-US')}`
}
export const faDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
export const parseMoney = (v: string): number => { const t = faDigits(v).replace(/[^\d-]/g, ''); const neg = t.startsWith('-'); const n = Number(t.replace(/-/g, '')) || 0; return neg ? -n : n }
export const todayIso = () => new Date().toISOString().slice(0, 10)

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="im-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="im-err" role="alert">{error}</div> : hint ? <div className="im-helper">{hint}</div> : null}
    </div>
  )
}

/** Amount field with thousands separators; negative values (savings/decreases) allowed. */
export function MoneyInput({ id, value, onChange, placeholder }: { id?: string; value: number; onChange: (n: number) => void; placeholder?: string }) {
  return <input id={id} dir="ltr" inputMode="numeric" className="cm-mono" style={{ textAlign: 'end' }} value={value === 0 ? '' : value.toLocaleString('en-US')} placeholder={placeholder ?? '0'} onChange={(e) => onChange(parseMoney(e.target.value))} />
}

export function StatusChip({ status }: { status: ChangeStatus }) {
  return <span className="cm-chip" style={{ ['--c' as string]: STATUS_COLOR[status] }}><i />{STATUS_FA[status]}</span>
}
