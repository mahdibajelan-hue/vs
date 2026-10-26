import assert from 'node:assert/strict'
import { isDowngrade, frontOf, buildJoints, rowWith, jointRangeOfKm, bulkPreview, kmByStage, physicalProgress, dueState, applyEvent, assetPicture, execReading, jointNumberOf } from './twinCore.ts'

const row = (no, p = {}) => ({ joint_no: no, welding: 'not_started', welding_at: null, ndt: 'pending', ndt_at: null, coating: 'pending', coating_at: null, lowering: 'pending', lowering_at: null, backfill: 'pending', backfill_at: null, welders: [], weld_ref: '', notes: '', ...p })

// joints: geometric count, stored rows overlay, history from stage dates (sorted), final status derived
let js = buildJoints(120, 12, [row(2, { welding: 'accepted', welding_at: '2026-01-02', ndt: 'failed', ndt_at: '2026-01-03' }), row(3, { welding: 'welded', welding_at: '2026-01-01', ndt: 'passed', ndt_at: '2026-01-02', coating: 'completed', coating_at: '2026-01-03', lowering: 'completed', lowering_at: '2026-01-04', backfill: 'completed', backfill_at: '2026-01-05' })])
assert.equal(js.length, 10); assert.equal(js[0].jointNumber, 'J-00001'); assert.equal(js[2].chainageMeters, 36)
assert.equal(js[1].finalStatus, 'ncr'); assert.equal(js[2].finalStatus, 'completed'); assert.equal(js[0].finalStatus, 'not_started')
assert.deepEqual(js[2].history.map((h) => h.field), ['weldingStatus', 'ndtStatus', 'coatingStatus', 'loweringStatus', 'backfillStatus'])
assert.equal(jointNumberOf(12345), 'J-12345')
// a stage set back to its default clears its date
let r = rowWith(js[2], row(3, { coating: 'completed', coating_at: 'x' }), 'coating', 'pending', 'now')
assert.equal(r.coating, 'pending'); assert.equal(r.coating_at, null)
r = rowWith(js[0], undefined, 'welding', 'welded', '2026-02-01', { welders: ['W1'] })
assert.equal(r.joint_no, 1); assert.equal(r.welding_at, '2026-02-01'); assert.deepEqual(r.welders, ['W1'])

// km → joints, with a non-zero route start, clipped to the route
assert.deepEqual(jointRangeOfKm(100, 100.12, 100, 12, 10), [1, 10])
assert.deepEqual(jointRangeOfKm(100.05, 100.03, 100, 12, 10), [3, 4])
assert.equal(jointRangeOfKm(0, 99, 100, 12, 10), null)

// bulk preview: changes and out-of-sequence work
let p = bulkPreview(js, 'coating', 'completed')
assert.equal(p.changed, 9); assert.equal(p.outOfSequence, 9, 'only joint 3 had a passed NDT and it is already coated')
p = bulkPreview(js, 'welding', 'welded')
assert.equal(p.outOfSequence, 0)

// km built and physical progress
const k = kmByStage(js, 12)
assert.equal(k.welding, 0.024); assert.equal(k.backfill, 0.012)
assert.equal(Math.round(physicalProgress(js)), 13)

// assets: due state, an inspection moves the next date by the interval, a failure marks failed
assert.equal(dueState({ nextInspection: '2026-01-01' }, '2026-02-01'), 'overdue')
assert.equal(dueState({ nextInspection: '2026-02-10' }, '2026-02-01'), 'soon')
assert.equal(dueState({ nextInspection: null }, '2026-02-01'), 'none')
const a = { id: 'a', tag: 'V-1', kind: 'valve', criticality: 'high', condition: 'good', opState: 'open', inspectEveryDays: 90, nextInspection: '2026-01-01' }
assert.deepEqual(applyEvent(a, { kind: 'inspection', at: '2026-02-01', condition: 'fair', opState: null }), { condition: 'fair', nextInspection: '2026-05-02' })
assert.deepEqual(applyEvent(a, { kind: 'failure', at: '2026-02-01', condition: null, opState: null }), { condition: 'failed' })
const pic = assetPicture([a, { ...a, id: 'b', condition: 'failed', opState: 'closed', nextInspection: '2027-01-01' }], '2026-02-01')
assert.equal(pic.overdue, 1); assert.equal(pic.criticalPoor, 1); assert.equal(pic.valvesClosed, 1); assert.equal(pic.byKind.valve, 2)

// executive reading: a gap with the official construction progress is called out; the last line is always the km picture
const lines = execReading({ routeKm: 412, physicalPct: 30, officialCPct: 45, kmBackfilled: 120, kmUnderGas: 0, jointNcr: 3, officialNcr: 0, assetsOverdue: 2, criticalAssetsPoor: 0, landBlockedKm: null })
assert.equal(lines[0].tone, 'warn'); assert.match(lines[0].text, /۱۵/)
assert.equal(lines.at(-1).tone, 'good'); assert.match(lines.at(-1).text, /۴۱۲/)
// failed joints with no NCR in the execution module is called out as a mismatch to fix
assert.match(execReading({ routeKm: 10, physicalPct: 5, officialCPct: 5, kmBackfilled: 1, kmUnderGas: 0, jointNcr: 7, officialNcr: 0, assetsOverdue: 0, criticalAssetsPoor: 0, landBlockedKm: null })[0].text, /NCR صادر کنید/)
// a bulk «welded» never sets back an accepted weld; the work front is the first joint not done at all
assert.equal(isDowngrade('welding', 'accepted', 'welded'), true); assert.equal(isDowngrade('welding', 'welded', 'accepted'), false); assert.equal(isDowngrade('welding', 'accepted', 'not_started'), false)
const acc = buildJoints(48, 12, [row(1, { welding: 'accepted', welding_at: 'x' }), row(2, { welding: 'welded', welding_at: 'x' })])
p = bulkPreview(acc, 'welding', 'welded')
assert.equal(p.changed, 2, 'joints 3 and 4'); assert.equal(p.kept, 1, 'joint 1 stays accepted')
assert.equal(frontOf(acc, 'welding'), 2); assert.equal(frontOf(acc, 'ndt'), 0)
console.log('pdt/twinCore: all assertions passed')
