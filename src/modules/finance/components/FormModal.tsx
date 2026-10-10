import { useMemo, useState, type ReactNode } from 'react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { AttachmentField } from './AttachmentField'
import { faDigits, parseNum } from './fn'

export type Vals = Record<string, string | number | null>
export interface FieldDef {
  key: string
  label: string
  kind: 'text' | 'money' | 'num' | 'pct' | 'date' | 'select' | 'area' | 'file'
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
  span?: 2
  folder?: string
  group?: string
  /** hide the field unless the condition holds */
  show?: (v: Vals) => boolean
  disabled?: boolean
  allowNegative?: boolean
}
export interface GroupDef { id: string; title: string; collapsed?: boolean }

/** Whole-number amount: Persian digits, thousands separators, and the size in words under the field. */
export function MoneyField({ value, onChange, id, allowNegative, invalid }: { value: number; onChange: (n: number) => void; id: string; allowNegative?: boolean; invalid?: boolean }) {
  const shown = value ? value.toLocaleString('fa-IR', { maximumFractionDigits: 2 }) : ''
  const words = Math.abs(value) >= 1e6 ? (() => { const a = Math.abs(value); const [v, u] = a >= 1e12 ? [a / 1e12, 'هزار میلیارد'] : a >= 1e9 ? [a / 1e9, 'میلیارد'] : [a / 1e6, 'میلیون']; return `≈ ${v.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ${u} ریال` })() : ''
  return (
    <div>
      <input id={id} key={shown} inputMode="decimal" dir="ltr" style={{ textAlign: 'right' }} defaultValue={shown} aria-invalid={invalid || undefined}
        onBlur={(e) => { let n = parseNum(e.target.value); if (!allowNegative) n = Math.abs(n); onChange(n); e.target.value = n ? n.toLocaleString('fa-IR', { maximumFractionDigits: 2 }) : '' }} />
      {words && <p className="im-helper" style={{ margin: '3px 0 0' }}>{words}</p>}
    </div>
  )
}

/** One modal for every finance record: fields are data, validation and layout are shared. */
export function FormModal({ title, subtitle, fields, groups = [], initial, submitLabel = 'ثبت', onSubmit, onClose, preview, extra }: {
  title: string; subtitle?: string; fields: FieldDef[]; groups?: GroupDef[]; initial: Vals; submitLabel?: string
  onSubmit: (v: Vals) => Promise<void> | void; onClose: () => void; preview?: (v: Vals) => ReactNode; extra?: ReactNode
}) {
  const [v, setV] = useState<Vals>(initial)
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string, x: string | number | null) => { setV((p) => ({ ...p, [k]: x })); if (err[k]) setErr((p) => { const n = { ...p }; delete n[k]; return n }) }
  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial])
  const visible = (f: FieldDef) => !f.show || f.show(v)

  const submit = async () => {
    const e: Record<string, string> = {}
    for (const f of fields) {
      if (!visible(f)) continue
      const x = v[f.key]
      if (f.required && (x == null || x === '' || (f.kind === 'money' && Number(x) <= 0 && f.key !== 'amount0'))) e[f.key] = 'این فیلد لازم است'
    }
    setErr(e)
    if (Object.keys(e).length) { document.getElementById(`ff-${Object.keys(e)[0]}`)?.focus(); return }
    setBusy(true)
    try { await onSubmit(v); onClose() } finally { setBusy(false) }
  }
  const close = () => { if (!dirty || window.confirm('تغییرات ذخیره‌نشده از بین می‌رود. بسته شود؟')) onClose() }

  const render = (f: FieldDef) => {
    const id = `ff-${f.key}`, bad = !!err[f.key]
    const val = v[f.key]
    let input: ReactNode
    switch (f.kind) {
      case 'text': input = <input id={id} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} aria-invalid={bad || undefined} disabled={f.disabled} />; break
      case 'area': input = <textarea id={id} rows={3} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} />; break
      case 'money': input = <MoneyField id={id} value={Number(val) || 0} onChange={(n) => set(f.key, n)} allowNegative={f.allowNegative} invalid={bad} />; break
      case 'num': case 'pct': input = <input id={id} key={String(val)} inputMode="decimal" dir="ltr" style={{ textAlign: 'right' }} defaultValue={val ? faDigits(String(val)) : ''} onBlur={(e) => set(f.key, parseNum(e.target.value))} />; break
      case 'date': input = <JalaliDateInput value={String(val ?? '')} onChange={(x) => set(f.key, x || null)} />; break
      case 'select': input = <select id={id} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} aria-invalid={bad || undefined} disabled={f.disabled}>{!f.required && <option value="">—</option>}{f.required && !val && <option value="">انتخاب کنید</option>}{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; break
      case 'file': input = <AttachmentField folder={f.folder ?? 'general'} value={String(val ?? '')} onChange={(p) => set(f.key, p)} />; break
    }
    return <div key={f.key} className="im-field" style={f.span === 2 ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{f.label}{f.required && ' *'}{f.kind === 'pct' && ' (٪)'}</label>{input}{bad && <div className="im-err">{err[f.key]}</div>}{f.hint && !bad && <p className="im-helper">{f.hint}</p>}</div>
  }
  const main = fields.filter((f) => !f.group && visible(f))
  return (
    <div className="im-overlay">
      <div className="im-modal fn-form" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="im-modal-head"><div><div className="im-modal-title">{title}</div>{subtitle && <p className="im-helper" style={{ margin: 0 }}>{subtitle}</p>}</div><button className="im-modal-close" onClick={close} aria-label="بستن">✕</button></div>
        <div className="fn-form-grid">{main.map(render)}</div>
        {groups.map((g) => { const fs = fields.filter((f) => f.group === g.id && visible(f)); return fs.length ? <details key={g.id} open={!g.collapsed} className="fn-form-group"><summary>{g.title}</summary><div className="fn-form-grid">{fs.map(render)}</div></details> : null })}
        {preview && <div className="fn-form-preview">{preview(v)}</div>}
        {extra}
        <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={close}>انصراف</button><button className="im-btn im-btn-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ثبت…' : submitLabel}</button></div>
      </div>
    </div>
  )
}
