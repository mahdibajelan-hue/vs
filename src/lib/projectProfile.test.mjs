import assert from 'node:assert/strict'
import { parseProjectKind, projectKind, kindScopes, rowScope, inView, writeScope, fitView, scopeViews, scopeTerms } from './projectProfile.ts'
import { executionCore } from '../modules/execution/lib/executionCore.ts'
import { actionInScope } from '../modules/execution/lib/workActions.ts'

// legacy free text is read leniently; unknown keeps the pipeline behaviour
assert.equal(parseProjectKind('خطوط لوله'), 'pipeline')
assert.equal(parseProjectKind('pipeline'), 'pipeline')
assert.equal(parseProjectKind('ایستگاه تقویت فشار گاز'), 'compressor_station')
assert.equal(parseProjectKind('خط لوله و ایستگاه تقویت فشار'), 'hybrid')
assert.equal(parseProjectKind('EPC'), null)
assert.equal(projectKind(''), 'pipeline')
assert.deepEqual(kindScopes('hybrid'), ['pipeline', 'station'])
assert.deepEqual(scopeViews('compressor_station'), ['station'])
assert.equal(fitView('pipeline', 'compressor_station'), 'station')
assert.equal(fitView('station', 'hybrid'), 'station')

// untagged rows belong to the main scope; only a hybrid project filters
assert.equal(rowScope(null, 'compressor_station'), 'station')
assert.equal(rowScope(null, 'hybrid'), 'pipeline')
assert.equal(inView('pipeline', 'compressor_station', 'station'), true) // changing a project's type never hides rows
assert.equal(inView('station', 'hybrid', 'pipeline'), false)
assert.equal(inView(null, 'hybrid', 'pipeline'), true)
assert.equal(writeScope('pipeline', 'pipeline'), null)
assert.equal(writeScope('hybrid', 'all'), 'pipeline')
assert.equal(writeScope('hybrid', 'station'), 'station')
assert.equal(scopeTerms('station').km, false)

// actions: the other scope's default set is hidden in a hybrid project
assert.equal(actionInScope('st_concrete', 'pipeline'), false); assert.equal(actionInScope('st_concrete', 'station'), true); assert.equal(actionInScope('stringing', 'station'), false)
assert.equal(actionInScope('custom_x', 'station') && actionInScope('custom_x', 'pipeline'), true)

// per-scope progress in a hybrid project: weights are normalised inside each scope; the whole project mixes both
const act = (id, scope, base) => ({ id, projectId: 'p', itemNo: id, title: id, unit: 'm', baseQty: base, unitPrice: 1, weight: 50, weightGroup: '', active: true, approval: 'approved', sort: 0, plannedStart: null, plannedEnd: null, scope })
const st = {
  settingsByProject: new Map(), baselines: [], blines: [],
  activities: [act('L1', null, 100), act('L2', 'pipeline', 100), act('S1', 'station', 100), act('S2', 'station', 100)],
  reports: [{ id: 'r1', projectId: 'p', formKey: 'work', reportDate: '2026-10-01', status: 'approved', scope: null }, { id: 'r2', projectId: 'p', formKey: 'work', reportDate: '2026-10-01', status: 'approved', scope: 'station' }],
  lines: [{ id: 'a', reportId: 'r1', activityId: 'L1', qty: 100, status: 'approved', approvedQty: 100, detail: {} }, { id: 'b', reportId: 'r2', activityId: 'S1', qty: 50, status: 'approved', approvedQty: 50, detail: {} }],
}
const epc = { welds: [], lineWelds: [], actionRules: [], workActions: [] }
const core = (view) => executionCore(st, epc, 'p', '2026-11-01', { kind: 'hybrid', view })
assert.equal(core('pipeline').activities.length, 2)
assert.equal(core('station').reports.length, 1)
assert.ok(Math.abs(core('pipeline').approved.overall - 0.5) < 1e-9)
assert.ok(Math.abs(core('station').approved.overall - 0.25) < 1e-9)
assert.ok(Math.abs(core('all').approved.overall - 0.375) < 1e-9)
// a pure station project sees every row whatever its tag
assert.equal(executionCore(st, epc, 'p', '2026-11-01', { kind: 'compressor_station', view: 'station' }).activities.length, 4)
console.log('projectProfile: ok')
