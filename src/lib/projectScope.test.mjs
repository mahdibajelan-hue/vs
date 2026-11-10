import assert from 'node:assert/strict'
import { register } from 'node:module'
// projectScope imports the app stores only for insideProject(); the pure helpers are tested here
const { scopedSelect, mergePatch } = await import('./projectScopePure.ts')

// select / filter key through two parents
assert.deepEqual(scopedSelect('*', { col: 'master_project_id', path: [['mtl_package_items', 'fk1'], ['mtl_packages', 'fk2']] }, 'P'),
  { select: '*, __p:mtl_package_items!fk1!inner(__p:mtl_packages!fk2!inner(master_project_id))', key: '__p.__p.master_project_id' })
assert.deepEqual(scopedSelect('*', { col: 'project_id' }, 'P'), { select: '*', key: 'project_id' })
assert.deepEqual(scopedSelect('*', { col: 'project_id' }, null), { select: '*', key: null })

// merge: own rows, children two levels down, shared lists
const cur = {
  packages: [{ id: 'a', masterProjectId: 'P' }, { id: 'b', masterProjectId: 'Q' }],
  items: [{ id: 'ia', packageId: 'a' }, { id: 'ib', packageId: 'b' }],
  stages: [{ id: 'sa', itemId: 'ia' }, { id: 'sb', itemId: 'ib' }],
  units: [{ code: 'm' }],
}
const patch = { packages: [{ id: 'a2', masterProjectId: 'P' }], items: [{ id: 'ia2', packageId: 'a2' }], stages: [{ id: 'sa2', itemId: 'ia2' }], units: [{ code: 'm' }, { code: 'kg' }] }
const out = mergePatch(cur, patch, 'P', { items: ['packageId', 'packages'], stages: ['itemId', 'items'] })
assert.deepEqual(out.packages.map((x) => x.id).sort(), ['a2', 'b'])
assert.deepEqual(out.items.map((x) => x.id).sort(), ['ia2', 'ib'])
assert.deepEqual(out.stages.map((x) => x.id).sort(), ['sa2', 'sb'])
assert.equal(out.units.length, 2)
// no scope: the patch as it is
assert.equal(mergePatch(cur, patch, null), patch)
console.log('projectScope: all assertions passed')
