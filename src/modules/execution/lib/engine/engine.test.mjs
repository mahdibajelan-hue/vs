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
rd = activityReadiness('a', [pr('p1', { kind: 'drawing', refType: 'eng_doc', refId: 'd2' }), pr('p2', { refType: 'material', refId: 'm1' })], docs, supply, '2026-01-01'); assert.equal(rd.state, 'at_risk'); assert.ok(rd.items[0].reason.includes('منتظر مجوز'))
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

// ── assistant: answers only from the facts, says so when it cannot
import { answer } from './assistant.ts'
const facts = { today: '2026-01-10', projectName: 'پروژه', progress: { actual: 0.4, planned: 0.5, spi: 0.8 },
  activities: [{ id: 'a', title: 'جوشکاری', unit: 'عدد', remaining: 100, pct: 0.3, plannedEnd: '2026-01-20', late: true, forecastFinish: '2026-02-01', onTimeProb: 0.1, lateRisk: 'high', unreliable: false, readiness: 'blocked', blockers: ['نقشه'], front: 'شمال' }],
  stoppages: [{ category: 'material', hours: 30, critical: true }, { category: 'weather', hours: 5, critical: false }], alerts: [{ severity: 'critical', title: 'فعالیت مسدود', reason: 'x' }], ledger: [{ title: 'لوله', mismatches: ['اندازه‌گیری > تأییدشده'] }],
  lookahead: { ppc: 0.5, committed: 4, missed: [{ title: 'خم', cause: 'کمبود لوله' }] }, pendingReviews: 2,
  welding: [{ title: 'جوشکاری', remaining: 100, perDay: 10, requiredPerDay: 25, extraCrews: 2, reachable: true, capLabel: null, basis: 'assumed', confidence: 'medium', workDays: 18 }] }
let an = answer('امروز هر پروژه نسبت به برنامه در چه وضعیتی است؟', facts); assert.ok(an.text.includes('۴۰٫۰٪') || an.text.includes('۴۰'), an.text); assert.ok(an.known); assert.equal(an.asOf, '2026-01-10'); assert.ok(an.sources.length)
an = answer('کدام جبهه‌ها بیشترین عقب‌ماندگی را دارند و علت اصلی چیست؟', facts); assert.ok(an.text.includes('شمال') && an.text.includes('کمبود مصالح'))
an = answer('برای جبران عقب‌ماندگی جوشکاری در سه هفته آینده چه منابعی لازم است؟', facts); assert.ok(an.text.includes('۲ اکیپ') && an.text.includes('ضریب فرضی'))
an = answer('چه موانع مهندسی یا تأمین کالایی اثر دارند؟', facts); assert.ok(an.text.includes('نقشه') && an.text.includes('مسدود'))
an = answer('کدام تعهدات انجام نشده است؟', facts); assert.ok(an.text.includes('کمبود لوله'))
an = answer('وضعیت مقادیر اجرایی در مقایسه با صورت‌وضعیت چیست؟', facts); assert.ok(an.text.includes('لوله') && an.text.includes('استحقاق پرداخت'))
an = answer('چه تصمیم‌هایی لازم است؟', facts); assert.ok(an.text.includes('فعالیت مسدود') && an.text.includes('۲'))
an = answer('قیمت دلار چند است؟', facts); assert.equal(an.known, false); assert.ok(an.text.includes('ممکن نیست'))
an = answer('برای جبران جوشکاری چه لازم است', { ...facts, welding: [{ ...facts.welding[0], perDay: null, requiredPerDay: null }] }); assert.ok(an.text.includes('ممکن نیست'))
console.log('assistant tests ok')

