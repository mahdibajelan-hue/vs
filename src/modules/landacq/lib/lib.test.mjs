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
assert.ok(full > totalExpectedDays(mk({ acquisitionRoute: 'art9', complexity: 3 })), 'art9 is shorter')
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

// ---- legal clocks (1358 law)
import { addJalaliMonths, isoToJalali } from './jalali.ts'
import { legalClocks, nextDeadline, stayActive } from './legal.ts'
assert.deepEqual(isoToJalali('2026-03-21'), { jy: 1405, jm: 1, jd: 1 })
assert.equal(addJalaliMonths('2026-03-21', 3), '2026-06-22')   // 1405/1/1 + 3 months = 1405/4/1
assert.equal(addJalaliMonths('2026-03-21', 6), '2026-09-23')   // 1405/7/1
const mkp = (over) => ({ id: 'x', masterProjectId: 'm', code: 'LP', title: '', kmStart: 0, kmEnd: 1, landType: 'agricultural', ownershipClass: 'private', landUse: '', ownerCountEst: 1, ownerKnown: true, custodian: '', disputeProbability: 0, complexity: 1, estDurationDays: null, flags: {}, acquisitionRoute: 'art9', areaM2: null, estCost: null, notes: '', riskId: null, issueId: null, scheduleWarningId: null, isDemo: false, legal: {}, nextDeadline: null, nextDeadlineLabel: '', owners: [], docs: [], stages: makeStages(), ...over })
const done = (key, d) => ({ key, status: 'done', responsible: '', plannedDate: d, actualDate: d, note: '' })
const bs9 = mkp({})
bs9.stages = bs9.stages.map((s) => (s.key === 'art9_necessity' || s.key === 'art9_minutes' || s.key === 'art9_possession' ? done(s.key, '2026-03-21') : s))
const c1 = legalClocks(bs9, '2026-06-10').find((c) => c.key === 'art9_payment')
assert.equal(c1.due, '2026-06-22'); assert.equal(c1.status, 'due_soon'); assert.equal(c1.daysLeft, 12)
assert.equal(legalClocks(bs9, '2026-06-23').find((c) => c.key === 'art9_payment').status, 'overdue')
assert.equal(legalClocks(bs9, '2026-04-01').find((c) => c.key === 'art9_payment').status, 'running')
assert.equal(nextDeadline(bs9, '2026-06-10').date, '2026-06-22')
const paid = { ...bs9, stages: bs9.stages.map((s) => (s.key === 'art9_payment' ? done('art9_payment', '2026-05-01') : s)) }
assert.equal(legalClocks(paid, '2026-07-30').find((c) => c.key === 'art9_payment').status, 'done'); assert.equal(nextDeadline(paid, '2026-07-30'), null)
// possession without necessity/minutes is a compliance alarm
const bad = mkp({}); bad.stages = bad.stages.map((s) => (s.key === 'art9_possession' ? done('art9_possession', '2026-03-21') : s))
assert.ok(legalClocks(bad, '2026-03-25').some((c) => c.key === 'art9_compliance' && c.severity === 'critical'))
// owner's court stay: active until payment / lifting
const stayed = { ...bs9, legal: { stayFiledDate: '2026-07-01', stayOrderDate: '2026-07-05' } }
assert.ok(stayActive(stayed)); assert.ok(!stayActive({ ...stayed, legal: { ...stayed.legal, stayLiftedDate: '2026-07-06' } })); assert.ok(!stayActive(paid))
// regular route: Article 3 note 2 (3 months after agreement) and Article 5 note 5 (1 month for the experts)
const reg = mkp({ acquisitionRoute: 'normal', legal: { agreementDate: '2026-03-21', expertAssignedDate: '2026-03-21' } })
const rc = legalClocks(reg, '2026-04-01'); assert.equal(rc.find((c) => c.key === 'agreement_payment').due, '2026-06-22'); assert.equal(rc.find((c) => c.key === 'expert_opinion').due, '2026-04-21')
console.log('landacq/legal: all assertions passed')

