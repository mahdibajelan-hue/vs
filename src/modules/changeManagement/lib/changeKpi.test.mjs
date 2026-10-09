import assert from 'node:assert/strict'
import { cumulativeByContract, dwellByRole, endDateImpact, overdueSteps, stalled, summarize, addDays, dayDiff } from './changeKpi.ts'
import { actionsFor, friendly } from './changeFlow.ts'

const req = (o = {}) => ({ id: 'r' + Math.random(), masterProjectId: 'P1', contractId: 'C1', status: 'approved', changeType: 'additional_work', proposedCost: 100, proposedDays: 0, approvedCost: 100, approvedDays: 0, reasonCategories: [], stageEnteredAt: '2026-05-01T00:00:00Z',
  createdBy: 'u1', submittedBy: 'u1', attempt: 1, approvedAt: '2026-05-02', executedUnderException: false, implementedAsApproved: null, implementationOwnerId: null, ...o })
const step = (o = {}) => ({ id: 's' + Math.random(), requestId: 'r', attempt: 1, status: 'active', roleName: 'مدیرعامل', enteredAt: '2026-05-01T00:00:00Z', dueAt: '2026-05-08T00:00:00Z', decidedAt: null, ...o })

// cumulative per contract: approved and pending separately, thresholds crossed with pending included
const rs = [req({ approvedCost: 600 }), req({ approvedCost: 300 }), req({ status: 'awaiting_approval', proposedCost: 200, approvedCost: null }), req({ status: 'rejected', proposedCost: 999 }), req({ status: 'draft', proposedCost: 999 }), req({ contractId: 'C2', approvedCost: 50 })]
const agg = cumulativeByContract(rs, (r) => (r.contractId === 'C1' ? 10000 : 1000), [10, 25])
const c1 = agg.find((a) => a.contractId === 'C1')
assert.equal(c1.approvedAmount, 900); assert.equal(c1.pendingAmount, 200); assert.equal(c1.approvedPct, 9); assert.equal(c1.withPendingPct, 11); assert.equal(c1.crossed, 10); assert.equal(c1.next, 25); assert.equal(c1.count, 3)
assert.equal(agg[0].contractId, 'C1')
assert.equal(agg.find((a) => a.contractId === 'C2').crossed, null)
// the small changes cannot hide: 4 changes of 3% each are 12% cumulative
const small = cumulativeByContract([1, 2, 3, 4].map(() => req({ approvedCost: 300 })), () => 10000, [10, 25])
assert.equal(small[0].approvedPct, 12); assert.equal(small[0].crossed, 10)
// summary
const sm = summarize(rs)
assert.equal(sm.total, 5); assert.equal(sm.approved, 3); assert.equal(sm.awaiting, 1); assert.equal(sm.rejected, 1); assert.equal(sm.approvedAmount, 950); assert.equal(sm.pendingAmount, 200)
// dwell and overdue
const ss = [step({ status: 'approved', decidedAt: '2026-05-03T00:00:00Z' }), step({ status: 'approved', decidedAt: '2026-05-05T00:00:00Z' }), step({ roleName: 'مدیر ارشد پروژه' })]
const d = dwellByRole(ss, '2026-05-11T00:00:00Z')
assert.equal(d.decided[0].role, 'مدیرعامل'); assert.equal(d.decided[0].avgDays, 3); assert.equal(d.decided[0].maxDays, 4); assert.equal(d.waiting[0].avgDays, 10)
assert.equal(overdueSteps(ss, '2026-05-11T00:00:00Z').length, 1); assert.equal(overdueSteps(ss, '2026-05-04T00:00:00Z').length, 0)
assert.equal(stalled([req({ status: 'awaiting_approval' }), req({ status: 'approved' })], '2026-05-20T00:00:00Z', 14).length, 1)
// dates
assert.equal(addDays('2027-04-04', 30), '2027-05-04'); assert.equal(dayDiff('2026-05-10', '2026-05-01'), 9); assert.deepEqual(endDateImpact('2027-04-04', 45), { from: '2027-04-04', to: '2027-05-19', days: 45 }); assert.equal(endDateImpact(null, 5), null)

// ---- who may do what (server re-checks everything)
const me = (o = {}) => ({ isAdmin: false, roles: [], userId: 'u9', ...o })
let r = req({ status: 'awaiting_approval', approvedAt: null }); const act = [step({ roleName: 'مدیرعامل' }), step({ roleName: 'مدیر ارشد پروژه' })]
assert.equal(actionsFor(r, act, me({ roles: ['مدیرعامل'] }), false).decide.length, 1)
assert.equal(actionsFor(r, act, me(), false).decide.length, 0)                                           // no role
assert.equal(actionsFor(r, act, me({ roles: ['مدیرعامل'], userId: 'u1' }), false).decide.length, 0)      // the requester never approves
assert.equal(actionsFor(r, act, me({ isAdmin: true }), false).decide.length, 2)
assert.equal(actionsFor(r, act, me({ roles: ['مدیر پروژه'] }), false).startImplementation, false)       // not before approval ...
assert.equal(actionsFor(r, act, me({ roles: ['مدیر پروژه'] }), true).startImplementation, true)         // ... unless an exception was authorised
assert.equal(actionsFor(req({ status: 'approved' }), [], me({ roles: ['مدیر پروژه'] }), false).startImplementation, true)
assert.equal(actionsFor(req({ status: 'draft', createdBy: 'u9' }), [], me({ roles: ['پیمانکار'] }), false).submit, true)
assert.equal(actionsFor(req({ status: 'draft', createdBy: 'u1' }), [], me({ roles: ['پیمانکار'] }), false).submit, false)
assert.equal(actionsFor(req({ status: 'closed' }), [], me({ isAdmin: true }), false).cancel, false)
assert.ok(friendly({ message: 'P0001: self_approval_forbidden' }).includes('ثبت‌کننده'))
console.log('change kpi/flow ok')
