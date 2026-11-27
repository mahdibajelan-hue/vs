/**
 * Pipeline stationing (chainage): a kilometre point is written «1+284» (km 1, 284 m). It is stored as decimal km
 * (1.284). On a phone the number pad has no «+», so the whole number of metres is typed (1284) and the «+» is placed by
 * the field itself; «1/284», «1+284» or a decimal «1.284» are understood too.
 */
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩'
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))

/** decimal km → «1+284» ('' for no value) */
export function chainText(v: unknown): string {
  if (v == null || String(v).trim() === '') return ''
  const x = Number(latin(String(v)).replace('٫', '.'))
  if (!Number.isFinite(x)) return String(v)
  const total = Math.round(Math.abs(x) * 1000), km = Math.floor(total / 1000), m = total % 1000
  return `${x < 0 ? '-' : ''}${km}+${String(m).padStart(3, '0')}`
}

/** what was typed → decimal km (null when empty) */
export function chainParse(typed: string): number | null {
  const t = latin(typed).trim()
  if (!t) return null
  const sep = t.match(/[+/]/)
  if (sep) {
    const [a, b] = t.split(/[+/]/, 2)
    const km = Number(a.replace(/\D/g, '') || '0'), m = Number(b.replace(/\D/g, '').slice(0, 3) || '0')
    return km + m / 1000
  }
  if (/[.٫]/.test(t)) { const x = Number(t.replace('٫', '.').replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : null }
  const digits = t.replace(/\D/g, '')
  return digits ? Number(digits) / 1000 : null
}

/** the field while typing: metres typed so far shown with the «+» in place (25100 → 25+100; up to 3 digits stay as typed) */
export function chainLive(typed: string): string {
  const t = latin(typed)
  if (/[+/.٫]/.test(t)) return t
  const d = t.replace(/\D/g, '')
  return d.length > 3 ? `${d.slice(0, -3)}+${d.slice(-3)}` : d
}
