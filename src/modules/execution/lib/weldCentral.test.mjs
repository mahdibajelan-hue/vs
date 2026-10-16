import assert from 'node:assert/strict'
import { attrOfKey, overlayDetail, centralKey } from './weldCentral.ts'
assert.equal(attrOfKey('rt_report', 'odIn'), 'size'); assert.equal(attrOfKey('fitup', 'lengthM'), 'length'); assert.equal(attrOfKey('rt_report', 'lengthM'), null); assert.equal(attrOfKey('welding', 'result'), null)
const d = { sec: '1', weldNo: 'W-1', odIn: '', thkIn: 0.4, result: 'acc' }
const o = overlayDetail('rt_report', d, { size: '48', thk: '0.5', length: '12' })
assert.deepEqual([o.odIn, o.thkIn, o.result], ['48', '0.5', 'acc']); assert.equal(o.lengthM, undefined); assert.equal(d.odIn, '') // original untouched
assert.equal(overlayDetail('rt_report', d, undefined), d)
assert.equal(centralKey(d), '1|W-1'); assert.equal(centralKey({ sec: '1' }), null)
console.log('weldCentral ok')
