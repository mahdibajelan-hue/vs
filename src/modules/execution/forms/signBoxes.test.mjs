import assert from 'node:assert/strict'
import { sheetSignCells, signRoleOf } from './signBoxes.ts'

assert.equal(signRoleOf('تهیه کننده: مسئول دفتر فنی'), 0)
assert.equal(signRoleOf('تایید کننده: سرپرست کارگاه'), 1)
assert.equal(signRoleOf('بررسی کننده: ناظر مرتبط'), 2)
assert.equal(signRoleOf('تاییدکننده: سرپرست نظارت'), 3)
assert.equal(signRoleOf('توضیحات:'), null)
// the bottom of «حمل و ریسه لوله»: four captions on row 38, empty boxes on row 39
const cells = [
  { r: 35, c: 0, v: 'توضیحات:', cs: 12 },
  { r: 37, c: 0, v: 'تهیه کننده: مسئول دفتر فنی', cs: 3 }, { r: 37, c: 3, v: 'تایید کننده: سرپرست کارگاه', cs: 3 },
  { r: 37, c: 6, v: 'بررسی کننده: ناظر مرتبط', cs: 3 }, { r: 37, c: 9, v: 'تاییدکننده: سرپرست نظارت', cs: 3 },
  { r: 38, c: 0, cs: 3 }, { r: 38, c: 3, cs: 3 }, { r: 38, c: 6, cs: 3 }, { r: 38, c: 9, cs: 3 },
]
const tpl = { cols: [], rows: [], styles: [], logos: [], cells }
assert.deepEqual(sheetSignCells(tpl, ['prep', 'appr', 'rev', 'sup']), { A39: 'prep', D39: 'appr', G39: 'rev', J39: 'sup' })
// a sheet with only party boxes (no captions per signer) → {} so the paper prints its own four-box row
assert.deepEqual(sheetSignCells({ ...tpl, cells: [{ r: 41, c: 0, v: 'دستگاه نظارت', cs: 6 }, { r: 41, c: 6, v: 'پیمانکار', cs: 4 }] }, ['prep', 'appr', 'rev', 'sup']), {})
console.log('execution/forms/signBoxes: all assertions passed')
