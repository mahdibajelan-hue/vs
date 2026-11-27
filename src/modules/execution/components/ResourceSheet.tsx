import { useMemo } from 'react'
import { resourceBands, sideFont } from '../lib/dailyDr'
import type { ResField } from '../lib/resourceCatalog'
import type { ReportResource } from '../types'

const n = (v: number) => (v ? v.toLocaleString('fa-IR') : '·')

/**
 * «لیست نیروی انسانی» / «لیست ماشین‌آلات سبک و سنگین» as on the contractor's daily sheet: the sections side by side in
 * four bands (the section name written down the side), every row of the list, and the grand total at the foot.
 */
export function ResourceSheet({ rows, kind }: { rows: Pick<ReportResource, 'kind' | 'section' | 'name' | ResField>[]; kind: 'man' | 'equip' }) {
  const b = useMemo(() => resourceBands(rows, kind), [rows, kind])
  return (
    <div className="rs-sheet">
      <div className="rs-title">{kind === 'man' ? 'لیست نیروی انسانی' : 'لیست ماشین‌آلات سبک و سنگین و تجهیزات اجرایی'}</div>
      <div className="rs-bands">
        {b.bands.map((band, i) => (
          <table key={i} className="rs-band">
            <thead><tr><th className="rs-sec">قسمت</th><th>{kind === 'man' ? 'نیروی انسانی' : 'تجهیزات'}</th>{b.head.map((h) => <th key={h} className="rs-v">{h}</th>)}</tr></thead>
            <tbody>{band.map((r, j) => (
              <tr key={j} className={r.vals[0] ? 'on' : undefined}>
                {r.span > 0 && <td className="rs-sec" rowSpan={r.span}><span style={{ fontSize: sideFont(r.section, r.span, 17) }}>{r.section}</span></td>}
                <td className="rs-name">{r.name}</td>
                {r.vals.map((v, k) => <td key={k} className="rs-v">{n(v)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        ))}
      </div>
      <table className="rs-total"><tbody><tr><th>جمع کل</th>{b.head.map((h, i) => <td key={h}><small>{h}</small><b>{b.total[i].toLocaleString('fa-IR')}</b></td>)}</tr></tbody></table>
    </div>
  )
}
