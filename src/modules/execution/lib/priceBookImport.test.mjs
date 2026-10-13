import assert from 'node:assert/strict'
import { parsePriceWorkbook, weightsByValue, chapterNumber } from './priceBookImport.ts'

// layout A with stacked chapters, a star column, a surcharge and a printed chapter total
const A = { name: 'مالی', rows: [
  [null, 'فهرست بهای واحد پایه رشته ابنیه سال 1403'],
  [null, 'ردیف', '*', 'کد فهرست', 'شرح کامل', 'واحد', 'بهـاي واحد', 'مقدار', 'جمـع به ريال', 'توضیحات'],
  [null, '3- عملیات خاکی با ماشین'],
  [null, 1, null, '030103', 'کندن زمین', 'مترمکعب', 100, 10, 1000],
  [null, 2, null, '030202', 'اضافه بها به ردیف 030103 برای سنگ', 'مترمکعب', 50, 10, 500, '50 % ردیف 030103'],
  [null, 3, '*', '030504', 'چکش', 'مترمکعب', 20, 5, 100],
  [null, null, null, null, null, null, 'جمع فصل به ريال :', null, 1600],
  [null, '4- بتن'],
  [null, 1, null, '040101', 'بتن', 'مترمکعب', 10, 3, 30],
  [null, null, null, null, null, null, 'جمع فصل به ريال :', null, 99],
] }
const a = parsePriceWorkbook([A], 'x-1403.xlsx')
assert.equal(a.year, 1403); assert.equal(a.rows.length, 4); assert.equal(a.items.length, 4)
assert.equal(a.chapters.length, 2); assert.ok(a.chapters[0].ok); assert.ok(!a.chapters[1].ok) // the second total is wrong on purpose
assert.ok(a.warnings.some((w) => w.includes('بتن')))
assert.equal(a.rows[1].parentItemNo, '030103'); assert.equal(a.rows[1].surchargePct, 50)
assert.ok(a.rows[2].starred); assert.equal(a.rows[0].chapterNo, '3')

// layout B: one item code, several size ranges, repeated chapter lines
const B = { name: 'Sheet1', rows: [
  ['فصل بیست و یکم - برق'], ['کد', 'گروه'], ['ELCW01', 'کابل'], ['592105'], ['ردیف', 'دامنه وزنی /اندازه', null, null, 'واحد', 'بهای واحد', 'مقدار', 'بهای کل'],
  [1, '140<S<=190MM2', null, null, 'متر', 10, 100, 1000], [2, '64<S<=100MM2', null, null, 'متر', 5, 60, 300],
  ['فصل بیست و یکم - برق'], ['کد', 'گروه'], ['ELCW02', 'کابل ۲'], ['592106'], ['ردیف', 'دامنه وزنی /اندازه', null, null, 'واحد', 'بهای واحد', 'مقدار', 'بهای کل'],
  [1, 'S<=16MM2', null, null, 'متر', 2, 50, 100], ['جمع فصل ', null, null, null, null, null, null, 1400],
] }
const b = parsePriceWorkbook([B])
assert.equal(b.rows.length, 3); assert.equal(b.chapters.length, 1); assert.ok(b.chapters[0].ok)
assert.equal(b.rows[0].itemNo, '592105'); assert.equal(b.rows[0].spec, '140<S<=190MM2'); assert.equal(b.items.length, 3)

// layout C: starred rows are the ones summed in the «جمع آیتم های ستاره دار» formula
const C = { name: 'pipe', rows: [
  [null, ':فصل اول', 'ریسه'], ['ردیف', 'کد فهرست', 'شرح', 'واحد', 'بهای واحد', 'مقدار', 'بهای کل'],
  [1, '510101026', 'ریسه لوله 56 اینچ', 'متر', 100, 10, 1000], [2, '510101027', 'اضافه بها به ردیف 510101026', 'متر', 7, 10, 70],
  ['جمع فهرست بها', null, null, null, null, null, 1000], ['جمع آیتم های ستاره دار', null, null, null, null, null, 70], ['جمع فصل ', null, null, null, null, null, 1070],
], formulas: [[], [], [], [], [], [null, null, null, null, null, null, '=G4'], []] }
const c = parsePriceWorkbook([C])
assert.deepEqual(c.rows.map((r) => r.starred), [false, true]); assert.ok(c.chapters[0].ok); assert.equal(c.chapters[0].starredFile, 70); assert.equal(c.rows[1].surchargePct, 7)

// weights: value-proportional, exactly 100
const w = weightsByValue([1, 1, 1]); assert.equal(Math.round(w.reduce((x, y) => x + y, 0) * 100) / 100, 100)
assert.deepEqual(weightsByValue([3, 1]), [75, 25]); assert.deepEqual(weightsByValue([0, 0]), [0, 0])
assert.equal(chapterNumber('فصل بیست و یکم - برق'), '21'); assert.equal(chapterNumber('12- بتن'), '12'); assert.equal(chapterNumber('فصل دوم'), '2')
console.log('priceBookImport ok')
