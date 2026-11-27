import assert from 'node:assert/strict'
import { metricSource } from './radarMetric.ts'

assert.deepEqual(metricSource('کنترل زمان', 0, '2026-11-26'), {
  source: 'کنترل زمان', state: 'ready', asOf: '2026-11-26', readAt: undefined,
})
assert.equal(metricSource('کنترل زمان', null, null).state, 'empty')
assert.equal(metricSource('کنترل زمان', null, null, true).state, 'error')
assert.equal(metricSource('ریسک', 0, null, false, '2026-11-26').readAt, '2026-11-26')
