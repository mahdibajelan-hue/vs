const nf = new Intl.NumberFormat('fa-IR')
export const faNum = (n: number | string): string => (typeof n === 'number' ? nf.format(n) : String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]))
export const faDec = (n: number, digits = 1): string => nf.format(+n.toFixed(digits))
/** Route lengths: one decimal below 100 km, whole km above. */
export const fmtLen = (n: number): string => faDec(n, n >= 100 ? 0 : 1)

const longFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', year: '2-digit' })
const at = (iso: string) => new Date(`${iso}T12:00:00Z`)
export const fmtDate = (iso: string | null | undefined): string => (iso ? longFmt.format(at(iso)) : '—')
export const fmtDateShort = (iso: string | null | undefined): string => (iso ? shortFmt.format(at(iso)).replace(/\//g, '/') : '—')
export const fmtMonth = (iso: string): string => monthFmt.format(at(iso))

/** "۳ روز دیگر" / "۵ روز پیش" / "امروز" */
export function relDays(days: number): string {
  if (days === 0) return 'امروز'
  return days > 0 ? `${faNum(days)} روز دیگر` : `${faNum(-days)} روز پیش`
}
/** "۴ ماه و ۲ روز" for durations */
export function fmtDuration(days: number): string {
  const d = Math.round(Math.abs(days))
  if (d < 31) return `${faNum(d)} روز`
  const m = Math.floor(d / 30)
  const r = d % 30
  return r ? `${faNum(m)} ماه و ${faNum(r)} روز` : `${faNum(m)} ماه`
}
/** Rial amounts the way managers read them. */
export function fmtMoney(rial: number | null | undefined): string {
  if (rial == null) return '—'
  const abs = Math.abs(rial)
  if (abs >= 1e9) return `${faNum(+(rial / 1e9).toFixed(1))} میلیارد ریال`
  if (abs >= 1e6) return `${faNum(Math.round(rial / 1e6))} میلیون ریال`
  return `${faNum(Math.round(rial))} ریال`
}
