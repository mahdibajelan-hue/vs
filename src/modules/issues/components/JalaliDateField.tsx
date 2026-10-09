import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { JALALI_MONTHS, JALALI_WEEKDAYS, formatJalali, isoToJalali, todayJalali } from '../../../lib/jalali'
import { monthGrid, shiftMonth } from '../lib/imCalendar'
import { todayIso } from '../lib/issueRing'

/** Jalali date picker: shows the date as 1405/07/20 and opens a month calendar; value is an ISO date (yyyy-mm-dd). */
export function JalaliDateField({ id, value, onChange, max }: { id?: string; value: string; onChange: (iso: string) => void; max?: string }) {
  const [open, setOpen] = useState(false)
  const base = isoToJalali(value) ?? todayJalali()
  const [ym, setYm] = useState({ jy: base.jy, jm: base.jm })
  const box = useRef<HTMLDivElement>(null)
  const today = todayIso()

  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open])

  const grid = monthGrid(ym.jy, ym.jm)
  const nav = (d: number) => setYm((o) => shiftMonth(o.jy, o.jm, d))
  return (
    <div className="im-datef" ref={box}>
      <button type="button" id={id} className="im-datef-btn" onClick={() => { const b = isoToJalali(value) ?? todayJalali(); setYm({ jy: b.jy, jm: b.jm }); setOpen((o) => !o) }} aria-haspopup="dialog" aria-expanded={open}>
        <CalendarDays size={15} aria-hidden /><span>{formatJalali(value)}</span>{value === today && <em>امروز</em>}
      </button>
      {open && (
        <div className="im-datef-pop" role="dialog" aria-label="انتخاب تاریخ">
          <div className="im-datef-head">
            <button type="button" className="im-cal-nav" onClick={() => nav(-1)} aria-label="ماه قبل"><ChevronRight size={16} /></button>
            <b>{JALALI_MONTHS[ym.jm - 1]} {ym.jy}</b>
            <button type="button" className="im-cal-nav" onClick={() => nav(1)} aria-label="ماه بعد"><ChevronLeft size={16} /></button>
          </div>
          <div className="im-datef-grid">
            {JALALI_WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
            {grid.map((c) => {
              const dis = !!max && c.iso > max
              return <button type="button" key={c.iso} disabled={dis} className={`${c.inMonth ? '' : 'out'} ${c.iso === value ? 'on' : ''} ${c.iso === today ? 'td' : ''}`} onClick={() => { onChange(c.iso); setOpen(false) }}>{c.jd}</button>
            })}
          </div>
          <button type="button" className="im-btn im-btn-ghost im-btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { onChange(today); setOpen(false) }}>امروز</button>
        </div>
      )}
    </div>
  )
}
