import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, FileText } from 'lucide-react'
import { JALALI_MONTHS, JALALI_WEEKDAYS, isoToJalali, jalaliMonthLength, jalaliToIso, jalaliWeekday, todayJalali } from '../../../lib/jalali'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { REPORT_STATUS_LABEL_FA, type Report } from '../types'
import { ReportStatusChip, fa } from '../components/common'
import { ReportEditor } from '../components/ReportEditor'
import type { ExecutionModel } from '../lib/useExecutionModel'

const titleOf = (r: Report) => (r.formKey === 'work' ? 'گزارش وضعیت کارگاه' : FORM_BY_KEY[r.formKey]?.title ?? r.formKey)

/**
 * The archive of the daily reports as a calendar: every day shows how many reports were sent; clicking a day lists them by
 * title, and a title opens the signed paper (print, PDF, Excel) — not the entry tables. Drafts are not archived.
 */
export function ArchiveCalendar({ model: m }: { model: ExecutionModel }) {
  const t = todayJalali()
  const [ym, setYm] = useState({ y: t.jy, m: t.jm })
  const [day, setDay] = useState<string>(jalaliToIso(t.jy, t.jm, t.jd))
  const [front, setFront] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const archived = useMemo(() => m.reports.filter((r) => r.status !== 'draft' && (!front || (r.front ?? '') === front)), [m.reports, front])
  const fronts = useMemo(() => [...new Set(m.reports.map((r) => r.front ?? '').filter(Boolean))].sort(), [m.reports])
  const byDay = useMemo(() => { const x = new Map<string, Report[]>(); for (const r of archived) { const a = x.get(r.reportDate); if (a) a.push(r); else x.set(r.reportDate, [r]) } return x }, [archived])
  const len = jalaliMonthLength(ym.y, ym.m), first = jalaliWeekday(ym.y, ym.m, 1)
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)]
  const move = (d: number) => setYm(({ y, m: mm }) => { const n = mm + d; return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n } })
  const list = (byDay.get(day) ?? []).slice().sort((a, b) => (a.formKey === 'work' ? -1 : b.formKey === 'work' ? 1 : titleOf(a).localeCompare(titleOf(b))))
  const dj = isoToJalali(day)
  const monthTotal = cells.reduce<number>((s, d) => s + (d ? byDay.get(jalaliToIso(ym.y, ym.m, d))?.length ?? 0 : 0), 0)

  if (open) return <ReportEditor reportId={open} model={m} onClose={() => setOpen(null)} paperOnly />
  return (
    <div className="arc">
      <section className="im-card arc-cal">
        <div className="arc-head">
          <button type="button" className="im-btn im-btn-sm" onClick={() => move(-1)} aria-label="ماه قبل"><ChevronRight size={15} /></button>
          <b>{JALALI_MONTHS[ym.m - 1]} {ym.y.toLocaleString('fa-IR', { useGrouping: false })}</b>
          <button type="button" className="im-btn im-btn-sm" onClick={() => move(1)} aria-label="ماه بعد"><ChevronLeft size={15} /></button>
          <small>{fa(monthTotal)} گزارش در این ماه</small>
          {fronts.length > 1 && <select value={front} onChange={(e) => setFront(e.target.value)} aria-label="جبهه"><option value="">همهٔ جبهه‌ها</option>{fronts.map((f) => <option key={f} value={f}>{f}</option>)}</select>}
        </div>
        <div className="arc-grid" role="grid" aria-label="تقویم بایگانی">
          {JALALI_WEEKDAYS.map((w) => <span key={w} className="arc-wd">{w}</span>)}
          {cells.map((d, i) => { if (!d) return <span key={`e${i}`} />
            const iso = jalaliToIso(ym.y, ym.m, d), n = byDay.get(iso)?.length ?? 0, on = iso === day, isToday = ym.y === t.jy && ym.m === t.jm && d === t.jd
            return (
              <button key={iso} type="button" className={`arc-day${on ? ' on' : ''}${n ? ' has' : ''}${isToday ? ' today' : ''}`} onClick={() => setDay(iso)} aria-pressed={on} aria-label={`${d} ${JALALI_MONTHS[ym.m - 1]}: ${n} گزارش`}>
                <span>{d.toLocaleString('fa-IR')}</span>{n > 0 && <em>{fa(n)}</em>}
              </button>
            ) })}
        </div>
      </section>
      <section className="im-card arc-list">
        <h3>{dj ? `${dj.jd.toLocaleString('fa-IR')} ${JALALI_MONTHS[dj.jm - 1]} ${dj.jy.toLocaleString('fa-IR', { useGrouping: false })}` : ''}</h3>
        {list.length === 0 ? <p className="im-helper">برای این روز گزارش ارسال‌شده‌ای در بایگانی نیست.</p> : (
          <ul>
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} title={`باز کردن فرم امضاشده — ${REPORT_STATUS_LABEL_FA[r.status]}`}>
                  {r.formKey === 'work' ? <ClipboardList size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
                  <span><b>{titleOf(r)}</b><small className="fn-code">{r.reportNo}{r.front ? ` · ${r.front}` : ''}</small></span>
                  <ReportStatusChip status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
