import assert from 'node:assert/strict'
import { DEFAULT_CONTRACT, classifyEvent, measureImpact, milestoneRows, noticeState, reconcile, suggestFromDocs, suggestFromStoppages, windowsAnalysis } from './delay.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
const rel = (p, s) => ({ id: p + s, versionId: 'v', predId: p, succId: s, type: 'FS', lag: 0 })
const CAL = { workDays: [0, 1, 2, 3, 4, 5], holidays: [], hoursPerDay: 8 }
const ev = (o = {}) => ({ id: 'e', title: 't', cause: 'drawing_approval', party: 'employer', clause: '', eventStart: '2026-01-10', eventEnd: null, noticeDate: '2026-01-15', activityUids: ['B'], claimedDays: 6, critical: null, status: 'draft', approvedDays: null, approvedCost: null, sourceType: 'manual', sourceRef: '', note: '', ...o })
const C = { ...DEFAULT_CONTRACT, contractFinish: '2026-02-20', noticeDays: 14, ldPerDay: 1000, contractValue: 100000, ldCapPct: 10 }

// network: A(5) → B(10) → C(5)  and a side path D(3) with lots of float
const acts = [act('A', 5), act('B', 10), act('C', 5), act('D', 3)]
const sched = { activities: acts, relations: [rel('A', 'B'), rel('B', 'C')], calendar: CAL, mode: 'plan' }

// the measured effect is the finish that the delay cost, only if the activity is critical
const onB = measureImpact(sched, ev({ activityUids: ['B'], claimedDays: 6 }))
assert.equal(onB.impactDays > 0, true); assert.ok(onB.impactDays >= 6)
const onD = measureImpact(sched, ev({ activityUids: ['D'], claimedDays: 2 }))
assert.equal(onD.impactDays, 0)
assert.equal(measureImpact(sched, ev({ activityUids: [] })), null)

// classification
const emp = classifyEvent(ev(), C, onB.impactDays)
assert.equal(emp.cls, 'excusable_compensable'); assert.ok(emp.compensable); assert.ok(emp.allowedDays > 0 && emp.allowedDays <= 6)
assert.equal(classifyEvent(ev({ activityUids: ['D'] }), C, 0).cls, 'no_impact')
assert.equal(classifyEvent(ev(), C, null).cls, 'pending')
assert.equal(classifyEvent(ev({ party: 'contractor', noticeDate: null }), C, 8).cls, 'non_excusable')
assert.equal(classifyEvent(ev({ party: 'contractor' }), C, 8).disallowedDays, 8)
// notice outside the period bars an employer-side claim
const late = classifyEvent(ev({ noticeDate: '2026-02-01' }), C, 8); assert.equal(late.cls, 'barred_notice'); assert.equal(late.allowedDays, 0); assert.ok(late.disallowedDays > 0)
const none = classifyEvent(ev({ noticeDate: null }), C, 8); assert.equal(none.cls, 'barred_notice')
assert.equal(classifyEvent(ev({ party: 'force_majeure' }), C, 8).cls, 'excusable_time_only')
assert.equal(classifyEvent(ev({ party: 'force_majeure', noticeDate: null }), { ...C, forceMajeureNotice: false }, 8).cls, 'excusable_time_only')
const conc = classifyEvent(ev({ party: 'shared' }), C, 8); assert.equal(conc.cls, 'concurrent'); assert.equal(conc.compensable, false)
assert.equal(classifyEvent(ev({ party: 'shared' }), { ...C, concurrentCompensable: true }, 8).compensable, true)
// the approver's decision overrides the recommendation; rejected is final
assert.equal(classifyEvent(ev({ status: 'approved', approvedDays: 3 }), C, 8).allowedDays, 3)
assert.equal(classifyEvent(ev({ status: 'rejected' }), C, 8).cls, 'rejected')
// an overstated claim is cut to what was measured
const over = classifyEvent(ev({ claimedDays: 20 }), C, 8); assert.equal(over.allowedDays, 8); assert.equal(over.disallowedDays, 12)
// critical flag given by the planner wins over the measurement
assert.equal(classifyEvent(ev({ critical: false }), C, 8).cls, 'no_impact')

