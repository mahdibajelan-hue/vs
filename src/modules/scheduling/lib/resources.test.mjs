import assert from 'node:assert/strict'
import { resourceHistogram } from './resources.ts'
import { sCurve } from './evm.ts'
import { computeSchedule } from './schedule.ts'
import { integrateActivity, emptySources } from './integration.ts'
import { suggestFromChanges } from './delay.ts'
import { summarize } from './summary.ts'
import { DEFAULT_CONTRACT } from './delay.ts'

const act = (code, dur, o = {}) => ({ id: code, uid: 'u' + code, versionId: 'v', code, sourceId: code, name: code, wbsCode: '', wbsPath: '', type: 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 1000, owner: '', sort: 0, ...o })
const rel = (p, s) => ({ id: p + s, versionId: 'v', predId: p, succId: s, type: 'FS', lag: 0 })
const CAL = { workDays: [0, 1, 2, 3, 4, 5], holidays: [], hoursPerDay: 8 }

// resources: two activities in sequence needing a crane, one overlapping week above the limit
const acts = [act('A', 6, { plannedFinish: '2026-01-08' }), act('B', 6, { plannedFinish: '2026-01-15' })]
const fc = computeSchedule({ activities: acts, relations: [rel('A', 'B')], calendar: CAL, mode: 'plan' })
const res = [{ id: 'r1', name: 'جرثقیل', kind: 'equipment', unit: 'دستگاه', maxUnits: 1, ratePerDay: 100, execMatch: 'جرثقیل' }, { id: 'r2', name: 'جوشکار', kind: 'labor', unit: 'نفر', maxUnits: 0, ratePerDay: 10, execMatch: 'جوشکار' }]
const asg = [{ id: '1', activityUid: 'uA', resourceId: 'r1', unitsPerDay: 1 }, { id: '2', activityUid: 'uB', resourceId: 'r1', unitsPerDay: 2 }, { id: '3', activityUid: 'uA', resourceId: 'r2', unitsPerDay: 4 }]
const usage = [{ date: '2026-01-04', kind: 'equip', name: 'جرثقیل ۵۰ تن', qty: 1 }, { date: '2026-01-05', kind: 'equip', name: 'جرثقیل ۵۰ تن', qty: 1 }, { date: '2026-01-05', kind: 'man', name: 'جوشکار', qty: 3 }]
const h = resourceHistogram({ resources: res, assignments: asg, activities: acts, forecast: fc, calendar: CAL, usage })
const crane = h.get('r1')
assert.equal(crane.unitDays, 6 * 1 + 6 * 2); assert.equal(crane.cost, 1800); assert.equal(crane.peak, 2); assert.ok(crane.overWeeks >= 1)
assert.ok(crane.weeks.some((w) => w.actual === 1)); assert.equal(h.get('r2').unitDays, 24); assert.equal(h.get('r2').overWeeks, 0)
assert.equal(h.get('r2').weeks.find((w) => w.actual != null).actual, 3)            // machinery rows never leak into labour

// actual cost and CPI
const cur = [{ ...acts[0], actualStart: '2026-01-03', pctComplete: 100, actualFinish: '2026-01-08' }, acts[1]]
const f2 = computeSchedule({ activities: cur, relations: [rel('A', 'B')], calendar: CAL, mode: 'forecast', dataDate: '2026-01-10' })
const e1 = sCurve({ baseline: acts, current: cur, forecast: f2, dataDate: '2026-01-10', costs: [{ date: '2026-01-05', amount: 800 }, { date: '2026-01-09', amount: 700 }] })
assert.equal(e1.ev, 1000); assert.equal(e1.ac, 1500); assert.ok(Math.abs(e1.cpi - 1000 / 1500) < 1e-9); assert.ok(Math.abs(e1.eac - 2000 / (1000 / 1500)) < 1e-6); assert.ok(e1.vac < 0)
assert.ok(e1.points.some((p) => p.cost != null && p.cost > 0))
assert.equal(sCurve({ baseline: acts, current: cur, forecast: f2, dataDate: '2026-01-10' }).cpi, null)

// new link types
const src = emptySources()
src.parcels.set('p1', { id: 'p1', code: 'P-12', title: 'x', released: false, plannedRelease: '2026-03-01', actualRelease: null })
src.parcels.set('p2', { id: 'p2', code: 'P-13', title: 'x', released: true, plannedRelease: null, actualRelease: '2026-01-01' })
src.changes.set('c1', { id: 'c1', crNumber: 'CR-7', title: 't', status: 'evaluating', proposedDays: 20, approvedDays: null })
src.changes.set('c2', { id: 'c2', crNumber: 'CR-8', title: 't', status: 'approved', proposedDays: 20, approvedDays: 15 })
const L = (t, id, extra = {}) => ({ id: t + id, projectId: 'p', activityUid: 'uA', targetType: t, targetId: id, needKind: 'start', needDate: '2026-02-01', note: '', ...extra })
const i1 = integrateActivity('uA', [L('land_parcel', 'p1'), L('land_parcel', 'p2'), L('change_request', 'c1'), L('change_request', 'c2')], src, { today: '2026-01-20', forecastStart: '2026-02-01' })
assert.equal(i1.supplyTotal, 2); assert.equal(i1.supplyDelivered, 1); assert.equal(i1.startNoEarlier, '2026-03-01')
assert.ok(i1.blockers.some((b) => b.kind === 'land_parcel' && b.text.includes('P-12'))); assert.ok(i1.blockers.some((b) => b.kind === 'change_request' && b.severity === 'medium')); assert.ok(i1.blockers.some((b) => b.kind === 'change_request' && b.severity === 'low'))
const sg = suggestFromChanges([{ id: 'c2', crNumber: 'CR-8', title: 'x', status: 'approved', approvedDays: 15, approvedAt: '2026-01-05T10:00:00Z', activityUids: ['uA'] }, { id: 'c3', crNumber: 'CR-9', title: 'x', status: 'draft', approvedDays: 5, approvedAt: null, activityUids: [] }])
assert.equal(sg.length, 1); assert.equal(sg[0].claimedDays, 15); assert.equal(sg[0].party, 'employer')

// summary for outside use
const sm = summarize({ sched: { activities: cur, relations: [rel('A', 'B')], calendar: CAL, mode: 'forecast', dataDate: '2026-01-10' }, activities: cur, baselineFinish: '2026-01-10', contract: { ...DEFAULT_CONTRACT, contractFinish: '2026-01-12' }, events: [], today: '2026-01-10' })
assert.equal(sm.activities, 2); assert.ok(sm.baselineSlip > 0); assert.ok(sm.contractorDelay > 0)
console.log('resources/cost/links/summary: all assertions passed')
