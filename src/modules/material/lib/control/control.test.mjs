import assert from 'node:assert/strict'
import { buildPositions } from './model.ts'
import { detectDiscrepancies } from './discrepancies.ts'
import { itemProgress, rollup, progressBy, weightsValid } from './progress.ts'
import { consumptionReport, normFor } from './consumption.ts'
import { balanceBy, unexplained } from './balance.ts'
import { prioritize, frontsAtRisk } from './priority.ts'
import { suggestRaises } from './riskSuggest.ts'
import { planMtoImport, parseMtoRows, matchKey } from './mto.ts'

const S = { longLeadDays: 90, delayBufferDays: 14, stagnantDays: 120, qtyTolerancePct: 0, scrapWarnPct: 3, consumptionTolerancePct: 10, priority: { criticality: 40, urgency: 30, gap: 20, risk: 10 } }
const mat = (o = {}) => ({ id: 'm1', masterProjectId: 'P', materialCode: 'V-1', description: 'شیر', unit: 'EA', spec: 'A', size: '4"', facility: 'ST1', area: 'A', front: 'F1', pipelineNo: 'L-1', tagNumber: '', usageLocation: '', unitPrice: 100, fxRate: 1, mtoQuantity: 10, contractQty: 10, detailQty: null, criticality: 'B', leadTimeDays: 30, needDate: '2026-09-01', groupId: 'g1', lineNo: '1', detailSpec: null, detailUnit: null, detailCode: null, detailLocation: null, ...o })
const po = (o = {}) => ({ id: 'po1', status: 'issued', ...o })
const pl = (o = {}) => ({ id: 'pl1', poId: 'po1', materialId: 'm1', quantityOrdered: 10, unitPrice: 100, plannedDeliveryDate: '2026-07-01', ...o })
const wl = (o = {}) => ({ id: 'w' + Math.random(), receiptId: 'r', materialId: 'm1', quantityReceived: 4, condition: 'ok', inspectionStatus: 'accepted', ...o })
const tx = (o = {}) => ({ id: 't' + Math.random(), materialId: 'm1', kind: 'issue', qty: 1, adjustSign: null, status: 'posted', txnDate: '2026-06-01', workOp: '', activityQty: null, contractorOrgId: null, front: '', facility: '', ...o })
const data = (o = {}) => ({ materials: [mat()], purchaseOrders: [po()], poLines: [pl()], manufacturing: [], shipmentLines: [], warehouseLines: [], allocations: [], txns: [], ...o })
const pos = (d) => buildPositions(d).get('m1')

// ── positions: ordered is not stock; only accepted & usable counts; ledger moves stock
let p = pos(data())
assert.equal(p.ordered, 10); assert.equal(p.onHand, 0); assert.equal(p.inbound, 10); assert.equal(p.siteGap, 10); assert.equal(p.uncoveredGap, 0, 'inbound covers the gap on paper')
p = pos(data({ warehouseLines: [wl({ quantityReceived: 4 }), wl({ quantityReceived: 2, inspectionStatus: 'pending' }), wl({ quantityReceived: 1, condition: 'damaged', inspectionStatus: 'rejected' })], txns: [tx({ qty: 1 }), tx({ kind: 'return', qty: 1 }), tx({ kind: 'scrap', qty: 1 }), tx({ kind: 'issue', qty: 5, status: 'pending' })] }))
assert.equal(p.received, 7); assert.equal(p.accepted, 4); assert.equal(p.quarantine, 2); assert.equal(p.rejected, 1)
assert.equal(p.onHand, 3, '4 accepted −1 issued +1 returned −1 scrapped (pending ignored)'); assert.equal(p.netConsumed, 0); assert.equal(p.inbound, 3)
p = pos(data({ allocations: [{ materialId: 'm1', quantityAllocated: 5, status: 'allocated' }], warehouseLines: [wl({ quantityReceived: 4 })] }))
assert.equal(p.reserved, 4); assert.equal(p.available, 0)
// design quantity drives the requirement, the contract quantity stays the base
p = pos(data({ materials: [mat({ detailQty: 14 })] }))
assert.equal(p.requiredQty, 14); assert.equal(p.diffQty, 4); assert.equal(p.orderGap, 4); assert.equal(p.baseValue, 1000)
// voided and cancelled never count
p = pos(data({ purchaseOrders: [po({ status: 'cancelled' })], txns: [tx({ status: 'voided' })] }))
assert.equal(p.ordered, 0)

