import assert from 'node:assert/strict'
import { plannedShare, weldStats, stationProgress, overallProgress, welderStats, scopeTemplate, weldFromSheet, dayReport, progressCurve, DEFAULT_WEIGHTS } from './spCore.ts'
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`)

near(plannedShare('2026-01-01', '2026-01-11', '2026-01-06'), 0.5); assert.equal(plannedShare('2026-01-01', '2026-01-11', '2025-12-31'), 0)
assert.equal(plannedShare('2026-01-01', '2026-01-11', '2026-02-01'), 1); assert.equal(plannedShare(null, '2026-01-11', '2026-01-05'), null)

const W = (no, size, o = {}) => ({ id: no, stationId: 's', lineId: null, drawingId: null, weldNo: no, sizeIn: size, thkMm: null, jointType: 'BW', shopField: 'field', material: '', wps: '', welder: 'W1', fitupDate: null, weldDate: null, ndtMethod: 'RT', ndtDate: null, ndtResult: 'pending', repairs: 0, x: null, y: null, note: '', ...o })
const welds = [W('1', 10, { weldDate: '2026-01-05', ndtDate: '2026-01-06', ndtResult: 'accepted' }), W('2', 10, { weldDate: '2026-01-07', ndtDate: '2026-01-08', ndtResult: 'rejected', welder: 'W2' }), W('3', 20), W('4', 2, { ndtResult: 'na', weldDate: '2026-01-07' })]
const ws = weldStats(welds, '2026-01-10')
assert.equal(ws.count, 4); assert.equal(ws.welded, 3); near(ws.totalDi, 42); near(ws.weldedDi, 22)
assert.equal(ws.ndtRequired, 3); near(ws.ndtDi, 40); assert.equal(ws.tested, 2); near(ws.acceptedDi, 10); near(ws.repairRate, 0.5)
// as of an earlier date only what was done by then counts
assert.equal(weldStats(welds, '2026-01-05').welded, 1)

const st = { id: 's', code: 'BV-01', name: '', kind: 'valve', km: 10, plannedStart: '2026-01-01', plannedFinish: '2026-01-31', weights: null }
const items = [
  { id: 'a', stationId: 's', discipline: 'civil', code: '', title: 'بتن', unit: 'm³', qty: 100, weight: 3, plannedStart: '2026-01-01', plannedFinish: '2026-01-11', sort: 0 },
  { id: 'b', stationId: 's', discipline: 'civil', code: '', title: 'فنس', unit: 'm', qty: 50, weight: 1, plannedStart: null, plannedFinish: null, sort: 1 },
  { id: 'c', stationId: 's', discipline: 'electrical', code: '', title: 'کابل', unit: 'm', qty: 0, weight: 1, plannedStart: null, plannedFinish: null, sort: 2 },
]
const logs = [{ id: 'l1', stationId: 's', itemId: 'a', at: '2026-01-03', qty: 50, note: '', by: '' }, { id: 'l2', stationId: 's', itemId: 'a', at: '2026-01-04', qty: 80, note: '', by: '' }, { id: 'l3', stationId: 's', itemId: 'b', at: '2026-01-04', qty: 25, note: '', by: '' }]
const p = stationProgress(st, items, logs, welds, '2026-01-06')
const civ = p.disciplines.find((d) => d.discipline === 'civil')
near(civ.actual, ((3 * 1 + 1 * 0.5) / 4) * 100) // over-reported concrete caps at 100 %
near(civ.planned, ((3 * 0.5 + 1 * (5 / 30)) / 4) * 100)
assert.equal(p.disciplines.find((d) => d.discipline === 'electrical').hasScope, false) // zero-quantity scope is ignored
const weld = p.disciplines.find((d) => d.discipline === 'welding'); near(weld.actual, (10 / 42) * 100)
const ndt = p.disciplines.find((d) => d.discipline === 'ndt'); near(ndt.actual, (10 / 40) * 100)
const Wt = DEFAULT_WEIGHTS
near(p.actual, (Wt.civil * civ.actual + Wt.welding * weld.actual + Wt.ndt * ndt.actual) / (Wt.civil + Wt.welding + Wt.ndt))
// custom weights
near(stationProgress({ ...st, weights: { welding: 0, ndt: 0 } }, items, logs, welds, '2026-01-06').actual, civ.actual)

const o = overallProgress([p, stationProgress({ ...st, id: 'x' }, [], [], [], '2026-01-06')])
assert.equal(o.stations, 1); near(o.actual, p.actual)

const wl = welderStats(welds); assert.equal(wl[0].welder, 'W1'); assert.equal(wl.find((x) => x.welder === 'W2').rejected, 1)
const tpl = scopeTemplate('pcs'); assert.ok(tpl.some((t) => t.title.includes('رگولاتور'))); assert.ok(tpl.every((t) => t.qty > 0))
assert.deepEqual(weldFromSheet({ 'Weld No': 'W-12', Size: 8, Welder: 'K7', 'Weld Date': '2026-02-01', 'NDT Result': 'Accepted' }).ndtResult, 'accepted')
assert.equal(weldFromSheet({ size: 2 }), null)
const dr = dayReport('2026-01-04', items, logs, welds); assert.equal(dr.items.length, 2)
const curve = progressCurve([st], items, logs, welds, '2026-01-20'); assert.ok(curve.length >= 3); assert.equal(curve.at(-1).at >= '2026-01-31', true)
assert.ok(curve.every((c, i) => i === 0 || c.planned == null || c.planned >= curve[i - 1].planned))
console.log('stationpiping/core: all assertions passed')
