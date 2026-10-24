import assert from 'node:assert/strict'
import { buildStageGateBundle, SG_DIMENSION_STAGES } from './stageGateBundle.ts'
import { analyseProject } from './useProjectAnalysis.ts'

const phase = (code, sort, extra = {}) => ({ code, sort, title: 'مرحله ' + code, gateName: 'گیت ' + code, threshold: 80, group: sort <= 5 ? 'fel' : 'execution', engine: 'step', icon: '', responsible: 'کارفرما', standardDays: 60, ...extra })
const phases = [phase('G1', 1), phase('G2', 2), phase('G3', 3), phase('G4', 4), phase('G5', 5), phase('G6', 6)]
const defs = [
  { id: 1, phase: 'G3', kind: 'objective', seq: 1, title: 'تهیه اسناد', description: '', mandatory: false },
  { id: 2, phase: 'G3', kind: 'objective', seq: 2, title: 'ارزیابی کیفی', description: '', mandatory: false },
  { id: 10, phase: 'G3', kind: 'output', seq: 1, title: 'فهرست کوتاه', description: '', mandatory: false },
  { id: 20, phase: 'G3', kind: 'criterion', seq: 1, title: 'تصویب هیئت مدیره', description: '', mandatory: true },
  { id: 21, phase: 'G3', kind: 'criterion', seq: 2, title: 'ابلاغ', description: '', mandatory: false },
]
const item = (kind, itemId, status, extra = {}) => ({ project: 'P', phase: 'G3', kind, itemId, status, updatedAt: '2026-09-01T00:00:00Z', updatedBy: null, owner: null, dueDate: null, completionDate: null, evidence: '', evidenceUrl: '', comment: '', submittedBy: null, verifiedBy: null, verificationDate: null, ...extra })
const dec = (p, decision, at) => ({ project: 'P', phase: p, decision, decidedAt: at, decidedBy: 'x@y', reason: 'ok', conditionText: decision === 'conditional' ? 'ارسال گزارش' : '', conditionDue: null })
const ms = (stageKey, extra = {}) => ({ id: 'm-' + stageKey, projectId: 'M', name: 'ms ' + stageKey, milestoneType: 'project', stageKey, baselineDate: '2026-01-01', forecastDate: '2026-03-01', actualDate: null, isCritical: true, ownerId: null, dependsOnId: null, status: 'delayed', evidenceUrl: '', evidenceLabel: '', comments: '', ...extra })

const input = {
  masterProjectId: 'M', project: 'P', phases, defs,
  items: [item('objective', 1, 'completed'), item('objective', 2, 'in_progress'), item('output', 10, 'completed'), item('criterion', 20, 'pending', { dueDate: '2026-01-01' })],
  decisions: [dec('G1', 'pass', '2026-03-01T00:00:00Z'), dec('G2', 'conditional', '2026-08-01T00:00:00Z')],
  phaseRows: [{ project: 'P', phase: 'G3', gateStatus: 'not_ready', actualStart: '2026-08-02', actualFinish: null, plannedStart: '2026-08-01', plannedFinish: '2026-12-01', manualPct: null }],
  schedule: [{ id: 5, phase: 'G3', parentId: null, seq: 1, title: 'ارزیابی', plannedStart: '2026-08-01', plannedFinish: '2026-09-01', weight: 100, manualPct: 40 }],
  progress: [{ id: 1, phase: 'G3', newPct: 30, comment: '', recordedBy: null, recordedAt: '2026-09-10T00:00:00Z' }],
  milestones: [ms('procurement'), ms('G6', { status: 'on_track', isCritical: false, forecastDate: '2026-01-01' })],
  forecastHistory: [], health: [], warnings: [], actions: [],
}
const today = new Date('2026-10-24T00:00:00Z')
const b = buildStageGateBundle(input, today)

// stages: G1, G2 passed (conditional counts) → G3 current with half of its steps done
assert.equal(b.lifecycle.currentStageKey, 'G3')
assert.equal(b.lifecycle.stageEnteredAt, '2026-08-01')
assert.deepEqual(b.stages.map((s) => [s.stageKey, s.status, s.progress]), [['G1', 'completed', 100], ['G2', 'completed', 100], ['G3', 'in_progress', 50], ['G4', 'not_started', 0], ['G5', 'not_started', 0], ['G6', 'not_started', 0]])
// gates from decisions; the conditional one carries its condition
assert.equal(b.gates.find((g) => g.stageKey === 'G1').status, 'approved')
const g2 = b.gates.find((g) => g.stageKey === 'G2')
assert.equal(g2.status, 'conditional'); assert.equal(g2.conditionText, 'ارسال گزارش')
assert.equal(b.gates.find((g) => g.stageKey === 'G3').status, 'in_progress')
// checklist: outputs and mandatory criteria decide readiness, steps do not
const c = (id) => b.checklist.find((x) => x.id === id)
assert.equal(c('sg-output-10').isMandatory, true)
assert.equal(c('sg-criterion-20').isMandatory, true)
assert.equal(c('sg-criterion-21').isMandatory, false)
assert.equal(c('sg-objective-1').isMandatory, false)
assert.equal(c('sg-criterion-21').status, 'not_started', 'no project row → not started')
// schedule items become activities; old milestone stage keys are read as G phases
assert.equal(b.activities[0].progress, 40); assert.equal(b.activities[0].status, 'in_progress')
assert.equal(b.milestones[0].stageKey, 'G5', 'procurement → G5')
assert.equal(b.decisions[0].gateId, 'sg-gate-G2', 'newest decision first')

// the whole analysis runs on it: readiness of G3, overdue mandatory criterion → warning, procurement health from G3/G5 milestones
const a = analyseProject(b, {}, '2026-10-24')
const r3 = a.readiness.find((r) => r.stageKey === 'G3')
assert.ok(r3, 'G3 readiness computed')
assert.equal(r3.mandatoryTotal, 2)
assert.equal(r3.mandatoryDone, 1)
assert.ok(a.warnings.length > 0, 'an overdue mandatory item raises an early warning')
const proc = a.health.find((h) => h.dimension === 'procurement')
assert.ok(proc.score < 100, 'the delayed critical milestone (procurement → G5) lowers procurement health')
const cons = a.health.find((h) => h.dimension === 'construction')
assert.equal(cons.explanation.includes('تأخیر') || cons.score === 100, true)
assert.deepEqual(SG_DIMENSION_STAGES.construction, ['G6', 'G7'])
console.log('lifecycle/stageGateBundle: all assertions passed')
