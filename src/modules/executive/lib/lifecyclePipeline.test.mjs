import assert from 'node:assert/strict'
import { buildPipeline, countByPhase } from './lifecyclePipeline.ts'

const phases = [{ code: 'G1', sort: 1, title: 'تعریف' }, { code: 'G2', sort: 2, title: 'شناسایی' }, { code: 'G3', sort: 3, title: 'خرید خدمات مشاور' }]
const steps = [
  { id: 31, phase: 'G3', seq: 1, title: 'تهیه اسناد ارزیابی کیفی' },
  { id: 32, phase: 'G3', seq: 2, title: 'ارزیابی کیفی' },
  { id: 33, phase: 'G3', seq: 3, title: 'فهرست کوتاه' },
]
const titles = new Map([['output:7', 'فهرست کوتاه مشاوران']])
const today = new Date('2026-10-23T12:00:00Z')
const base = { phases, steps, titles }

// A: G1, G2 passed → in G3; step 1 done, step 2 in progress; latest action is the step 2 change
{
  const [a] = buildPipeline({
    ...base, projects: ['A'],
    decisions: [
      { project: 'A', phase: 'G1', decision: 'pass', decidedAt: '2026-06-01T08:00:00Z', decidedBy: 'x@y' },
      { project: 'A', phase: 'G2', decision: 'conditional', decidedAt: '2026-09-01T08:00:00Z', decidedBy: 'x@y' },
    ],
    items: [
      { project: 'A', phase: 'G3', kind: 'objective', itemId: 31, status: 'completed', updatedAt: '2026-09-20T08:00:00Z', updatedBy: 'u1' },
      { project: 'A', phase: 'G3', kind: 'objective', itemId: 32, status: 'in_progress', updatedAt: '2026-10-13T08:00:00Z', updatedBy: 'u2' },
      { project: 'A', phase: 'G3', kind: 'output', itemId: 7, status: 'submitted', updatedAt: '2026-10-01T08:00:00Z', updatedBy: 'u3' },
    ],
    phaseRows: [],
  }, today)
  assert.equal(a.phase, 'G3')
  assert.deepEqual(a.steps.map((s) => s.status), ['done', 'active', 'todo'])
  assert.equal(a.stepIndex, 1)
  assert.equal(a.stepsDone, 1)
  assert.equal(a.enteredAt, '2026-09-01T08:00:00Z', 'entered when the previous gate passed (conditional counts)')
  assert.equal(a.daysInPhase, 52)
  assert.equal(a.lastAction.text, 'گام «ارزیابی کیفی» شروع شد')
  assert.equal(a.lastAction.by, 'u2')
  assert.equal(a.daysSinceAction, 10)
}

// B: a cancelled decision undoes the pass; no decision at all falls back to the phase row's gate status
{
  const [b, c] = buildPipeline({
    ...base, projects: ['B', 'C'],
    decisions: [
      { project: 'B', phase: 'G1', decision: 'pass', decidedAt: '2026-01-01T08:00:00Z', decidedBy: null },
      { project: 'B', phase: 'G1', decision: 'cancelled', decidedAt: '2026-02-01T08:00:00Z', decidedBy: null },
    ],
    items: [],
    phaseRows: [{ project: 'C', phase: 'G1', gateStatus: 'passed', actualStart: null }, { project: 'C', phase: 'G2', gateStatus: 'not_ready', actualStart: '2026-10-03' }],
  }, today)
  assert.equal(b.phase, 'G1', 'cancelled → back in G1')
  assert.equal(b.enteredAt, null)
  assert.equal(b.lastAction.text, 'تصویب گیت G1 لغو شد')
  assert.equal(c.phase, 'G2')
  assert.equal(c.enteredAt, '2026-10-03', 'no decision for G1 → the phase actual start')
  assert.equal(c.lastAction, null)
  assert.equal(c.stepIndex, null, 'G2 has no steps defined here')
}

// D: every gate passed → done; counts include 'done'
{
  const lines = buildPipeline({
    ...base, projects: ['D', 'E'],
    decisions: ['G1', 'G2', 'G3'].map((p, i) => ({ project: 'D', phase: p, decision: 'pass', decidedAt: `2026-0${i + 1}-01T00:00:00Z`, decidedBy: null })),
    items: [], phaseRows: [],
  }, today)
  assert.equal(lines[0].phase, 'done')
  assert.equal(lines[1].phase, 'nodata', 'nothing recorded for E')
  assert.deepEqual(countByPhase(lines, phases), [{ code: 'G1', count: 0 }, { code: 'G2', count: 0 }, { code: 'G3', count: 0 }, { code: 'done', count: 1 }, { code: 'nodata', count: 1 }])
}

// F: only G2 has a recorded decision → in G3 (unrecorded G1 does not pull it back); all phase rows 'not_ready' → no data
{
  const [f, g] = buildPipeline({
    ...base, projects: ['F', 'G'],
    decisions: [{ project: 'F', phase: 'G2', decision: 'pass', decidedAt: '2026-08-01T00:00:00Z', decidedBy: null }],
    items: [], phaseRows: ['G1', 'G2', 'G3'].map((p) => ({ project: 'G', phase: p, gateStatus: 'not_ready', actualStart: null })),
  }, today)
  assert.equal(f.phase, 'G3')
  assert.equal(f.enteredAt, '2026-08-01T00:00:00Z')
  assert.equal(g.phase, 'nodata')
}
console.log('executive/lib/lifecyclePipeline: all assertions passed')
