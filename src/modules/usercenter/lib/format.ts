const faNumFmt = new Intl.NumberFormat('fa-IR')
export const faNum = (n: number | string): string => (typeof n === 'number' ? faNumFmt.format(n) : String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]))

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' })

export const fmtDate = (iso: string | null | undefined): string => (iso ? dateFmt.format(new Date(iso)) : '—')
export const fmtDateTime = (iso: string | null | undefined): string => (iso ? dateTimeFmt.format(new Date(iso)) : '—')
export const fmtTime = (iso: string): string => timeFmt.format(new Date(iso))

/** "۳ ساعت پیش" style relative time; falls back to the date after a month. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'هرگز'
  const diff = Math.max(0, now - new Date(iso).getTime())
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'همین حالا'
  if (min < 60) return `${faNum(min)} دقیقه پیش`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${faNum(hr)} ساعت پیش`
  const day = Math.floor(hr / 24)
  if (day < 31) return `${faNum(day)} روز پیش`
  return fmtDate(iso)
}

/** Day bucket label for the activity timeline. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (diffDays === 0) return 'امروز'
  if (diffDays === 1) return 'دیروز'
  return fmtDate(iso)
}

export function initials(name: string, email: string): string {
  const base = (name || email.split('@')[0] || '؟').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0][0]}‌${parts[1][0]}` : base.slice(0, 2)
}

export function hueOf(seed: string): number {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

export function displayName(u: { fullName: string; email: string }): string {
  return u.fullName.trim() || u.email.split('@')[0]
}

/** A strong, readable temporary password (no look-alike characters). */
export function generatePassword(length = 14): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4
  return { score: s, label: ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی'][s] }
}

/** A copy of `set` with `key` added, or removed when already present. */
export function toggled<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
