import assert from 'node:assert/strict'
import { buildPositions } from './model.ts'
import { supplyFunnel, needAging, orderDeadlines, stationGroupHeat, leadTimeExposure } from './insights.ts'

const mat = (o = {}) => ({ id: 'm1', unit: 'EA', facility: 'ST1', front: 'F1', unitPrice: 100, fxRate: 1, mtoQuantity: 10, contractQty: 10, detailQty: null, leadTimeDays: 30, needDate: '2026-09-01', groupId: 'g1', ...o })
const base = (o = {}) => ({ materials: [mat()], purchaseOrders: [{ id: 'po', status: 'issued' }], poLines: [{ id: 'pl', poId: 'po', materialId: 'm1', quantityOrdered: 6 }], manufacturing: [], shipmentLines: [], warehouseLines: [{ id: 'w', materialId: 'm1', quantityReceived: 12, condition: 'ok', inspectionStatus: 'accepted' }], allocations: [], txns: [], ...o })
const d = base(); const pos = buildPositions(d)

const f = supplyFunnel(d.materials, pos)
assert.equal(f[0].value, 1000); assert.equal(f[2].value, 600, 'ordered 6 of 10'); assert.equal(f[3].value, 1000, 'received is capped at the requirement'); assert.ok(f.every((s) => s.value <= f[0].value))

const d2 = base({ warehouseLines: [], poLines: [] }); const p2 = buildPositions(d2)
const a = needAging(d2.materials, p2, '2026-10-01'); assert.equal(a.find((b) => b.key === 'over').count, 1); assert.equal(a.find((b) => b.key === 'over').value, 1000)
const a2 = needAging(d2.materials, p2, '2026-08-20'); assert.equal(a2.find((b) => b.key === 'd30').count, 1)
const a3 = needAging([mat({ needDate: null })], buildPositions(base({ materials: [mat({ needDate: null })], warehouseLines: [], poLines: [] })), '2026-08-20'); assert.equal(a3.find((b) => b.key === 'none').count, 1)

const dl = orderDeadlines(d2.materials, p2, '2026-07-01'); assert.equal(dl.length, 1); assert.equal(dl[0].orderBy, '2026-07-19', '2026-09-01 − 30 − 14 days'); assert.equal(dl[0].daysLeft, 18)
assert.equal(orderDeadlines(d.materials, pos, '2026-07-01').length, 1, 'ordered 6 of 10: still short of an order')

const h = stationGroupHeat(d.materials, pos, [{ id: 'g1', title: 'لوله' }]); assert.equal(h.cells.get('ST1|g1').covered / h.cells.get('ST1|g1').value, 1)
const le = leadTimeExposure(d2.materials, p2, '2026-08-15'); assert.equal(le[0].slackDays, 17 - 30)
console.log('insights ok')
