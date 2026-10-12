import assert from 'node:assert/strict'
import { buildPositions } from './model.ts'
import { shortageByFront } from './shortage.ts'
import { orderAllowance } from './allowance.ts'
import { itemProgress, stageBackingLimit } from './progress.ts'

const mat = (o = {}) => ({ id: 'm1', itemUid: 'MT-000001', lineNo: '001', materialCode: 'V-1', description: 'شیر', unit: 'EA', facility: 'ST1', area: 'عبور از جاده', front: 'F1', usageLocation: '', unitPrice: 100, fxRate: 1, mtoQuantity: 10, contractQty: 10, detailQty: null, needDate: '2026-09-01', ...o })
const data = (o = {}) => ({ materials: [mat()], purchaseOrders: [{ id: 'po', status: 'issued' }], poLines: [], manufacturing: [], shipmentLines: [], warehouseLines: [], allocations: [], txns: [], packages: [], packageItems: [], ...o })
const wh = (q) => ({ id: 'w' + q, materialId: 'm1', quantityReceived: q, condition: 'ok', inspectionStatus: 'accepted' })
const run = (d, by = 'facility', arrival = new Map()) => shortageByFront({ materials: d.materials, positions: buildPositions(d), arrival, by })

// nothing ordered: blocked
let r = run(data())
assert.equal(r[0].verdict, 'blocked'); assert.equal(r[0].lines[0].status, 'not_ordered')
// ordered fully, on time: in transit
r = run(data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }] }), 'facility', new Map([['m1', '2026-08-01']]))
assert.equal(r[0].verdict, 'in_transit'); assert.equal(r[0].lines[0].status, 'inbound')
// ordered fully but arrives after the need date: blocked ('late')
r = run(data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }] }), 'facility', new Map([['m1', '2026-10-01']]))
assert.equal(r[0].verdict, 'blocked'); assert.equal(r[0].lines[0].status, 'late')
// ordered too little: partial
r = run(data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 4 }] }))
assert.equal(r[0].lines[0].status, 'partial')
// everything in the store: ready, and grouped by the chosen dimension
r = run(data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }], warehouseLines: [wh(10)] }), 'area')
assert.equal(r[0].verdict, 'ready'); assert.equal(r[0].key, 'عبور از جاده')
// two fronts: the blocked one is listed first
r = run(data({ materials: [mat(), mat({ id: 'm2', facility: 'ST2' })], poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }], warehouseLines: [wh(10)] }))
assert.deepEqual(r.map((x) => [x.key, x.verdict]), [['ST2', 'blocked'], ['ST1', 'ready']])

// allowance: open → locked once ordered; shortage re-opens it
const pos = (d) => buildPositions(d).get('m1')
assert.equal(orderAllowance(pos(data()), 'package').state, 'open')
const ordered = data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }] })
assert.equal(orderAllowance(pos(ordered), 'order').state, 'locked')
const scrapped = data({ poLines: [{ id: 'l', poId: 'po', materialId: 'm1', quantityOrdered: 10 }], warehouseLines: [wh(10)], txns: [{ id: 't', materialId: 'm1', kind: 'scrap', qty: 3, status: 'posted' }] })
const al = orderAllowance(pos(scrapped), 'order'); assert.equal(al.state, 'shortage'); assert.equal(al.remaining, 3); assert.ok(al.reasonAuto.includes('کسری'))

// progress is capped by the real records: PO stage approved with no order line earns nothing
const item = { id: 'i', packageId: 'p', materialId: 'm1', qty: 10, unitPrice: 100 }
const stage = (key, w, approvedQty = 10) => ({ id: key, itemId: 'i', stageKey: key, applicable: true, weight: w, status: 'approved', approvedQty, approvedAt: '2026-01-01', plannedDate: null })
const stages = [stage('pr_submit', 30), stage('po_issue', 70)]
assert.equal(itemProgress(item, stages, '2026-06-01', 1).actual, 1)
assert.equal(itemProgress(item, stages, '2026-06-01', 1, { ordered: 0, received: 0 }).actual, 0.3)
assert.equal(itemProgress(item, stages, '2026-06-01', 1, { ordered: 5, received: 0 }).actual, 0.65)
assert.equal(stageBackingLimit('rfq', { ordered: 0, received: 0 }), null)
assert.equal(stageBackingLimit('site_receipt', { ordered: 9, received: 4 }), 4)