// ---- approval chain, UTM, measuring
import { allowedActions, canEditData } from './approval.ts'
assert.deepEqual(allowedActions('draft', 'contractor', false), ['submit']); assert.deepEqual(allowedActions('draft', 'consultant', false), [])
assert.deepEqual(allowedActions('submitted', 'consultant', false), ['approve', 'return']); assert.deepEqual(allowedActions('submitted', 'employer_legal', false), [])
assert.deepEqual(allowedActions('consultant_approved', 'employer_legal', false), ['attest', 'return'])
assert.deepEqual(allowedActions('legal_attested', 'project_manager', false), ['final', 'return']); assert.deepEqual(allowedActions('legal_attested', 'executive', false), ['final', 'return'])
assert.deepEqual(allowedActions('approved', 'project_manager', false), ['reopen']); assert.deepEqual(allowedActions('approved', 'contractor', false), [])
assert.ok(allowedActions('submitted', null, true).includes('approve'), 'admin may act in any step')
assert.ok(canEditData({ approvalStatus: 'draft' }, 'contractor', false, false)); assert.ok(!canEditData({ approvalStatus: 'submitted' }, 'contractor', false, true))
assert.ok(!canEditData({ approvalStatus: 'draft' }, 'consultant', false, true)); assert.ok(canEditData({ approvalStatus: 'submitted' }, null, false, true)); assert.ok(!canEditData({ approvalStatus: 'draft' }, null, false, false))
import { toUtm, fromUtm, polygonMetrics, utmZoneOf } from './utm.ts'
const esb = toUtm(40.7484, -73.9857); assert.equal(esb.zone, 18); assert.ok(Math.abs(esb.e - 585628) < 3 && Math.abs(esb.n - 4511322) < 3)
const rt = toUtm(35.6892, 51.389); assert.equal(rt.zone, 39); const back = fromUtm(rt.e, rt.n, rt.zone, rt.north); assert.ok(Math.abs(back[0] - 51.389) < 1e-8 && Math.abs(back[1] - 35.6892) < 1e-8)
assert.equal(utmZoneOf(56.27), 40); assert.equal(polygonMetrics([[0, 0], [30, 0], [30, 100], [0, 100]]).area, 3000)
import { pathLength, polygonAreaLonLat } from './measure.ts'
const sq = [[51, 35], [51.001, 35], [51.001, 35.001], [51, 35.001]]
const ar = polygonAreaLonLat(sq); assert.ok(ar > 10000 && ar < 10300, String(ar))   // ~ 91 m x 111 m
assert.ok(Math.abs(pathLength([[51, 35], [51, 35.001]]) - 111.2) < 1)
console.log('landacq/approval+utm+measure: all assertions passed')

// ---- route import (KMZ / IP tables) and problem drafts
import { readFileSync } from 'node:fs'
import { kmlFromKmz, parseIpTable, tableFromText } from './routeImport.ts'
const kmzBuf = readFileSync(new URL('./t.kmz', import.meta.url))
assert.ok((await kmlFromKmz(kmzBuf.buffer.slice(kmzBuf.byteOffset, kmzBuf.byteOffset + kmzBuf.byteLength))).includes('<coordinates>'))
assert.equal(parseIpTable([['Lon', 'Lat'], [51.1, 35.1], [51.2, 35.2]]).format, 'lonlat')
assert.deepEqual(parseIpTable(tableFromText('35.1 51.1\n35.2 51.2')).points[0], [51.1, 35.1])
const ip1 = toUtm(35.1, 51.1, 39)
const ipu = parseIpTable([['IP', 'Easting', 'Northing'], ['IP1', ip1.e, ip1.n], ['IP2', ip1.e + 1000, ip1.n]]); assert.equal(ipu.format, 'utm'); assert.ok(Math.abs(ipu.points[0][0] - 51.1) < 1e-6)
assert.equal(parseIpTable([['نام', 'زون', 'شرقی', 'شمالی'], ['A', 40, 600000, 3000000]]).zone, 40)
import { problemsOf } from './problems.ts'
import { analyze as analyzeRows } from './kpis.ts'
const probParcel = { ...bs9, legal: { stayFiledDate: '2026-07-01', stayOrderDate: '2026-07-05' } }
const [pa] = analyzeRows([probParcel], [], '2026-08-01', { bufferDays: 30, horizonDays: 90 })
const rep = problemsOf(pa, '2026-08-01')
assert.ok(rep.issue && rep.risk && rep.issue.severity === 'critical'); assert.ok(rep.issue.description.includes('متوقف')); assert.equal(rep.risk.params.probability, 5)
const [fine] = analyzeRows([mkp({ acquisitionRoute: 'normal' })], [], '2026-08-01', { bufferDays: 30, horizonDays: 90 })
assert.equal(problemsOf(fine, '2026-08-01').issue, null)
console.log('landacq/import+problems: all assertions passed')

