import assert from 'node:assert/strict'
import { EXCEL_FIELDS, findHeaderRow, suggestMapping, parseExcelGrid, templateGrid } from './excel.ts'
import { validateParsed, countIssues } from './validate.ts'
import { compareVersions } from './compare.ts'
import { plannedPct, progressAt, overdueActivities, lookahead, finishVariance, activitySlips } from './variance.ts'
import { integrateActivity, emptySources, supplyDelayImpact } from './integration.ts'
import { computeSchedule } from './schedule.ts'
import { runMonteCarlo, triangular, mulberry32, percentile } from './monteCarlo.ts'
import { WorkCalendar } from './calendar.ts'

const CAL = { workDays: [0, 1, 2, 3, 4], holidays: [], hoursPerDay: 8 }
const act = (code, dur, o = {}) => ({ id: code, uid: `u-${code}`, versionId: 'v', code, sourceId: code, name: `act ${code}`, wbsCode: '', wbsPath: '', type: dur === 0 ? 'milestone' : 'task', calendarId: null, origDuration: dur, remDuration: null, plannedStart: '2026-01-03', plannedFinish: null, actualStart: null, actualFinish: null, pctComplete: null, constraintType: '', constraintDate: null, budgetCost: 0, owner: '', sort: 0, ...o })
const rel = (p, s, type = 'FS', lag = 0) => ({ id: `${p}${s}${type}`, versionId: 'v', predId: p, succId: s, type, lag })

// ── Excel: header detection, mapping (English / Persian / Persian digits), duplicate & dangling-predecessor checks
const grid = [
  ['گزارش برنامه'], [],
  ['کد فعالیت', 'نام فعالیت', 'نوع', 'مدت', 'تاریخ شروع', 'تاریخ پایان', 'پیش‌نیازها', 'درصد پیشرفت'],
  ['A1', 'مهندسی', 'فعالیت', 5, '2026-01-03', '2026-01-07', '', 100],
  ['A2', 'تأمین', '', 3, '1404/10/20', '', 'A1FS+1', ''],
  ['A2', 'تکراری', '', 1, '', '', '', ''],
  ['A3', 'خطا', '', 2, 'not a date', '', 'ZZ', ''],
  ['M1', 'پایان', 'نقطه عطف', '', '2026-01-20', '2026-01-20', 'A2;A3SS', 0.5],
]
assert.equal(findHeaderRow(grid), 2)
const map = suggestMapping(grid[2].map(String))
assert.equal(map.code, 0); assert.equal(map.name, 1); assert.equal(map.predecessors, 6); assert.equal(map.cost, -1)
const px = parseExcelGrid(grid, 2, map)
assert.equal(px.activities.length, 4)                                           // the duplicate A2 row is rejected
assert.ok(px.issues.some((i) => i.level === 'error' && i.code === 'A2' && /تکراری/.test(i.message)))
assert.ok(px.issues.some((i) => i.level === 'error' && /not a date/.test(i.message)))
assert.ok(px.issues.some((i) => i.level === 'error' && /ZZ/.test(i.message)))      // dangling predecessor
assert.equal(px.activities.find((a) => a.code === 'M1').type, 'milestone'); assert.equal(px.activities.find((a) => a.code === 'M1').pctComplete, 50)
assert.equal(px.relations.length, 3); assert.equal(px.relations.find((r) => r.succCode === 'A2').lag, 1)
assert.equal(px.activities.find((a) => a.code === 'A2').plannedStart, '2026-01-10')   // Jalali 1404/10/20 → 2026-01-10
assert.ok(countIssues(px.issues).errors >= 3)
// missing required column
assert.ok(parseExcelGrid(grid, 2, { ...map, code: -1 }).issues[0].message.includes('کد فعالیت'))
// the downloadable template parses clean
const t = templateGrid(); assert.equal(t[0].length, EXCEL_FIELDS.length)
const tp = parseExcelGrid(t, 0, suggestMapping(t[0].map(String)))
assert.equal(countIssues(tp.issues).errors, 0); assert.equal(tp.activities.length, 4); assert.equal(tp.relations.length, 3)
assert.equal(validateParsed(tp).filter((i) => i.level === 'error').length, 0)

