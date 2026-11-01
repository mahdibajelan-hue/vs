import assert from 'node:assert/strict'
import { todayTehran } from './today.ts'
assert.equal(todayTehran(new Date('2026-11-01T20:44:51Z')), '2026-11-02') // 00:14 in Tehran: already the next day
assert.equal(todayTehran(new Date('2026-11-01T20:29:00Z')), '2026-11-01') // 23:59 in Tehran
assert.equal(todayTehran(new Date('2026-06-15T12:00:00Z')), '2026-06-15')
console.log('lib/today: all assertions passed')
