import assert from 'node:assert/strict'
import { dayKey, keyOf, monthKey, weekKey } from './periods.ts'
// 2026-11-14 is a Saturday; the week runs to Friday 2026-11-20
assert.equal(weekKey('2026-11-14'), '2026-11-14'); assert.equal(weekKey('2026-11-20'), '2026-11-14'); assert.equal(weekKey('2026-11-21'), '2026-11-21'); assert.equal(weekKey('2026-11-13T10:00:00Z'), '2026-11-07')
assert.equal(dayKey('2026-11-14T08:00:00Z'), '2026-11-14')
assert.equal(monthKey('2026-11-14'), '1405-08'); assert.equal(keyOf('month', '2026-03-21'), '1405-01'); assert.equal(keyOf('month', '2026-03-20'), '1404-12')
console.log('photo periods: ok')
