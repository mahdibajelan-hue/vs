import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { parseDocx, parseWordXml } from './docx.ts'
import { buildChunks, articleOf } from './chunk.ts'
import { buildIndex, search, extractFacts, intentOf, readQuery, highlight } from './search.ts'

const P = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
const TC = (t) => `<w:tc><w:tcPr/>${P(t)}</w:tc>`
const TR = (...c) => `<w:tr>${c.map(TC).join('')}</w:tr>`
const wrap = (body) => `<?xml version="1.0"?><w:document xmlns:w="x" xmlns:r="y" xmlns:mc="z"><w:body>${body}</w:body></w:document>`

// --- a table of contents in a content control, then the real articles (with an empty self-closing paragraph and a text box)
const toc = `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent>${P('فهرست مطالب')}${P('ماده 29- تعدیل آحاد بها\t12', 'TOC1')}${P('ماده 49- تغییر در کارها\t20', 'TOC1')}</w:sdtContent></w:sdt>`
const body = [
  P('شرایط عمومی پیمان', 'Title'), toc,
  P('فصل 8: تغییر در کارها'),
  P('ماده 49- تغییر در کارها'), '<w:p/>',
  P('49-1- کارفرما می‌تواند در مدت پیمان مقادیر کارها را تا بیست و پنج درصد افزایش یا کاهش دهد و پیمانکار موظف به اجرای آن است.'),
  P('49-2- برای کارهای جدید که در فهرست بها قیمت ندارند، قیمت جدید با توافق طرفین تعیین می‌شود.'),
  P('فصل 10: پرداخت‌ها'),
  P('ماده 29- تعدیل آحاد بها'),
  P('29-1- مبلغ پیمان بر اساس شاخص‌های قیمت اعلام‌شده از سوی سازمان برنامه و بودجه تعدیل می‌شود.'),
  P('ماده 30- پیش‌پرداخت'),
  P('30-1- پیش‌پرداخت معادل ده درصد مبلغ پیمان در برابر تضمین پیش‌پرداخت پرداخت می‌شود.'),
  P('ماده 5- تجهیز کارگاه'),
  P('5-1- پیمانکار موظف است ظرف 30 روز از تاریخ تحویل زمین، کارگاه را تجهیز نماید. کار تجهیز کارگاه با هزینه پیمانکار است.'),
  P('ماده 12- مسئولیت‌های پیمانکار'),
  P('12-1- پیمانکار مسئول کیفیت کار و رعایت قیمت‌های پیشنهادی خود و انجام کار طبق نقشه است.'),
  P('12-2- هر نوع کار باید طبق برنامه زمانی و با کیفیت انجام شود و قیمت کالا مطابق پیشنهاد است.'),
  P('ماده 70- فسخ پیمان'),
  `<w:p><w:r><w:t>70-1- در صورت تأخیر بیش از 60 روز، کارفرما حق فسخ پیمان را دارد.</w:t></w:r><w:r><mc:AlternateContent><mc:Choice><w:drawing><w:txbxContent>${P('یادداشت کادر: فسخ با اخطار کتبی است.')}</w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent>${P('یادداشت کادر: فسخ با اخطار کتبی است.')}</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`,
  `<w:tbl>${TR('ردیف', 'شرح تجهیز', 'قیمت واحد (ریال)')}${TR('1', 'شیر توپی ۴۸ اینچ', '۱۸٬۵۰۰٬۰۰۰٬۰۰۰')}${TR('2', 'کمپرسور گاز', '۹۲٬۰۰۰٬۰۰۰٬۰۰۰')}</w:tbl>`,
  '<w:altChunk r:id="rIdAlt"/>',
].join('')
const inner = new JSZip()
inner.file('word/document.xml', wrap(P('ماده 77- قوانین حاکم') + P('77-1- این پیمان تابع قوانین جمهوری اسلامی ایران است و اختلافات از طریق داوری حل می‌شود.')))
const zip = new JSZip()
zip.file('[Content_Types].xml', '<Types/>')
zip.file('word/document.xml', wrap(body))
zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rIdAlt" Type="aFChunk" Target="afchunk.docx"/></Relationships>')
zip.file('word/afchunk.docx', await inner.generateAsync({ type: 'uint8array' }))
const buf = await zip.generateAsync({ type: 'uint8array' })

