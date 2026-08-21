import type { EmploymentEntry } from '../types'

/** Age in whole years as of today, from a Gregorian ISO birth date (JalaliDateInput's on-the-wire format). */
export function computeAge(birthDateIso: string | null | undefined): number | null {
  if (!birthDateIso) return null
  const birth = new Date(birthDateIso)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 ? age : null
}

/** Whole months between two Gregorian ISO dates; a blank end date means "still ongoing" (through today). */
export function monthsBetween(startIso: string, endIso: string): number | null {
  if (!startIso) return null
  const start = new Date(startIso)
  if (isNaN(start.getTime())) return null
  const end = endIso ? new Date(endIso) : new Date()
  if (isNaN(end.getTime())) return null
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) - (end.getDate() < start.getDate() ? 1 : 0)
  return Math.max(0, months)
}

/** "۲ سال و ۳ ماه" / "۵ ماه" / "کمتر از یک ماه" — Persian-digit duration label for a month count. */
export function formatDurationFa(months: number | null): string {
  if (months == null) return '—'
  if (months < 1) return 'کمتر از یک ماه'
  const years = Math.floor(months / 12)
  const rem = months % 12
  const parts: string[] = []
  if (years > 0) parts.push(`${years.toLocaleString('fa-IR')} سال`)
  if (rem > 0) parts.push(`${rem.toLocaleString('fa-IR')} ماه`)
  return parts.join(' و ')
}

/** Sum of every entry's duration, in months — the mechanical "total career length" figure (does not correct for overlapping positions). */
export function totalMonths(entries: EmploymentEntry[]): number {
  return entries.reduce((sum, e) => sum + (monthsBetween(e.startDate, e.endDate) ?? 0), 0)
}

/** Same as totalMonths but only positions flagged isPipelineRole — feeds yearsExperiencePipeline. */
export function totalPipelineMonths(entries: EmploymentEntry[]): number {
  return entries.filter((e) => e.isPipelineRole).reduce((sum, e) => sum + (monthsBetween(e.startDate, e.endDate) ?? 0), 0)
}

/** Sum of each position's self-reported insurance months — a simple total, not derived from the date range. */
export function totalInsuranceMonths(entries: EmploymentEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.insuranceMonths ?? 0), 0)
}

export function monthsToYears(months: number): number {
  return Math.round((months / 12) * 10) / 10
}
