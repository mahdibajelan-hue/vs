import assert from 'node:assert/strict'
import { buildProfile, fillPatch } from './weldProfile.ts'
const lines = [
  { formKey: 'fitup', date: '2026-01-01', detail: { pipeNo: 'P1', sizeIn: 48, thkIn: 0.5, lengthM: 11.5, bendDeg: '' } },
  { formKey: 'welding', date: '2026-01-03', detail: { pipeNo: 'P1-B', thkIn: 0.5 } },
  { formKey: 'rt_report', date: '2026-01-05', detail: { odIn: 48, thkIn: 0.6, lengthM: 99 } },
]
const p = buildProfile(lines)
assert.equal(p.pipe.value, 'P1-B'); assert.equal(p.pipe.from, 'welding') // the later record wins
assert.equal(p.thk.value, '0.6'); assert.equal(p.size.value, '48')
assert.equal(p.length.value, '11.5') // joint length only from joint forms, never from an RT report
assert.equal(p.bend, undefined)
const cols = new Set(['sec', 'weldNo', 'odIn', 'thkIn', 'result'])
assert.deepEqual(fillPatch('rt_report', cols, { thkIn: 0.7 }, p), { odIn: '48' }) // thkIn already typed → kept; pipe/length not in this form
assert.deepEqual(fillPatch('rt_report', cols, { odIn: 0 }, p), { odIn: '48', thkIn: '0.6' })
assert.deepEqual(fillPatch('welding', new Set(['pipeNo', 'lengthM']), { pipeNo: 'X' }, p), { lengthM: '11.5' })
console.log('weldProfile ok')
