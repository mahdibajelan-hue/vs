/** Persian text normalisation shared by the chunker and the search engine. */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function normalizeFa(s: string): string {
  let o = ''
  for (const ch of s) {
    const a = FA_DIGITS.indexOf(ch), b = AR_DIGITS.indexOf(ch)
    if (a >= 0) o += String(a); else if (b >= 0) o += String(b)
    else if (ch === 'ي' || ch === 'ى') o += 'ی'
    else if (ch === 'ك') o += 'ک'
    else if (ch === 'ۀ' || ch === 'ة') o += 'ه'
    else if (ch === 'أ' || ch === 'إ' || ch === 'ٱ') o += 'ا'
    else if (ch === 'ؤ') o += 'و'
    else if (ch === 'ئ') o += 'ی'
    else if (ch === '‌' || ch === '‏' || ch === '‎') o += ' '
    else if (ch === 'ـ' || /[ً-ٰٟ]/.test(ch)) continue
    else o += ch
  }
  return o.replace(/،/g, ',').replace(/[٫]/g, '.').replace(/[٬]/g, ',')
}

export const STOP = new Set(('از به در که را با این آن و یا است هست باشد شود شده می برای تا هر کلیه بر خود آیا چه چند چقدر چیست چیه کدام کجا کی چطور چگونه اگر هم نیز یک دو بند ماده مورد موارد طبق مطابق براساس بر اساس طرف طرفین مربوط مربوطه بین های ها ای بود بوده خواهد کند کنند کرد کرده باید نباید میشود می‌شود می‌باشد میباشد').split(/\s+/))

const SUFFIX = ['های', 'ها', 'ات', 'ان', 'ین']
export function stem(t: string): string {
  if (t.length > 4) for (const s of SUFFIX) if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length)
  if (t.length > 4 && t.endsWith('ی')) return t.slice(0, -1)
  return t
}

/** every word, light-stemmed, stop words kept — for matching multi-word phrases such as «تغییر در کارها» */
export function tokenizeAll(s: string): string[] {
  return normalizeFa(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0).map(stem)
}
export function tokenize(s: string): string[] {
  return tokenizeAll(s).filter((t) => (t.length > 1 || /\d/.test(t)) && !STOP.has(t))
}
