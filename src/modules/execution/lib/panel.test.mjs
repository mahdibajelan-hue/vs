import assert from 'node:assert/strict'
import { buildStatement } from './statement.ts'
import { buildDelays } from './delays.ts'
import { chapterProgress, forecast } from './forecast.ts'

const act = (id, o = {}) => ({ id, itemNo: id, active: true, approval: 'approved', sort: 0, unitPrice: 10, bookId: 'b1', chapterNo: '1', chapter: 'فصل ۱', plannedEnd: null, ...o })
const rep = (id, date, status = 'approved', o = {}) => ({ id, formKey: 'work', reportDate: date, status, data: {}, ...o })
const line = (reportId, activityId, qty, status = 'approved', approvedQty = qty) => ({ reportId, activityId, qty, status, approvedQty })
const acts = [act('A'), act('B', { chapterNo: '2', chapter: 'فصل ۲', unitPrice: 5 })]
const reports = [rep('r1', '2026-02-10'), rep('r2', '2026-03-05'), rep('r3', '2026-03-06', 'submitted')]
const lines = [line('r1', 'A', 100), line('r2', 'A', 50, 'approved', 40), line('r2', 'B', 20), line('r3', 'A', 30, 'pending', null)]
const st = buildStatement({ activities: acts, reports, lines }, { from: '2026-03-01', to: '2026-03-31' }, (a) => (a.id === 'A' ? 120 : 100), () => 'فهرست یک')
const A = st.books[0].chapters[0].rows[0]
assert.equal(A.prev, 100); assert.equal(A.period, 40); assert.equal(A.cum, 140); assert.equal(A.pending, 30)
assert.equal(A.periodAmt, 400); assert.equal(A.cumAmt, 1400); assert.equal(A.over, true); assert.equal(A.pendingAmt, 300)
assert.equal(st.books[0].chapters.length, 2)
assert.equal(st.grand.periodAmt, 400 + 100); assert.equal(st.grand.cumAmt, 1400 + 100); assert.equal(st.overRows, 1)
// tolerance lifts the over-base flag
assert.equal(buildStatement({ activities: acts, reports, lines }, { from: '2026-03-01', to: '2026-03-31' }, (a) => (a.id === 'A' ? 120 : 100), () => '', 20).overRows, 0)

const stops = [
  { id: 's1', reportId: 'r1', category: 'material', hours: 4, responsibility: '', critical: false, noticeDate: null },
  { id: 's2', reportId: 'r2', category: 'material', hours: 6, responsibility: 'employer', critical: true, noticeDate: '2026-03-08' },
  { id: 's3', reportId: 'r2', category: 'weather', hours: 3, responsibility: 'force_majeure', critical: false, noticeDate: '2026-03-30' },
  { id: 's4', reportId: 'r3', category: 'land', hours: 2, responsibility: 'employer', critical: false, noticeDate: null },
]
const d = buildDelays({ stoppages: stops, reports: [rep('r1', '2026-02-10'), rep('r2', '2026-03-05', 'approved', { data: { weather: 'rainy' } }), rep('r3', '2026-03-06', 'submitted')], today: '2026-03-10', noticeDays: 14 })
const by = Object.fromEntries(d.rows.map((x) => [x.id, x]))
assert.equal(by.s1.notice, 'lost'); assert.equal(by.s2.notice, 'sent'); assert.equal(by.s3.notice, 'late'); assert.equal(by.s4.notice, 'due'); assert.equal(by.s4.noticeDaysLeft, 10)
assert.equal(d.hours, 15); assert.equal(d.unassessed, 1); assert.equal(d.claimableHours, 11); assert.equal(d.criticalHours, 6); assert.equal(d.noticeLost, 2); assert.equal(d.weatherDays, 1)
assert.equal(d.byCategory[0].category, 'material'); assert.equal(d.byCategory[0].byResp.employer, 6)
// EOT estimate: excusable critical hours per day capped at a working day; a day with contractor and excusable critical stoppage is concurrent
const st2 = [
  { id: 'e1', reportId: 'r1', category: 'material', hours: 12, description: '', responsibility: 'employer', critical: true, noticeDate: '2026-02-12' },
  { id: 'e2', reportId: 'r1', category: 'equipment', hours: 3, description: '', responsibility: 'contractor', critical: true, noticeDate: null },
  { id: 'e3', reportId: 'r2', category: 'weather', hours: 5, description: '', responsibility: 'force_majeure', critical: true, noticeDate: null },
  { id: 'e4', reportId: 'r2', category: 'land', hours: 4, description: '', responsibility: 'third_party', critical: false, noticeDate: null },
]
const d2 = buildDelays({ stoppages: st2, reports: [rep('r1', '2026-02-10'), rep('r2', '2026-03-05')], today: '2026-03-10', noticeDays: 14, hoursPerDay: 10 })
assert.ok(Math.abs(d2.eot.days - 1.5) < 1e-9); assert.ok(Math.abs(d2.eot.compensableDays - 1) < 1e-9)
assert.deepEqual(d2.concurrentDates, ['2026-02-10'])
assert.equal(d2.windows.length, 2); assert.equal(d2.windows[0].contractor, 3); assert.equal(d2.windows[1].excusable, 9); assert.equal(d2.windows[1].criticalExcusable, 5)

const curve = [{ date: '2026-01-31', planned: 0.1, actual: 0.1, registered: 0.1 }, { date: '2026-03-10', planned: 0.5, actual: 0.4, registered: 0.4 }]
const f = forecast({ curve, actual: 0.4, planned: 0.5, activities: [act('A', { plannedEnd: '2026-04-30' }), act('B', { plannedEnd: '2026-04-01' })], today: '2026-03-10' })
assert.ok(Math.abs(f.spi - 0.8) < 1e-9); assert.equal(f.plannedFinish, '2026-04-30'); assert.ok(f.ratePerDay > 0); assert.ok(f.slipDays > 0)
assert.equal(forecast({ curve: [], actual: 0, planned: null, activities: [], today: '2026-03-10' }).forecastFinish, null)

const rows = [{ activity: act('A'), base: { weight: 30 }, pct: 0.5 }, { activity: act('B'), base: { weight: 10 }, pct: 1 }, { activity: act('C', { chapterNo: '2', chapter: 'فصل ۲' }), base: { weight: 60 }, pct: 0.25 }]
const cp = chapterProgress(rows)
assert.equal(cp[0].title, 'فصل ۲'); assert.equal(cp[0].pct, 0.25); assert.ok(Math.abs(cp[1].pct - 0.625) < 1e-9)
console.log('execution/lib/panel: all assertions passed')
