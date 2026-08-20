import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  jalaliWeekday,
  formatJalali,
  todayJalali,
} from '../../lib/jalali'

interface JalaliDateInputProps {
  value: string
  onChange: (iso: string) => void
  className?: string
}

type PickerView = 'days' | 'months' | 'years'

const YEARS_PER_PAGE = 12

/**
 * Jalali date picker. Clicking the month/year header drills into a month grid, and clicking the
 * year inside that drills further into a year grid — the same "day -> month -> year" pattern as
 * native OS date pickers — instead of the only way to reach a distant date being to click the
 * single-month prev/next arrow repeatedly (unusable for something like a birth date decades back).
 */
export function JalaliDateInput({ value, onChange, className = '' }: JalaliDateInputProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PickerView>('days')
  const initial = isoToJalali(value) ?? todayJalali()
  const [viewYear, setViewYear] = useState(initial.jy)
  const [viewMonth, setViewMonth] = useState(initial.jm)
  const [yearPageStart, setYearPageStart] = useState(initial.jy - Math.floor(YEARS_PER_PAGE / 2))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const j = isoToJalali(value)
    if (j) {
      setViewYear(j.jy)
      setViewMonth(j.jm)
    }
  }, [value])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setView('days')
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selected = isoToJalali(value)
  const monthLen = jalaliMonthLength(viewYear, viewMonth)
  const firstWeekday = jalaliWeekday(viewYear, viewMonth, 1)
  const today = todayJalali()

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }
  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const pickDay = (jd: number) => {
    onChange(jalaliToIso(viewYear, viewMonth, jd))
    setOpen(false)
    setView('days')
  }

  const openYearPicker = () => {
    setYearPageStart(viewYear - Math.floor(YEARS_PER_PAGE / 2))
    setView('years')
  }

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: monthLen }, (_, i) => i + 1)]

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setView('days')
        }}
        className={`input flex items-center justify-between gap-2 text-right num ${className}`}
      >
        <span>{value ? formatJalali(value) : 'انتخاب تاریخ'}</span>
        <CalendarDays size={14} className="text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-64 rounded-xl glass-panel p-3" style={{ background: 'var(--bg-panel-solid)' }}>
          {view === 'days' && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={goPrevMonth} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronRight size={15} />
                </button>
                <button type="button" onClick={() => setView('months')} className="rounded-lg px-2 py-1 text-sm font-medium num hover:bg-white/10 transition-colors">
                  {JALALI_MONTHS[viewMonth - 1]} {viewYear.toLocaleString('fa-IR')}
                </button>
                <button type="button" onClick={goNextMonth} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronLeft size={15} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {JALALI_WEEKDAYS.map((w, i) => (
                  <span key={i} className="text-center text-[10px] text-muted">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((jd, i) => {
                  if (jd === null) return <span key={i} />
                  const isSelected = selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === jd
                  const isToday = today.jy === viewYear && today.jm === viewMonth && today.jd === jd
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => pickDay(jd)}
                      className={`rounded-lg py-1 text-xs num transition-colors ${
                        isSelected
                          ? 'bg-brand-500 text-white font-bold'
                          : isToday
                            ? 'bg-brand-500/15 text-brand-300'
                            : 'hover:bg-white/10'
                      }`}
                    >
                      {jd}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === 'months' && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => setViewYear((y) => y - 1)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronRight size={15} />
                </button>
                <button type="button" onClick={openYearPicker} className="rounded-lg px-2 py-1 text-sm font-medium num hover:bg-white/10 transition-colors">
                  {viewYear.toLocaleString('fa-IR')}
                </button>
                <button type="button" onClick={() => setViewYear((y) => y + 1)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronLeft size={15} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {JALALI_MONTHS.map((m, i) => {
                  const monthNum = i + 1
                  const isSelected = selected && selected.jy === viewYear && selected.jm === monthNum
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setViewMonth(monthNum)
                        setView('days')
                      }}
                      className={`rounded-lg py-2 text-[11px] transition-colors ${isSelected ? 'bg-brand-500 text-white font-bold' : 'hover:bg-white/10'}`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === 'years' && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => setYearPageStart((y) => y - YEARS_PER_PAGE)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronRight size={15} />
                </button>
                <span className="num text-sm font-medium">
                  {yearPageStart.toLocaleString('fa-IR')} - {(yearPageStart + YEARS_PER_PAGE - 1).toLocaleString('fa-IR')}
                </span>
                <button type="button" onClick={() => setYearPageStart((y) => y + YEARS_PER_PAGE)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
                  <ChevronLeft size={15} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i).map((y) => (
                  <button
                    type="button"
                    key={y}
                    onClick={() => {
                      setViewYear(y)
                      setView('months')
                    }}
                    className={`num rounded-lg py-2 text-[11px] transition-colors ${y === viewYear ? 'bg-brand-500 text-white font-bold' : 'hover:bg-white/10'}`}
                  >
                    {y.toLocaleString('fa-IR')}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
