// Run: npx tsx src/modules/landacq/lib/lib.test.mjs
import assert from 'node:assert/strict'
import { addDays, diffDays, fmtKm, fmtKmRange } from './dates.ts'
import { STAGE_ORDER, makeStages, currentStage, isReleased, isStarted, stageProgress, remainingDays, totalExpectedDays, stageDelay, overdueStages } from './workflow.ts'
import { criticality, levelOf } from './scoring.ts'
import { activityDateAt, impactsOf, needByDate, earlyAction, constraintsOf } from './schedule.ts'
import { heuristicPredictor } from './forecast.ts'
import { displayStatus } from './status.ts'
import { analyze, computeKpis, criticalConstraints, buildActions, lengthByStatus } from './kpis.ts'
import { polyline, pointAt, slice, fit, haversine } from './geometry.ts'

const TODAY = '2026-01-15'
const mk = (o = {}) => ({
  id: 'p' + Math.random().toString(36).slice(2, 7), masterProjectId: 'm', code: 'LP', title: '', kmStart: 10, kmEnd: 11, landType: 'rangeland', ownershipClass: 'private', landUse: '',
  ownerCountEst: 1, ownerKnown: true, custodian: '', disputeProbability: 0, complexity: 1, estDurationDays: null, flags: {}, acquisitionRoute: 'normal', areaM2: null, estCost: null, notes: '',
  riskId: null, issueId: null, scheduleWarningId: null, isDemo: false, stages: makeStages(), owners: [], docs: [], ...o,
})
const setStage = (p, key, status, extra = {}) => { const s = p.stages.find((x) => x.key === key); Object.assign(s, { status, ...extra }); return p }
const release = (p) => { for (const k of STAGE_ORDER) setStage(p, k, 'done'); return p }

// ---- dates / chainage -------------------------------------------------------------------------------------
assert.equal(addDays('2026-01-31', 1), '2026-02-01'); assert.equal(diffDays('2026-03-01', '2026-02-01'), 28)
assert.equal(fmtKm(42.3), '42+300'); assert.equal(fmtKm(0.05), '0+050'); assert.equal(fmtKm(9.9996), '10+000'); assert.equal(fmtKmRange(42.3, 43.1), 'KM 42+300 – 43+100')

// ---- workflow ------------------------------------------------------------------------------------------------
let p = mk()
assert.equal(STAGE_ORDER.length, 10); assert.equal(currentStage(p).key, 'identification'); assert.equal(isStarted(p), false); assert.equal(stageProgress(p), 0)
setStage(p, 'identification', 'done'); setStage(p, 'ownership_status', 'in_progress')
assert.equal(currentStage(p).key, 'ownership_status'); assert.equal(isStarted(p), true); assert.equal(stageProgress(p), 0.15)
assert.equal(isReleased(release(mk())), true)
const full = totalExpectedDays(mk({ complexity: 3 }))
assert.ok(full > totalExpectedDays(mk({ acquisitionRoute: 'accelerated', complexity: 3 })), 'accelerated is shorter')
assert.ok(totalExpectedDays(mk({ acquisitionRoute: 'dispute', complexity: 3 })) > full, 'dispute is longer')
assert.equal(totalExpectedDays(mk({ estDurationDays: 120 })), 120)
assert.equal(remainingDays(release(mk())), 0)
assert.equal(remainingDays(mk({ estDurationDays: 120 })), 120)
assert.ok(remainingDays(setStage(mk({ estDurationDays: 120 }), 'identification', 'done')) < 120)
assert.equal(stageDelay({ key: 'payment', status: 'in_progress', plannedDate: '2026-01-05', actualDate: null, responsible: '', note: '' }, TODAY), 10)
assert.equal(stageDelay({ key: 'payment', status: 'done', plannedDate: '2026-01-05', actualDate: '2026-01-08', responsible: '', note: '' }, TODAY), 3)
assert.equal(stageDelay({ key: 'payment', status: 'done', plannedDate: '2026-01-05', actualDate: '2026-01-02', responsible: '', note: '' }, TODAY), 0)
assert.equal(overdueStages(setStage(mk(), 'valuation', 'not_started', { plannedDate: '2026-01-01' }), TODAY).length, 1)

