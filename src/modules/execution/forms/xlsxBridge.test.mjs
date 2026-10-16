const test = async (name, f) => { try { await f() } catch (e) { e.message = name + ': ' + e.message; throw e } } // plain assert script like the rest of the suite (scripts/run-tests.mjs only awaits the import)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gridToWorkbook, workbookToGrid, compareLayouts } from './xlsxBridge.ts'
const load = (n) => JSON.parse(readFileSync(new URL(`./templates/${n}.grid.json`, import.meta.url), 'utf8'))
for (const name of ['bend', 'connection', 'welder_card']) {
  await test(`round trip ${name}: geometry, texts and styles survive`, async () => {
    const base = load(name)
    const buf = await gridToWorkbook(base, { title: 't', version: 1 })
    const { layout } = await workbookToGrid(buf, `${name}.xlsx`, { formKey: base.formKey, base })
    assert.equal(layout.cols.length, base.cols.length); assert.equal(layout.rows.length, base.rows.length)
    assert.deepEqual(layout.cols.map((c) => c.w), base.cols.map((c) => c.w)); assert.deepEqual(layout.rows.map((r) => r.h), base.rows.map((r) => r.h))
    assert.deepEqual(layout.cols.map((c) => c.hidden), base.cols.map((c) => c.hidden))
    const key = (t) => new Map(t.cells.filter((c) => c.v || c.rs || c.cs).map((c) => [`${c.r},${c.c}`, [c.v ?? null, c.rs ?? 1, c.cs ?? 1, JSON.stringify(t.styles[c.s].f), JSON.stringify(t.styles[c.s].a.slice(0, 4)), JSON.stringify(t.styles[c.s].b), t.styles[c.s].bg]]))
    const A = key(base), B = key(layout)
    const bad = [...A].filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(B.get(k)))
    assert.equal(bad.length, 0, `${bad.length} cells differ, e.g. ${JSON.stringify(bad[0])} vs ${JSON.stringify(B.get(bad[0]?.[0]))}`)
    assert.equal(layout.stats.merged, base.stats.merged); assert.equal(layout.print.orientation, base.print.orientation)
    const d = compareLayouts(base, layout, []); assert.equal(d.textChanges.length, 0); assert.equal(d.structural, false)
  })
}
