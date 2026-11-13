import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarCheck2, CalendarClock, Flag, Hourglass } from 'lucide-react'
import { jalaliText, weekdayOf, WEEKDAY_FA_SAFE } from './olDates'

const faN = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })

/** A number that counts up to its value once, with a strong ease-out; instant when the user prefers reduced motion. */
export function CountUp({ value, digits = 0, ms = 900 }: { value: number; digits?: number; ms?: number }) {
  const [v, setV] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    const start = performance.now(), a = from.current, b = value
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - (1 - k) ** 4
      setV(a + (b - a) * e)
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{faN(v, digits)}</>
}

/** Section heading with a coloured icon chip. */
export function OlHead({ icon: I, color, title, hint, action }: { icon: LucideIcon; color: string; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="olx-head" style={{ '--c': color } as CSSProperties}>
      <span className="olx-head-ico"><I size={17} aria-hidden /></span>
      <div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      {action && <div className="olx-head-act">{action}</div>}
    </div>
  )
}

/** A card of the section (entrance animation via the --i order). */
export function OlCard({ children, i = 0, className = '', style }: { children: ReactNode; i?: number; className?: string; style?: CSSProperties }) {
  return <section className={`olx-card ${className}`} style={{ '--i': i, ...style } as CSSProperties}>{children}</section>
}

export type HeroTone = 'good' | 'warn' | 'bad' | 'none'
const TONE: Record<HeroTone, [string, string]> = { good: ['#22c55e', '#06b6d4'], warn: ['#f59e0b', '#ec4899'], bad: ['#ef4444', '#a855f7'], none: ['#64748b', '#06b6d4'] }

/**
 * The countdown to the forecast finish: days left in big type, the finish date in a glowing frame (a slowly turning
 * light around the border, coloured by how the finish stands against the plan), and the 80% band against the planned end.
 */
export function CountdownHero({ today, finish, p10, p90, planned, workDaysLeft, lowerBound }: { today: string; finish: string | null; p10: string | null; p90: string | null; planned: string | null; workDaysLeft: number | null; lowerBound?: boolean }) {
  const days = finish ? Math.max(0, Math.round((Date.parse(finish) - Date.parse(today)) / 86400000)) : null
  const slip = finish && planned ? Math.round((Date.parse(finish) - Date.parse(planned)) / 86400000) : null
  const tone: HeroTone = slip == null ? 'none' : slip > 30 ? 'bad' : slip > 0 ? 'warn' : 'good'
  const [c1, c2] = TONE[tone]
  // band: from today to the latest of p90 / planned
  const end = [p90, planned, finish].filter((x): x is string => !!x).sort().pop() ?? today
  const span = Math.max(1, Date.parse(end) - Date.parse(today))
  const at = (d: string | null) => (d ? Math.min(100, Math.max(0, ((Date.parse(d) - Date.parse(today)) / span) * 100)) : null)
  return (
    <section className={`olh is-${tone}`} style={{ '--c1': c1, '--c2': c2 } as CSSProperties} aria-label="شمارش معکوس تا پایان پروژه">
      <div className="olh-aura" aria-hidden />
      <div className="olh-frame">
        <div className="olh-inner">
          <div className="olh-count">
            <span className="olh-count-ico"><Hourglass size={20} aria-hidden /></span>
            <b>{days == null ? '—' : <CountUp value={days} />}</b>
            <span className="olh-count-unit">روز</span>
            <small>{days == null ? 'تاریخ پایان هنوز قابل پیش‌بینی نیست' : `مانده تا پایان پیش‌بینی‌شدهٔ پروژه${workDaysLeft != null ? ` · ${faN(workDaysLeft)} روز کاری` : ''}`}</small>
          </div>
          <div className="olh-date">
            <span className="olh-label"><CalendarCheck2 size={15} aria-hidden /> تاریخ اتمام پیش‌بینی‌شده{lowerBound ? ' (کمینه)' : ''}</span>
            <b className="olh-date-v">{finish ? jalaliText(finish) : '—'}</b>
            {finish && <span className="olh-date-wd">{WEEKDAY_FA_SAFE[weekdayOf(finish)]}</span>}
            <span className={`olh-chip is-${tone}`}>{slip == null ? (planned ? '—' : 'بدون تاریخ برنامه') : slip === 0 ? 'طبق برنامه' : slip > 0 ? `${faN(slip)} روز دیرتر از برنامه` : `${faN(-slip)} روز زودتر از برنامه`}</span>
          </div>
          <div className="olh-band" aria-hidden={!finish}>
            <div className="olh-band-track">
              {finish && <i className="olh-band-fill" style={{ width: `${at(finish)}%` }} />}
              {p10 && p90 && <i className="olh-band-range" style={{ insetInlineStart: `${at(p10)}%`, width: `${Math.max(1.5, (at(p90) ?? 0) - (at(p10) ?? 0))}%` }} />}
              {finish && <i className="olh-band-dot" style={{ insetInlineStart: `${at(finish)}%` }} />}
              {planned && <i className="olh-band-plan" style={{ insetInlineStart: `${at(planned)}%` }} title="پایان برنامه‌ای" />}
            </div>
            <div className="olh-band-legend">
              <span><CalendarClock size={13} aria-hidden /> امروز {jalaliText(today)}</span>
              {p10 && p90 && <span className="is-range">بازهٔ ۸۰٪: {jalaliText(p10)} تا {jalaliText(p90)}</span>}
              {planned && <span className="is-plan"><Flag size={13} aria-hidden /> پایان برنامه‌ای {jalaliText(planned)}</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
