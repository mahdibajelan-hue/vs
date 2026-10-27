import assert from 'node:assert/strict'
import { cumulative, effectiveBase, physicalProgress, plannedFraction, plannedOverall, weightSums, lineValue, deviationDrivers } from './progress.ts'
import { weekOf, monthOf, periodsBetween, workingDays, weekdayOf } from './periods.ts'
import { computeMetrics, cumulativeMetrics, missingForReport } from './forms.ts'
import { FORM_BY_KEY, FORMS } from './formCatalog.ts'
import { detectGaps } from './completeness.ts'
import { activityRows } from './periodReport.ts'

const act = (id, o = {}) => ({ id, projectId: 'p', priceItemId: null, itemNo: id, title: 'act ' + id, unit: 'm', chapter: '', kind: 'standard', baseQty: 100, unitPrice: 0, weight: 50, weightGroup: 'A', metric: '', area: '', front: '', station: '', kmFrom: null, kmTo: null, plannedStart: '2026-01-01', plannedEnd: '2026-01-11', active: true, approval: 'approved', approvalNote: '', sort: 0, note: '', ...o })
const rep = (id, date, status = 'approved', o = {}) => ({ id, projectId: 'p', formKey: 'work', reportNo: id, reportDate: date, contractorOrgId: 'c', front: 'F1', station: '', shift: 'day', status, data: { weather: 'sunny' }, notes: '', missing: [], completionOf: null, dueDate: null, createdAt: date + 'T08:00:00Z', submittedAt: date + 'T18:00:00Z', reviewedAt: null, ...o })
const line = (id, reportId, activityId, qty, status = 'approved', approvedQty = null) => ({ id, reportId, lineNo: 0, activityId, qty, kmFrom: null, kmTo: null, location: '', note: '', detail: {}, status, approvedQty: status === 'approved' ? (approvedQty ?? qty) : null, reviewNote: '', sourceReportId: null })

// ── cumulative: approved uses the approved quantity; registered adds the waiting ones; rejected/returned/draft never count
const reports = [rep('r1', '2026-01-02'), rep('r2', '2026-01-03', 'partially_approved'), rep('r3', '2026-01-04', 'draft'), rep('r4', '2026-01-05', 'submitted')]
const lines = [line('l1', 'r1', 'a', 30, 'approved', 25), line('l2', 'r2', 'a', 20, 'pending'), line('l3', 'r2', 'a', 10, 'rejected'), line('l4', 'r3', 'a', 99, 'pending'), line('l5', 'r4', 'a', 5, 'returned')]
assert.equal(cumulative(reports, lines, { mode: 'approved' }).get('a'), 25)
assert.equal(cumulative(reports, lines, { mode: 'registered' }).get('a'), 45)
assert.equal(cumulative(reports, lines, { mode: 'registered', before: '2026-01-03' }).get('a'), 25)
assert.equal(cumulative(reports, lines, { mode: 'registered', excludeReportId: 'r1' }).get('a'), 20)
assert.equal(lineValue(lines[2], 'registered'), 0)

// ── effective base: the version in force on the date, falling back to the live row
const bl = [{ id: 'b1', projectId: 'p', version: 1, status: 'approved', effectiveDate: '2026-01-01' }, { id: 'b2', projectId: 'p', version: 2, status: 'approved', effectiveDate: '2026-02-01' }, { id: 'b3', projectId: 'p', version: 3, status: 'draft', effectiveDate: '2026-01-01' }]
const bls = [{ baselineId: 'b1', activityId: 'a', baseQty: 100, weight: 50, unitPrice: 0, active: true }, { baselineId: 'b2', activityId: 'a', baseQty: 140, weight: 60, unitPrice: 0, active: true }]
assert.equal(effectiveBase(act('a', { baseQty: 999 }), bl, bls, '2026-01-15').baseQty, 100)
assert.equal(effectiveBase(act('a', { baseQty: 999 }), bl, bls, '2026-02-15').baseQty, 140)
assert.equal(effectiveBase(act('a', { baseQty: 999 }), [], [], '2026-02-15').version, 0)

