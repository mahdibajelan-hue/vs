import assert from 'node:assert/strict'
import { applyFilter, counts, dueIn, rank, EMPTY_FILTER } from './model.ts'

const mk = (key, over = {}) => ({ key, source: 'execution', kind: 'review', projectId: 'p', projectName: 'پروژه ۱', title: 'گزارش ' + key, sub: '', due: null, since: '2026-01-01T00:00:00Z', urgent: false, refId: key, extra: {}, ...over })
const items = [
  mk('a', { since: '2026-01-05T00:00:00Z' }),
  mk('b', { urgent: true, source: 'material', kind: 'sign', projectName: 'پروژه ۲' }),
  mk('c', { due: '2026-02-10', kind: 'task', source: 'issues' }),
  mk('d', { due: '2026-02-01', kind: 'task', source: 'issues' }),
]
// urgent first, then nearest due date, then undated
assert.deepEqual([...items].sort((x, y) => rank(x, y)).map((i) => i.key), ['b', 'd', 'c', 'a'])
// filters
assert.equal(applyFilter(items, { ...EMPTY_FILTER, source: 'issues' }).length, 2)
assert.equal(applyFilter(items, { ...EMPTY_FILTER, group: 'decide' }).map((i) => i.key).sort().join(), 'a,b') // review + sign are decisions
assert.equal(applyFilter(items, { ...EMPTY_FILTER, project: 'پروژه ۲' }).length, 1)
assert.equal(applyFilter(items, { ...EMPTY_FILTER, urgentOnly: true }).length, 1)
assert.equal(applyFilter(items, { ...EMPTY_FILTER, q: 'گزارش c' }).length, 1)
// snoozed items are hidden
assert.equal(applyFilter(items, EMPTY_FILTER, new Set(['a', 'b'])).length, 2)
// counts
const c = counts(items)
assert.equal(c.total, 4); assert.equal(c.urgent, 1); assert.equal(c.byGroup.get('decide'), 2); assert.equal(c.byGroup.get('do'), 2)
// days until due
const now = new Date('2026-03-10T15:00:00').getTime()
assert.equal(dueIn('2026-03-10', now), 0); assert.equal(dueIn('2026-03-13', now), 3); assert.equal(dueIn('2026-03-08', now), -2); assert.equal(dueIn(null, now), null)
console.log('inbox/lib/model: all assertions passed')