// ── discrepancies
const det = (d, today = '2026-06-10') => detectDiscrepancies({ materials: d.materials, positions: buildPositions(d), poLines: d.poLines, purchaseOrders: d.purchaseOrders, settings: S, today })
const kinds = (xs) => xs.map((x) => x.kind).sort()
assert.deepEqual(kinds(det(data({ materials: [mat({ contractQty: null, detailQty: 6, mtoQuantity: 6 })], poLines: [] }))), ['not_in_contract'], 'only in design → flagged, nothing decided')
assert.deepEqual(kinds(det(data({ materials: [mat({ detailQty: 14 })], poLines: [pl({ quantityOrdered: 14 })] }))), ['qty_diff'])
assert.deepEqual(kinds(det(data({ poLines: [] }))), ['no_order'])
assert.ok(det(data({ poLines: [] }))[0].dueDate, 'last order date is given')
assert.deepEqual(kinds(det(data({ poLines: [pl({ quantityOrdered: 6 })] }))), ['under_ordered'])
assert.equal(det(data({ poLines: [pl({ quantityOrdered: 6 })] }))[0].diffQty, 4)
assert.ok(kinds(det(data({ poLines: [pl({ plannedDeliveryDate: '2026-08-25' })] }))).includes('delay_risk'), 'arrival + buffer after need date')
assert.ok(!kinds(det(data({ poLines: [pl({ plannedDeliveryDate: '2026-07-01' })] }))).includes('delay_risk'))
assert.ok(kinds(det(data({ warehouseLines: [wl({ quantityReceived: 10 })] }))).includes('unallocated'))
assert.deepEqual(kinds(det(data({ materials: [mat({ detailSpec: 'B', detailUnit: 'M', detailCode: 'V-2', detailLocation: 'X' })] }))).filter((k) => k.endsWith('mismatch')), ['code_mismatch', 'location_mismatch', 'spec_mismatch', 'unit_mismatch'])
assert.ok(det(data()).every((x) => x.fingerprint.includes(x.materialId)), 'fingerprints are stable per item and kind')
assert.deepEqual(det(data({ materials: [mat({ detailQty: 10.5 })], poLines: [pl({ quantityOrdered: 10.5 })] })).map((x) => x.kind), ['qty_diff'])
const tol = detectDiscrepancies({ materials: [mat({ detailQty: 10.5 })], positions: buildPositions(data({ materials: [mat({ detailQty: 10.5 })], poLines: [pl({ quantityOrdered: 10.5 })] })), poLines: [], purchaseOrders: [], settings: { ...S, qtyTolerancePct: 10 }, today: '2026-06-10' })
assert.ok(!tol.some((x) => x.kind === 'qty_diff'), 'inside the tolerance')

