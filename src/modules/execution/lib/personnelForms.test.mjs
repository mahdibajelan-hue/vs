import assert from 'node:assert/strict'
import { WQT_FIELDS, WQT_GROUPS, wqtDefaults, testProblems, cardData, validityText } from './personnelForms.ts'
// every field belongs to exactly one group (nothing hidden, nothing asked twice)
const grouped = WQT_GROUPS.flatMap((g) => g.keys)
assert.deepEqual([...grouped].sort(), WQT_FIELDS.map((f) => f.key).sort())
assert.equal(new Set(grouped).size, grouped.length)
// identity is never a test/card field: it is typed once on the person
for (const k of ['welderName', 'welderId', 'name', 'id', 'stamp', 'nationalId']) assert.ok(!WQT_FIELDS.some((f) => f.key === k), k)
assert.equal(wqtDefaults().process, 'SMAW')
assert.equal(testProblems({}).length, 3); assert.equal(testProblems({ wqtNo: '36', testDate: '2026-01-01', qualified: 'YES' }).length, 0)
const t = { wqtNo: '36', process: 'SMAW', position: '5G', refStd: 'API 1104', baseMat: 'API 5L-X60', coupon: '30"', filler: 'E8010', range: '0.154≤ST<0.750', testDate: '2026-05-01', progression: 'Down Hill' }
const d = cardData({ kind: 'welder', fullName: 'Ali', nationalId: '146-122037-8', raw: '35', card: { validity: 'END', wps: 'WPS-01', polarity: 'DCEP' } }, t, (x) => x.replace(/-/g, '/'))
assert.equal(d.nationalId, '146-122037-8'); assert.equal(d.stamp, '35'); assert.equal(d.validity, 'End of project'); assert.equal(d.validityRaw, 'END')
assert.deepEqual(d.rows.find((r) => r[0] === 'Test Date'), ['Test Date', '2026/05/01']); assert.deepEqual(d.rows.find((r) => r[0] === 'Type Manual'), ['Type Manual', 'DCEP'])
assert.deepEqual(d.dirs, { fill: 'down', root: 'down' }); assert.deepEqual(d.table[0], ['WQT NO', '36'])
assert.equal(validityText('2027-01-01', (x) => `J${x}`), 'J2027-01-01'); assert.equal(validityText(''), '')
const c = cardData({ kind: 'coater', fullName: 'Reza', nationalId: '1', raw: 'C1', card: { sys: 'Sleeve', size: '30"' } }, undefined)
assert.equal(c.title, 'COATING APPLICATOR QUALIFICATION CARD'); assert.equal(c.rows.length, 2)
console.log('personnel forms: all assertions passed')
