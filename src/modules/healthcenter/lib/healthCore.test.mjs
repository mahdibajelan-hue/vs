import assert from 'node:assert/strict'
import { computeHealth, DEFAULT_SETTINGS, INDICATORS, mergeSettings, scoreOf, statusOf, indexStatus } from './healthCore.ts'
import { today, facts } from '../../reporting/lib/analyticsFixture.mjs'

/* scoring: linear between bounds, either direction, clipped; missing stays missing */
assert.equal(scoreOf(1, { good: 1, bad: 0.75 }), 100)
assert.equal(scoreOf(0.875, { good: 1, bad: 0.75 }), 50)
assert.equal(scoreOf(0.5, { good: 1, bad: 0.75 }), 0)
assert.equal(scoreOf(5, { good: 0, bad: 10 }), 50)
assert.equal(scoreOf(-3, { good: 0, bad: 10 }), 100)
assert.equal(scoreOf(null, { good: 0, bad: 10 }), null)
assert.equal(statusOf(null), 'none')
assert.equal(statusOf(80), 'good'); assert.equal(statusOf(55), 'watch'); assert.equal(statusOf(30), 'bad'); assert.equal(statusOf(29), 'critical')
assert.equal(indexStatus(80), 'good'); assert.equal(indexStatus(65), 'watch'); assert.equal(indexStatus(45), 'bad'); assert.equal(indexStatus(44), 'critical')

/* every indicator has a full definition and a band */
for (const d of INDICATORS) {
  assert.ok(d.label && d.source && d.fields && d.formula && d.frequency && d.unit, d.id)
  assert.ok(DEFAULT_SETTINGS.bands[d.id], `band ${d.id}`)
}
assert.equal(Object.values(DEFAULT_SETTINGS.weights).reduce((a, b) => a + b, 0), 100)

const site = {
  projectId: 'a', project: 'الف', facts: null,
  reports: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, formKey: 'welding', formTitle: 'جوشکاری', date: `2026-10-${String(19 + i).padStart(2, '0')}`, status: 'approved', front: 'جبهه ۱' })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, formKey: 'welding', formTitle: 'جوشکاری', date: `2026-09-${String(10 + i).padStart(2, '0')}`, status: 'approved', front: 'جبهه ۲' })),
  ],
  production: [
    { date: '2026-10-20', formKey: 'welding', formTitle: '', metric: 'سرجوش', group: '', unit: 'سرجوش', value: 100, approved: true },
    { date: '2026-10-21', formKey: 'weld_repair', formTitle: '', metric: 'تعمیر', group: '', unit: 'سرجوش', value: 5, approved: true },
  ],
  work: [],
  resources: [
    ...['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'].flatMap((d) => [
      { date: d, kind: 'man', name: 'جوشکار', section: '', total: 50, active: 40, idle: 10, stopped: 0, repair: 0 },
      { date: d, kind: 'equip', name: 'جرثقیل', section: '', total: 10, active: 6, idle: 2, stopped: 0, repair: 2 },
    ]),
    { date: '2026-10-10', kind: 'man', name: 'جوشکار', section: '', total: 100, active: 90, idle: 10, stopped: 0, repair: 0 },
  ],
  stoppages: [{ date: '2026-10-25', category: 'کمبود مصالح', hours: 20, responsibility: 'contractor', critical: true, description: '' }],
  qc: [
    { createdAt: '2026-10-01', closedAt: null, severity: 'high', status: 'open', kind: '', note: '' },
    { createdAt: '2026-10-02', closedAt: '2026-10-10', severity: 'low', status: 'closed', kind: '', note: '' },
  ],
  docs: [{ docNo: 'D1', title: '', discipline: '', status: '', plannedPrepared: null, actualPrepared: null, plannedApproved: '2026-10-01', actualApproved: null, critical: true }],
  materials: null, receipts: null,
  shipments: [{ number: 'S1', date: null, eta: '2026-10-01', ata: null, status: '', origin: '' }],
  orders: null, discrepancies: [{ detectedAt: '2026-10-01', status: 'open', kind: '', cause: '' }],
  certificates: [{ number: 'C1', contract: '', date: '2026-08-01', gross: 100, certified: 100, paid: 40, status: '' }, { number: 'C2', contract: '', date: '2026-10-10', gross: 100, certified: 100, paid: 0, status: '' }],
  payments: [{ date: '2026-10-15', amount: 50, contract: '' }],
}
const A = facts('a', 'پروژه الف')
const r = computeHealth({ today, facts: A, site, extra: { punchA: 2, htFailed: 0 } })
const I = r.indicators
assert.equal(I.gap.value, -12)
assert.equal(I.spi.value, 0.8)
assert.equal(I.manpower_util.value, 80)
assert.equal(I.equip_util.value, 60)
assert.equal(I.resource_balance.value, 20)
assert.equal(I.spo2.value, 70)
assert.equal(I.manpower_cap.value, 50) // 50/day now vs 100/day in the 30 days before
assert.equal(I.weld_repair.value, 5)
assert.equal(I.ncr_open.value, 3) // one open high finding weighs three
assert.equal(I.doc_overdue.value, 1)
assert.equal(I.late_shipments.value, 1)
assert.equal(I.mat_disc.value, 1)
assert.equal(I.payables.value, 30) // C1: 60 unpaid older than 30 days of 200 certified
assert.equal(I.cash_flow.value, 25) // paid 50 vs certified 200 in the last 90 days
assert.equal(I.punch_a.value, 2)
assert.equal(I.proc_gap.value, -30)
assert.equal(I.dec_overdue.value, 1)
assert.equal(I.stoppage_rate.value, 2) // 20 h over 10 reported days
assert.equal(I.report_compliance.value, 71) // 10 of 14 days
assert.equal(I.risk_temp.value >= 6, true)
assert.ok(r.ecg.length === 5 && r.ecg[0] === 6)