// ── weighted progress (example from the brief: value 100, order weight 20 → 20 once approved)
const item = { id: 'i1', packageId: 'pk', materialId: 'm1', qty: 1, unitPrice: 100 }
const stg = (k, w, o = {}) => ({ id: k, itemId: 'i1', stageKey: k, applicable: true, weight: w, status: 'pending', approvedQty: 0, plannedDate: null, approvedAt: null, ...o })
let ip = itemProgress(item, [stg('pr', 30), stg('po', 20, { status: 'approved', approvedQty: 1, approvedAt: '2026-05-01T00:00:00Z' }), stg('mf', 50)], '2026-06-01')
assert.equal(ip.value, 100); assert.ok(Math.abs(ip.actual - 0.2) < 1e-9, 'approved order stage earns 20 of 100')
ip = itemProgress(item, [stg('pr', 30), stg('po', 20, { status: 'submitted' }), stg('mf', 50)], '2026-06-01'); assert.equal(ip.actual, 0, 'submitted is not approved')
ip = itemProgress(item, [stg('pr', 30, { applicable: false }), stg('po', 20, { status: 'approved', approvedQty: 1, approvedAt: '2026-05-01' }), stg('mf', 50, { status: 'approved', approvedQty: 1, approvedAt: '2026-05-02' })], '2026-06-01')
assert.equal(ip.actual, 1, 'not-applicable stage leaves both sides, item still reaches 100 %'); assert.equal(ip.naCount, 1)
ip = itemProgress({ ...item, qty: 10 }, [stg('po', 100, { status: 'approved', approvedQty: 4, approvedAt: '2026-05-01' })], '2026-06-01'); assert.ok(Math.abs(ip.actual - 0.4) < 1e-9, 'partial delivery earns in proportion')
ip = itemProgress(item, [stg('po', 100, { status: 'approved', approvedQty: 1, approvedAt: '2026-07-01' })], '2026-06-01'); assert.equal(ip.actual, 0, 'approvals after the cut-off do not count')
ip = itemProgress(item, [stg('a', 50, { plannedDate: '2026-05-01' }), stg('b', 50, { plannedDate: '2026-08-01' })], '2026-06-01'); assert.equal(ip.planned, 0.5)
// value weighting across items
const r = rollup([{ value: 300, actual: 1, planned: 1 }, { value: 100, actual: 0, planned: 0.5 }])
assert.equal(r.actual, 0.75); assert.equal(r.planned, 0.875); assert.ok(Math.abs(r.deviation + 0.125) < 1e-9)
const rows = progressBy({ items: [{ ...item, id: 'i1' }, { ...item, id: 'i2', packageId: 'pk2', qty: 3 }], stages: [stg('po', 100, { status: 'approved', approvedQty: 1, approvedAt: '2026-05-01' })], packages: [{ id: 'pk', code: 'PK1', title: 'a', status: 'active' }, { id: 'pk2', code: 'PK2', title: 'b', status: 'cancelled' }], materials: [mat()], asOf: '2026-06-01', by: 'package' })
assert.equal(rows.length, 1, 'cancelled package excluded'); assert.equal(rows[0].actual, 1)
assert.ok(weightsValid({ a: 40, b: 60 }, ['a', 'b'])); assert.ok(!weightsValid({ a: 40, b: 50 }, ['a', 'b']))

// ── consumption against norms
const grp = [{ id: 'g1', isConsumable: true }]
const norms = [{ id: 'n1', materialId: null, groupId: 'g1', workOp: 'weld-6', qtyPerUnit: 0.5 }, { id: 'n2', materialId: 'm1', groupId: null, workOp: 'weld-6', qtyPerUnit: 0.4 }]
assert.equal(normFor(mat(), 'weld-6', norms).id, 'n2', 'item norm beats group norm')
assert.equal(normFor(mat({ id: 'm9' }), 'weld-6', norms).id, 'n1', 'falls back to the group norm')
assert.equal(normFor(mat({ id: 'm9', groupId: null }), 'weld-6', norms), null)
let cr = consumptionReport({ materials: [mat()], groups: grp, norms, settings: S, txns: [tx({ qty: 30, workOp: 'weld-6', activityQty: 60 }), tx({ qty: 2, kind: 'return', workOp: 'weld-6' })] })
assert.equal(cr[0].actual, 28); assert.equal(cr[0].expected, 24); assert.ok(Math.abs(cr[0].deviationPct - 16.6667) < 1e-3); assert.equal(cr[0].over, true)
cr = consumptionReport({ materials: [mat()], groups: grp, norms, settings: S, txns: [tx({ qty: 25, workOp: 'weld-6', activityQty: 60 })] }); assert.equal(cr[0].over, false, 'within the 10 % tolerance')
cr = consumptionReport({ materials: [mat()], groups: [{ id: 'g1', isConsumable: false }], norms: [], settings: S, txns: [tx()] }); assert.equal(cr.length, 0, 'non-consumables are not analysed')

// ── balance and what is unexplained
const d2 = data({ warehouseLines: [wl({ quantityReceived: 12 })], txns: [tx({ qty: 11 }), tx({ qty: 2, kind: 'scrap' })] })
const pp = pos(d2)
assert.ok(unexplained(pp).some((s) => s.includes('بیش از کالای پذیرفته')), 'issue + scrap above accepted')
assert.ok(unexplained(pp).some((s) => s.includes('کالای رسیده بیش از سفارش')))
const bal = balanceBy({ materials: d2.materials, positions: buildPositions(d2), groups: [], by: 'project' })
assert.equal(bal[0].label, 'کل پروژه'); assert.equal(bal[0].sameUnit, true); assert.equal(bal[0].contractValue, 1000)
const mixed = balanceBy({ materials: [mat(), mat({ id: 'm2', unit: 'M' })], positions: buildPositions({ ...data(), materials: [mat(), mat({ id: 'm2', unit: 'M' })] }), groups: [], by: 'project' })
assert.equal(mixed[0].sameUnit, false); assert.equal(mixed[0].unit, '')

