import assert from 'node:assert/strict'
import * as k from './svIntegrity.ts'

const days = Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
// recorded the same evening (19:00 Iran = 15:30 UTC)
const onTime = (day) => `${day}T15:30:00Z`
const row = (day, o = {}) => ({ personId: 'p1', day, status: 'present', checkIn: null, checkOut: null, hours: 8, overtime: 0, breakfast: true, lunch: true, dinner: true, source: 'manual', note: '', lateReason: '', createdAt: onTime(day), ...o })
const fig = { rest: 6, onProject: 30, overtime: 40, overtimeCap: 80 }

// ── entry day is taken in Iran time
assert.equal(k.entryDay('2026-01-05T21:00:00Z'), '2026-01-06', '21:00 UTC is already the next day in Tehran')
assert.equal(k.entryDay('2026-01-05T15:00:00Z'), '2026-01-05')

// ── late rows
assert.equal(k.isLateRow(row('2026-01-05'), 2), false)
assert.equal(k.isLateRow(row('2026-01-05', { createdAt: '2026-01-07T10:00:00Z' }), 2), false, 'inside the 2-day window')
assert.equal(k.isLateRow(row('2026-01-05', { createdAt: '2026-01-08T10:00:00Z' }), 2), true, 'three days later')
assert.equal(k.isLateRow(row('2026-01-05', { lateReason: 'فراموش شده بود' }), 2), true, 'a reason marks it late')
assert.equal(k.isLateRow(row('2026-01-05', { source: 'clock', createdAt: '2026-02-01T10:00:00Z' }), 2), false, 'clock rows are never late')

// ── an honest month: no flags
const honest = days.map((d, i) => row(d, { checkIn: i % 3 ? '07:05' : '06:55', checkOut: i % 4 ? '17:10' : '18:20', status: i % 5 === 4 ? 'rest' : 'present' }))
assert.deepEqual(k.personCheck(honest, fig, 2), { late: 0, flags: [] })
const ph = k.projectCheck(honest, 2)
assert.equal(ph.timelyPct, 100)
assert.equal(ph.bulk, null)
assert.equal(ph.level, 'ok')

// ── the month typed on its last evening, 08:00–18:00 every day, no rest, overtime on the cap
const end = Date.parse('2026-01-30T16:00:00Z')
const faked = days.map((d, i) => row(d, { checkIn: '08:00', checkOut: '18:00', createdAt: new Date(end + i * 10e3).toISOString(), lateReason: i < 27 ? 'ثبت آخر ماه' : '' }))
const pc = k.personCheck(faked, { rest: 0, onProject: 30, overtime: 80, overtimeCap: 80 }, 2)
assert.equal(pc.late, 27)
assert.ok(pc.flags.some((f) => f.includes('با تأخیر')))
assert.ok(pc.flags.some((f) => f.includes('یکسان')))
assert.ok(pc.flags.some((f) => f.includes('استراحت')))
assert.ok(pc.flags.some((f) => f.includes('سقف')))

// three people, all 08:00–18:00, typed together → same-for-all + bulk
const team = ['a', 'b', 'c'].flatMap((p, j) => days.map((d, i) => row(d, { personId: p, checkIn: '08:00', checkOut: '18:00', createdAt: new Date(end + (j * 30 + i) * 5e3).toISOString() })))
const pt = k.projectCheck(team, 2)
assert.equal(pt.sameForAll, 30)
assert.ok(pt.bulk && pt.bulk.count === 90)
assert.ok(pt.timelyPct < 20)
assert.equal(pt.level, 'bad')

// rows without createdAt (old data) are not counted as late or bulk
const legacy = days.map((d) => row(d, { createdAt: undefined }))
assert.equal(k.projectCheck(legacy, 2).timelyPct, 100)

console.log('supervision/lib/svIntegrity: all assertions passed')
