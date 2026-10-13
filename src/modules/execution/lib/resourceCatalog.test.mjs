import assert from 'node:assert/strict'
import { MAN_CATALOG, blankRes, catalogRows, mergeCatalog, resProblem, resUsed } from './resourceCatalog.ts'

// manpower: active + leave + stopped cannot exceed the total; native + non-native must equal the total when given
const w = { ...blankRes('man', 'ج', 'جوشکار'), totalQty: 10, activeQty: 8, leaveQty: 1, stoppedQty: 1 }
assert.equal(resProblem(w), '')
assert.match(resProblem({ ...w, activeQty: 9 }), /بیشتر/)
assert.match(resProblem({ ...w, nativeQty: 6, nonnativeQty: 3 }), /بومی/)
assert.equal(resProblem({ ...w, nativeQty: 6, nonnativeQty: 4 }), '')
// machinery: active + inactive + stopped + repair <= total
const e = { ...blankRes('equip', 'ج', 'ساید بوم'), totalQty: 4, activeQty: 2, idleQty: 1, repairQty: 1 }
assert.equal(resProblem(e), '')
assert.match(resProblem({ ...e, stoppedQty: 1 }), /بیشتر/)
// merge keeps saved values and extra rows, catalog rows come first
const saved = [{ ...blankRes('man', MAN_CATALOG[0].section, MAN_CATALOG[0].items[0]), totalQty: 1, activeQty: 1 }, { ...blankRes('man', 'قسمت جدید', 'شغل جدید'), totalQty: 2, activeQty: 2 }]
const merged = mergeCatalog(saved)
assert.equal(merged.length, catalogRows().length + 1)
assert.equal(merged[0].totalQty, 1)
assert.equal(merged.at(-1).name, 'شغل جدید')
assert.equal(resUsed(blankRes('man', 'a', 'b')), false)
assert.equal(resUsed({ ...blankRes('equip', 'a', 'b'), repairQty: 1 }), true)
console.log('execution/lib/resourceCatalog: all assertions passed')
