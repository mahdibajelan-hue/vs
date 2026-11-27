import assert from 'node:assert/strict'
import { dayNarrative, dayProgress, resourceBands } from './dailyDr.ts'
import { MAN_CATALOG } from './resourceCatalog.ts'

const R = (section, name, total, active, kind = 'man') => ({ kind, section, name, totalQty: total, activeQty: active, idleQty: 0, leaveQty: 0, stoppedQty: 0, nativeQty: 0, nonnativeQty: 0, repairQty: 0 })
const sec = MAN_CATALOG[0].section
const b = resourceBands([R(sec, 'رئیس کارگاه', 1, 1), R(sec, 'رئیس کارگاه', 1, 0), R('بخش جدید', 'کارگر ویژه', 3, 2)], 'man')
assert.equal(b.bands.length, 4)
assert.equal(b.head[0], 'تعداد کل')
assert.deepEqual(b.total.slice(0, 2), [5, 3])
const rows = b.bands.flat()
assert.equal(rows.find((r) => r.name === 'رئیس کارگاه').vals[0], 2)
assert.ok(rows.some((r) => r.section === 'بخش جدید' && r.span === 1))
assert.equal(rows.length, MAN_CATALOG.reduce((s, c) => s + c.items.length, 0) + 1)
// a section is never split over two bands
for (const band of b.bands) { let left = 0; for (const r of band) { if (r.span) { assert.equal(left, 0); left = r.span } left -= 1 } assert.equal(left, 0) }

const A = { id: 'a', itemNo: '1', title: 'ریسه', unit: 'm', sort: 1 }
const reps = [{ id: 'r1', formKey: 'work', status: 'approved', reportDate: '2026-11-25', data: {} }, { id: 'r2', formKey: 'work', status: 'submitted', reportDate: '2026-11-26', data: { ops: ['حفاری', ''], obstacles: ['باد'] } }]
const lines = [{ reportId: 'r1', activityId: 'a', qty: 100, status: 'approved', approvedQty: 90, kmFrom: null, kmTo: null, note: '' }, { reportId: 'r2', activityId: 'a', qty: 50, status: 'pending', approvedQty: null, kmFrom: 1.2, kmTo: 1.25, note: 'x' }]
const p = dayProgress([A], reps, lines, '2026-11-26', () => 1000)
assert.equal(p.length, 1); assert.equal(p[0].prev, 90); assert.equal(p[0].today, 50); assert.equal(p[0].cum, 140); assert.equal(p[0].remaining, 860); assert.equal(p[0].kmFrom, 1.2)
assert.deepEqual(dayNarrative([reps[1]]), { ops: ['حفاری'], obstacles: ['باد'] })
console.log('dailyDr ok')
