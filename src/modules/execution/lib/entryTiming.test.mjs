import assert from 'node:assert/strict'
import { fmtClock, activeMs, deviceClass, strongest, worthKeeping, median, quantile, summarize, weekOf } from './entryTiming.ts'

// gaps are capped at 30 s: 0 → 10 s → (10 min away) → +5 s = 10 + 30 + 5
assert.equal(activeMs([0, 10_000, 610_000, 615_000]), 45_000)
assert.equal(activeMs([615_000, 0, 10_000, 610_000]), 45_000) // order does not matter
assert.equal(activeMs([5]), 0); assert.equal(activeMs([]), 0)
assert.equal(deviceClass(390, true), 'mobile'); assert.equal(deviceClass(820, true), 'tablet'); assert.equal(deviceClass(820, false), 'desktop'); assert.equal(deviceClass(1440, true), 'desktop')
assert.equal(strongest('closed', 'saved'), 'saved'); assert.equal(strongest('submitted', 'saved'), 'submitted'); assert.equal(strongest('closed', 'closed'), 'closed')
assert.ok(!worthKeeping(3, 0)); assert.ok(worthKeeping(3, 1)); assert.ok(worthKeeping(20, 0))
assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5); assert.equal(median([]), null)
assert.equal(quantile([0, 10], 0.9), 9)

const R = (o) => ({ id: o.id, projectId: 'p', reportId: o.rep ?? null, userId: o.u ?? 'u1', formKey: o.f ?? 'work', outcome: o.out ?? 'saved', newReport: false, startedAt: o.at ?? '2026-11-18T08:00:00Z', endedAt: o.at ?? '2026-11-18T08:10:00Z', activeSec: o.a, wallSec: o.a * 2, edits: o.e ?? 10, lines: o.l ?? 0, device: o.d ?? 'mobile' })
// report r1 entered in two sittings (300 + 200 s, sent in the second) counts once with 500 s; r2 was sent in 400 s;
// r3 was only saved, so it does not enter the median while sent reports exist
const g = summarize([R({ id: 'a', rep: 'r1', a: 300 }), R({ id: 'b', rep: 'r1', a: 200, out: 'submitted', l: 5 }), R({ id: 'c', rep: 'r2', a: 400, out: 'submitted', l: 4, d: 'desktop' }), R({ id: 'd', rep: 'r3', a: 50 })], (r) => r.userId)
assert.equal(g.length, 1)
assert.deepEqual({ s: g[0].sessions, r: g[0].reports, sub: g[0].submitted, med: g[0].medianActiveSec, spl: g[0].secPerLine, mob: g[0].mobileShare }, { s: 4, r: 3, sub: 2, med: 450, spl: 100, mob: 0.75 })
// a group with no sent report falls back to all its reports
assert.equal(summarize([R({ id: 'x', rep: 'q', a: 70 })], () => 'k')[0].medianActiveSec, 70)
// weeks start on Saturday
assert.equal(weekOf('2026-11-20T10:00:00Z'), '2026-11-14') // Friday → the Saturday before
assert.equal(weekOf('2026-11-21T10:00:00Z'), '2026-11-21') // Saturday → itself
assert.equal(fmtClock(558), '۹:۱۸'); assert.equal(fmtClock(65), '۱:۰۵'); assert.equal(fmtClock(null), '—')
console.log('entryTiming ok')