// ── version comparison
const v1 = { activities: [act('A', 5, { plannedFinish: '2026-01-07' }), act('B', 3, { plannedStart: '2026-01-10', plannedFinish: '2026-01-12' }), act('C', 2)], relations: [rel('A', 'B'), rel('A', 'C')], calendar: CAL }
const v2 = { activities: [act('A', 7, { id: 'A2', plannedFinish: '2026-01-11' }), act('B', 3, { id: 'B2', plannedStart: '2026-01-14', plannedFinish: '2026-01-16' }), act('N', 1, { id: 'N2', uid: 'u-new' })], relations: [{ ...rel('A', 'B'), id: 'x1', predId: 'A2', succId: 'B2', lag: 2 }, { ...rel('A', 'N'), id: 'x2', predId: 'A2', succId: 'N2' }], calendar: { ...CAL, holidays: ['2026-02-01'] } }
const d = compareVersions(v1, v2)
assert.deepEqual(d.added.map((a) => a.code), ['N']); assert.deepEqual(d.removed.map((a) => a.code), ['C'])
assert.deepEqual(d.changed.map((c) => c.code).sort(), ['A', 'B'])
assert.equal(d.changed.find((c) => c.code === 'A').changes.find((x) => x.field === 'مدت').shift, 2)
assert.equal(d.changed.find((c) => c.code === 'B').changes.find((x) => x.field === 'شروع').shift, 4)
assert.equal(d.counts.relationsAdded, 1); assert.equal(d.counts.relationsRemoved, 1); assert.equal(d.counts.relationsChanged, 1)
assert.deepEqual(d.relationsChanged[0].from, { type: 'FS', lag: 0 }); assert.ok(d.calendarChanges.length === 1)
assert.equal(compareVersions(v1, v1).counts.changed, 0)

// ── progress & variance
const cal = new WorkCalendar(CAL, '2026-01-03')
const base = [act('A', 5, { plannedStart: '2026-01-03', plannedFinish: '2026-01-07' }), act('B', 5, { plannedStart: '2026-01-10', plannedFinish: '2026-01-14' })]
assert.equal(plannedPct(base[0], '2026-01-02', cal), 0); assert.equal(plannedPct(base[0], '2026-01-07', cal), 100); assert.equal(Math.round(plannedPct(base[0], '2026-01-05', cal)), 60)
const pr = progressAt(base, '2026-01-10', CAL, new Map([['A', { approved: 100, reported: 100, file: null }], ['B', { approved: null, reported: 40, file: null }]]))
assert.equal(Math.round(pr.planned), 60)                 // A 100% + B 20% at its first day → (100+20)/2
assert.equal(Math.round(pr.actual), 50)                  // only approved/file figures are settled: B counts 0 until approved
assert.equal(Math.round(pr.reportedOverall), 70)         // the reported (unapproved) quantity is shown separately
assert.equal(pr.settledShare, 0.5); assert.ok(pr.spi < 1)
assert.equal(pr.rows[1].approved, null); assert.equal(pr.rows[1].reported, 40)
const od = overdueActivities([act('A', 5, { plannedFinish: '2026-01-07' }), act('B', 5, { plannedStart: '2026-01-09', plannedFinish: '2026-01-14' })], '2026-01-10', new Set(['A']))
assert.deepEqual(od.map((o) => [o.code, o.kind, o.days]), [['A', 'late_finish', 3], ['B', 'late_start', 1]])
// forecast vs baseline + look-ahead
const acts = [act('A', 5, { plannedFinish: '2026-01-07' }), act('B', 3, { plannedStart: '2026-01-10', plannedFinish: '2026-01-12' }), act('C', 2, { plannedStart: '2026-01-10', plannedFinish: '2026-01-11' }), act('D', 1, { plannedStart: '2026-01-13', plannedFinish: '2026-01-13' })]
const rels = [rel('A', 'B'), rel('A', 'C'), rel('B', 'D'), rel('C', 'D')]
const plan = computeSchedule({ activities: acts, relations: rels, calendar: CAL, mode: 'plan' })
const late = acts.map((a) => (a.code === 'A' ? { ...a, actualStart: '2026-01-03', pctComplete: 40 } : a))
const fc = computeSchedule({ activities: late, relations: rels, calendar: CAL, mode: 'forecast', dataDate: '2026-01-10' })
const fv = finishVariance(plan, fc); assert.ok(fv.slipDays > 0)
assert.ok(activitySlips(acts, late, fc).find((s) => s.code === 'D').finishSlip > 0)
assert.ok(lookahead(late, fc, '2026-01-10', 3).length >= 3)
assert.equal(lookahead(late, fc, '2026-01-10', 3).some((r) => r.status === 'complete'), false)

