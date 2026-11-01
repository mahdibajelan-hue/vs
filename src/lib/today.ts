/**
 * Today's date (yyyy-mm-dd) on Iran time. `new Date().toISOString()` gives the UTC date, which is still "yesterday"
 * between 00:00 and 03:30 Tehran time — anything dated today (a document approval, a daily report) would then be left out
 * of today's figures. The database uses the same zone (`now() at time zone 'Asia/Tehran'`).
 */
export function todayTehran(at: Date = new Date()): string {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
    const s = `${g('year')}-${g('month')}-${g('day')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  } catch { /* no Intl time-zone data: fall back to a fixed +03:30 offset (Iran has no daylight saving time) */ }
  return new Date(at.getTime() + 3.5 * 3600000).toISOString().slice(0, 10)
}