// ── engineering progress, forecast, float, impact, readiness
import { engProgress, engProgressBy, forecastDoc, forecastCompletion, linkState, totalFloat, docImpact, execReadiness, DEFAULT_ENG_RULES } from './engineering.ts'
const doc = (id, o = {}) => ({ id, code: id.toUpperCase(), title: id, discipline: 'civil', contract: 'C1', weight: 1, critical: false, plannedPrepared: '2026-01-05', plannedApproved: '2026-01-10', actualPrepared: null, actualApproved: null, status: 'required', ...o })
const edocs = [doc('d1', { weight: 2, status: 'approved', actualPrepared: '2026-01-04', actualApproved: '2026-01-12' }), doc('d2', { weight: 1, status: 'issued', actualPrepared: '2026-01-06' }), doc('d3', { weight: 1, status: 'restricted', actualPrepared: '2026-01-05', actualApproved: '2026-01-10' }), doc('d4', { weight: 0, status: 'approved', actualApproved: '2026-01-01', actualPrepared: '2026-01-01' }), doc('d5', { weight: 4, status: 'required', plannedPrepared: '2026-03-01', plannedApproved: '2026-03-10' })]
let ep = engProgress(edocs, '2026-01-20')
// weights 2+1+1+4 = 8 (d4 has weight 0 and is ignored); planned prepared by 01-20: d1,d2,d3 = 4/8; actual prepared: d1,d2,d3 = 4/8; approved: d1,d3 = 3/8; ready = (2 + .5)/8
near(ep.plannedPrepared, 0.5); near(ep.actualPrepared, 0.5); near(ep.plannedApproved, 0.5); near(ep.actualApproved, 3 / 8); near(ep.ready, 2.5 / 8); near(ep.actualScore, 0.6 * 0.5 + 0.4 * 3 / 8); assert.equal(ep.docs, 4)
near(engProgress(edocs, '2026-01-03').actualPrepared, 0) // before anything happened (string date compare)
assert.equal(engProgressBy([doc('a', { discipline: 'civil' }), doc('b', { discipline: 'mech', weight: 3 })], '2026-02-01', 'discipline')[0].key, 'mech')
// forecast of a late document: discipline slip learned from completed ones
const done = [doc('c1', { plannedApproved: '2026-01-10', actualApproved: '2026-01-20', status: 'approved' }), doc('c2', { plannedApproved: '2026-01-10', actualApproved: '2026-01-16', status: 'approved' }), doc('c3', { plannedApproved: '2026-01-10', actualApproved: '2026-01-14', status: 'approved' })]
const open1 = doc('o1', { plannedApproved: '2026-02-01', status: 'in_preparation' })
let fd = forecastDoc(open1, [...done, open1], '2026-01-25'); assert.equal(fd.lagDays, 7); assert.equal(fd.expectedApproval, '2026-02-08'); assert.equal(fd.overdue, false); assert.equal(fd.sample, 3)
fd = forecastDoc(doc('o2', { plannedApproved: '2026-01-05', status: 'in_preparation' }), [...done], '2026-01-25'); assert.equal(fd.overdue, true); assert.equal(fd.overdueDays, 20); assert.equal(fd.expectedApproval, '2026-01-25') // never earlier than today
fd = forecastDoc(open1, [open1, done[0]], '2026-01-25'); assert.equal(fd.expectedApproval, null); assert.ok(fd.reason.includes('کافی نیست')); assert.equal(forecastDoc(doc('o3', { plannedApproved: null }), done, '2026-01-25').expectedApproval, null)
// completion forecast from recent throughput
const fc2 = forecastCompletion([doc('x1', { weight: 2, status: 'approved', actualApproved: '2026-01-20' }), doc('x2', { weight: 2, status: 'approved', actualApproved: '2026-01-24' }), doc('x3', { weight: 8, status: 'in_preparation' })], '2026-02-01', { ...DEFAULT_ENG_RULES, windowDays: 42 })
near(fc2.ratePerWeek, 4 / 42 * 7); assert.equal(fc2.date, '2026-04-26') // remaining 8 / (4/42 per day) = 84 days → 2026-02-01 + 84
assert.equal(forecastCompletion([doc('y', { weight: 3, status: 'approved', actualApproved: '2026-01-20' }), doc('y2', { weight: 3 })], '2026-02-01').date, null)
// link state against the required status
const lk = (o = {}) => ({ id: 'l', docId: 'd', activityId: 'a', front: '', needKind: 'start', needDate: '2026-02-10', minStatus: 'approved', allowRestricted: false, altActivityId: null, ...o })
assert.equal(linkState(lk(), doc('d', { status: 'approved' })), 'ok'); assert.equal(linkState(lk(), doc('d', { status: 'issued' })), 'open'); assert.equal(linkState(lk({ minStatus: 'issued' }), doc('d', { status: 'issued' })), 'ok')
assert.equal(linkState(lk(), doc('d', { status: 'restricted' })), 'open'); assert.equal(linkState(lk({ allowRestricted: true }), doc('d', { status: 'restricted' })), 'restricted'); assert.equal(linkState(lk(), undefined), 'missing')
// float: A→B→C chain, project end = C end; D standalone
const A = { id: 'A', plannedStart: '2026-02-01', plannedEnd: '2026-02-10' }, B = { id: 'B', plannedStart: '2026-02-11', plannedEnd: '2026-02-20' }, C = { id: 'C', plannedStart: '2026-02-21', plannedEnd: '2026-03-01' }, Dd = { id: 'D', plannedStart: '2026-02-01', plannedEnd: '2026-02-05' }, E = { id: 'E', plannedStart: '2026-02-01', plannedEnd: '2026-02-05' }
let fl = totalFloat([A, B, C, Dd], [{ predId: 'A', succId: 'B', type: 'FS', lag: 0 }, { predId: 'B', succId: 'C', type: 'FS', lag: 0 }])
assert.equal(fl.get('A').float, 0); assert.equal(fl.get('C').float, 0); assert.equal(fl.get('D').assumed, true); assert.equal(fl.get('A').assumed, false)
// D feeds C with slack: D ends 02-05, C starts 02-21 → 15 days between end and C's late start
fl = totalFloat([A, B, C, Dd], [{ predId: 'A', succId: 'B', type: 'FS', lag: 0 }, { predId: 'B', succId: 'C', type: 'FS', lag: 0 }, { predId: 'D', succId: 'C', type: 'FS', lag: 0 }]); assert.equal(fl.get('D').float, 15); assert.equal(fl.get('D').assumed, false)
// impact: need date independent of the planned issue date; float and alternatives absorb the delay
const actD = { id: 'D', title: 'D', plannedStart: '2026-02-01', plannedEnd: '2026-02-05' }
const baseIn = { link: lk({ activityId: 'D', needDate: '2026-02-01' }), doc: doc('d', { status: 'in_preparation', plannedApproved: '2026-01-25' }), forecast: { docId: 'd', overdue: false, overdueDays: 0, expectedApproval: '2026-02-11', lagDays: 5, sample: 4, reason: 'r' }, activity: actD, float: { float: 15, assumed: false }, today: '2026-01-25' }
let im = docImpact(baseIn); assert.equal(im.lateDays, 10); assert.equal(im.projectSlipDays, 0); assert.equal(im.absorbedBy, 'float'); assert.equal(im.startSlipDays, 10)
im = docImpact({ ...baseIn, float: { float: 4, assumed: false } }); assert.equal(im.projectSlipDays, 6)
im = docImpact({ ...baseIn, float: { float: 0, assumed: true } }); assert.equal(im.projectSlipDays, 10); assert.ok(im.assumptions.some((x) => x.includes('شناوری صفر')))
im = docImpact({ ...baseIn, link: lk({ activityId: 'D', needDate: '2026-02-01', altActivityId: 'Z' }) }); assert.equal(im.absorbedBy, 'alternative'); assert.equal(im.projectSlipDays, 0)
im = docImpact({ ...baseIn, forecast: { ...baseIn.forecast, expectedApproval: null, reason: 'نمونه کافی نیست' } }); assert.equal(im.known, false); assert.equal(im.projectSlipDays, null)
im = docImpact({ ...baseIn, link: lk({ needDate: null }), activity: { ...actD, plannedStart: null } }); assert.equal(im.known, false)
im = docImpact({ ...baseIn, doc: doc('d', { status: 'approved' }) }); assert.equal(im.projectSlipDays, 0); assert.equal(im.state, 'ok')
// readiness: a document alone never makes an activity ready
const okDoc = { impact: { state: 'ok' }, docCode: 'D1', needDate: '2026-02-01' }
assert.equal(execReadiness({ docs: [okDoc], others: [{ title: 'لوله', state: 'blocked' }], today: '2026-01-25' }).state, 'not_ready')
assert.equal(execReadiness({ docs: [okDoc], others: [{ title: 'مجوز', state: 'pending' }], today: '2026-01-25' }).state, 'ready_with_restrictions')
assert.equal(execReadiness({ docs: [okDoc], others: [], today: '2026-01-25' }).state, 'ready')
assert.equal(execReadiness({ docs: [{ impact: { state: 'open' }, docCode: 'D2', needDate: '2026-01-20' }], others: [], today: '2026-01-25' }).state, 'not_ready')
const fut = execReadiness({ docs: [{ impact: { state: 'open' }, docCode: 'D2', needDate: '2026-03-01' }], others: [], today: '2026-01-25' }); assert.equal(fut.state, 'ready_with_restrictions'); assert.deepEqual(fut.open, ['مدرک D2'])
assert.equal(execReadiness({ docs: [{ impact: { state: 'restricted' }, docCode: 'D3', needDate: null }], others: [], today: '2026-01-25' }).state, 'ready_with_restrictions')
console.log('engineering tests ok')
