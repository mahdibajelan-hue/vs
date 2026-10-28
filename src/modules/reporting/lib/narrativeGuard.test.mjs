import assert from 'node:assert/strict'
import { guardNarrative, normaliseDigits, numbersIn } from './narrativeGuard.ts'

assert.equal(normaliseDigits('۱۲٫۵ و ۱٬۴۰۵'), '12.5 و 1405')
assert.deepEqual(numbersIn('SPI ۰٫۸۰ در ۱۴۰۵/۰۸/۰۶'), ['0.8', '1405', '8', '6'])

const items = [
  { id: 'f-spi', text: 'شاخص عملکرد زمانی: SPI برابر ۰٫۸ است. [SPI ۰٫۸]' },
  { id: 'f-delay', text: 'توقف: ۱۳۰ ساعت توقف ثبت شده است' },
  { id: 'r-x', text: 'اقدام: تعیین تکلیف مسئلهٔ «IFC»' },
]
const r = guardNarrative([
  { text: 'پروژه با SPI برابر ۰٫۸ از برنامه عقب است.', refs: ['f-spi'] },
  { text: 'توقف ۱۳۰ ساعته دلیل اصلی است.', refs: ['f-delay'] },
  { text: 'SPI برابر ۰٫۷ است.', refs: ['f-spi'] },              // number not in the cited item
  { text: 'پروژه عقب است.', refs: [] },                          // no reference
  { text: 'پروژه عقب است.', refs: ['f-unknown'] },               // unknown id
  { text: 'تأخیر قطعاً به‌خاطر توقف است.', refs: ['f-delay'] },   // over-claim
  { text: 'SPI ۰٫۸ و ۱۳۰ ساعت توقف.', refs: ['f-spi'] },          // 130 not in the cited item
  { text: 'SPI ۰٫۸ و ۱۳۰ ساعت توقف.', refs: ['f-spi', 'f-delay'] },
  { text: '', refs: ['f-spi'] },
], items)
assert.equal(r.accepted.length, 3)
assert.equal(r.rejected.length, 5)
assert.ok(r.rejected.some((x) => x.reason.includes('عدد')))
assert.ok(r.rejected.some((x) => x.reason.includes('قطعیت')))
assert.ok(r.rejected.some((x) => x.reason.includes('ناموجود')))
assert.ok(guardNarrative([{ text: 'x'.repeat(400), refs: ['f-spi'] }], items).rejected[0].reason.includes('طولانی'))
console.log('narrativeGuard ok')
