const test = async (name, f) => { try { await f() } catch (e) { e.message = name + ': ' + e.message; throw e } } // plain assert script like the rest of the suite (scripts/run-tests.mjs only awaits the import)
import assert from 'node:assert/strict'
import { todayOnSite } from './todayOnSite.ts'
const acts = [{ id: 'a', title: 'جوشکاری', plannedStart: '2026-01-01', plannedEnd: '2026-01-10', active: true }, { id: 'b', title: 'ریسه', plannedStart: null, plannedEnd: null, active: true }, { id: 'c', title: 'غیرفعال', plannedStart: '2026-01-01', plannedEnd: '2026-01-10', active: false }]
const req = [{ activityId: 'a', formKey: 'welding' }, { activityId: 'a', formKey: 'rt_report' }, { activityId: 'b', formKey: 'string' }, { activityId: 'c', formKey: 'welding' }]
await test('planned or worked activities with required forms; best state wins', () => {
  const reps = [{ formKey: 'welding', reportDate: '2026-01-05', status: 'draft', front: 'F1' }, { formKey: 'welding', reportDate: '2026-01-05', status: 'approved', front: 'F1' }, { formKey: 'rt_report', reportDate: '2026-01-04', status: 'approved', front: 'F1' }]
  const r = todayOnSite(acts, req, reps, '2026-01-05', new Set())
  assert.equal(r.length, 1); assert.deepEqual(r[0].forms, [{ formKey: 'welding', state: 'approved' }, { formKey: 'rt_report', state: 'missing' }])
  const r2 = todayOnSite(acts, req, [], '2026-01-05', new Set(['b']))
  assert.deepEqual(r2.map((x) => x.activityId), ['a', 'b'])
})
await test('front filter and no required forms', () => {
  const reps = [{ formKey: 'welding', reportDate: '2026-01-05', status: 'submitted', front: 'F2' }]
  assert.equal(todayOnSite(acts, req, reps, '2026-01-05', new Set(), 'F1')[0].forms[0].state, 'missing')
  assert.equal(todayOnSite(acts, [], reps, '2026-01-05', new Set()).length, 0)
})