// ---- scoring --------------------------------------------------------------------------------------------------
assert.equal(levelOf(24), 'low'); assert.equal(levelOf(25), 'medium'); assert.equal(levelOf(50), 'high'); assert.equal(levelOf(75), 'critical')
let c = criticality(mk())
assert.equal(c.level, 'low'); assert.equal(c.score, 0)
c = criticality(mk({ ownershipClass: 'unknown', ownerCountEst: 12, disputeProbability: 80, complexity: 5, flags: { past_dispute: true, critical_for_execution: true, has_facilities: true } }))
assert.equal(c.level, 'critical'); assert.ok(c.factors[0].points >= c.factors[1].points, 'sorted by points'); assert.ok(c.score <= 100)
const base = criticality(mk({ ownershipClass: 'unknown', ownerCountEst: 6, disputeProbability: 60 })).score
const advanced = criticality(setStage(setStage(mk({ ownershipClass: 'unknown', ownerCountEst: 6, disputeProbability: 60 }), 'identification', 'done'), 'ownership_status', 'done')).score
assert.ok(advanced < base, 'progress lowers criticality')
assert.deepEqual([criticality(release(mk({ ownershipClass: 'unknown' ,flags: { past_dispute: true } }))).score, criticality(release(mk())).resolved], [0, true])
assert.equal(criticality(mk({ owners: [{ }, { }, { }, { }, { }] , ownerCountEst: 1 })).factors.find((f) => f.key === 'owners').points, 12, 'owner rows count too')

// ---- schedule / early action ------------------------------------------------------------------------------
const act = (o = {}) => ({ id: 'a', masterProjectId: 'm', key: 'clearing', name: 'Clearing', kmStart: 0, kmEnd: 100, startDate: '2026-01-01', endDate: '2026-04-11', sequence: 0, isDemo: false, ...o })
assert.equal(activityDateAt(act(), 0), '2026-01-01'); assert.equal(activityDateAt(act(), 100), '2026-04-11'); assert.equal(activityDateAt(act(), 50), '2026-02-20'); assert.equal(activityDateAt(act(), 500), '2026-04-11')
const parcel = mk({ kmStart: 42.3, kmEnd: 43.1 })
const acts = [act(), act({ id: 'b', key: 'welding', name: 'Welding', startDate: '2026-02-01', endDate: '2026-05-12', sequence: 1 }), act({ id: 'c', key: 'x', name: 'Far', kmStart: 60, kmEnd: 90 })]
const imp = impactsOf(parcel, acts)
assert.equal(imp.length, 2); assert.equal(imp[0].activity.key, 'clearing'); assert.equal(needByDate(parcel, acts), imp[0].from)
assert.equal(needByDate(parcel, [acts[2]]), null)
// spec example: acquisition takes 120 days, activity arrives at day X => start by X-120 (no buffer)
const spec = mk({ kmStart: 78.2, kmEnd: 79, estDurationDays: 120 })
const specAct = [act({ startDate: '2025-12-01', endDate: '2026-04-10' })]
let ea = earlyAction(spec, specAct, TODAY, { bufferDays: 0, horizonDays: 90 })
assert.equal(ea.remaining, 120); assert.equal(ea.startBy, addDays(ea.needBy, -120))
assert.equal(ea.state, 'action_required', 'start-by already passed and nothing started'); assert.ok(ea.delayDays > 0)
// plenty of time -> on track; soon -> start_soon; started -> delay_expected not action_required
const far = mk({ kmStart: 90, kmEnd: 91, estDurationDays: 60 }); const farAct = [act({ startDate: '2026-06-01', endDate: '2026-12-01' })]
assert.equal(earlyAction(far, farAct, TODAY, { bufferDays: 0, horizonDays: 30 }).state, 'on_track')
assert.equal(earlyAction(far, farAct, TODAY, { bufferDays: 0, horizonDays: 300 }).state, 'start_soon')
const started = setStage(mk({ kmStart: 78.2, kmEnd: 79, estDurationDays: 120 }), 'identification', 'in_progress')
assert.equal(earlyAction(started, specAct, TODAY, { bufferDays: 0, horizonDays: 90 }).state, 'delay_expected')
assert.equal(earlyAction(release(mk({ kmStart: 78.2, kmEnd: 79 })), specAct, TODAY, { bufferDays: 0, horizonDays: 90 }).state, 'ready')
assert.equal(earlyAction(mk({ kmStart: 200, kmEnd: 201 }), specAct, TODAY, { bufferDays: 0, horizonDays: 90 }).state, 'unscheduled')
assert.equal(constraintsOf(release(mk()), acts, TODAY).length, 0)
assert.ok(constraintsOf(spec, specAct, TODAY).some((x) => x.slackDays < 0))

