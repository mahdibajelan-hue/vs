import assert from 'node:assert/strict'
import { mean, median, stdev, linreg, normCdf, quantile } from './stats.ts'
import { productivity, resourceElasticity, capacity, validateLogs, DEFAULT_PRODUCTIVITY_PARAMS } from './productivity.ts'
import { compensationScenarios, rankScenarios, resourcesForTarget, DEFAULT_SCENARIO_PARAMS } from './scenarios.ts'
import { forecastActivity } from './forecast.ts'
import { activityReadiness } from './readiness.ts'
import { ppc, deviationCauses, lookaheadWeeks } from './lookahead.ts'
import { reconcile } from './reconcile.ts'
import { buildAlerts } from './alerts.ts'
import { metricTotals } from './aggregate.ts'
import { parseDate, parseScheduleGrid, parsePredecessors, matchActivities } from './scheduleImport.ts'
import { jalaliToIso } from '../../../../lib/jalali.ts'
import { weekdayOf } from '../periods.ts'

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`)
// ── stats
near(mean([1, 2, 3]), 2); near(median([5, 1, 3]), 3); near(median([1, 2, 3, 4]), 2.5); near(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935, 1e-6)
near(linreg([0, 1, 2, 3], [1, 3, 5, 7]).b, 2); near(linreg([0, 1, 2, 3], [1, 3, 5, 7]).r2, 1); near(normCdf(0), 0.5, 1e-6); near(normCdf(1.96), 0.975, 1e-3); near(quantile([1, 2, 3, 4, 5], 0.5), 3)

// ── productivity on a controlled series
const day = (n) => `2026-01-${String(n).padStart(2, '0')}`
const log = (n, out, o = {}) => ({ date: day(n), activityId: 'a', crew: 'C1', composition: { welder: 4, weld_machine: 2 }, usefulHours: 10, idleHours: 0, outputQty: out, approved: true, ...o })
const flat = Array.from({ length: 10 }, (_, i) => log(i + 1, 10))
let p = productivity(flat, day(10), { weighting: 'all' })
near(p.rates.perCrewDay, 10); near(p.rates.perUsefulHour, 1); near(p.rates.perManHour, 0.25); near(p.rates.perEquipHour, 0.5); near(p.rates.sd, 0); near(p.rates.utilisation, 1)
assert.equal(p.rates.days, 10); assert.equal(p.quality.used, 10); assert.equal(p.quality.confidence, 'medium') // 10 days < 14 → medium
// excluded rows: duplicate, no hours, no composition, unapproved, negative; plus a robust outlier
const varied = [9, 10, 11, 10, 10, 9, 11, 10].map((o, i) => log(i + 1, o))
const dirty = [...varied, log(9, 100), log(2, 10), log(10, 5, { usefulHours: 0 }), log(11, 10, { composition: {} }), log(12, 10, { approved: false }), log(13, -1)]
const v = validateLogs(dirty, DEFAULT_PRODUCTIVITY_PARAMS)
const flags = (i) => v[i].issues.slice().sort().join(',')
assert.ok(flags(8).includes('outlier')); assert.ok(flags(1).includes('duplicate') && flags(9).includes('duplicate')); assert.equal(flags(10), 'no_hours'); assert.equal(flags(11), 'no_composition'); assert.equal(flags(12), 'unapproved'); assert.ok(flags(13).includes('negative'))
p = productivity(dirty, day(13), { weighting: 'all', windowDays: 28 })
assert.ok(p.quality.excluded.outlier >= 1 && p.quality.score < 1)
// weighting: recent days weigh more (WMA) than a plain mean when the rate is rising
const rising = Array.from({ length: 10 }, (_, i) => log(i + 1, 10 + i))
const all = productivity(rising, day(10), { weighting: 'all' }).rates.perCrewDay, wma = productivity(rising, day(10), { weighting: 'wma' }).rates.perCrewDay, sma = productivity(rising, day(10), { weighting: 'sma', smaDays: 3 }).rates.perCrewDay
near(all, 14.5); assert.ok(wma > all); near(sma, 18)
near(productivity(rising, day(10), { weighting: 'all' }).rates.trendPerWeek, 7, 1e-6)
// the window really limits history
assert.equal(productivity(rising, day(10), { windowDays: 3, weighting: 'all' }).rates.days, 3)

// ── elasticity: observed from history, otherwise an explicit assumption
const sizes = [4, 6, 8, 4, 6, 8, 4, 6, 8].map((n, i) => ({ date: day(i + 1), activityId: 'a', crew: 'C1', composition: { welder: n }, usefulHours: 10, idleHours: 0, outputQty: 20 * Math.sqrt(n) }))
let el = resourceElasticity(sizes, 'welder'); assert.equal(el.basis, 'observed'); near(el.elasticity, 0.5, 1e-6)
el = resourceElasticity(flat, 'welder', 0.6); assert.equal(el.basis, 'assumed'); near(el.elasticity, 0.6)
// capacity: sub-linear gain, capped by an external constraint, never linear by default
let cap = capacity({ baseRate: 10, baseComposition: { welder: 4 }, newComposition: { welder: 8 }, elasticity: { welder: 0.5 } }); near(cap.rate, 10 * Math.SQRT2, 1e-9); assert.ok(cap.rate < 20)
cap = capacity({ baseRate: 10, baseComposition: { welder: 4 }, newComposition: { welder: 8 }, elasticity: { welder: 0.5 }, constraints: [{ key: 'insp', label: 'بازرسی', maxPerDay: 12 }] }); near(cap.rate, 12); assert.equal(cap.limitedBy.key, 'insp'); near(cap.uncapped, 14.142135, 1e-5)

// ── forecast
const prodFlat = productivity(flat, day(10), { weighting: 'all' })
const wd = [0, 1, 2, 3, 4, 5, 6]
let f = forecastActivity({ activityId: 'a', remainingQty: 100, plannedEnd: '2026-01-16', prod: prodFlat, today: '2026-01-10', workDays: wd })
assert.equal(f.finish, '2026-01-20'); assert.equal(f.onTimeProb, 0); assert.equal(f.lateRisk, 'high'); near(f.requiredPerDay, 100 / 6); near(f.requiredRatio, 100 / 6 / 10, 1e-9)
f = forecastActivity({ activityId: 'a', remainingQty: 50, plannedEnd: '2026-01-20', prod: prodFlat, today: '2026-01-10', workDays: wd })
assert.equal(f.finish, '2026-01-15'); assert.equal(f.lateRisk, 'low')
f = forecastActivity({ activityId: 'a', remainingQty: 50, plannedEnd: '2026-01-20', prod: prodFlat, today: '2026-01-10', workDays: wd, blockers: ['نقشه'] }); assert.equal(f.unreliable, true)
f = forecastActivity({ activityId: 'a', remainingQty: 50, plannedEnd: null, prod: productivity([], day(10)), today: '2026-01-10', workDays: wd }); assert.equal(f.finish, null); assert.equal(f.unreliable, true)

// ── scenarios
const st = { activityId: 'a', title: 'جوش', unit: 'عدد', remainingQty: 100, plannedEnd: '2026-01-06', rate: 10, rateSd: 2, composition: { welder: 4 }, elasticity: { welder: 0.5 }, constraints: [], blockers: [], frontsAvailable: 3 }
const sp = DEFAULT_SCENARIO_PARAMS('2026-01-01', wd)
let sc = compensationScenarios(st, sp)
const get = (id) => sc.find((s) => s.id === id)
assert.equal(get('base').finish, '2026-01-11'); assert.equal(get('base').slackDays, -5)
assert.equal(get('crew1').ratePerDay, 20); assert.equal(get('crew1').finish, '2026-01-06'); assert.equal(get('crew1').slackDays, 0)
near(get('add:welder:1').ratePerDay, 10 * Math.sqrt(5 / 4), 1e-9); assert.ok(get('add:welder:1').ratePerDay < 12.5)  // adding a welder is NOT linear
assert.equal(get('shift2').ratePerDay, 18)
// one front only: extra crews gain nothing
sc = compensationScenarios({ ...st, frontsAvailable: 1 }, sp); assert.equal(sc.find((s) => s.id === 'crew1').ratePerDay, 10); assert.equal(sc.find((s) => s.id === 'crew1').effective, false); assert.ok(sc.find((s) => s.id === 'crew1').limits[0].includes('جبهه'))
// a constraint caps every scenario
sc = compensationScenarios({ ...st, constraints: [{ key: 'insp', label: 'ظرفیت بازرسی', maxPerDay: 12 }] }, sp); assert.ok(sc.filter((s) => s.kind !== 'baseline').every((s) => s.ratePerDay <= 12 + 1e-9))
// blockers: nothing is effective until removed
sc = compensationScenarios({ ...st, blockers: ['نقشه تأییدنشده'] }, sp); assert.equal(sc[0].effective, false); assert.equal(sc[0].ratePerDay, 0); assert.ok(sc[0].limits[0].includes('نقشه'))
// cost and ranking
sc = compensationScenarios(st, { ...sp, crewDayCost: 1000 }); const ranked = rankScenarios(sc)
assert.ok(ranked[0].slackDays >= 0); assert.ok(ranked.every((s) => s.kind !== 'baseline'))
const okCosts = ranked.filter((s) => s.slackDays >= 0).map((s) => s.cost ?? Infinity); assert.deepEqual(okCosts, [...okCosts].sort((a, b) => a - b))
// resources for a target
let rt = resourcesForTarget(st, 25); assert.equal(rt.reachable, true); assert.equal(rt.extraCrews, 2)
rt = resourcesForTarget({ ...st, constraints: [{ key: 'insp', label: 'بازرسی', maxPerDay: 15 }] }, 25); assert.equal(rt.reachable, false); assert.equal(rt.cap.key, 'insp')
assert.equal(resourcesForTarget({ ...st, blockers: ['x'] }, 25).reachable, false)

// ── readiness: only prerequisites decide, crews on site do not
const docs = new Map([['d1', { id: 'd1', docNo: 'DWG-1', title: '', rev: 'B', status: 'approved', restrictionNote: '', dueDate: null }], ['d2', { id: 'd2', docNo: 'DWG-2', title: '', rev: 'A', status: 'restricted', restrictionNote: 'منتظر مجوز', dueDate: null }]])
const supply = new Map([['m1', { id: 'm1', onSite: 40, required: 100 }], ['m2', { id: 'm2', onSite: 100, required: 100 }]])
const pr = (id, o) => ({ id, activityId: 'a', kind: 'material', title: id, refType: '', refId: null, status: 'pending', neededDate: null, readyDate: null, ...o })
let rd = activityReadiness('a', [pr('p1', { kind: 'drawing', refType: 'eng_doc', refId: 'd1' }), pr('p2', { refType: 'material', refId: 'm2' })], docs, supply, '2026-01-01'); assert.equal(rd.state, 'ready')
rd = activityReadiness('a', [pr('p1', { kind: 'drawing', refType: 'eng_doc', refId: 'd2' }), pr('p2', { refType: 'material', refId: 'm1' })], docs, supply, '2026-01-01'); assert.equal(rd.state, 'blocked'); assert.ok(rd.blockers[0].includes('منتظر مجوز'))
rd = activityReadiness('a', [pr('p2', { refType: 'material', refId: 'm1' })], docs, supply, '2026-01-01'); assert.equal(rd.state, 'at_risk')
rd = activityReadiness('a', [pr('p3', { kind: 'permit', status: 'pending', neededDate: '2025-12-30' })], docs, supply, '2026-01-01'); assert.equal(rd.state, 'at_risk'); assert.ok(rd.items[0].reason.includes('گذشته'))
assert.equal(activityReadiness('zzz', [pr('p9')], docs, supply, '2026-01-01').state, 'unknown')
assert.equal(activityReadiness('a', [pr('p9', { status: 'na' })], docs, supply, '2026-01-01').state, 'ready')

// ── look-ahead: PPC and over-commitment against predicted capacity
const li = (id, o) => ({ id, weekStart: '2026-01-03', activityId: 'a', front: 'F', responsible: '', plannedQty: 100, committed: true, achievedQty: 95, deviationCause: '', recoveryPlan: '', ...o })
const items = [li('1'), li('2', { achievedQty: 50, deviationCause: 'کمبود لوله' }), li('3', { achievedQty: 40, deviationCause: 'کمبود لوله' }), li('4', { committed: false, achievedQty: 0 }), li('5', { achievedQty: 90 })]
near(ppc(items, '2026-01-03').ppc, 2 / 4); assert.equal(ppc(items, '2026-01-03').committed, 4)
assert.deepEqual(deviationCauses(items), [{ cause: 'کمبود لوله', count: 2 }]); assert.equal(ppc(items, '2026-02-01').ppc, null)
const wk = lookaheadWeeks([li('9', { weekStart: '2026-01-03', plannedQty: 200 })], '2026-01-05', 0, weekdayOf, new Map([['a', 120]]))
assert.equal(wk.length, 3); assert.equal(wk[0].weekStart, '2026-01-03'); assert.equal(wk[0].overCommit.length, 1)

// ── reconciliation of the five quantity concepts
const rows = (a) => a.map(([periodKey, measured, billed, paid, certificateId = 'c']) => ({ activityId: 'a', periodKey, measured, billed, paid, certificateId }))
let led = reconcile([{ activityId: 'a', title: 'x', unit: 'm', executed: 100, approved: 90, employer: null, evidenceMissing: 0, rows: rows([['1', 40, 40, 30], ['2', 30, 20, 10]]) }])[0]
assert.equal(led.measured, 70); assert.equal(led.billed, 60); assert.equal(led.paid, 40); assert.equal(led.toMeasure, 20); assert.equal(led.toBill, 10); assert.equal(led.toPay, 20); assert.equal(led.mismatches.length, 0)
led = reconcile([{ activityId: 'a', title: 'x', unit: 'm', executed: 100, approved: 90, employer: 80, evidenceMissing: 3, rows: rows([['1', 85, 90, 95, null]]) }])[0]
assert.deepEqual(led.mismatches.map((m) => m.kind).sort(), ['approved_without_evidence', 'billed_over_measured', 'billed_without_certificate', 'measured_over_approved', 'paid_over_billed'])
led = reconcile([{ activityId: 'a', title: 'x', unit: 'm', executed: 100, approved: 90, employer: null, evidenceMissing: 0, rows: [] }])[0]; assert.deepEqual(led.mismatches.map((m) => m.kind), ['approved_not_measured'])
assert.equal(reconcile([{ activityId: 'a', title: 'x', unit: 'm', executed: 50, approved: 60, employer: null, evidenceMissing: 0, rows: [] }])[0].mismatches[0].kind, 'approved_over_executed')

// ── alerts: every alert carries its rule
const al = buildAlerts({ today: '2026-01-01', spi: 0.7, forecasts: [{ activityId: 'a', title: 'جوش', onTimeProb: 0.2, lateRisk: 'high', unreliable: false }, { activityId: 'b', title: 'مه', onTimeProb: 0.1, lateRisk: 'high', unreliable: true }],
  readiness: [{ activityId: 'c', title: 'حفاری', state: 'blocked', blockers: ['نقشه'], earliestStart: null, plannedStart: null }, { activityId: 'd', title: 'خم', state: 'at_risk', blockers: [], earliestStart: null, plannedStart: '2026-01-05' }],
  overdueReports: [{ id: 'r', reportNo: 'WRK-1', days: 5 }, { id: 'r2', reportNo: 'WRK-2', days: 1 }], ppcLast: { ppc: 0.5, committed: 4 }, ledger: [{ activityId: 'a', title: 'جوش', approved: 100, toMeasure: 30, mismatches: 0 }, { activityId: 'e', title: 'لوله', approved: 10, toMeasure: 0, mismatches: 2 }], dataQualityLow: [{ activityId: 'a', title: 'جوش' }] })
assert.equal(al[0].severity, 'critical'); assert.ok(al.every((a) => a.reason.length > 3))
assert.ok(al.some((a) => a.id === 'spi' && a.severity === 'critical')); assert.ok(!al.some((a) => a.id === 'fc:b'));  assert.ok(!al.some((a) => a.id === 'rv:r2')); assert.ok(al.some((a) => a.id === 'rr:d')); assert.ok(al.some((a) => a.id === 'ppc')); assert.ok(al.some((a) => a.id === 'fl:e')); assert.ok(al.some((a) => a.id === 'fm:a'))

// ── metric totals: only same-metric activities are added
const mt = metricTotals([{ id: '1', metric: 'weld_joint', baseQty: 100, unit: 'عدد' }, { id: '2', metric: 'weld_joint', baseQty: 50, unit: 'عدد' }, { id: '3', metric: 'excavation_m', baseQty: 1000, unit: 'm' }, { id: '4', metric: '', baseQty: 5, unit: 'x' }], new Map([['1', 120], ['2', 10]]))
const w = mt.find((x) => x.key === 'weld_joint'); assert.equal(w.base, 150); assert.equal(w.done, 110); assert.equal(w.remaining, 40); assert.equal(mt.length, 2); assert.equal(mt.find((x) => x.key === 'excavation_m').done, 0)

// ── schedule import
assert.equal(parseDate(46023), '2026-01-01'); assert.equal(parseDate('2026-01-05'), '2026-01-05'); assert.equal(parseDate('05/01/2026'), '2026-01-05'); assert.equal(parseDate('1404/09/07'), jalaliToIso(1404, 9, 7)); assert.equal(parseDate('۱۴۰۴/۰۹/۰۷'), jalaliToIso(1404, 9, 7)); assert.equal(parseDate('abc'), null)
const g = [['گزارش', '', ''], ['Activity ID', 'Activity Name', 'Start', 'Finish', 'Predecessors', '% Complete'], ['510226007', 'جوشکاری خط', 46023, 46030, '', 50], ['A2', 'تست', 'xx', '2026-02-01', '510226007FS+2d;A3 SS', 0.1], ['', '', '', '', '', '']]
const ps = parseScheduleGrid(g); assert.equal(ps.rows.length, 2); assert.equal(ps.rows[0].start, '2026-01-01'); near(ps.rows[0].pctComplete, 0.5); near(ps.rows[1].pctComplete, 0.1); assert.equal(ps.issues.length, 1); assert.ok(ps.issues[0].message.includes('شروع'))
assert.deepEqual(parsePredecessors(ps.rows[1].predecessors), [{ predCode: '510226007', type: 'FS', lag: 2 }, { predCode: 'A3', type: 'SS', lag: 0 }]); assert.deepEqual(parsePredecessors('12'), [{ predCode: '12', type: 'FS', lag: 0 }])
assert.equal(parseScheduleGrid([['x', 'y']]).rows.length, 0)
const mres = matchActivities(ps.rows, [{ id: 'A', itemNo: '510226007', rowNo: '', title: 'x' }, { id: 'B', itemNo: '', rowNo: '', title: 'تست' }, { id: 'C', itemNo: '', rowNo: '', title: 'تست' }])
assert.equal(mres.matched.length, 1); assert.equal(mres.matched[0].activityId, 'A'); assert.equal(mres.ambiguous.length, 1); assert.equal(mres.unmatched.length, 0)
console.log('engine tests ok')

// ── employer step in the cumulative: binding counts only the employer-confirmed quantity
import { lineValue, cumulative } from '../progress.ts'
const ln = (o) => ({ id: 'l', reportId: 'r', lineNo: 1, activityId: 'a', qty: 40, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status: 'approved', approvedQty: 30, reviewNote: '', sourceReportId: null, ...o })
assert.equal(lineValue(ln({}), 'approved'), 30); assert.equal(lineValue(ln({}), 'approved', 'advisory'), 30)
assert.equal(lineValue(ln({}), 'approved', 'binding'), 0); assert.equal(lineValue(ln({ employerStatus: 'approved', employerQty: 25 }), 'approved', 'binding'), 25); assert.equal(lineValue(ln({ employerStatus: 'rejected', employerQty: 0 }), 'approved', 'binding'), 0)
console.log('employer-step tests ok')
