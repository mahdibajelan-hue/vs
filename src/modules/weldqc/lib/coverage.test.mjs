import assert from 'node:assert/strict'
import { coveredHours, densityIssue, segmentHours } from './coverage.ts'
assert.deepEqual(segmentHours('12-3'), [0, 3]); assert.deepEqual(segmentHours('ساعت ۹ تا ۱۲'), [9, 0]); assert.equal(segmentHours('0-1 A'), null); assert.equal(segmentHours('14-20'), null)
assert.equal(coveredHours(['A', 'B']), null)
assert.deepEqual(coveredHours(['12-3', '3-6', '6-9', '9-12']), { hours: 12, gaps: [] })
const c = coveredHours(['12-3', '6-9']); assert.equal(c.hours, 6); assert.deepEqual(c.gaps, [[3, 6], [9, 12]])
assert.equal(coveredHours(['10-2']).hours, 4)
assert.equal(densityIssue('2.0-3.5'), null); assert.ok(densityIssue('۱٫۵')); assert.ok(densityIssue('2.2–4.3')); assert.equal(densityIssue(''), null)
assert.equal(segmentHours('0-1'), null); assert.equal(coveredHours(['0-1', '1-2', '2-3']), null)
console.log('coverage: ok')
