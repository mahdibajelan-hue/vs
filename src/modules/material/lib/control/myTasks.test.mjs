import assert from 'node:assert/strict'
import { buildMyTasks } from './myTasks.ts'

const base = { uid: 'u1', today: '2026-10-01', can: () => false, stages: [], defs: new Map(), stageLabel: () => ({ item: 'لوله', pkg: 'PK-1' }), discrepancies: [], discLabel: () => 'مغایرت', changes: [], changeLabel: () => 'تغییر', txns: [], txnLabel: () => 'تراکنش', requisitions: [], signers: [], records: [] }
const defs = new Map([['po_issue', { key: 'po_issue', title: 'سفارش', reviewLevel: 'consultant' }]])
const st = (o) => ({ id: 's', itemId: 'i', stageKey: 'po_issue', applicable: true, status: 'submitted', submittedBy: 'u2', submittedAt: '2026-09-10T00:00:00Z', responsible: null, plannedDate: null, rejectReason: '', ...o })

assert.equal(buildMyTasks({ ...base, uid: null }).length, 0)
// a submitted stage is my task only when my role may decide, and never when I submitted it myself
assert.equal(buildMyTasks({ ...base, defs, stages: [st({})] }).length, 0)
let t = buildMyTasks({ ...base, defs, can: (a) => a === 'review_stage', stages: [st({})] })
assert.equal(t.length, 1); assert.equal(t[0].kind, 'stage_decide'); assert.ok(t[0].urgent, 'waiting more than 7 days')
assert.equal(buildMyTasks({ ...base, defs, can: () => true, stages: [st({ submittedBy: 'u1' })] }).length, 0)
// my rejected stage must be fixed; my pending stage shows with its delay
t = buildMyTasks({ ...base, defs, stages: [st({ status: 'rejected', rejectReason: 'مدرک ناخوانا', submittedBy: 'u1' }), st({ id: 's2', status: 'pending', responsible: 'u1', plannedDate: '2026-09-20' })] })
assert.deepEqual(t.map((x) => x.kind).sort(), ['stage_do', 'stage_fix']); assert.equal(t.find((x) => x.kind === 'stage_do').late, 11)
// requisition: only the next pending signer
const rq = { id: 'r1', number: 'REQ-001', facility: 'ST1', status: 'awaiting_signatures', neededBy: null }
const sg = (role, sort, userId, decision) => ({ requisitionId: 'r1', role, sort, userId, decision })
assert.equal(buildMyTasks({ ...base, requisitions: [rq], signers: [sg('requester', 1, 'u9', 'approved'), sg('site_supervisor', 2, 'u1', 'pending'), sg('storekeeper', 3, 'u3', 'pending')] }).length, 1)
assert.equal(buildMyTasks({ ...base, requisitions: [rq], signers: [sg('requester', 1, 'u9', 'approved'), sg('site_supervisor', 2, 'u3', 'pending'), sg('storekeeper', 3, 'u1', 'pending')] }).length, 0, 'not my turn yet')
// ordering: urgent first
t = buildMyTasks({ ...base, defs, can: (a) => a === 'review_stage', stages: [st({ id: 'a', submittedAt: '2026-09-30T00:00:00Z' }), st({ id: 'b' })] })
assert.equal(t[0].id, 'sd:b')