const report = { paragraphs: 0, tables: 0, tocSkipped: 0, embedded: 0, chars: 0 }
const blocks = await parseDocx(buf, report)
const texts = blocks.filter((b) => b.type === 'p').map((b) => b.text)
assert.ok(report.tocSkipped >= 2, 'TOC lines skipped')
assert.ok(!texts.some((t) => /\t|20$/.test(t) && t.includes('تغییر در کارها') && t.length < 30 && t.endsWith('20')), 'no TOC page-number lines')
assert.equal(texts.filter((t) => t.includes('یادداشت کادر')).length, 1, 'text box read once (fallback skipped)')
assert.ok(texts.some((t) => t.includes('تابع قوانین')), 'embedded altChunk docx read')
assert.ok(texts.some((t) => t.includes('بیست و پنج درصد')), 'article body kept')
// self-closing empty paragraph does not swallow the following ones
assert.ok(parseWordXml(wrap(P('الف') + '<w:p/>' + P('ب'))).filter((b) => b.type === 'p').length === 2)

const chunks = buildChunks(blocks)
const c491 = chunks.find((c) => c.clauseNo === '49-1')
assert.ok(c491 && /ماده 49/.test(c491.path) && /فصل 8/.test(c491.path), 'clause path has chapter and article: ' + c491?.path)
assert.equal(articleOf(c491.path), 'ماده 49 تغییر در کارها')
const ix = buildIndex(chunks.map((chunk) => ({ docId: 'd', chunk })))

// concepts are read from the question as whole phrases
assert.deepEqual(readQuery('تعدیل قیمت و کار اضافی').concepts, ['adjust', 'extra'])
const r = search(ix, 'تعدیل قیمت و کار اضافی')
const allHits = r.groups.flatMap((g) => g.hits.map((h) => h.chunk.clauseNo))
assert.ok(allHits.includes('29-1'), 'adjustment clause found')
assert.ok(allHits.includes('49-1'), 'extra-work clause found: ' + JSON.stringify(allHits))
assert.ok(!allHits.includes('12-1') && !allHits.includes('12-2'), 'clauses that only say «کار» or «قیمت» are not returned: ' + JSON.stringify(allHits))
assert.ok(r.groups.some((g) => g.title.includes('تعدیل')) && r.groups.some((g) => g.title.includes('کار اضافی')), 'grouped by concept')

const mob = search(ix, 'مهلت تجهیز کارگاه چند روز است؟')
assert.equal(mob.hits[0].chunk.clauseNo, '5-1')
assert.ok(extractFacts(mob).some((f) => /30/.test(f.value)), 'extracts 30 days')
assert.match(search(ix, 'شرایط فسخ پیمان').hits[0].chunk.path, /ماده 70/)
const price = search(ix, 'قیمت کمپرسور')
assert.equal(price.hits[0].chunk.kind, 'row'); assert.match(price.hits[0].chunk.text, /کمپرسور/)
assert.ok(extractFacts(price).some((f) => /92/.test(f.value)), 'price fact from table row')
assert.match(search(ix, 'داوری').hits[0].chunk.text, /داوری/)
assert.match(search(ix, 'درصد پیش پرداخت').hits[0].chunk.path, /ماده 30/)
assert.equal(search(ix, 'رنگ آمیزی ساختمان اداری').hits.length, 0)
assert.equal(intentOf('چند ریال'), 'amount')
// highlighting marks the phrase, also in its plural form
const hl = highlight('مقادیر کارهای اضافی را تعدیل کنید', ['کار اضافی', 'تعدیل'])
assert.ok(hl.some(([t, m]) => m && t.includes('کارهای اضافی')) && hl.some(([t, m]) => m && t === 'تعدیل'), JSON.stringify(hl))
console.log('contract docs: all assertions passed')
