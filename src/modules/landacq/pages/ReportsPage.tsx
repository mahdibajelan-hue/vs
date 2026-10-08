import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { NoRoute } from '../components/shared'
import { Card } from '../components/ui'
import { buildReports, toCsv, type Report } from '../lib/reports'
import { faNum } from '../lib/fa'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function printReport(r: Report) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #999;padding:5px 8px;text-align:right}th{background:#eee}h1{font-size:16px}</style></head><body><h1>${esc(r.title)} — ${esc(r.fa)}</h1><table><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((x) => `<tr>${x.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
function download(r: Report) {
  const url = URL.createObjectURL(new Blob([toCsv(r)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${r.title.replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** The eight management reports; every row opens its parcel. */
export function ReportsPage() {
  const data = useLandStore((s) => s.data)
  const select = useLandStore((s) => s.selectParcel)
  const { rows, settings, today } = useLandAnalysis()
  const [key, setKey] = useState<Report['key']>('critical')
  const reports = useMemo(() => (data ? buildReports({ rows, parcels: data.parcels, activities: data.activities, events: data.events, linked: data.linked, today, settings }) : []), [data, rows, today, settings])
  if (!data?.route) return <NoRoute />
  const r = reports.find((x) => x.key === key) ?? reports[0]
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="گزارش‌ها">
        {reports.map((x) => <button key={x.key} role="tab" className="la-chip" aria-selected={x.key === r.key} aria-pressed={x.key === r.key} onClick={() => setKey(x.key)}>{x.fa} <span className="la-num" style={{ color: 'var(--la-ink-2)' }}>({faNum(x.rows.length)})</span></button>)}
      </div>
      <Card title={r.title} hint={`${r.fa} — ${r.hint}`} help="reports" pad={false} action={<div className="flex gap-1.5"><button className="la-btn la-btn-sm" onClick={() => download(r)}><Download size={13} /> خروجی اکسل</button><button className="la-btn la-btn-sm" onClick={() => printReport(r)}><Printer size={13} /> چاپ</button></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}>{r.columns.map((c) => <th key={c} className="px-3 py-2 text-right font-semibold">{c}</th>)}</tr></thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={i} onClick={x.parcelId ? () => select(x.parcelId!) : undefined} style={{ borderTop: '1px solid var(--la-line)', cursor: x.parcelId ? 'pointer' : undefined, background: x.hot ? 'color-mix(in srgb, #ef4444 6%, transparent)' : undefined }}>
                  {x.cells.map((c, j) => <td key={j} className="px-3 py-2 leading-6">{c}</td>)}
                </tr>
              ))}
              {r.rows.length === 0 && <tr><td colSpan={r.columns.length} className="la-eyebrow px-3 py-8 text-center">موردی برای این گزارش وجود ندارد.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
