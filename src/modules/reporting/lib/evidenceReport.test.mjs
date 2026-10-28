import assert from 'node:assert/strict'
import { buildEvidenceReport, compareFacts, DEFAULT_THRESHOLDS, monthEnds, slopePerMonth, trendOf } from './evidenceReport.ts'

const today = '2026-10-28'
const curve = [
  { date: '2026-05-31', planned: 20, earned: 18 },
  { date: '2026-06-30', planned: 30, earned: 24 },
  { date: '2026-07-31', planned: 40, earned: 28 },
  { date: '2026-08-31', planned: 50, earned: 32 },
  { date: '2026-09-30', planned: 60, earned: 36 },
  { date: '2026-10-27', planned: 70, earned: 40 },
  { date: '2026-12-31', planned: 90, earned: null },
]
const base = {
  today, project: 'P',
  metrics: {
    asOf: '2026-10-27', lifecycle: { actual: 30, planned: 42 }, evm: { bac: 1000, spi: 0.8, cpi: 0.85, eac: 1176, vac: -176 }, curve, planFinish: '2027-03-01',
    health: { status: 'black', drivenBy: 'زمان', blockers: ['G6: ۱ مسئلهٔ بحرانی باز'], dims: [{ label: 'زمان', status: 'red', explanation: 'دو Milestone بحرانی عقب است', assessed: true }, { label: 'کیفیت', status: 'red', explanation: 'x', assessed: false }] },
    delays: [{ label: 'آب‌وهوا', value: 40 }, { label: 'کمبود مصالح', value: 90 }],
  },
  risks: [
    { id: 'r1', title: 'تأخیر تحویل لوله', status: 'open', score: 20, level: 'critical', owner: 'u1', identifiedDate: '2026-03-01', assessments: [{ date: '2026-08-01', score: 16 }, { date: '2026-10-01', score: 20 }] },
    { id: 'r2', title: 'مجوز عبور', status: 'open', score: 9, level: 'medium', owner: null, identifiedDate: '2026-04-01', assessments: [{ date: '2026-06-01', score: 15 }, { date: '2026-09-15', score: 9 }] },
  ],
  riskActions: [
    { id: 'a1', riskId: 'r2', title: 'مذاکره با منابع طبیعی', status: 'completed', dueDate: '2026-08-01', completedAt: '2026-07-20', owner: null, createdAt: '2026-05-01' },
    { id: 'a2', riskId: 'r1', title: 'سفارش جایگزین', status: 'completed', dueDate: '2026-10-01', completedAt: '2026-10-20', owner: null, createdAt: '2026-09-01' },
  ],
  issues: [
    { id: 'i1', title: 'تأخیر IFC', status: 'open', priority: 'critical', deadline: '2026-10-01', createdAt: '2026-08-01', closedAt: null, owner: 'u2' },
    { id: 'i2', title: 'جزئی', status: 'approved', priority: 'low', deadline: '2026-07-01', createdAt: '2026-06-01', closedAt: '2026-06-20', owner: null },
  ],
  actions: [{ id: 'x1', title: 'پیگیری کارفرما', status: 'in_progress', priority: 'high', dueDate: '2026-10-10', owner: 'u3', relatedRiskId: null, relatedIssueId: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' }],
  decisions: [{ id: 'd1', title: 'تأیید پیمانکار جایگزین', status: 'pending', requiredBy: '2026-10-15', owner: 'u4', createdAt: '2026-09-20' }],
  portfolio: null,
  sourceDates: [{ source: 'شاخص‌ها', date: '2026-10-27', available: true }, { source: 'ریسک', date: '2026-10-01', available: true }, { source: 'مسائل', date: '2026-10-20', available: true }],
  previous: null,
}

const rep = buildEvidenceReport(base)

// every finding carries evidence; material ones first
assert.ok(rep.findings.length > 0)
assert.ok(rep.findings.every((f) => f.evidence.length > 0))
assert.equal(rep.findings[0].materiality, 'material')
const sched = rep.findings.find((f) => f.id === 'f-schedule')
assert.equal(sched.materiality, 'material') // 12 pp ≥ 8
assert.equal(rep.findings.find((f) => f.id === 'f-spi').materiality, 'material')
assert.equal(rep.findings.find((f) => f.id === 'f-cpi').materiality, 'material')
assert.ok(rep.findings.some((f) => f.id === 'f-vac'))
// an unassessed health dimension is not reported
assert.ok(!rep.findings.some((f) => f.id === 'f-dim-کیفیت'))
assert.ok(rep.findings.some((f) => f.id === 'f-dim-زمان'))

// causes: the blocked gate is direct, the rest associated; every cause cites evidence
assert.ok(rep.causes.some((c) => c.strength === 'direct'))
assert.ok(rep.causes.filter((c) => c.strength === 'associated').some((c) => c.text.includes('کمبود مصالح')))
assert.ok(rep.causes.every((c) => c.evidence.length > 0))

// causes are listed once for all time / cost deviations, not repeated per finding
assert.equal(new Set(rep.causes.map((c) => c.text)).size, rep.causes.length)
assert.ok(rep.causes[0].findingIds.length > 1)
// a cost health dimension is not repeated when the CPI finding already states it
const dup = buildEvidenceReport({ ...base, metrics: { ...base.metrics, health: { ...base.metrics.health, dims: [{ key: 'cost', label: 'هزینه', status: 'red', explanation: 'CPI = 0.85', assessed: true }] } } })
assert.ok(!dup.findings.some((f) => f.id === 'f-dim-هزینه'))

// trends: gap widening → worsening; risk exposure computed from dated assessments
const gapT = rep.trends.find((t) => t.id === 't-gap')
assert.equal(gapT.direction, 'worsening')
assert.ok(gapT.slopePerMonth > 0)
assert.ok(rep.trends.find((t) => t.id === 't-issues'))

// projections state method + assumption; finish from the last 3 months' rate (4 pp / month)
const fin = rep.projections.find((p) => p.id === 'p-finish')
assert.ok(fin.method.includes('سه ماه'))
assert.ok(fin.assumption.length > 0)
assert.ok(fin.value.includes('روز بعد از'))
assert.ok(rep.projections.find((p) => p.id === 'p-eac'))

// recommendations come from findings and name their record
assert.ok(rep.recommendations.every((r) => r.findingIds.length > 0 || r.id === 'r-reassess'))
assert.ok(rep.recommendations.some((r) => r.text.includes('تأخیر IFC')))
assert.ok(rep.recommendations.some((r) => r.text.includes('تأخیر تحویل لوله'))) // critical risk without an open action
assert.ok(rep.recommendations.some((r) => r.text.includes('تأیید پیمانکار جایگزین')))
assert.equal(rep.recommendations[0].urgency, 'now')

// decisions: gate + portfolio (red/black without a portfolio decision) + the overdue project decision
assert.deepEqual(rep.decisions.map((d) => d.level).sort(), ['gate', 'portfolio', 'project'])
assert.ok(rep.decisions.find((d) => d.id === 'd1').overdue)

// effects: r2 reassessed lower after a1 → effective; a2 completed 8 days ago without a later assessment → too early
assert.equal(rep.effects.find((e) => e.id === 'a1').verdict, 'effective')
assert.equal(rep.effects.find((e) => e.id === 'a2').verdict, 'too_early')

// facts frozen, no previous report → no change list
assert.equal(rep.facts.gap, 12)
assert.equal(rep.changes, null)
assert.equal(rep.confidence, 'medium') // 2 of 3 sources fresh

// no metrics → low confidence, honest headline, no invented schedule finding
const bare = buildEvidenceReport({ ...base, metrics: null, risks: [], issues: [], actions: [], riskActions: [], decisions: [] })
assert.equal(bare.confidence, 'low')
assert.ok(bare.headline[0].includes('در دسترس نیست'))
assert.equal(bare.findings.length, 0)

// a material deviation with no recorded cause asks for the cause instead of guessing
const noCause = buildEvidenceReport({ ...base, metrics: { ...base.metrics, health: { status: 'yellow', drivenBy: null, blockers: [], dims: [] }, delays: [] }, issues: [] })
assert.ok(noCause.recommendations.some((r) => r.text.startsWith('ثبت علت')))
assert.equal(noCause.causes.length, 0)

// a half EVM reading is not reported as SPI / CPI
const halfEvm = buildEvidenceReport({ ...base, metrics: { ...base.metrics, evm: { bac: 1000, spi: 0, cpi: null, eac: null, vac: null } } })
assert.ok(!halfEvm.findings.some((f) => f.id === 'f-spi'))
assert.equal(halfEvm.facts.spi, null)

// comparison with the previous report
const ch = compareFacts({ ...rep.facts, gap: 8, health: 'red', criticalRisks: 2 }, rep.facts)
assert.equal(ch.find((c) => c.key === 'gap').direction, 'worse')
assert.equal(ch.find((c) => c.key === 'health').direction, 'worse')
assert.equal(ch.find((c) => c.key === 'criticalRisks').direction, 'better')
const withPrev = buildEvidenceReport({ ...base, previous: { reportNumber: 'R-1', issuedAt: '2026-09-28', facts: { ...rep.facts, gap: 8 } } })
assert.equal(withPrev.previousRef, 'R-1')
assert.ok(withPrev.changes.length > 0)

// trend helper
assert.equal(trendOf('x', 'x', 'u', [{ date: '2026-01-01', value: 1 }], 'up', 3, 0.1).direction, 'insufficient')
assert.ok(slopePerMonth([{ date: '2026-01-01', value: 0 }, { date: '2026-01-31', value: 3 }]) > 2.9)
assert.equal(monthEnds('2026-10-28', 3).length, 3)
assert.equal(monthEnds('2026-10-28', 3)[0], '2026-08-31')
assert.equal(DEFAULT_THRESHOLDS.gapMaterial, 8)
console.log('evidenceReport ok')
