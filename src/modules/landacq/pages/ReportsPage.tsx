import { useMemo, useState } from 'react'
import { AlarmClockOff, CalendarClock, CheckCircle2, Download, FileWarning, GitCompareArrows, History, Printer, ShieldAlert, Sparkles, type LucideIcon } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { NoRoute } from '../components/shared'
import { HelpButton } from '../components/Help'
import { buildReports, REPORT_COLOR, toCsv, type Report, type ReportKey } from '../lib/reports'
import { faNum, fmtDate } from '../lib/fa'

const ICON: Record<ReportKey, LucideIcon> = { critical: ShieldAlert, constraint: FileWarning, upcoming: CalendarClock, last_action: History, overdue: AlarmClockOff, ready: CheckCircle2, recommended: Sparkles, conflict: GitCompareArrows }
/** Words that get a coloured pill wherever they start a cell. */
const PILLS: [RegExp, string][] = [[/^(Critical|بحرانی)/i, '#ef4444'], [/^(High|زیاد)/i, '#f97316'], [/^(Medium|متوسط|مشروط)/i, '#eab308'], [/^(Low|کم)/i, '#22c55e'], [/^(آماده نیست|Not Ready)/i, '#f97316'], [/^(آزاد|آماده)/, '#22c55e'], [/^(در حال تحصیل)/, '#eab308'], [/^(دارای ریسک)/, '#f97316'], [/^(منابع طبیعی)/, '#38bdf8'], [/^(دولتی)/, '#a78bfa']]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function printReport(r: Report, project: string, date: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const c = REPORT_COLOR[r.key]
  w.document.write(`<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>body{font-family:Vazirmatn,Tahoma,sans-serif;padding:24px;color:#111}header{border-radius:12px;padding:16px 20px;color:#fff;background:linear-gradient(120deg,${c},#1e293b)}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;font-size:12px;opacity:.9}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:14px}th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right}th{background:${c}22}tr:nth-child(even) td{background:#f8fafc}</style></head><body><header><p>${esc(project)}</p><h1>${esc(r.title)} — ${esc(r.fa)}</h1><p>${esc(r.hint)} · ${esc(date)} · ${r.rows.length} مورد</p></header><table><thead><tr><th>#</th>${r.columns.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((x, i) => `<tr><td>${i + 1}</td>${x.cells.map((y) => `<td>${esc(y)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
function download(r: Report, project: string, date: string) {
  const url = URL.createObjectURL(new Blob([toCsv(r, { project, date })], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${r.title.replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Cell({ text }: { text: string }) {
  const hit = PILLS.find(([re]) => re.test(text))
  if (!hit) return <>{text}</>
  return <span className="la-badge" style={{ '--c': hit[1] } as React.CSSProperties}><i /> {text}</span>
}

/** The eight management reports, each with its project and report title, headline figures and a readable, colour-coded table. */
export function ReportsPage() {
  const data = useLandStore((s) => s.data)
  const projects = useLandStore((s) => s.projects)
  const projectId = useLandStore((s) => s.projectId)
  const select = useLandStore((s) => s.selectParcel)
  const { rows, settings, today } = useLandAnalysis()
  const [key, setKey] = useState<ReportKey>('critical')
  const reports = useMemo(() => (data ? buildReports({ rows, parcels: data.parcels, activities: data.activities, events: data.events, linked: data.linked, today, settings }) : []), [data, rows, today, settings])
  if (!data?.route) return <NoRoute />
  const r = reports.find((x) => x.key === key) ?? reports[0]
  const color = REPORT_COLOR[r.key]
  const Icon = ICON[r.key]
  const project = projects.find((p) => p.id === projectId)?.name || data.route.name || 'پروژه'
  const date = fmtDate(today)
  const hot = r.rows.filter((x) => x.hot).length
  const linked = r.rows.filter((x) => x.parcelId).length

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="گزارش‌ها">
        {reports.map((x) => {
          const c = REPORT_COLOR[x.key]
          const I = ICON[x.key]
          return (
            <button key={x.key} role="tab" aria-selected={x.key === r.key} onClick={() => setKey(x.key)} className="la-rep-tab" style={{ '--c': c } as React.CSSProperties}>
              <I size={14} aria-hidden /> {x.fa} <span className="la-num">{faNum(x.rows.length)}</span>
            </button>
          )
        })}
      </div>

      <section className="la-rep-banner" style={{ '--c': color } as React.CSSProperties} aria-label="سربرگ گزارش">
        <div className="la-rep-icon" aria-hidden><Icon size={26} /></div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12px] opacity-90">{project}</p>
          <h2 className="m-0 mt-0.5 text-[20px] font-black leading-8" dir="ltr" style={{ textAlign: 'right' }}>{r.title}</h2>
          <p className="m-0 text-[14px] font-bold">{r.fa}</p>
          <p className="m-0 mt-1 text-[11.5px] leading-6 opacity-85">{r.hint}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="la-rep-date">تاریخ گزارش: {date}</span>
          <span className="flex gap-1.5">
            <HelpButton topic="reports" />
            <button className="la-btn la-btn-sm" onClick={() => download(r, project, date)}><Download size={13} /> اکسل</button>
            <button className="la-btn la-btn-sm" onClick={() => printReport(r, project, date)}><Printer size={13} /> چاپ</button>
          </span>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3" aria-label="خلاصهٔ گزارش">
        <Tile label="تعداد موارد" value={faNum(r.rows.length)} color={color} />
        <Tile label="موارد حساس" value={faNum(hot)} color="#ef4444" />
        <Tile label="دارای قطعهٔ مرتبط" value={faNum(linked)} color="#38bdf8" />
      </section>

      <div className="la-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="la-rep-table">
            <thead><tr><th>#</th>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={i} data-hot={x.hot ? '' : undefined} onClick={x.parcelId ? () => select(x.parcelId!) : undefined} style={{ cursor: x.parcelId ? 'pointer' : undefined }}>
                  <td className="la-num" style={{ color: 'var(--la-muted)' }}>{faNum(i + 1)}</td>
                  {x.cells.map((c, j) => <td key={j}><Cell text={c} /></td>)}
                </tr>
              ))}
              {r.rows.length === 0 && <tr><td colSpan={r.columns.length + 1} className="la-eyebrow" style={{ textAlign: 'center', padding: 32 }}>موردی برای این گزارش وجود ندارد.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="la-card-flat p-3" style={{ borderTop: `3px solid ${color}` }}>
      <p className="la-eyebrow m-0">{label}</p>
      <p className="la-num m-0 mt-0.5 text-[24px] font-bold" style={{ color }}>{value}</p>
    </div>
  )
}
