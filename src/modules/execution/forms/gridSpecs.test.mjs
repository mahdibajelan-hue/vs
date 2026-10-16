import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addr } from './gridTypes.ts'
import { GRID_SPECS, specPage, specPages } from './gridSpecs.ts'

const file = { fitup: 'fit_up', bend: 'bend', weld_repair: 'repair', tie_in: 'connection', rt_request: 'rt_req_full', rt_request_rp: 'rt_req_repair', rt_report: 'rt_report', pipe_entry: 'pipe_entry' }
for (const [key, spec] of Object.entries(GRID_SPECS)) {
  const t = JSON.parse(readFileSync(new URL(`./templates/${file[key]}.grid.json`, import.meta.url)))
  assert.equal(t.formKey, key)
  const have = new Set(t.cells.map((c) => addr(c.r, c.c)))
  for (const h of spec.headers) assert.ok(have.has(h.cell), `${key}: header cell ${h.cell} missing`)
  // every cell the row block writes exists in the approved sheet, for every record of a full page
  const row = Object.fromEntries(['km', 'pipeNo', 'wtMm', 'lengthM', 'diaIn', 'dirSO', 'dirLR', 'ovalMm', 'ovalPct', 'sec', 'jointNo', 'sizeIn', 'bendDeg', 'remark', 'stamp', 'defectType', 'rtReqNo', 'weldNo', 'thkIn', 'odIn', 'stampRoot', 'stampHot', 'stampFill', 'stampCap', 'stampRootC', 'stampHotC', 'stampFillC', 'stampCapC', 'stNo', 'segment', 'defect'].map((k) => [k, k === 'thkIn' ? '0.5' : k === 'lengthM' ? '12' : 'x']))
  row.result = 'acc'; row.repairDone = 'done'; row.repairKind = 'RS'
  const rows = Array.from({ length: spec.rows.per + 1 }, () => row)
  assert.equal(specPages(spec, rows.length), 2)
  for (let p = 0; p < 2; p++) {
    const r = specPage(spec, t, { header: { date: 'D', reportNo: 'R', pipeSpec: 'P' }, rows, thk: [0.5, 0.6, 0.7, 0.8], prior: { len: [1, 1, 1, 1], joints: [1, 1, 1, 1] } }, p)
    assert.deepEqual(r.missing, [], `${key} page ${p}: cells outside the approved sheet: ${r.missing}`)
    assert.ok(Object.keys(r.values).length > 5)
  }
}
console.log('grid specs: all assertions passed')

// sheet entry: a clicked cell maps back to its field
{
  const { cellTarget, editableCells } = await import('./gridSpecs.ts')
  const sp = GRID_SPECS.fitup
  assert.deepEqual(cellTarget(sp, 'A4', 0), { kind: 'header', key: 'pipeSpec' })
  assert.equal(cellTarget(sp, 'D5', 0), null) // reportNo is derived
  assert.deepEqual(cellTarget(sp, 'C10', 0), { kind: 'row', row: 0, key: 'jointNo' })
  assert.equal(cellTarget(sp, 'C10', 1)?.row, 20)
  assert.ok(editableCells(sp, 0).has('A4') && !editableCells(sp, 0).has('D5'))
  console.log('sheet-entry targets ok')
}

// pipe-delivery sheet: stacked thickness blocks with this-report and to-date totals
{
  const t = JSON.parse(readFileSync(new URL('./templates/pipe_entry.grid.json', import.meta.url)))
  const sp = GRID_SPECS.pipe_entry
  const rows = [{ pipeNo: 'P1', lengthM: '12', thkIn: '0.688' }, { pipeNo: 'P2', lengthM: '11.5', thkIn: '0.688' }, { pipeNo: 'P3', lengthM: '10', thkIn: '0.406' }]
  const r = specPage(sp, t, { header: { date: '1402/08/13', reportNo: '002' }, rows, priorByThk: { '0.688': { len: 100, joints: 9 } } }, 0)
  assert.equal(r.values.E36, '23.50'); assert.equal(r.values.J36, '2')      // 0.688 today
  assert.equal(r.values.E37, '123.50'); assert.equal(r.values.J37, '11')    // to date = prior + today
  assert.equal(r.values.E32, '10.00'); assert.equal(r.values.J33, '1')      // 0.406
  assert.equal(r.values.E40, '133.50'); assert.equal(r.values.J40, '12')    // grand totals
  assert.equal(r.values.C6, '12'); assert.equal(r.values.A4, '1402/08/13'); assert.deepEqual(r.missing, [])
  console.log('pipe entry vblocks ok')
}