// ── weighted progress, per weighting basis that totals 100; different units are never added
const acts = [act('a', { weight: 60, unit: 'm' }), act('b', { weight: 40, unit: 'نفر-روز', baseQty: 10 }), act('c', { weight: 100, weightGroup: 'B', unit: 'عدد', baseQty: 4 })]
const pl = [line('p1', 'r1', 'a', 50), line('p2', 'r1', 'b', 10), line('p3', 'r1', 'c', 2)]
const pr = physicalProgress({ activities: acts, baselines: [], blines: [], reports: [rep('r1', '2026-01-02')], lines: pl, asOf: '2026-01-31', mode: 'approved' })
assert.ok(Math.abs(pr.groups.find((g) => g.group === 'A').pct - (0.6 * 0.5 + 0.4 * 1)) < 1e-9)
assert.ok(Math.abs(pr.groups.find((g) => g.group === 'B').pct - 0.5) < 1e-9)
assert.ok(Math.abs(pr.overall - ((0.7 + 0.5) / 2)) < 1e-9)
assert.ok(pr.weightsOk)
assert.ok(Math.abs(physicalProgress({ activities: acts, baselines: [], blines: [], reports: [rep('r1', '2026-01-02')], lines: pl, asOf: '2026-01-31', mode: 'approved', groupWeights: { A: 3, B: 1 } }).overall - (3 * 0.7 + 0.5) / 4) < 1e-9)
// capped at 100 % and flagged when over
const over = physicalProgress({ activities: [act('a', { weight: 100 })], baselines: [], blines: [], reports: [rep('r1', '2026-01-02')], lines: [line('q', 'r1', 'a', 130)], asOf: '2026-01-31', mode: 'approved' })
assert.equal(over.rows[0].pct, 1); assert.ok(over.rows[0].over)
assert.deepEqual(weightSums([{ weight: 60, weightGroup: 'A', active: true, approval: 'approved' }, { weight: 30, weightGroup: 'A', active: true, approval: 'approved' }]).map((x) => x.ok), [false])

// ── planned fraction is linear; planned overall skips activities without dates
assert.equal(plannedFraction({ plannedStart: '2026-01-01', plannedEnd: '2026-01-11' }, '2026-01-06'), 0.5)
assert.equal(plannedFraction({ plannedStart: null, plannedEnd: null }, '2026-01-06'), null)
assert.ok(Math.abs(plannedOverall({ activities: [act('a', { weight: 100 })], baselines: [], blines: [], asOf: '2026-01-06' }).overall - 0.5) < 1e-9)

// ── periods (Saturday-based week, Jalali month)
assert.equal(weekdayOf('2026-10-10'), 0) // 2026-10-10 is a Saturday
assert.deepEqual([weekOf('2026-10-14', 0).from, weekOf('2026-10-14', 0).to], ['2026-10-10', '2026-10-16'])
assert.equal(monthOf('2026-10-14').from, '2026-09-23') // 1 Mehr 1405
assert.equal(periodsBetween('week', '2026-10-10', '2026-10-30', 0).length, 3)
assert.equal(workingDays('2026-10-10', '2026-10-16', [0, 1, 2, 3, 4, 5]).length, 6)

// ── technical forms: today / until now, grouped by thickness; where-filters
const str = FORM_BY_KEY.string
const sl = (id, rid, thk, len) => ({ id, reportId: rid, detail: { thkIn: thk, lengthM: len, pipeNo: id } })
const m1 = computeMetrics(str, [sl('1', 'x', 0.406, 12), sl('2', 'x', 0.406, 12), sl('3', 'x', 0.562, 11)])
assert.equal(m1.find((r) => r.metric.key === 'joints' && r.group === '0.406').value, 2)
assert.equal(m1.find((r) => r.metric.key === 'length' && r.group === '0.562').value, 11)
const prevR = rep('s0', '2026-01-01', 'approved', { formKey: 'string' }), curR = rep('s1', '2026-01-02', 'draft', { formKey: 'string' })
const cm = cumulativeMetrics(str, curR, [sl('9', 's1', 0.406, 12)], [prevR, curR], [sl('8', 's0', 0.406, 12), sl('7', 's0', 0.406, 12)])
const j = cm.find((r) => r.metric.key === 'joints' && r.group === '0.406'); assert.deepEqual([j.today, j.prior, j.total], [1, 2, 3])
const rtm = computeMetrics(FORM_BY_KEY.rt_report, [{ detail: { result: 'acc' } }, { detail: { result: 'rep' } }, { detail: { result: 'acc' } }])
assert.equal(rtm.find((r) => r.metric.key === 'accepted').value, 2); assert.equal(rtm.find((r) => r.metric.key === 'repair').value, 1)
assert.ok(FORMS.length >= 20 && FORMS.every((f) => f.key && f.title && f.sheet))

