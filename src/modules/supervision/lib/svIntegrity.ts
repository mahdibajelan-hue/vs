import type { SvAttendance } from '../types'

/**
 * کنترل صحت ثبت — without a time clock, attendance is only as honest as whoever types it. These checks turn the
 * server-stamped entry times (`created_at`, set by a trigger) and the typed values into warnings the approver sees
 * before signing: days written long after the fact, the whole month typed in one sitting, the same hours every day
 * or for everybody, a month with no rest at all, overtime that lands exactly on the ceiling.
 */

const TZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Calendar day (Iran time) of a server timestamp. */
export const entryDay = (ts: string) => TZ_FMT.format(new Date(ts))
const plusDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Written after the entry window (today and `grace` days back), by its reason or by when it was first stored. */
export function isLateRow(r: Pick<SvAttendance, 'day' | 'lateReason' | 'createdAt' | 'source'>, grace: number): boolean {
  if (r.source !== 'manual') return false
  if ((r.lateReason ?? '').trim()) return true
  return !!r.createdAt && entryDay(r.createdAt) > plusDays(r.day, grace)
}

export interface PersonCheck { late: number; flags: string[] }
export interface PersonFigures { rest: number; onProject: number; overtime: number; overtimeCap: number }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** One person's month: late rows and the patterns that suggest the days were filled in rather than recorded. */
export function personCheck(rows: SvAttendance[], m: PersonFigures, grace: number, linked = false): PersonCheck {
  const manual = rows.filter((r) => r.source === 'manual')
  const late = manual.filter((r) => isLateRow(r, grace)).length
  const flags: string[] = []
  if (manual.length && late / manual.length >= 0.3) flags.push(`${pct(late, manual.length)}٪ روزها با تأخیر ثبت شده`)
  const timed = manual.filter((r) => r.status === 'present' && r.checkIn && r.checkOut)
  if (timed.length >= 8) {
    const counts = new Map<string, number>()
    for (const r of timed) counts.set(`${r.checkIn}-${r.checkOut}`, (counts.get(`${r.checkIn}-${r.checkOut}`) ?? 0) + 1)
    const top = Math.max(...counts.values())
    if (top / timed.length >= 0.9) flags.push(`ساعت ورود و خروج در ${pct(top, timed.length)}٪ روزها دقیقاً یکسان`)
  }
  const present = manual.filter((r) => r.status === 'present')
  if (present.length >= 8 && present.filter((r) => !r.checkIn && !r.checkOut).length / present.length >= 0.8) flags.push('در بیشتر روزها ساعت ورود و خروج ثبت نشده')
  // someone who checks in with their phone but whose present days were typed by hand
  const handPresent = linked ? rows.filter((r) => r.status === 'present' && r.source === 'manual').length : 0
  if (handPresent >= 3) flags.push(`${handPresent} روز «حاضر» دستی ثبت شده در حالی که باید با گوشی ثبت کند`)
  if (m.onProject >= 20 && m.rest === 0) flags.push('در کل ماه حتی یک روز استراحت ندارد')
  if (m.overtimeCap > 0 && m.overtime >= m.overtimeCap - 0.5 && m.overtime <= m.overtimeCap + 0.5) flags.push('اضافه‌کار دقیقاً برابر سقف')
  return { late, flags }
}

export interface ProjectCheck {
  rows: number
  late: number
  /** share of hand-typed rows recorded inside the window, 0–100 */
  timelyPct: number
  /** largest number of rows first stored within 15 minutes, and when */
  bulk: { count: number; at: string } | null
  /** days on which 3+ people present all carry exactly the same check-in/out */
  sameForAll: number
  /** share of present days recorded by the person's phone inside a site, 0–100 */
  gpsPct: number
  flags: string[]
  level: 'ok' | 'warn' | 'bad'
}

export function projectCheck(rows: SvAttendance[], grace: number, personFlags = 0): ProjectCheck {
  const present = rows.filter((r) => r.status === 'present')
  const gpsPct = pct(present.filter((r) => r.source === 'gps').length, present.length)
  const manual = rows.filter((r) => r.source === 'manual')
  const late = manual.filter((r) => isLateRow(r, grace)).length
  const timelyPct = manual.length ? 100 - pct(late, manual.length) : 100
  // bulk: sliding 15-minute window over first-entry times
  const ts = manual.map((r) => (r.createdAt ? Date.parse(r.createdAt) : NaN)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b)
  let best = 0, at = 0
  for (let i = 0, j = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 15 * 60e3) j++; if (i - j + 1 > best) { best = i - j + 1; at = ts[j] } }
  const bulk = best >= 40 ? { count: best, at: new Date(at).toISOString() } : null
  const byDay = new Map<string, Set<string>>(), nDay = new Map<string, number>()
  for (const r of manual) if (r.status === 'present' && r.checkIn && r.checkOut) {
    if (!byDay.has(r.day)) byDay.set(r.day, new Set())
    byDay.get(r.day)!.add(`${r.checkIn}-${r.checkOut}`)
    nDay.set(r.day, (nDay.get(r.day) ?? 0) + 1)
  }
  let sameForAll = 0
  for (const [d, set] of byDay) if ((nDay.get(d) ?? 0) >= 3 && set.size === 1) sameForAll++
  const flags: string[] = []
  if (manual.length && timelyPct < 70) flags.push(`فقط ${timelyPct}٪ ردیف‌ها به‌موقع ثبت شده`)
  if (bulk) flags.push(`ثبت انبوه: ${bulk.count} ردیف در کمتر از ۱۵ دقیقه`)
  if (sameForAll >= 5) flags.push(`در ${sameForAll} روز ساعت ورود و خروج همهٔ نفرات عین هم است`)
  const n = flags.length + personFlags
  return { rows: manual.length, late, timelyPct, bulk, sameForAll, gpsPct, flags, level: n === 0 ? 'ok' : bulk || timelyPct < 50 || n >= 4 ? 'bad' : 'warn' }
}