// ── facilities: stations & crossings ──
{
  const { crossingState, crossingDrafts, parcelHeading, stationLabel } = await import('./facilities.ts')
  const acts = [{ id: 'a', name: 'Welding', sequence: 1, kmStart: 0, kmEnd: 100, startDate: '2026-03-01', endDate: '2026-09-01' }]
  const cr = (o = {}) => ({ id: 'c', masterProjectId: 'm', crossingType: 'railway', name: '', km: 50, custodian: '', permitStatus: 'not_started', permitNumber: '', undertakingRequired: true, undertakingStatus: 'pending', feeRequired: true, feeAmount: 100, feePaidAmount: 0, ...o })
  // railway needs 120 days lead; front reaches km 50 about mid-June → request-by ≈ mid-Feb. Today in March → late.
  const late = crossingState(cr(), acts, '2026-03-01')
  assert.equal(late.status, 'critical'); assert.ok(late.alarms.some((a) => a.key === 'request_late'))
  const fine = crossingState(cr(), acts, '2025-06-01')
  assert.equal(fine.status, 'ok'); assert.equal(fine.alarms.length, 0)
  const done = crossingState(cr({ permitStatus: 'issued', undertakingStatus: 'signed', feePaidAmount: 100 }), acts, '2026-06-01')
  assert.ok(done.ready && done.status === 'ready' && done.progress === 1)
  const noFee = crossingState(cr({ feeRequired: false, undertakingRequired: false, permitStatus: 'issued' }), acts, '2026-06-01')
  assert.ok(noFee.ready)
  assert.equal(crossingState(cr({ permitStatus: 'rejected' }), acts, '2025-06-01').status, 'critical')
  const d = crossingDrafts(cr(), late, '2026-03-01')
  assert.ok(d.issue && d.risk && d.issue.description.includes('تعهدنامه'))
  assert.equal(crossingDrafts(cr(), fine, '2025-06-01').issue, null)
  assert.equal(stationLabel({ stationType: 'pig_launcher' }), 'ایستگاه ارسال توپک')
  assert.ok(parcelHeading({ kind: 'station', stationType: 'line_valve', kmStart: 25.4, kmEnd: 25.401 }).includes('KM'))
  console.log('landacq/facilities: all assertions passed')
}

// ── pricing & finance ──
{
  const { BASE_PRICE, benchmarkFor, verdictOf, priceAllowed, unitPrice, averagesByFactor, multOf } = await import('./pricing.ts')
  const { summarize, spendSeries } = await import('./finance.ts')
  const P = (o = {}) => ({ id: 'x', landType: 'agricultural', ownershipClass: 'private', flags: {}, areaM2: 1000, estCost: 6_000_000_000, landUse: 'کشاورزی', priceException: null, ...o })
  const bm = benchmarkFor(P(), [])
  assert.equal(bm.source, 'base'); assert.equal(Math.round(bm.expected), BASE_PRICE.agricultural)
  assert.equal(verdictOf(6_000_000, bm), 'ok'); assert.equal(verdictOf(2_000_000, bm), 'low'); assert.equal(verdictOf(20_000_000, bm), 'high')
  assert.equal(unitPrice(P()), 6_000_000); assert.equal(unitPrice(P({ areaM2: null })), null)
  // factors move the expected price: residence +15%, national land x0.4
  assert.ok(Math.abs(multOf(P({ flags: { residence_livelihood: true } })) - 1.15) < 1e-9)
  assert.ok(benchmarkFor(P({ ownershipClass: 'natural_resources' }), []).expected < bm.expected / 2)
  // an unusual price is only allowed once the project manager approved exactly that price
  assert.equal(priceAllowed(20_000_000, bm, null), false)
  assert.equal(priceAllowed(20_000_000, bm, { status: 'requested', price: 20_000_000 }), false)
  assert.equal(priceAllowed(20_000_000, bm, { status: 'rejected', price: 20_000_000 }), false)
  assert.equal(priceAllowed(20_000_000, bm, { status: 'approved', price: 20_000_000 }), true)
  assert.equal(priceAllowed(21_000_000, bm, { status: 'approved', price: 20_000_000 }), false)
  // with 3+ comparable parcels the project's own median replaces the reference table
  const peers = [1, 2, 3].map((i) => P({ id: 'p' + i, estCost: 1000 * 9_000_000 }))
  const bp = benchmarkFor(P(), peers); assert.equal(bp.source, 'project'); assert.equal(Math.round(bp.expected), 9_000_000)
  const avg = averagesByFactor([P(), P({ estCost: 8_000_000_000 }), P({ landType: 'garden', estCost: 14_000_000_000 })])
  const ag = avg.find((x) => x.group === 'landType' && x.key === 'agricultural'); assert.equal(ag.n, 2); assert.equal(Math.round(ag.avg), 7_000_000)
  // finance
  const pays = [{ category: 'owner', amount: 100 }, { category: 'expert', amount: 10 }, { category: 'transfer', amount: 5 }, { category: 'legal', amount: 1 }]
  const sm = summarize([{ estCost: 500 }], pays, 232)
  assert.equal(sm.owners, 100); assert.equal(sm.fees, 16); assert.equal(sm.total, 116); assert.equal(sm.expert, 10); assert.equal(sm.consumption, 0.5); assert.equal(sm.remaining, 116)
  assert.equal(summarize([], pays, null).consumption, null); assert.equal(summarize([{ estCost: 500 }], pays, 400).overrun, true)
  const ser = spendSeries([{ amount: 10, paidDate: '2026-01-15' }, { amount: 5, paidDate: '2026-01-20' }, { amount: 7, paidDate: '2026-03-02' }], '2026-04-10')
  assert.deepEqual(ser.map((x) => [x.month, x.paid, x.cumulative]), [['2026-01-01', 15, 15], ['2026-02-01', 0, 15], ['2026-03-01', 7, 22], ['2026-04-01', 0, 22]])
  console.log('landacq/pricing+finance: all assertions passed')
}

