import assert from 'node:assert/strict'
import { plannedByDate, sgProgress } from './sgProgress.ts'

const today = new Date('2026-07-01T00:00:00Z')
assert.equal(plannedByDate('2026-01-01', '2026-12-31', today), 50)
assert.equal(plannedByDate(null, '2026-12-31', today), null)
assert.equal(plannedByDate('2027-01-01', '2027-12-31', today), 0)

const r = sgProgress({
  phases: [{ code: 'G1', engine: 'step' }, { code: 'G2', engine: 'basic_design' }, { code: 'G3', engine: 'epc' }],
  phaseRows: [
    { phase: 'G1', plannedStart: '2026-01-01', plannedFinish: '2026-03-01', manualPct: null, weightPct: 20 },
    { phase: 'G2', plannedStart: '2026-01-01', plannedFinish: '2026-12-31', manualPct: 40, weightPct: 30 },
    { phase: 'G3', plannedStart: null, plannedFinish: null, manualPct: null, weightPct: 50 },
  ],
  // G1: a parent with two weighted leaves (80% × 3 + 20% × 1) / 4 = 65, plus an unweighted sibling leaf at 100
  // → top level has no custom weights: (65 + 100) / 2 = 82.5
  schedule: [
    { id: 1, phase: 'G1', parentId: null, weightPct: null, manualPct: null },
    { id: 2, phase: 'G1', parentId: 1, weightPct: 3, manualPct: 80 },
    { id: 3, phase: 'G1', parentId: 1, weightPct: 1, manualPct: 20 },
    { id: 4, phase: 'G1', parentId: null, weightPct: null, manualPct: 100 },
  ],
  clientReport: { progress_engineering: 90, progress_procurement: 60, progress_construction: 30, progress_engineering_planned: 100, progress_procurement_planned: 80, progress_construction_planned: 50, progress_engineering_weight: 20, progress_procurement_weight: 30, progress_construction_weight: 50 },
}, today)
assert.equal(r.phases.get('G1').actual, 82.5)
assert.equal(r.phases.get('G1').planned, 100, 'window already over')
assert.deepEqual(r.phases.get('G2'), { actual: 40, planned: 50 })
assert.equal(r.phases.get('G3').actual, 18 + 18 + 15)
assert.equal(r.phases.get('G3').planned, 20 + 24 + 25)
// weighted 20 / 30 / 50
assert.equal(Math.round(r.overall.actual * 10) / 10, Math.round(((82.5 * 20 + 40 * 30 + 51 * 50) / 100) * 10) / 10)
assert.equal(Math.round(r.overall.planned), Math.round((100 * 20 + 50 * 30 + 69 * 50) / 100))
// no window → planned follows actual; no rows → equal weights
const e = sgProgress({ phases: [{ code: 'A', engine: 'step' }, { code: 'B', engine: 'step' }], phaseRows: [], schedule: [{ id: 9, phase: 'A', parentId: null, weightPct: null, manualPct: 60 }], clientReport: null }, today)
assert.deepEqual(e.phases.get('A'), { actual: 60, planned: 60 })
assert.deepEqual(e.overall, { actual: 30, planned: 30 })
console.log('stagegate/sgProgress: all assertions passed')
