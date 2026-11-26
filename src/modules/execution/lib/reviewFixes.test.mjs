import assert from 'node:assert/strict'
import { byPath, fixItems, fixPath, sameValue } from './reviewFixes.ts'

assert.ok(sameValue(5, '5'))
assert.ok(sameValue('5.0', 5))
assert.ok(sameValue(' a ', 'a'))
assert.ok(!sameValue('', 0))
assert.ok(!sameValue(-20, -15))
assert.equal(fixPath.res('r1', 'active_qty'), 'res:r1:active_qty')
assert.equal(fixPath.cell('l1', 'weldNo'), 'line:l1:d:weldNo')

const cur = { 'data:tempMin': -20, 'data:humidity': 30, 'res:r1:active_qty': 3 }
const get = (p) => cur[p]
// a new correction
assert.deepEqual(fixItems({ 'data:tempMin': { value: -15, label: 'دمای کمینه' } }, get, new Map()), [{ path: 'data:tempMin', value: -15, label: 'دمای کمینه' }])
// a draft equal to the contractor's figure and no earlier correction: nothing to send
assert.deepEqual(fixItems({ 'data:humidity': { value: '30', label: 'رطوبت' } }, get, new Map()), [])
// an earlier correction (contractor 3 → 2; the report now carries 2): back to 3 withdraws it, 2 again is unchanged
const fixes = byPath([{ id: 'f', reportId: 'x', path: 'res:r1:active_qty', label: 'فعال', was: 3, value: 2, note: '', fixedBy: null, fixedByName: '', fixedAt: '' }])
const cur2 = (p) => (p === 'res:r1:active_qty' ? 2 : cur[p])
assert.deepEqual(fixItems({ 'res:r1:active_qty': { value: 3, label: 'فعال' } }, cur2, fixes), [{ path: 'res:r1:active_qty', value: null, label: 'فعال' }])
assert.deepEqual(fixItems({ 'res:r1:active_qty': { value: 2, label: 'فعال' } }, cur2, fixes), [])
assert.deepEqual(fixItems({ 'res:r1:active_qty': { value: 1, label: 'فعال' } }, cur2, fixes), [{ path: 'res:r1:active_qty', value: 1, label: 'فعال' }])
console.log('reviewFixes ok')
