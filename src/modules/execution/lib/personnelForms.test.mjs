import assert from 'node:assert/strict'
import { cardFields, cardValues, wqtValues, cardProblems } from './personnelForms.ts'
const c = cardValues('welder', { name: 'Ali', id: 'W1', stamp: 'A12', thk: '0.438', prep: 'E6010', pos: '5G', dirA: 'up', dirB: 'down', validity: '2026-05-01' }, { consultant: { name: 'C', date: '2026-01-02' } }, (d) => d.replace(/-/g, '/'))
assert.equal(c.D3, 'Ali'); assert.equal(c.A17, '0.438'); assert.equal(c.C17, 'E6010'); assert.equal(c.H17, '5G'); assert.equal(c.A11, '2026/05/01')
assert.equal(c.A12, '✓'); assert.equal(c.A13, ''); assert.equal(c.H13, '✓'); assert.equal(c.H12, '')
assert.match(c.A21, /Name: C\nSign:\nDate: 2026\/01\/02/); assert.equal(c.H21, undefined)
assert.deepEqual(cardValues('welder', {}), {}) // nothing typed → the sheet keeps its own text
const w = wqtValues({ wqtNo: '12', process: 'SMAW', visual: 'yes', rtNo: 'R5', rtResult: 'ACC', qualified: 'YES' })
assert.equal(w.A5, 'W.Q.T NO: 12'); assert.match(w.A16, /☑ yes/); assert.match(w.A17, /Report No\.: R5 .*Results ACC/); assert.equal(w.A13, 'QUALIFIED: YES')
assert.ok(cardFields('coater').some((f) => f.key === 'sys' && f.label === 'Coating System'))
assert.equal(cardProblems('welder', { name: 'x' }).length, 3)
console.log('personnel forms: all assertions passed')
