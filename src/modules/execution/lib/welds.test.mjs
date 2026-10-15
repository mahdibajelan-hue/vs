import assert from 'node:assert/strict'
import { normN1, normN2, weldKey, analyseWelds } from './welds.ts'

// N1 — safe normalisation
assert.equal(normN1('  w-404 '), 'W-404')
assert.equal(normN1('W‑404'), 'W-404')             // non-breaking hyphen
assert.equal(normN1('W–404'), 'W-404')             // en dash
assert.equal(normN1('W—404'), 'W-404')             // em dash
assert.equal(normN1('W−404'), 'W-404')             // minus sign
assert.equal(normN1('۱۲'), '12'); assert.equal(normN1('٣٤'), '34')
assert.equal(normN1('W‌404'), 'W404')          // ZWNJ
assert.equal(normN1('W‎-404‏'), 'W-404')  // direction marks
assert.equal(normN1('W   404'), 'W 404')            // spaces collapse but are kept
assert.equal(normN1('كيان'), 'کیان')                // Arabic ي / ك
assert.equal(normN1(null), ''); assert.equal(normN1(undefined), ''); assert.equal(normN1(12), '12')
// N1 does NOT merge things that merely look alike
assert.notEqual(normN1('W-404'), normN1('W404'))
assert.notEqual(normN1('W-04'), normN1('W-4'))
assert.notEqual(normN1('W 404'), normN1('W404'))
assert.notEqual(normN1('SEC-12'), normN1('12'))
// N2 — suspicion only
assert.equal(normN2('W-404'), normN2('W404'))
assert.equal(normN2('W-04'), normN2('W-4'))
assert.equal(normN2('w 4'), normN2('W-04'))
assert.notEqual(normN2('W-404'), normN2('W-405'))
assert.notEqual(normN2('SEC-12'), normN2('12'))     // prefixes are never stripped
// key
assert.equal(weldKey('۱۲', 'w-404'), '12|W-404')
assert.equal(weldKey('', 'W1'), null); assert.equal(weldKey('12', '  '), null); assert.equal(weldKey(null, null), null)

const row = (o) => ({ lineId: 'l' + Math.random(), reportId: 'r1', formKey: 'welding', section: '12', weld: 'W-404', ...o })
// exact N1 equality groups rows of different forms into one weld with stage counts
let a = analyseWelds([row({ formKey: 'fitup', lineId: 'a', pipe: 'P1', sizeIn: '48', thkIn: '0.5' }), row({ formKey: 'welding', lineId: 'b', section: '۱۲', weld: 'w-404', pipe: 'p1' }), row({ formKey: 'rt_report', lineId: 'c', weld: ' W-404 ' }), row({ formKey: 'weld_repair', lineId: 'd' })])
assert.equal(a.welds.length, 1); assert.deepEqual(a.welds[0].stages, { fitup: 1, weld: 1, rt: 1, repair: 1 })
assert.equal(a.welds[0].pipe, 'P1'); assert.equal(a.welds[0].conflicts.length, 0); assert.equal(a.stats.suspectGroups, 0)
// rows of non-weld forms are ignored
a = analyseWelds([row({ formKey: 'string' }), row({ formKey: 'work' })]); assert.equal(a.stats.weldRows, 0); assert.equal(a.welds.length, 0)
// invalid rows (no section / no weld) never attach to a weld
a = analyseWelds([row({ section: '' }), row({ weld: '' }), row({})]); assert.equal(a.invalid.length, 2); assert.equal(a.welds.length, 1)
// pipe mismatch → attached, pipe hidden, conflict recorded, nothing overwritten
a = analyseWelds([row({ lineId: 'a', pipe: 'P1' }), row({ lineId: 'b', formKey: 'fitup', pipe: 'P2' })])
assert.equal(a.welds.length, 1); assert.equal(a.welds[0].pipe, null); assert.equal(a.welds[0].conflicts[0].kind, 'pipe'); assert.deepEqual(a.welds[0].conflicts[0].values, ['P1', 'P2'])
// one row without a pipe does not create a conflict or hide the known pipe
a = analyseWelds([row({ pipe: 'P1' }), row({ formKey: 'rt_report' })]); assert.equal(a.welds[0].pipe, 'P1'); assert.equal(a.welds[0].conflicts.length, 0)
// size / thickness / front conflicts
a = analyseWelds([row({ sizeIn: '48', thkIn: '0.5', front: 'A' }), row({ formKey: 'fitup', sizeIn: '30', thkIn: '0,6', front: 'B' })])
assert.deepEqual(a.welds[0].conflicts.map((c) => c.kind).sort(), ['front', 'size', 'thickness'])
a = analyseWelds([row({ thkIn: '0.5' }), row({ formKey: 'fitup', thkIn: '0,5' })]); assert.equal(a.welds[0].conflicts.length, 0) // 0,5 and 0.5 are the same number
// N2-only differences are flagged, NEVER merged
a = analyseWelds([row({ weld: 'W-404' }), row({ weld: 'W404', formKey: 'rt_report' }), row({ weld: 'W-04' }), row({ weld: 'W-4', formKey: 'fitup' })])
assert.equal(a.welds.length, 4); assert.equal(a.stats.suspectGroups, 2)
assert.deepEqual(a.suspects.map((s) => s.keys.length), [2, 2])
// different sections with the same weld number are different welds
a = analyseWelds([row({ section: '12' }), row({ section: '13' })]); assert.equal(a.welds.length, 2); assert.equal(a.stats.suspectGroups, 0)
// deterministic order, stats
a = analyseWelds([row({ weld: 'B' }), row({ weld: 'A' })]); assert.deepEqual(a.welds.map((w) => w.weld), ['A', 'B']); assert.equal(a.stats.rows, 2)
// the original rows are returned untouched (no mutation of inputs)
const r0 = row({ weld: ' w-1 ' }); const copy = JSON.stringify(r0); analyseWelds([r0]); assert.equal(JSON.stringify(r0), copy)
console.log('welds: all assertions passed')
