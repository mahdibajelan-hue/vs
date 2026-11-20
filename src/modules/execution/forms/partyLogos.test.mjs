import assert from 'node:assert/strict'
import { partyLogoCells } from './partyLogos.ts'

const cols = Array.from({ length: 12 }, () => ({ w: 50 }))
const P = { employer: { name: 'NIGC', logo: 'e.png' }, consultant: { name: 'Cons', logo: 'c.png' }, contractor: { name: 'Con', logo: 'k.png' } }
// «حمل و ریسه لوله»: three empty boxes on row 1, then a full-width empty row and the title
const string = { cols, rows: [], styles: [], logos: [], cells: [{ r: 0, c: 0, cs: 4 }, { r: 0, c: 4, cs: 4 }, { r: 0, c: 8, cs: 4 }, { r: 1, c: 0, cs: 12 }, { r: 2, c: 0, cs: 12, v: 'پروژه' }] }
assert.deepEqual(partyLogoCells(string, P), { I1: { image: 'e.png', caption: 'NIGC' }, E1: { image: 'c.png', caption: 'Cons' }, A1: { image: 'k.png', caption: 'Con' } })
// pipe entry: two boxes either side of the title
const entry = { cols, rows: [], styles: [], logos: [], cells: [{ r: 0, c: 0, cs: 3, rs: 3 }, { r: 0, c: 3, cs: 5, rs: 3, v: 'عنوان' }, { r: 0, c: 8, cs: 2, rs: 3 }] }
assert.deepEqual(Object.keys(partyLogoCells(entry, P)).sort(), ['A1', 'I1'])
assert.equal(partyLogoCells(entry, P).I1.image, 'e.png')
assert.equal(partyLogoCells(entry, P).A1.image, 'k.png')
// a party without a logo leaves its box empty; a sheet with its own logo images is left alone
assert.deepEqual(Object.keys(partyLogoCells(entry, { employer: { name: 'x' }, contractor: { logo: 'k.png' } })), ['A1'])
assert.deepEqual(partyLogoCells({ ...entry, logos: [{ kind: 'pic', from: [0, 8] }] }, P), {})
console.log('execution/forms/partyLogos: all assertions passed')
