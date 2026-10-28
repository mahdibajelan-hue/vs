import assert from 'node:assert/strict'
import { rollupEvidence } from './portfolioEvidence.ts'

const rep = (project, o = {}) => ({
  asOf: '2026-10-28', project, confidence: 'medium', headline: [], facts: {}, statusLines: [], trends: [], projections: [], effects: [], quality: [], changes: null, previousRef: null, thresholds: {}, thresholdsVersion: 'x', period: null,
  findings: [], causes: [], recommendations: [], decisions: [], ...o,
})
const m = (id, kind) => ({ id, kind, title: id, statement: id, materiality: 'material', evidence: [{ source: 's', asOf: null }] })
const out = rollupEvidence([
  { projectId: 'a', hasMetrics: true, report: rep('A', { findings: [m('f-spi', 'schedule'), m('f-gate', 'gate')], causes: [{ findingIds: [], strength: 'associated', text: 'در دورهٔ گزارش ۴۰ ساعت توقف با علت «کمبود مصالح» ثبت شده', evidence: [] }], decisions: [{ id: 'd1', title: 'x', level: 'project', owner: null, dueBy: null, overdue: true, evidence: [] }], recommendations: [{ id: 'r', findingIds: ['f-gate'], text: 'رفع مانع', owner: null, urgency: 'now' }] }) },
  { projectId: 'b', hasMetrics: true, report: rep('B', { findings: [m('f-spi', 'schedule')], causes: [{ findingIds: [], strength: 'associated', text: 'در دورهٔ گزارش ۹ ساعت توقف با علت «کمبود مصالح» ثبت شده', evidence: [] }], confidence: 'low' }) },
  { projectId: 'c', hasMetrics: false, report: rep('C') },
])
assert.equal(out.projects, 3); assert.equal(out.withData, 2); assert.equal(out.materialProjects, 2)
assert.equal(out.hotspots[0].project, 'A')
assert.equal(out.byKind[0].kind, 'schedule'); assert.equal(out.byKind[0].projects, 2)
assert.deepEqual(out.sharedCauses[0], { text: 'کمبود مصالح', projects: ['A', 'B'] })
assert.equal(out.decisions[0].overdue, true)
assert.equal(out.recommendations.length, 1)
assert.equal(out.confidence.low, 1)
assert.ok(out.headline.some((h) => h.includes('کمبود مصالح')))
assert.ok(rollupEvidence([]).headline[0].includes('دیده نشد'))
console.log('portfolioEvidence ok')
