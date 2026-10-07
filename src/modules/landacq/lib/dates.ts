const DAY = 86400000

/** Parse yyyy-mm-dd as a UTC midnight timestamp (never shifted by the local timezone). */
export const toMs = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
export const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso: string, days: number): string => fromMs(toMs(iso) + Math.round(days) * DAY)
export const diffDays = (a: string, b: string): number => Math.round((toMs(a) - toMs(b)) / DAY)
export const todayIso = (): string => {
  const d = new Date()
  return fromMs(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}
export const minIso = (a: string, b: string): string => (a <= b ? a : b)
export const maxIso = (a: string, b: string): string => (a >= b ? a : b)

/** "KM 42+300" — chainage as engineers write it. */
export function fmtKm(km: number): string {
  const whole = Math.floor(km + 1e-9)
  const m = Math.round((km - whole) * 1000)
  const carry = m === 1000 ? 1 : 0
  return `${whole + carry}+${String(carry ? 0 : m).padStart(3, '0')}`
}
export const fmtKmRange = (a: number, b: number): string => `KM ${fmtKm(a)} – ${fmtKm(b)}`