// ---- forecast -----------------------------------------------------------------------------------------------
const ctx = { activities: specAct, today: TODAY, settings: { bufferDays: 0, horizonDays: 90 } }
const f1 = heuristicPredictor.predict(spec, ctx), f2 = heuristicPredictor.predict(far, { ...ctx, activities: farAct })
assert.ok(f1.probability > 70 && f2.probability < 40, `late=${f1.probability} early=${f2.probability}`); assert.ok(f1.expectedDelayDays > 0 && f1.drivers.length > 0)
assert.equal(heuristicPredictor.predict(release(mk()), ctx).probability, 0)
assert.ok(heuristicPredictor.predict(mk({ kmStart: 78.2, kmEnd: 79, estDurationDays: 120, disputeProbability: 70, flags: { past_dispute: true } }), ctx).probability >= f1.probability)

// ---- status / kpis ----------------------------------------------------------------------------------------
assert.equal(displayStatus(release(mk({ ownershipClass: 'unknown' }))), 'released')
assert.equal(displayStatus(mk({ ownershipClass: 'natural_resources' })), 'natural'); assert.equal(displayStatus(mk({ ownershipClass: 'governmental' })), 'governmental')
assert.equal(displayStatus(mk()), 'review'); assert.equal(displayStatus(setStage(mk(), 'identification', 'in_progress')), 'acquiring')
assert.equal(displayStatus(mk({ ownershipClass: 'natural_resources', ownerCountEst: 12, disputeProbability: 90, complexity: 5, flags: { critical_for_execution: true, past_dispute: true } })), 'critical')
const parcels = [
  release(mk({ id: 'r', kmStart: 0, kmEnd: 10 })),
  setStage(mk({ id: 'a', kmStart: 10, kmEnd: 20 }), 'identification', 'in_progress'),
  mk({ id: 'c', kmStart: 78, kmEnd: 80, ownershipClass: 'unknown', ownerCountEst: 9, disputeProbability: 70, complexity: 5, estDurationDays: 120, flags: { critical_for_execution: true } }),
  setStage(mk({ id: 'o', kmStart: 40, kmEnd: 41 }), 'valuation', 'not_started', { plannedDate: '2026-01-02' }),
]
const rows = analyze(parcels, [act({ startDate: '2026-02-01', endDate: '2026-06-01' })], TODAY, { bufferDays: 15, horizonDays: 90 })
assert.deepEqual(rows.map((r) => r.parcel.id), ['r', 'a', 'o', 'c'], 'sorted by km')
const k = computeKpis(rows, 100, TODAY, { horizonDays: 90 })
assert.equal(k.parcelCount, 4); assert.equal(k.releasedKm, 10); assert.equal(k.releasedPct, 10); assert.equal(k.acquiringKm, 10); assert.equal(k.criticalCount, 1)
assert.equal(k.ownerCount, 1 + 1 + 1 + 9); assert.equal(k.disputeCount, 1); assert.equal(k.overdueActions, 1); assert.ok(k.progressPct > 0 && k.progressPct <= 100)
assert.ok(k.impactingSoon >= 1)
const lens = lengthByStatus(rows); assert.equal(lens.released, 10)
const cc = criticalConstraints(rows); assert.ok(cc.length >= 1 && cc[0].parcel.id !== 'r')
const acs = buildActions(rows, TODAY, { horizonDays: 90 })
assert.ok(acs.some((a) => a.kind === 'overdue_stage' && a.daysFromToday < 0)); assert.ok(acs.every((a, i) => i === 0 || acs[i - 1].due <= a.due), 'soonest first')

// ---- geometry -------------------------------------------------------------------------------------------
const pts = [[51, 28], [51.1, 28], [51.1, 28.1], [51.2, 28.1]]
const line = polyline(pts)
assert.ok(line.length > 25000 && line.length < 40000, String(line.length))
assert.deepEqual(pointAt(line, 0), pts[0]); assert.deepEqual(pointAt(line, 1), pts[3])
const mid = pointAt(line, 0.5); assert.ok(mid[0] > 51 && mid[0] < 51.2)
const sl = slice(line, 0.2, 0.8); assert.ok(sl.length >= 3); assert.deepEqual(sl[0], pointAt(line, 0.2))
const pr = fit(pts, 400, 300, 20); const [x0, y0] = pr(pts[0]); assert.ok(x0 >= 20 - 1e-6 && y0 <= 300)
assert.ok(pr(pts[3])[0] > pr(pts[0])[0], 'east is to the right'); assert.ok(pr(pts[2])[1] < pr(pts[0])[1], 'north is up')
assert.ok(Math.abs(haversine([0, 0], [0, 1]) - 111195) < 400)
console.log('landacq/lib: all assertions passed')