/* the cap: SPI 0.8 and the blocked gate cap the index; the gate (45) wins */
assert.ok(r.caps.some((c) => c.id === 'spi'))
assert.ok(r.caps.some((c) => c.id === 'gate'))
assert.ok(r.index <= 45)
assert.equal(r.status, r.index >= 45 ? 'bad' : 'critical')
assert.ok(r.rawIndex >= r.index)

/* missing data is never good: no site input → those indicators are «none» and score missingScore in their domain */
const bare = computeHealth({ today, facts: A, site: null, extra: { punchA: null, htFailed: null } })
assert.equal(bare.indicators.manpower_util.value, null)
assert.equal(bare.indicators.manpower_util.status, 'none')
const ex = bare.domains.find((d) => d.key === 'execution')
assert.equal(ex.score, DEFAULT_SETTINGS.missingScore)
assert.equal(ex.coverage, 0)
assert.ok(bare.coverage < r.coverage)

/* weights are configurable and the history drives the trend and the drivers */
const s2 = mergeSettings({ weights: { schedule: 100, finance: 0, execution: 0, quality: 0, supply: 0, risk: 0 }, blockedCap: 100 })
const r2 = computeHealth({ today, facts: A, site, extra: { punchA: 2, htFailed: 0 } }, s2, r)
assert.equal(r2.rawIndex, r2.domains.find((d) => d.key === 'schedule').score)
assert.equal(r2.prevIndex, r.index)
assert.equal(r2.indicators.gap.prev, -12)

/* the diagnosis names problems, causes and dated prescriptions */
assert.ok(r.diagnosis.problems.length >= 1 && r.diagnosis.problems.length <= 3)
assert.ok(r.diagnosis.prescriptions.length >= 1)
assert.ok(r.diagnosis.prescriptions.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.due) && p.action))
assert.ok(r.diagnosis.summary.includes('سقف'))
assert.equal(r.organs.length, 7)
assert.ok(r.imaging.ct.length === 3 && r.imaging.angio.length === 3)
