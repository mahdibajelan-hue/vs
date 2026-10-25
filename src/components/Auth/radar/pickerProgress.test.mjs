import assert from 'node:assert/strict'
import { pickerProgress } from './pickerProgressCore.ts'

const phases = [1, 2, 3, 4].map((i) => ({ code: 'G' + i, sort: i, title: 'فاز ' + i, gateName: '' }))
const steps = [{ id: 1, phase: 'G3', seq: 1, title: 'الف' }, { id: 2, phase: 'G3', seq: 2, title: 'ب' }]
const dec = (project, phase) => ({ project, phase, decision: 'pass', decidedAt: '2026-05-01T00:00:00Z', decidedBy: null })
const src = {
  links: [{ project: 'A', masterId: 'm-a' }, { project: 'B', masterId: 'm-b' }, { project: 'C', masterId: 'm-c' }],
  phases, steps,
  items: [{ project: 'A', phase: 'G3', kind: 'objective', itemId: 1, status: 'completed', updatedAt: null, updatedBy: null }],
  decisions: [dec('A', 'G1'), dec('A', 'G2'), dec('B', 'G1'), dec('B', 'G2'), dec('B', 'G3'), dec('B', 'G4')],
  phaseRows: [],
}
const m = pickerProgress(src)
// A: G1, G2 done, G3 half its steps → (100 + 100 + 50 + 0) / 4
const a = m.get('m-a')
assert.equal(a.pct, 63)
assert.equal(a.phaseCode, 'G3')
assert.deepEqual(a.segments.map((x) => [x.code, x.pct, x.state]), [['G1', 100, 'done'], ['G2', 100, 'done'], ['G3', 50, 'current'], ['G4', 0, 'upcoming']])
// B: every gate passed → 100, end of cycle
assert.equal(m.get('m-b').pct, 100)
assert.equal(m.get('m-b').phaseTitle, 'پایان چرخه')
// C: linked but nothing recorded → no gauge value
assert.equal(m.has('m-c'), false)
// a project's rows never leak into another one
assert.equal(pickerProgress({ ...src, links: [{ project: 'C', masterId: 'm-c' }] }).size, 0)
// with the engine: the current phase carries its own actual / planned (G3 is current for A)
const withEngine = pickerProgress({ ...src, engines: {
  phases: phases.map((p) => ({ code: p.code, engine: 'step' })),
  phaseRows: [{ project: 'A', phase: 'G3', plannedStart: '2026-01-01', plannedFinish: '2026-12-31', manualPct: null, weightPct: null }],
  schedule: [{ project: 'A', id: 1, phase: 'G3', parentId: null, weightPct: null, manualPct: 30 }],
  clientReports: new Map(),
} }, new Date('2026-07-02T00:00:00Z'))
assert.equal(withEngine.get('m-a').phaseActual, 30)
assert.equal(withEngine.get('m-a').phasePlanned, 50)
assert.equal(m.get('m-a').phaseActual, null, 'no engine inputs → no phase bar')
console.log('radar/pickerProgress: all assertions passed')
