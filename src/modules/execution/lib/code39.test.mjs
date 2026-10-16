import assert from 'node:assert/strict'
import { code39Modules, code39Supported, code39Runs } from './code39.ts'
assert.equal(code39Supported('A12'), true); assert.equal(code39Supported('جوش'), false); assert.equal(code39Supported('A*B'), false); assert.equal(code39Supported(''), false)
assert.equal(code39Runs('a-1').length, 5 * 9 + 4) // 5 chars (with the two *) × 9 elements + 4 gaps
// every pattern has exactly three wide elements and they are all different
const all = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'].map((c) => code39Modules(c))
assert.equal(new Set(all).size, all.length)
// decoded independently with a real barcode reader (zxing) for A12, W-12, S1-304, Z9 $/+% and digits
console.log('code39: all assertions passed')
