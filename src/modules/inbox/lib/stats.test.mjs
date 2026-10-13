import assert from 'node:assert/strict'
import { ageOf, bucketOf, computeStats, mood } from './stats.ts'

const now = new Date('2026-03-10T12:00:00').getTime()
const mk = (key, o = {}) => ({ key, source: 'execution', kind: 'review', projectId: null, projectName: '', title: key, sub: '', due: null, since: '2026-03-10T08:00:00', urgent: false, refId: key, extra: {}, ...o })
assert.equal(bucketOf('2026-03-08', now), 'overdue'); assert.equal(bucketOf('2026-03-10', now), 'today'); assert.equal(bucketOf('2026-03-12', now), 'soon')
assert.equal(bucketOf('2026-03-16', now), 'week'); assert.equal(bucketOf('2026-04-01', now), 'later'); assert.equal(bucketOf(null, now), 'none')
assert.equal(ageOf('2026-03-10T01:00:00', now), 'fresh'); assert.equal(ageOf('2026-03-08T00:00:00', now), 'days'); assert.equal(ageOf('2026-03-01T00:00:00', now), 'old')
const s = computeStats([mk('a', { urgent: true, due: '2026-03-01' }), mk('b', { source: 'material', kind: 'sign', due: '2026-03-10' }), mk('c', { source: 'material', kind: 'task' === 'x' ? 'sign' : 'discrepancy' })], now)
assert.equal(s.total, 3); assert.equal(s.urgent, 1); assert.deepEqual(s.bySource.map((x) => x[0]), ['material', 'execution'])
assert.equal(s.byGroup.decide, 2); assert.equal(s.byGroup.do, 1); assert.equal(s.byBucket.overdue, 1); assert.equal(s.byBucket.today, 1); assert.equal(s.byBucket.none, 1)
assert.equal(s.health, 67); assert.equal(computeStats([]).health, 100)
assert.equal(mood({ total: 0, urgent: 0 }).face, '🥳'); assert.equal(mood({ total: 5, urgent: 12 }).face, '😰')
console.log('inbox/lib/stats: all assertions passed')