// ── auto plan ──
{
  const { stepDays, planDates, applyPlan, plannedFinishOf, startOf, summarizePlan, buildSchedule } = await import('./autoplan.ts')
  const { STAGE_ORDER, ART9_ORDER } = await import('./workflow.ts')
  const p = mk({ complexity: 2 })
  const d = stepDays(p)
  const dates = planDates(p, '2026-01-01')
  // each step ends its duration after the previous one, in order
  let cur = '2026-01-01'
  for (const k of STAGE_ORDER) { cur = addDays(cur, d[k]); assert.equal(dates.get(k), cur, k) }
  assert.equal(plannedFinishOf({ ...p, stages: applyPlan(p, '2026-01-01') }), dates.get('ready_for_construction'))
  // a hand-set total duration scales the steps
  const sum = (x) => STAGE_ORDER.reduce((n, k) => n + stepDays(x)[k], 0)
  assert.ok(Math.abs(sum(mk({ estDurationDays: 200 })) - 200) <= STAGE_ORDER.length, String(sum(mk({ estDurationDays: 200 }))))
  // finished steps keep their dates and move the cursor to the day they really ended
  const q = mk({ complexity: 2 }); setStage(q, 'identification', 'done', { plannedDate: '2026-01-08', actualDate: '2026-01-20' })
  const dq = planDates(q, '2026-01-01')
  assert.equal(dq.get('identification'), '2026-01-08'); assert.equal(dq.get('ownership_status'), addDays('2026-01-20', stepDays(q).ownership_status))
  assert.ok(applyPlan(q, '2026-01-01').find((s) => s.key === 'identification').actualDate === '2026-01-20')
  // never plan into the past when told so
  assert.equal(planDates(mk(), '2025-01-01', '2026-01-15').get('identification'), addDays('2026-01-15', stepDays(mk()).identification))
  // Article 9: possession is the release; the 3-month payment window stays fixed
  const a9 = mk({ acquisitionRoute: 'art9' }); const da = planDates(a9, '2026-02-01')
  assert.deepEqual([...da.keys()], ART9_ORDER); assert.equal(diffDays(da.get('art9_payment'), da.get('art9_possession')), 90)
  assert.equal(plannedFinishOf({ ...a9, stages: applyPlan(a9, '2026-02-01') }), da.get('art9_possession'))
  assert.equal(stepDays(mk({ acquisitionRoute: 'art9', estDurationDays: 30 })).art9_payment, 90)
  // modes and summary
  // capacity planner: N files at a monthly rate, in order of need
  const C = (id, needBy, extra = {}) => ({ id, route: 'normal', complexity: 2, needBy, crit: 10, kmStart: Number(id.slice(1)), ...extra })
  const cs = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => C(id, addDays('2026-03-01', 130 + i * 30)))
  const base = { start: '2026-03-01', totalMonths: null, art9Days: null, avgDays: 120, perMonth: 2, order: 'need', onlyNew: false }
  const pl = buildSchedule(base, cs)
  assert.equal(pl.count, 6); assert.equal(pl.perMonth, 2); assert.equal(pl.basis, 'given')
  assert.equal(pl.starts.get('p1'), '2026-03-01'); assert.equal(pl.starts.get('p2'), addDays('2026-03-01', 15)); assert.equal(pl.starts.get('p3'), addDays('2026-03-01', 30))
  assert.equal(pl.days.get('p1'), 120); assert.equal(pl.finish, addDays(pl.starts.get('p6'), 120))
  // a slower rate pushes the end out and creates misses; the planner reports the rate that would be enough
  const slow = buildSchedule({ ...base, perMonth: 0.5 }, cs); assert.ok(slow.finish > pl.finish && slow.misses > 0)
  assert.ok(slow.neededPerMonth >= 1 && buildSchedule({ ...base, perMonth: slow.neededPerMonth }, cs).misses === 0)
  // no rate given: the smallest rate that meets every need date; with a target duration the rate follows from it
  const auto = buildSchedule({ ...base, perMonth: null }, cs); assert.equal(auto.basis, 'needed'); assert.equal(auto.misses, 0); assert.equal(auto.perMonth, auto.neededPerMonth)
  const tgt = buildSchedule({ ...base, perMonth: null, totalMonths: 12 }, cs); assert.equal(tgt.basis, 'target'); assert.ok(Math.abs(tgt.totalDays - 360) < 40, String(tgt.totalDays))
  // Article 9 files take the preparation time, disputes take longer than the average
  const mixed = buildSchedule({ ...base, art9Days: 20 }, [C('p1', null, { route: 'art9' }), C('p2', null, { route: 'dispute' }), C('p3', null)])
  assert.equal(mixed.days.get('p1'), 20); assert.ok(mixed.days.get('p2') > 120); assert.equal(mixed.days.get('p3'), 120)
  // km order
  assert.equal(buildSchedule({ ...base, order: 'km' }, [C('p9', '2026-04-01'), C('p2', '2027-01-01')]).starts.get('p2'), '2026-03-01')
  const ps = [{ ...p, planStart: '2026-01-01', stages: applyPlan(p, '2026-01-01') }, { ...mk(), planStart: null }]
  const sm = summarizePlan(ps); assert.equal(sm.start, '2026-01-01'); assert.equal(sm.planned, 1); assert.equal(sm.total, 2); assert.ok(sm.span > 100)
  assert.equal(startOf(q), '2026-01-20')
  console.log('landacq/autoplan: all assertions passed')
}

