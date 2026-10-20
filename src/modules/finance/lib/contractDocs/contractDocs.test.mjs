import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { parseDocx } from './docx.ts'
import { buildChunks } from './chunk.ts'
import { buildIndex, search, extractFacts, intentOf } from './search.ts'

const P = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
const TC = (t) => `<w:tc><w:tcPr/>${P(t)}</w:tc>`
const TR = (...c) => `<w:tr>${c.map(TC).join('')}</w:tr>`
const body = [
  P('قرارداد احداث خط لوله گاز', 'Title'),
  P('ماده ۱- موضوع قرارداد'),
  P('موضوع قرارداد عبارت است از طراحی، تهیه کالا و اجرای خط لوله ۴۸ اینچ.'),
  P('ماده ۵- مهلت تجهیز کارگاه'),
  P('پیمانکار موظف است ظرف ۳۰ (سی) روز از تاریخ مبادله قرارداد، کارگاه را تجهیز و برپا نماید.'),
  P('ماده ۱۲- فسخ قرارداد'),
  P('۱۲-۱- کارفرما می‌تواند در صورت تأخیر بیش از ۶۰ روز پیمانکار در شروع عملیات، قرارداد را فسخ نماید.'),
  P('۱۲-۲- در صورت فسخ، تضمین حسن انجام کار به نفع کارفرما ضبط می‌شود.'),
  P('ماده ۷- مبلغ قرارداد'),
  P('مبلغ کل قرارداد ۲٬۴۰۰٬۰۰۰٬۰۰۰٬۰۰۰ ریال می‌باشد و جریمه تأخیر روزانه ۰٫۵ درصد مبلغ قرارداد است.'),
  `<w:tbl>${TR('ردیف', 'شرح تجهیز', 'قیمت واحد (ریال)')}${TR('۱', 'شیر توپی ۴۸ اینچ', '۱۸٬۵۰۰٬۰۰۰٬۰۰۰')}${TR('۲', 'کمپرسور گاز', '۹۲٬۰۰۰٬۰۰۰٬۰۰۰')}</w:tbl>`,
  P('ماده ۹- حل اختلاف'),
  P('اختلافات از طریق داوری حل و فصل می‌شود.'),
].join('')
const zip = new JSZip()
zip.file('[Content_Types].xml', '<Types/>')
zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`)
const buf = await zip.generateAsync({ type: 'uint8array' })

const blocks = await parseDocx(buf)
assert.equal(blocks.filter((b) => b.type === 'table').length, 1)
assert.equal(blocks.find((b) => b.type === 'table').rows.length, 3)
const chunks = buildChunks(blocks)
assert.ok(chunks.some((c) => c.clauseNo === '12-1' && /ماده 12/.test(c.path)), 'clause 12-1 under article 12: ' + JSON.stringify(chunks.map((c) => c.path)))
assert.ok(chunks.filter((c) => c.kind === 'row').length === 2, 'table rows chunked')
assert.ok(chunks.find((c) => c.kind === 'row').text.includes('قیمت واحد (ریال): '), 'row keeps column title')
const ix = buildIndex(chunks.map((chunk) => ({ docId: 'd', chunk })))

const top = (q) => search(ix, q).hits[0]
assert.match(top('بندهای مربوط به فسخ قرارداد').chunk.path, /ماده 12/)
const mob = search(ix, 'مهلت تجهیز کارگاه چند روز است؟')
assert.match(mob.hits[0].chunk.text, /تجهیز/)
assert.equal(mob.intent, 'duration')
const facts = extractFacts(mob.hits, mob.terms, mob.intent)
assert.ok(facts.some((f) => /30/.test(f.value)), 'extracts 30 days: ' + JSON.stringify(facts.map((f) => f.value)))
const price = search(ix, 'قیمت کمپرسور')
assert.match(price.hits[0].chunk.text, /کمپرسور/)
assert.equal(price.hits[0].chunk.kind, 'row')
assert.ok(extractFacts(price.hits, price.terms, price.intent).some((f) => /92/.test(f.value)), 'price fact from table row')
const total = search(ix, 'مبلغ کل قرارداد چقدر است')
assert.match(total.hits[0].chunk.text, /ریال/)
const pen = search(ix, 'جریمه تاخیر چقدر است')
assert.match(pen.hits[0].chunk.text, /درصد/)
assert.equal(search(ix, 'رنگ آمیزی ساختمان اداری').hits.length === 0 || search(ix, 'رنگ آمیزی ساختمان اداری').hits[0].score <= 1, true)
assert.equal(intentOf('چند ریال'), 'amount')
console.log('contract docs: all assertions passed')
