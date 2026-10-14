import assert from 'node:assert/strict'
import { mcqQuality, bankHealth, longestCorrectShare } from './mcqQuality.ts'
const bad = { stem: 'کدام فعالیت گلوگاه اسپرد است؟', options: ['نصب تابلو', 'تحویل مدارک', 'احیای حریم', 'جوشکاری خط اصلی همراه با کنترل کیفیت و بازرسی تمام جوش‌ها'], correct: 3 }
let r = mcqQuality(bad)
assert.ok(r.flaws.some((f) => f.kind === 'LONGEST_CORRECT') && r.level !== 'OK', 'the long right answer among short ones is flagged')
const good = { stem: 'در بازرسی چشمی جوش، کدام عیب پیش از رادیوگرافی باید رد شود؟', options: ['شکاف سطحی در پاس نهایی با طول بیش از حد مجاز', 'گرده‌جوش یکنواخت با عرض ثابت و ظاهر مناسب', 'پاشش جزئی که با برس پاک شده است', 'رنگ‌پریدگی بدون ترک در منطقهٔ متأثر از حرارت'], correct: 0 }
r = mcqQuality(good)
assert.equal(r.level, 'OK', JSON.stringify(r))
r = mcqQuality({ stem: 'x', options: ['فقط الف', 'فقط ب', 'کار درست با توضیح', 'هرگز انجام نشود'], correct: 2 })
assert.ok(r.flaws.some((f) => f.kind === 'ABSOLUTE_WORDS'))
assert.ok(mcqQuality({ stem: 'x', options: ['الف', 'الف', 'ب', 'ج'], correct: 0 }).flaws.some((f) => f.kind === 'DUPLICATE'))
assert.equal(longestCorrectShare([bad, good]), 0.5)
assert.equal(bankHealth([bad, good]).total, 2)
console.log('mcq quality ok')