// ── KML route / chainage ──
{
  const { parseKmlRoute, kmFromName } = await import('./kml.ts')
  const { haversine } = await import('./geometry.ts')
  assert.equal(kmFromName('KM 12+500'), 12.5); assert.equal(kmFromName('۱۲+۵۰۰'), 12.5); assert.equal(kmFromName('KP 7.25'), 7.25); assert.equal(kmFromName('km0+000'), 0); assert.equal(kmFromName('Tower 4'), null)
  const A = [50, 30], B = [50.1, 30], C = [50.2, 30.0], D = [50.3, 30.0]
  const ls = (name, pts) => `<Placemark><name>${name}</name><LineString><coordinates>${pts.map((p) => `${p[0]},${p[1]},0`).join(' ')}</coordinates></LineString></Placemark>`
  const pt = (name, p) => `<Placemark><name>${name}</name><Point><coordinates>${p[0]},${p[1]},0</coordinates></Point></Placemark>`
  const dKm = haversine(A, D) / 1000
  const kml = `<kml><Document>${ls('second half (reversed)', [D, C, B])}${ls('first half', [A, B])}${ls('side road', [[51, 31], [51.01, 31.01]])}${pt('KM 10+000', A)}${pt(`KM 19+${String(Math.round((10 + haversine(A, B) / 1000 - 19) * 1000)).padStart(3, '0')}`, [50.1, 30])}${pt('depot', [55, 33])}<Placemark><name>area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>50,30 50.1,30 50.1,30.1 50,30</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`
  const r = parseKmlRoute(kml)
  assert.equal(r.points.length, 4, 'pieces chained, points not mixed in'); assert.ok(Math.abs(r.lengthKm - dKm) < 0.01, `${r.lengthKm} vs ${dKm}`)
  assert.equal(r.ignoredLines, 1); assert.equal(r.posts, 2)
  assert.ok(r.startKm != null && Math.abs(r.startKm - 10) < 0.05, String(r.startKm)); assert.ok(Math.abs(r.endKm - (10 + dKm)) < 0.05)
  assert.ok(Math.abs(r.postMismatchM) < 100)
  // without posts the chainage is left alone; a lone point or empty file gives no route
  const plain = parseKmlRoute(`<kml>${ls('r', [A, B, C])}${pt('x', A)}</kml>`)
  assert.equal(plain.startKm, null); assert.equal(plain.points.length, 3)
  assert.equal(parseKmlRoute('<kml></kml>').points.length, 0)
  console.log('landacq/kml: all assertions passed')
}