// notice state
assert.equal(noticeState(classifyEvent(ev({ noticeDate: null }), C, 8), '2026-01-12').state, 'due')
assert.equal(noticeState(classifyEvent(ev({ noticeDate: null }), C, 8), '2026-03-01').state, 'lost')
assert.equal(noticeState(classifyEvent(ev(), C, 8), '2026-03-01').state, 'ok')
assert.equal(noticeState(classifyEvent(ev({ party: 'contractor' }), C, 8), '2026-03-01').state, 'na')

// reconciliation with the contract
const rows = [classifyEvent(ev({ status: 'approved', approvedDays: 10, approvedCost: 5000 }), C, 12), classifyEvent(ev({ id: 'f', party: 'contractor' }), C, 15), classifyEvent(ev({ id: 'g', status: 'assessed' }), C, 4)]
const r = reconcile(C, '2026-03-20', rows)
assert.equal(r.totalSlip, 28); assert.equal(r.approvedExtension, 10); assert.equal(r.revisedFinish, '2026-03-02')
assert.equal(r.contractorDelay, 18); assert.equal(r.ldDays, 18); assert.equal(r.ldAmount, 10000); assert.equal(r.ldCapped, true)   // 18 × 1000 = 18000 → capped at 10 % of 100000 = 10000
assert.equal(r.compensableCost, 5000)
assert.ok(r.potentialRevisedFinish > r.revisedFinish)
const capped = reconcile({ ...C, ldPerDay: 100 }, '2026-03-20', rows); assert.equal(capped.ldAmount, 1800)
assert.equal(reconcile({ ...C, toleranceDays: 20 }, '2026-03-20', rows).ldAmount, 0)
assert.equal(reconcile({ ...C, contractFinish: null }, '2026-03-20', rows).totalSlip, null)
// no slip → nothing owed
assert.equal(reconcile(C, '2026-02-10', []).ldAmount, 0)

// milestones
const ms = milestoneRows([{ id: 'm', title: 'x', contractDate: '2026-02-01', ldPerDay: 500, activityUid: 'C' }, { id: 'n', title: 'y', contractDate: '2026-02-01', ldPerDay: 500, activityUid: null }], () => '2026-02-11')
assert.equal(ms[0].lateDays, 10); assert.equal(ms[0].ldAmount, 5000); assert.equal(ms[1].forecast, null)

// windows between updates
const snap = (label, finish, a) => ({ label, dataDate: null, finish, acts: new Map(Object.entries(a)) })
const w = windowsAnalysis([snap('R1', '2026-03-01', { B: { code: 'B', name: 'b', finish: '2026-02-01', critical: true } }), snap('R2', '2026-03-11', { B: { code: 'B', name: 'b', finish: '2026-02-11', critical: true }, Z: { code: 'Z', name: 'z', finish: '2026-02-11', critical: true } })])
assert.equal(w[0].finishShift, 10); assert.equal(w[0].drivers[0].code, 'B'); assert.equal(w[0].drivers.length, 1)

// suggestions from other modules
const sg = suggestFromStoppages([
  { id: '1', date: '2026-01-05', hours: 8, category: 'drawing', responsibility: 'employer', critical: true, noticeDate: '2026-01-06' },
  { id: '2', date: '2026-01-07', hours: 16, category: 'drawing', responsibility: 'employer', critical: false, noticeDate: null },
  { id: '3', date: '2026-01-07', hours: 4, category: 'weather', responsibility: '', critical: false, noticeDate: null },
])
assert.equal(sg.length, 1); assert.equal(sg[0].claimedDays, 3); assert.equal(sg[0].party, 'employer'); assert.equal(sg[0].critical, true); assert.equal(sg[0].eventEnd, '2026-01-07')
const dg = suggestFromDocs([{ id: 'd', docNo: 'D-1', title: 'x', issuedDate: '2026-01-01', actualApproved: '2026-01-30', status: 'approved', activityUids: ['B'] }, { id: 'e', docNo: 'D-2', title: 'x', issuedDate: '2026-01-01', actualApproved: '2026-01-10', status: 'approved', activityUids: ['B'] }], 14, '2026-02-01')
assert.equal(dg.length, 1); assert.equal(dg[0].claimedDays, 15)
console.log('delay: all assertions passed')
