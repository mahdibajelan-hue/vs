/**
 * Electronic signatures of the test minutes and coating records. A signature records who signed (name and account),
 * in which role, when, and a fingerprint of the record's content at that moment (the record without its signatures).
 * If the record changes after signing, the fingerprint no longer matches and the signature shows as void until signed
 * again. The fingerprint is a 53-bit content hash for detecting change — it is not a certificate-based (PKI) signature.
 */
export interface Sign { role: string; name: string; email: string; at: string; fp: string }
export interface SignRole { k: string; label: string }

export const SIGN_ROLES = {
  permit: [{ k: 'contractor', label: 'نمایندهٔ پیمانکار' }, { k: 'consultant', label: 'نمایندهٔ مشاور' }, { k: 'employer', label: 'نمایندهٔ کارفرما' }, { k: 'inspection', label: 'نمایندهٔ امور بازرسی فنی' }],
  hydro: [{ k: 'consultant', label: 'رئیس دستگاه نظارت (مشاور)' }, { k: 'executor', label: 'مسئول اجرای آزمایش هیدرواستاتیک' }, { k: 'site', label: 'رئیس کارگاه پیمانکار' }],
  coating: [{ k: 'site', label: 'رئیس کارگاه پیمانکار' }, { k: 'qc', label: 'مسئول کنترل کیفی پیمانکار' }, { k: 'supervisor', label: 'سرپرست دستگاه نظارت' }, { k: 'resident', label: 'ناظر مقیم مشاور' }],
} satisfies Record<string, SignRole[]>

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
/** cyrb53 — a fast 53-bit string hash */
function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
/** the content fingerprint of a record (its signatures and free-text note excluded), with the extra context (e.g. the result) */
export function fingerprint(data: Record<string, unknown>, ctx = ''): string {
  const { signs: _s, ...rest } = data
  return cyrb53(stable(rest) + '|' + ctx).toString(36).toUpperCase().padStart(11, '0')
}
export const signsOf = (data: Record<string, unknown>): Record<string, Sign> => (data.signs && typeof data.signs === 'object' ? (data.signs as Record<string, Sign>) : {})
export const signValid = (s: Sign, data: Record<string, unknown>, ctx = '') => s.fp === fingerprint(data, ctx)
export function withSign(data: Record<string, unknown>, role: string, who: { name: string; email: string }, at: string, ctx = '') {
  return { ...data, signs: { ...signsOf(data), [role]: { role, name: who.name, email: who.email, at, fp: fingerprint(data, ctx) } } }
}
export function withoutSign(data: Record<string, unknown>, role: string) {
  const s = { ...signsOf(data) }; delete s[role]; return { ...data, signs: s }
}
/** signature block for the printed forms: each role with its electronic signature (or an empty box) */
export function signTableHtml(roles: SignRole[], data: Record<string, unknown>, ctx: string, fmt: (iso: string) => string) {
  const s = signsOf(data)
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const cell = (r: SignRole) => {
    const x = s[r.k]
    if (!x) return '<td></td>'
    const ok = signValid(x, data, ctx)
    return `<td class="es ${ok ? 'es-ok' : 'es-void'}"><b>${esc(x.name || x.email)}</b><br><small>امضای الکترونیک — ${esc(fmt(x.at))}</small><br><small dir="ltr">${ok ? `code ${x.fp}` : 'باطل: فرم پس از امضا تغییر کرده است'}</small></td>`
  }
  return `<table class="sg"><tr>${roles.map((r) => `<td>${r.label}<br><small>نام و امضاء</small></td>`).join('')}</tr><tr class="sp">${roles.map(cell).join('')}</tr></table>`
}
export const ESIGN_PRINT_CSS = '.sg .es{text-align:center;vertical-align:middle;font-weight:400;line-height:1.5}.sg .es b{font-size:11.5px}.sg .es small{font-size:9px;color:#475569}.sg .es-ok{background:#f0fdf4!important;border:1.5px solid #16a34a}.sg .es-void{background:#fef2f2!important;color:#991b1b}'