// ── integration: documents, supply, risks; delay impact is computed, not assumed
const src = emptySources()
src.docs.set('d1', { id: 'd1', docNo: 'ME-001', title: 'P&ID', status: 'issued', plannedApproved: '2026-01-05', actualApproved: null, expectedApproval: null, critical: false })
src.docs.set('d2', { id: 'd2', docNo: 'ME-002', title: 'ISO', status: 'approved', plannedApproved: null, actualApproved: '2026-01-02', expectedApproval: null, critical: false })
src.packages.set('p1', { id: 'p1', code: 'PKG-1', title: 'Pipe', status: 'active', delivery: 'pending', expectedDelivery: '2026-01-25', plannedDelivery: '2026-01-08' })
src.exec.set('e1', { id: 'e1', title: 'Welding', approvedPct: 30, reportedPct: 55, rejectedQty: 4 })
src.risks.set('r1', { id: 'r1', code: 'R-1', title: 'Weather', open: true })
const L = (t, id, o = {}) => ({ id: t + id, projectId: 'p', activityUid: 'u-C', targetType: t, targetId: id, needKind: 'start', needDate: null, note: '', ...o })
const links = [L('eng_doc', 'd1', { needDate: '2026-01-08' }), L('eng_doc', 'd2'), L('mtl_package', 'p1', { needDate: '2026-01-10' }), L('exec_activity', 'e1'), L('risk', 'r1')]
const ig = integrateActivity('u-C', links, src, { today: '2026-01-10', forecastStart: '2026-01-10' })
assert.equal(ig.docsTotal, 2); assert.equal(ig.docsReady, 1)                       // an approved document is a satisfied prerequisite…
assert.equal(ig.execApproved, 30); assert.equal(ig.execReported, 55); assert.equal(ig.execRejectedQty, 4)   // …progress comes only from execution and stays split
assert.equal(ig.readiness, 'blocked'); assert.ok(ig.blockers.some((b) => b.kind === 'eng_doc' && b.severity === 'high'))
assert.equal(ig.startNoEarlier, '2026-01-25'); assert.equal(ig.openRisks, 1)
assert.equal(integrateActivity('u-X', links, src, { today: '2026-01-10', forecastStart: null }).readiness, 'unknown')
const ok = integrateActivity('u-C', [L('eng_doc', 'd2')], src, { today: '2026-01-10', forecastStart: '2026-01-10' }); assert.equal(ok.readiness, 'ready')
// late package on a floating activity (C has 1 day float) is partly absorbed; on a critical one it is not
const impact = supplyDelayImpact({ activities: acts, relations: rels, calendar: CAL, mode: 'plan' }, new Map([['u-C', { ...ig, startNoEarlier: '2026-01-11' }]]), new Map([['u-C', 'C']]), new Map([['C', 'C']]))
assert.equal(impact.items[0].absorbed, true); assert.equal(impact.overall, 0)
const impact2 = supplyDelayImpact({ activities: acts, relations: rels, calendar: CAL, mode: 'plan' }, new Map([['u-C', { ...ig, startNoEarlier: '2026-01-25' }]]), new Map([['u-C', 'C']]), new Map([['C', 'C']]))
assert.ok(impact2.overall > 0); assert.equal(impact2.items[0].absorbed, false)

// ── Monte Carlo
const rnd = mulberry32(1); const u = Array.from({ length: 5000 }, rnd)
assert.ok(Math.abs(u.reduce((a, b) => a + b, 0) / u.length - 0.5) < 0.02)
const tri = Array.from({ length: 5000 }, () => triangular(rnd(), 2, 4, 10)); assert.ok(tri.every((x) => x >= 2 && x <= 10)); assert.ok(Math.abs(tri.reduce((a, b) => a + b, 0) / tri.length - 5.333) < 0.15)
assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3)
const schedule = { activities: acts.map((a) => ({ ...a, budgetCost: 100 })), relations: rels, calendar: CAL, mode: 'plan' }
const none = runMonteCarlo({ schedule, durationRisks: [], events: [], iterations: 300, seed: 7 })
assert.ok(none.ok); assert.equal(none.finish.p80, none.deterministicFinish); assert.ok(none.warnings.some((w) => /عدم‌قطعیت/.test(w)))     // no inputs → equals the deterministic forecast
const risky = runMonteCarlo({ schedule, durationRisks: [{ uid: 'u-B', min: 3, likely: 3, max: 9 }], events: [{ id: 'e', title: 'Strike', probability: 0.5, days: { min: 1, likely: 2, max: 4 }, cost: { min: 10, likely: 20, max: 40 }, activityUids: ['u-D'], active: true }], iterations: 1500, seed: 7 })
assert.ok(risky.ok); assert.ok(risky.finish.p80 > risky.deterministicFinish); assert.ok(risky.finish.p10 <= risky.finish.p50 && risky.finish.p50 <= risky.finish.p80 && risky.finish.p80 <= risky.finish.p90)
assert.ok(risky.reserveDays.p80 > 0); assert.equal(risky.histogram.reduce((a, b) => a + b.count, 0), 1500)
assert.ok(risky.cost.p80 > risky.cost.base); assert.ok(Math.abs(risky.eventHits[0].hitRate - 0.5) < 0.06)
assert.equal(risky.sensitivity[0].code, 'B'); assert.ok(risky.sensitivity[0].correlation > 0.3)
const again = runMonteCarlo({ schedule, durationRisks: [{ uid: 'u-B', min: 3, likely: 3, max: 9 }], events: [], iterations: 1500, seed: 7 })
const again2 = runMonteCarlo({ schedule, durationRisks: [{ uid: 'u-B', min: 3, likely: 3, max: 9 }], events: [], iterations: 1500, seed: 7 })
assert.deepEqual(again.finish, again2.finish)                                       // seeded → reproducible
const cyc = runMonteCarlo({ schedule: { ...schedule, relations: [rel('A', 'B'), rel('B', 'A')] }, durationRisks: [], events: [], iterations: 100 })
assert.equal(cyc.ok, false)
console.log('scheduling/analysis: all assertions passed')
