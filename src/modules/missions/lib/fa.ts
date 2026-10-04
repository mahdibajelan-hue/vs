import { formatJalali, isoToJalali, jalaliToIso, todayJalali, toGregorian, toJalali, jalaliMonthLength, JALALI_MONTHS } from '../platform'

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Latin digits → Persian digits, for display. */
export function faNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
}

/** Persian/Arabic digits → Latin, for parsing user text. */
export function latinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

/** Canonical form of user text for keyword matching: unified ی/ک, no ZWNJ/tatweel/diacritics, Latin digits. */
export function normalizeFa(s: string): string {
  return latinDigits(s)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/[ـً-ٟ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function shamsi(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = formatJalali(iso.slice(0, 10))
  return j ? faNum(j) : '—'
}

/** "۲۱ شهریور ۱۴۰۵" — long form for reports. */
export function shamsiLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = isoToJalali(iso.slice(0, 10))
  if (!j) return '—'
  return `${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy)}`
}

export function todayIso(): string {
  const j = todayJalali()
  return jalaliToIso(j.jy, j.jm, j.jd)
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10))
  const b = Date.parse(toIso.slice(0, 10))
  return Math.round((b - a) / 86400000)
}

/** Number of calendar days a mission spans, inclusive. */
export function missionDays(startIso: string, endIso: string): number {
  return daysBetween(startIso, endIso) + 1
}

export function relativeFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = daysBetween(todayIso(), iso.slice(0, 10))
  if (d === 0) return 'امروز'
  if (d === 1) return 'فردا'
  if (d === -1) return 'دیروز'
  return d > 0 ? `${faNum(d)} روز دیگر` : `${faNum(-d)} روز پیش`
}

export function timeAgoFa(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso)
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'هم‌اکنون'
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${faNum(hours)} ساعت پیش`
  const days = Math.round(hours / 24)
  if (days < 30) return `${faNum(days)} روز پیش`
  return shamsi(iso)
}

export { toJalali, toGregorian, jalaliMonthLength, JALALI_MONTHS, isoToJalali, jalaliToIso, todayJalali }

/** Word count for Persian text (whitespace-separated tokens containing a letter). */
export function wordCount(s: string): number {
  return normalizeFa(s).split(' ').filter((w) => /[\p{L}\d]/u.test(w)).length
}
