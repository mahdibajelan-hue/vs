const test = async (name, f) => { try { await f() } catch (e) { e.message = name + ': ' + e.message; throw e } } // plain assert script like the rest of the suite (scripts/run-tests.mjs only awaits the import)
import assert from 'node:assert/strict'
import { qcSummary } from './qcSummary.ts'
const r = (id, status, d = '2026-01-05', formKey = 'welding') => ({ id, formKey, reportDate: d, status })
await test('status label follows approval share, work reports and drafts are ignored', () => {
  const s = qcSummary([r('1', 'approved'), r('2', 'submitted'), r('3', 'draft'), r('4', 'approved', '2026-01-05', 'work')], [], [], 0, '2026-01-01', '2026-01-07')
  assert.equal(s.forms, 2); assert.equal(s.approvedForms, 1); assert.equal(s.dataStatus, 'draft_included')
  assert.equal(qcSummary([r('1', 'approved')], [], [], 0, '2026-01-01', '2026-01-07').dataStatus, 'approved_only')
  assert.equal(qcSummary([], [], [], 0, '2026-01-01', '2026-01-07').dataStatus, 'none')
})
await test('counts of findings and NCRs', () => {
  const f = [{ status: 'open', createdAt: '2026-01-02T00:00:00Z', severity: 'high' }, { status: 'closed', createdAt: '2025-12-01T00:00:00Z', severity: 'low' }]
  const n = [{ status: 'open', createdAt: '2026-01-03T00:00:00Z', closedAt: null }, { status: 'closed', createdAt: '2025-12-01T00:00:00Z', closedAt: '2026-01-04T00:00:00Z' }]
  const s = qcSummary([], f, n, 140, '2026-01-01', '2026-01-07')
  assert.deepEqual([s.findingsInPeriod, s.openFindings, s.highOpen, s.ncrOpened, s.ncrClosed, s.ncrOpen, s.welds], [1, 1, 1, 1, 1, 1, 140])
})
