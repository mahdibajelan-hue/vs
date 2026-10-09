import assert from 'node:assert/strict'
import * as g from './gateProgress.ts'
const st = (key, seq, over = {}) => ({ id: key, stageKey: key, nameFa: key, sequence: seq, status: 'in_progress', plannedStart: '2026-01-01', plannedFinish: '2026-01-11', progress: 0, standardDays: 10, ...over })
assert.equal(Math.round(g.plannedPct(st('a'), '2026-01-06')), 50)
assert.equal(g.plannedPct({ plannedStart: null, plannedFinish: null, status: 'completed' }, 'x'), 100)
const gate = { id: 'g1', stageKey: 'a', engine: 'basic_design', readinessThreshold: 80 }
const log = [{ gateId: 'g1', series: 'overall', pct: 40, recordedAt: '2026-01-02' }]
const m = g.stageProgressMap([st('a', 0), st('b', 1, { standardDays: 30, progress: 10 })], [gate], [], log, '2026-01-06')
assert.equal(m.get('a').actual, 40); assert.equal(m.get('b').actual, 10)
const s = g.executiveSummary([st('a', 0), st('b', 1, { standardDays: 30, progress: 10 })], m, new Map([['a', 'ready']]), 'a')
assert.equal(s.actual, Math.round((40 * 10 + 10 * 30) / 40)); assert.equal(s.gateStatusLabel, 'آماده بررسی')
assert.equal(s.deviation, s.actual - s.planned)
console.log('gateProgress ok')
