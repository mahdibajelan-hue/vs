import assert from 'node:assert/strict'
import { projectMetrics, phaseActualAt, monthTicks } from './projectMetricsCore.ts'
import { sgProgress } from '../stagegate/sgProgress.ts'

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
const epc = (actual, planned) => ({ eng: { actual, planned }, proc: null, cons: null, weights: { e: 1, p: 1, c: 1 }, overall: { actual, planned } })
const today = '2026-07-01'
const m = projectMetrics({
  lc, today,
  epcAt: (t) => (t === today ? epc(50, 60) : t > today ? epc(50, t >= '2026-12-31' ? 100 : 80) : epc(20, 30)),
  epcWindow: { start: '2026-03-01', finish: '2026-12-31' },
  finance: { budget: 1000, contractsValue: 900, masterValue: 0, certificates: [{ date: '2026-05-01', amount: 300 }, { date: '2026-08-01', amount: 999 }], byCategory: [{ key: 'epc', label: 'EPC', value: 300 }] },
  risks: [], delays: [{ key: 'material', label: 'کالا', value: 12 }], today,
})
// headline = the Stage-Gate engine with the modules' EPC figure
const sg = sgProgress({ phases: phases.map((p) => ({ code: p.code, engine: p.engine })), phaseRows: lc.phaseRows, schedule: lc.schedule, clientReport: null, epcLive: { actual: 50, planned: 60 } }, new Date(`${today}T00:00:00Z`))
assert.equal(m.earned, sg.overall.actual)
assert.equal(m.planned, sg.overall.planned)
assert.equal(m.earned, (100 * 10 + 50 * 80 + 0 * 10) / 100)
assert.equal(m.planned, (100 * 10 + 60 * 80 + 0 * 10) / 100)
// EVM: BAC = budget; AC = certified up to today only
assert.equal(m.evm.bac, 1000); assert.equal(m.evm.bacSource, 'budget')
assert.equal(m.evm.ac, 300)
assert.equal(m.evm.ev, 500); assert.equal(m.evm.pv, 580)
assert.equal(Math.round(m.evm.cpi * 1000) / 1000, Math.round((500 / 300) * 1000) / 1000)
assert.equal(Math.round(m.evm.spi * 1000), Math.round((50 / 58) * 1000))
assert.equal(m.evm.cv, 200); assert.equal(m.evm.sv, -80)
assert.equal(Math.round(m.evm.tcpi * 1000), Math.round((500 / 700) * 1000))
// the curve passes through today exactly at the headline figures, and earned stops at today
const t = m.curve.find((c) => c.date === today)
assert.equal(t.earned, m.earned); assert.equal(t.planned, m.planned); assert.equal(t.cost, 30)
assert.ok(m.curve.filter((c) => c.date > today).every((c) => c.earned == null && c.cost == null))
assert.equal(m.curve[m.curve.length - 1].planned, 100, 'every window over by the last tick')
assert.equal(m.weekly.length, 10)
assert.equal(m.current.code, 'G6')
assert.equal(m.phases.find((p) => p.code === 'G6').start, '2026-03-01', 'EPC window from the modules')
// a phase's past actual spreads over its actual span; basic-design history wins
assert.equal(phaseActualAt(80, '2026-02-01', today, { actualStart: '2026-01-01', actualFinish: null, plannedStart: null }, []), 80 * 31 / 181)
assert.equal(phaseActualAt(80, '2025-12-01', today, { actualStart: '2026-01-01', actualFinish: null, plannedStart: null }, []), 0)
assert.equal(phaseActualAt(80, '2026-02-01', today, undefined, [{ pct: 40, at: '2026-01-15' }, { pct: 80, at: '2026-03-01' }]), 40)
assert.deepEqual(monthTicks('2026-01-10', '2026-03-05'), ['2026-01-31', '2026-02-28', '2026-03-05'])
console.log('projectMetrics/core: all assertions passed')
