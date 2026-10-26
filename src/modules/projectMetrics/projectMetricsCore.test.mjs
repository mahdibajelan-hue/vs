import assert from 'node:assert/strict'
import { projectMetrics, monthTicks } from './projectMetricsCore.ts'
import { sgProgress } from '../stagegate/sgProgress.ts'
import { computeHealth, computeOverallHealth, scoreFromIndex } from '../lifecycle/lib/health.ts'

const phases = [
  { code: 'G1', sort: 1, title: 'تعریف', gateName: '', engine: 'step' },
  { code: 'G6', sort: 2, title: 'اجرا', gateName: '', engine: 'epc' },
  { code: 'G7', sort: 3, title: 'راه‌اندازی', gateName: '', engine: 'step' },
]
const lc = {
  project: 'P', phases,
  phaseRows: [
    { phase: 'G1', weightPct: 10, plannedStart: '2026-01-01', plannedFinish: '2026-03-01', actualStart: '2026-01-01', actualFinish: '2026-03-01', manualPct: null, gateStatus: 'passed' },
    { phase: 'G6', weightPct: 80, plannedStart: null, plannedFinish: null, actualStart: '2026-03-01', actualFinish: null, manualPct: null, gateStatus: 'not_ready' },
    { phase: 'G7', weightPct: 10, plannedStart: '2027-01-01', plannedFinish: '2027-03-01', actualStart: null, actualFinish: null, manualPct: null, gateStatus: null },
  ],
  schedule: [{ id: 1, phase: 'G1', parentId: null, weightPct: null, manualPct: 100, plannedStart: null, plannedFinish: null }],
  history: [], clientReport: null,
}
// value-weighted EPC: E 1%, P 75%, C 24% of the value
const epc = (actual, planned) => ({ eng: { actual: 70, planned: 75 }, proc: { actual, planned }, cons: { actual: 5, planned: 30 }, weights: { e: 1, p: 75, c: 24 }, weightSource: 'value', values: { e: 10, p: 750, c: 240 }, overall: { actual, planned } })
const today = '2026-07-01'
const m = projectMetrics({
  lc, today,
  epcAt: (t) => (t === today ? epc(50, 60) : t > today ? epc(50, t >= '2026-12-31' ? 100 : 80) : epc(20, 30)),
  epcWindow: { start: '2026-03-01', finish: '2026-12-31' },
  finance: { epcContractsValue: 1000, epcCertificates: [{ date: '2026-05-01', amount: 300 }, { date: '2026-08-01', amount: 999 }], byCategory: [{ key: 'epc', label: 'EPC', value: 300 }] },
  risks: [], delays: [{ key: 'material', label: 'کالا', value: 12 }], today,
})
// the lifecycle figure is the Stage-Gate engine with the modules' EPC figure (what the radar shows)
const sg = sgProgress({ phases: phases.map((p) => ({ code: p.code, engine: p.engine })), phaseRows: lc.phaseRows, schedule: lc.schedule, clientReport: null, epcLive: { actual: 50, planned: 60 } }, new Date(`${today}T00:00:00Z`))
assert.equal(m.lifecycle.actual, sg.overall.actual)
assert.equal(m.lifecycle.planned, sg.overall.planned)
// EVM is the EPC scope only: BAC = EPC contracts, progress = EPC phase, AC = EPC certificates up to today
assert.equal(m.earned, 50); assert.equal(m.planned, 60)
assert.equal(m.evm.bac, 1000); assert.equal(m.evm.bacSource, 'epc_contracts')
assert.equal(m.evm.ac, 300); assert.equal(m.evm.ev, 500); assert.equal(m.evm.pv, 600)
assert.equal(Math.round(m.evm.cpi * 1000), Math.round((500 / 300) * 1000))
assert.equal(Math.round(m.evm.spi * 1000), Math.round((50 / 60) * 1000))
assert.equal(m.evm.cv, 200); assert.equal(m.evm.sv, -100)
assert.equal(Math.round(m.evm.tcpi * 1000), Math.round((500 / 700) * 1000))
assert.equal(Math.round(m.evm.eac), Math.round(1000 / (500 / 300)))
// no EPC contract → the modules' value is the BAC
const noContract = projectMetrics({ lc, today, epcAt: () => epc(50, 60), epcWindow: null, finance: { epcContractsValue: 0, epcCertificates: [], byCategory: [] }, risks: [], delays: [] })
assert.equal(noContract.evm.bacSource, 'module_values'); assert.equal(noContract.evm.bac, 1000); assert.equal(noContract.evm.cpi, null)
// the curve passes through today at the headline figures; earned and cost stop at today
const t = m.curve.find((c) => c.date === today)
assert.equal(t.earned, 50); assert.equal(t.planned, 60); assert.equal(t.cost, 30)
assert.ok(m.curve.filter((c) => c.date > today).every((c) => c.earned == null && c.cost == null))
assert.equal(m.weekly.length, 10)
assert.equal(m.current.code, 'G6')
assert.equal(m.phases.find((p) => p.code === 'G6').start, '2026-03-01', 'EPC window from the modules')
assert.deepEqual(monthTicks('2026-01-10', '2026-03-05'), ['2026-01-31', '2026-02-28', '2026-03-05'])

// health: index scale, unassessed dimensions out of the average, colour = worst dimension
assert.equal(scoreFromIndex(1.2), 100); assert.equal(scoreFromIndex(0.95), 80); assert.equal(scoreFromIndex(0.9), 60); assert.equal(scoreFromIndex(0.5), 0)
const dims = computeHealth({ activities: [], milestones: [], actions: [], openCriticalRisks: 0, openCriticalIssues: 0, blockedGateCount: 0, stored: [], perf: { engineering: 0.93, procurement: 1.16, construction: 0.16, schedule: 0.94, cost: 1.4 } })
const by = Object.fromEntries(dims.map((d) => [d.dimension, d]))
assert.equal(by.engineering.score, 72); assert.equal(by.engineering.status, 'yellow')
assert.equal(by.procurement.score, 100); assert.equal(by.construction.score, 0); assert.equal(by.construction.status, 'red')
assert.equal(by.quality.assessed, false)
const ov = computeOverallHealth(dims, null)
const assessed = dims.filter((d) => d.assessed !== false)
assert.equal(assessed.length, 6, 'schedule, cost, E, P, C, risk')
assert.equal(ov.score, Math.round(assessed.reduce((s, d) => s + d.score, 0) / 6))
assert.equal(ov.status, 'red'); assert.equal(ov.drivenBy, 'construction')
console.log('projectMetrics/core: all assertions passed')