// ── priority is transparent and ordered
const mats = [mat({ id: 'a', criticality: 'A', needDate: '2026-06-20', leadTimeDays: 120 }), mat({ id: 'b', criticality: 'C', needDate: '2027-06-01', leadTimeDays: 10 })]
const dd = { ...data(), materials: mats, poLines: [] }
const prs = prioritize({ materials: mats, positions: buildPositions(dd), settings: S, today: '2026-06-10' })
assert.equal(prs[0].materialId, 'a'); assert.ok(prs[0].score > prs[1].score); assert.equal(prs[0].stopRisk, true); assert.equal(prs[1].stopRisk, false)
assert.ok(prs[0].reasons.length >= 2)
const fr = frontsAtRisk(mats, prs); assert.equal(fr.length, 1); assert.equal(fr[0].critical, 1)
const withRisk = prioritize({ materials: mats, positions: buildPositions(dd), settings: S, today: '2026-06-10', openLinks: new Map([['b', 2]]) })
assert.ok(withRisk.find((x) => x.materialId === 'b').score > prs.find((x) => x.materialId === 'b').score, 'open risks raise the score')

// ── proposals group by cause
const longLead = [mat({ id: 'a', leadTimeDays: 180 }), mat({ id: 'b', leadTimeDays: 150 }), mat({ id: 'c', leadTimeDays: 10 })]
const dl = { ...data(), materials: longLead, poLines: [] }
const ps = buildPositions(dl)
const detected = detectDiscrepancies({ materials: longLead, positions: ps, poLines: [], purchaseOrders: [], settings: S, today: '2026-06-10' })
const sug = suggestRaises({ materials: longLead, positions: ps, groups: [{ id: 'g1', title: 'شیرآلات' }], detected, priorities: prioritize({ materials: longLead, positions: ps, settings: S, today: '2026-06-10' }), settings: S, today: '2026-06-10' })
const ll = sug.find((x) => x.key === 'risk:longlead:g1')
assert.equal(ll.sources.length, 2, 'two long-lead items → one risk with both attached'); assert.equal(ll.target, 'risk'); assert.equal(ll.extra.category, 'proc_longlead')
assert.equal(new Set(sug.map((x) => x.key)).size, sug.length, 'no duplicate proposals')

// ── MTO import: contract vs design
const ex = [mat({ id: 'x1', materialCode: 'P-1', facility: 'ST1', usageLocation: 'L-1', contractQty: 10 })]
let plan = planMtoImport(ex, [{ materialCode: 'p-1', facility: 'st1', usageLocation: 'l-1', qty: 12 }, { materialCode: 'N-9', facility: 'ST1', qty: 3 }], 'contract')
assert.equal(plan.changed.length, 1); assert.equal(plan.changed[0].to, 12); assert.equal(plan.create.length, 1)
plan = planMtoImport(ex, [{ materialCode: 'P-1', facility: 'ST1', usageLocation: 'L-1', qty: 12, spec: 'Z', unit: 'M' }, { materialCode: 'N-9', facility: 'ST1', qty: 3 }], 'detail')
assert.equal(plan.attach.length, 1); assert.equal(plan.attach[0].patch.detailQty, 12); assert.equal(plan.attach[0].patch.detailSpec, 'Z'); assert.equal(plan.attach[0].patch.detailUnit, 'M'); assert.equal(plan.create.length, 1, 'unknown design line is created, later flagged as outside the contract')
plan = planMtoImport(ex, [{ materialCode: '', qty: 1 }, { materialCode: 'A', qty: -1 }, { materialCode: 'D', qty: 1 }, { materialCode: 'D', qty: 2 }], 'contract')
assert.equal(plan.errors.length, 3)
assert.equal(matchKey(ex[0]), 'p-1|st1|l-1')
const parsed = parseMtoRows([{ 'کد کالا': 'V-1', 'تعداد': '۱٬۲۰۰', 'ایستگاه': 'ST1', 'محل مصرف': 'L-1', 'ناشناس': 'x' }])
assert.equal(parsed[0].materialCode, 'V-1'); assert.equal(parsed[0].qty, 1200); assert.equal(parsed[0].facility, 'ST1')
console.log('material control ok')
