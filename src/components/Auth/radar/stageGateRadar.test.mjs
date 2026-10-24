import assert from 'node:assert/strict'
import { stageGateRadarSection } from './stageGateRadarCore.ts'

const phases = [
  { code: 'G1', sort: 1, title: 'تعریف', gateName: 'گیت تعریف' },
  { code: 'G2', sort: 2, title: 'شناسایی', gateName: '' },
  { code: 'G3', sort: 3, title: 'خرید خدمات مشاور', gateName: 'تصویب انتخاب مشاور' },
]
const steps = [{ id: 1, phase: 'G3', seq: 1, title: 'الف' }, { id: 2, phase: 'G3', seq: 2, title: 'ب' }, { id: 3, phase: 'G3', seq: 3, title: 'ج' }, { id: 4, phase: 'G3', seq: 4, title: 'د' }]
const prereqs = [{ phase: 'G3', kind: 'output', id: 10 }, { phase: 'G3', kind: 'output', id: 11 }, { phase: 'G3', kind: 'criterion', id: 20 }, { phase: 'G3', kind: 'criterion', id: 21 }]
const dec = (phase, decision = 'pass') => ({ project: 'P', phase, decision, decidedAt: '2026-05-01T00:00:00Z', decidedBy: null })
const it = (kind, itemId, status) => ({ project: 'P', phase: 'G3', kind, itemId, status, updatedAt: '2026-06-01T00:00:00Z', updatedBy: null })

// G1, G2 passed → G3 current; 1 of 4 steps done → 25%; 1 output + 1 criterion verified of 4 prerequisites → 50% ready
{
  const r = stageGateRadarSection({ project: 'P', phases, steps, prereqs, decisions: [dec('G1'), dec('G2')], phaseRows: [], items: [it('objective', 1, 'completed'), it('objective', 2, 'in_progress'), it('output', 10, 'verified'), it('output', 11, 'submitted'), it('criterion', 20, 'verified')] })
  assert.deepEqual(r.lifecycle.map((l) => [l.key, l.state, l.progressPct]), [['G1', 'done', 100], ['G2', 'done', 100], ['G3', 'current', 25]])
  assert.equal(r.currentStageLabel, 'G3 — خرید خدمات مشاور')
  assert.deepEqual(r.nextGate, { name: 'تصویب انتخاب مشاور', nameEn: 'Gate G3', prerequisites: 4, passed: 2, pending: 2, failed: 0, readinessPct: 50 })
}
// a manual progress figure on the phase row wins over the step share
{
  const r = stageGateRadarSection({ project: 'P', phases, steps, prereqs, decisions: [dec('G1'), dec('G2')], items: [it('objective', 1, 'completed')], phaseRows: [{ project: 'P', phase: 'G3', gateStatus: 'not_ready', actualStart: null, actualFinish: null, plannedFinish: null, manualPct: 70 }] })
  assert.equal(r.lifecycle[2].progressPct, 70)
}
// nothing recorded → no section (the radar keeps its other source)
assert.equal(stageGateRadarSection({ project: 'P', phases, steps, prereqs, decisions: [], items: [], phaseRows: [] }), null)
// every gate passed → all done, last gate shown as passed
{
  const r = stageGateRadarSection({ project: 'P', phases, steps, prereqs, decisions: [dec('G1'), dec('G2'), dec('G3')], items: [], phaseRows: [] })
  assert.ok(r.lifecycle.every((l) => l.state === 'done'))
  assert.equal(r.currentStageLabel, 'پایان چرخه')
  assert.equal(r.nextGate.readinessPct, 100)
}
console.log('radar/stageGateRadar: all assertions passed')
