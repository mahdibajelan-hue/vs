import { useState } from 'react'

/**
 * A bend direction as the sheets write it — «IPR 8°», «SB 5°» — entered without typing the letters or the degree sign
 * (neither keyboard has «°»): pick the direction, type the angle, the value is put together. A value typed some other
 * way earlier is kept and shown until it is changed.
 */
export const BEND_DIRS = {
  /** in plan (horizontal): point of intersection to the right / left */
  plan: [{ v: 'IPR', t: 'افقی به راست (IP Right)' }, { v: 'IPL', t: 'افقی به چپ (IP Left)' }],
  /** in profile (vertical): sag bend / over bend */
  profile: [{ v: 'SB', t: 'عمودی رو به پایین (Sag Bend)' }, { v: 'OB', t: 'عمودی رو به بالا (Over Bend)' }],
} as const
const ALL = [...BEND_DIRS.plan, ...BEND_DIRS.profile]

export function parseBend(v: unknown): { dir: string; deg: string } {
  const m = /^\s*(IPR|IPL|SB|OB)?\s*([0-9]+(?:[.,][0-9]+)?)?\s*°?\s*$/i.exec(String(v ?? ''))
  return m ? { dir: (m[1] ?? '').toUpperCase(), deg: (m[2] ?? '').replace(',', '.') } : { dir: '', deg: '' }
}
export const bendText = (dir: string, deg: string) => (deg ? `${dir ? `${dir} ` : ''}${deg}°` : dir)

export function BendDir({ value, onValue, which, label, disabled }: { value: unknown; onValue: (v: string) => void; which: 'plan' | 'profile' | 'any'; label: string; disabled?: boolean }) {
  const p = parseBend(value)
  const [deg, setDeg] = useState(p.deg)
  const opts = which === 'any' ? ALL : BEND_DIRS[which]
  const odd = !!String(value ?? '').trim() && !p.dir && !p.deg // an old free-text value
  const set = (dir: string, d: string) => onValue(bendText(dir, d))
  if (disabled) return <span dir="ltr">{String(value ?? '') || '—'}</span>
  return (
    <span className="bd" role="group" aria-label={label}>
      <span className="bd-dirs">
        {opts.map((o) => <button key={o.v} type="button" title={o.t} aria-pressed={p.dir === o.v} onClick={() => set(p.dir === o.v ? '' : o.v, deg)}>{o.v}</button>)}
      </span>
      <span className="bd-deg">
        <input inputMode="decimal" dir="ltr" value={deg} aria-label={`${label} — زاویه (درجه)`} placeholder="0"
          onChange={(e) => { const d = e.target.value.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٫,]/g, '.').replace(/[^0-9.]/g, ''); setDeg(d); set(p.dir, d) }} />
        <span aria-hidden>°</span>
      </span>
      {odd && <small className="bd-old" title="مقدار قبلی؛ با انتخاب جهت و زاویه جایگزین می‌شود">{String(value)}</small>}
    </span>
  )
}