// ── missing fields
assert.ok(missingForReport({ formKey: 'work', front: '', contractorOrgId: null, data: {} }, [], null).includes('جبهه کاری'))
const ok = missingForReport({ formKey: 'work', front: 'F1', contractorOrgId: 'c', data: { weather: 'sunny' } }, [{ activityId: 'a', qty: 5 }], null, [{ kind: 'man', activeQty: 4, idleQty: 0 }])
assert.deepEqual(ok, [])
assert.ok(missingForReport({ formKey: 'welding', front: 'F', contractorOrgId: 'c', data: { weather: 'x' } }, [{ detail: {} }], FORM_BY_KEY.welding).some((s) => s.includes('WELD No.')))

// ── completeness: missing day, incomplete report, over-base cumulative, unreviewed, open period
const settings = { weekStart: 0, workDays: [0, 1, 2, 3, 4, 5], overBasePct: 0, blockOverBase: true, reviewDays: 2, gapDueDays: 2, expectedFronts: ['F1'], projectStart: '2026-10-10', enabledForms: [] }
const cr = [rep('d0', '2026-10-03', 'submitted'), rep('d1', '2026-10-10', 'approved'), rep('d3', '2026-10-12', 'submitted', { front: '', submittedAt: '2026-10-12T10:00:00Z' })]
const cl = [line('c1', 'd1', 'a', 80), line('c2', 'd3', 'a', 40, 'pending')]
const gaps = detectGaps({ today: '2026-10-15', settings, reports: cr, lines: cl, resources: [], activities: [act('a')], baselines: [], blines: [] })
const kinds = (k) => gaps.filter((g) => g.kind === k)
assert.deepEqual(kinds('missing_report').map((g) => g.periodKey).sort(), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
assert.ok(kinds('incomplete').some((g) => g.reportId === 'd3' && g.missing.includes('جبهه کاری')))
assert.ok(kinds('inconsistent').some((g) => g.fingerprint === 'over|a'))
assert.ok(kinds('unreviewed').some((g) => g.reportId === 'd3'))
assert.ok(kinds('period_open').length >= 1)
assert.ok(kinds('form_missing').length >= 1)
// no invented data: a missing-report gap carries only the known date and front
assert.deepEqual(kinds('missing_report')[0].existing, { date: '2026-10-11', front: 'F1' })

// ── period report rows come from the daily lines
const rows = activityRows({ activities: [act('a')], reports: [rep('r1', '2026-01-02'), rep('r2', '2026-01-09', 'submitted')], lines: [line('x1', 'r1', 'a', 30), line('x2', 'r2', 'a', 20, 'pending')], resources: [], stoppages: [] }, { kind: 'week', key: 'k', label: '', from: '2026-01-08', to: '2026-01-14' }, (a) => a.baseQty)
assert.equal(rows[0].prevApproved, 30); assert.equal(rows[0].pending, 20); assert.equal(rows[0].cumApproved, 30); assert.equal(rows[0].cumRegistered, 50)
// deviation drivers: planned minus approved, weighted like the overall figure; the biggest contributor first
const dv = deviationDrivers({ activities: [act('a', { weight: 60 }), act('b', { weight: 40 })], baselines: [], blines: [], reports: [rep('r1', '2026-01-02')], lines: [line('l1', 'r1', 'a', 50), line('l2', 'r1', 'b', 10)], asOf: '2026-01-11' })
assert.equal(dv[0].activity.id, 'b'); assert.ok(Math.abs(dv[0].points - 0.4 * 0.9) < 1e-9); assert.ok(Math.abs(dv[1].points - 0.6 * 0.5) < 1e-9)
console.log('execution libs ok')
