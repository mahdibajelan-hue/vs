import assert from 'node:assert/strict'
import { criticalOverdue, issueKpi, monthEnds, pressureOrder, sharedCategories, signalOf } from './issueKpiCore.ts'

const today = '2026-10-28'
const iss = (o) => ({ id: Math.random().toString(36), projectId: 'p', title: 't', description: '', pursuerId: null, approverId: null, priority: 'medium', deadlineDays: 0, deadlineDate: '2026-12-01', actionDate: null, status: 'open', closedAt: null, createdBy: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '', source: 'manual', relatedActionId: null, ...o })
const list = [
  iss({ priority: 'critical', deadlineDate: '2026-10-10', createdAt: '2026-09-01T00:00:00Z' }),           // open overdue critical, age 57
  iss({ priority: 'high', deadlineDate: '2026-11-30', createdAt: '2026-10-20T00:00:00Z', blockedSince: '2026-10-25', extensionCount: 1 }), // open, age 8
  iss({ status: 'approved', closedAt: '2026-10-15', createdAt: '2026-10-05T00:00:00Z', deadlineDate: '2026-10-20', rootCauseConfirmed: true, category: 'مجوز' }), // closed on time in 10 d
  iss({ status: 'approved', closedAt: '2026-10-25', createdAt: '2026-09-25T00:00:00Z', deadlineDate: '2026-10-20', reopenCount: 1, category: 'مجوز' }),         // closed late in 30 d
  iss({ status: 'rejected', createdAt: '2026-10-02T00:00:00Z' }),
]
const k = issueKpi(list, today)
assert.equal(k.total, 5); assert.equal(k.backlog, 2); assert.equal(k.critical, 1); assert.equal(k.high, 1)
assert.equal(k.overdue, 1); assert.equal(k.overdueRate, 0.5)
assert.equal(k.medianAge, Math.round((57 + 8) / 2))
assert.equal(k.mttr, 20) // median of 10 and 30
assert.equal(k.onTimeRate, 0.5)
assert.equal(k.blocked, 1); assert.equal(k.reopenRate, 0.5); assert.equal(k.extendedRate, 0.5); assert.equal(k.rootCauseRate, 0.5)
// opened in the last 30 days: 10-20, 10-05, 10-02 (rejected counts as inflow) = 3; closed 30d = 2
assert.equal(k.opened30, 3); assert.equal(k.closed30, 2); assert.ok(Math.abs(k.flowRatio - 2 / 3) < 1e-9)
assert.equal(k.trend.length, 6); assert.equal(k.trend.at(-1).open, 2)
assert.equal(k.categories.find((c) => c.key === 'مجوز').count, 2)
// empty input: no invented values
const e = issueKpi([], today)
assert.equal(e.overdueRate, null); assert.equal(e.mttr, null); assert.equal(e.flowRatio, null)

assert.equal(signalOf('overdueRate', 0.5), 'bad'); assert.equal(signalOf('overdueRate', 0.2), 'watch'); assert.equal(signalOf('overdueRate', 0.05), 'good')
assert.equal(signalOf('flowRatio', 0.5), 'bad'); assert.equal(signalOf('flowRatio', 0.9), 'watch'); assert.equal(signalOf('flowRatio', 1.2), 'good')
assert.equal(signalOf('onTimeRate', null), 'none')

assert.equal(criticalOverdue(list, today), 1)
const sh = sharedCategories([{ projectId: 'a', name: 'A', issues: list }, { projectId: 'b', name: 'B', issues: [iss({ category: 'مجوز' })] }])
assert.deepEqual(sh[0].projects, ['A', 'B']); assert.equal(sh[0].open, 1)
assert.deepEqual(pressureOrder([{ id: 1, criticalOverdue: 0, kpi: { overdue: 5, backlog: 9 } }, { id: 2, criticalOverdue: 1, kpi: { overdue: 1, backlog: 1 } }]).map((x) => x.id), [2, 1])
assert.deepEqual(monthEnds('2026-10-28', 3), ['2026-08-31', '2026-09-30', '2026-10-28'])
console.log('issueKpiCore ok')

// a close date before the identified date is left out of the resolution median and counted
const bad = issueKpi([...list, iss({ status: 'approved', closedAt: '2026-08-01', createdAt: '2026-10-10T00:00:00Z' })], today)
assert.equal(bad.mttr, 20); assert.equal(bad.badDates, 1)
