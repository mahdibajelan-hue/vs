// Run: npx tsx src/modules/landacq/repo/demo.test.mjs
import assert from 'node:assert/strict'
import { buildDemo } from './demoSeed.ts'
import { createMemoryRepo } from './memoryRepo.ts'
import { analyze, computeKpis, criticalConstraints, buildActions, lengthByStatus } from '../lib/kpis.ts'
import { makeStages } from '../lib/workflow.ts'
import { fmtKmRange } from '../lib/dates.ts'
import { polyline } from '../lib/geometry.ts'

const TODAY = '2026-02-10'
const b = buildDemo('mp1', TODAY)
// coverage: parcels are contiguous and span exactly 0..100
const ps = [...b.parcels].sort((a, c) => a.kmStart - c.kmStart)
assert.equal(ps[0].kmStart, 0); assert.ok(Math.abs(ps.at(-1).kmEnd - 100) < 0.01, String(ps.at(-1).kmEnd))
for (let i = 1; i < ps.length; i++) assert.ok(Math.abs(ps[i].kmStart - ps[i - 1].kmEnd) < 0.01, `gap at ${ps[i].kmStart}`)
assert.ok(ps.length >= 35 && ps.length <= 60, `${ps.length} parcels`)
assert.equal(new Set(ps.map((p) => p.code)).size, ps.length, 'unique codes')
assert.ok(ps.every((p) => p.kmEnd > p.kmStart && p.stages.length === 14))
const geo = polyline(b.route.geometry); assert.ok(geo.length > 80000 && geo.length < 140000, `geometry ${Math.round(geo.length / 1000)} km`)
assert.equal(b.activities.length, 6)

const repo = createMemoryRepo([{ id: 'mp1', name: 'P', code: 'P' }])
await repo.replaceDemo('mp1', b)
const data = await repo.load('mp1')
assert.equal(data.parcels.length, ps.length)
const rows = analyze(data.parcels, data.activities, TODAY, { bufferDays: 30, horizonDays: 90 })
const k = computeKpis(rows, 100, TODAY, { horizonDays: 90 })
const lens = lengthByStatus(rows)
console.log('KPIs', JSON.stringify(k))
console.log('lengths', JSON.stringify(Object.fromEntries(Object.entries(lens).map(([a, v]) => [a, +v.toFixed(1)]))))
const cc = criticalConstraints(rows)
console.log('constraints', cc.slice(0, 5).map((r) => `${r.parcel.code} ${fmtKmRange(r.parcel.kmStart, r.parcel.kmEnd)} ${r.crit.level}/${r.crit.score} ${r.early.state} delay=${r.early.delayDays} p=${r.forecast.probability}`))
const acts = buildActions(rows, TODAY, { horizonDays: 90 })
console.log('actions', acts.length, acts.slice(0, 3).map((a) => `${a.kind}:${a.daysFromToday}`))
assert.ok(k.releasedKm > 15 && k.releasedKm < 40, `released ${k.releasedKm}`)
assert.ok(k.criticalCount >= 2, 'critical parcels exist'); assert.ok(k.actionRequired >= 1, 'at least one action required')
assert.ok(cc.some((r) => r.parcel.title.includes('باغات')) && cc.some((r) => r.parcel.title.includes('سابقهٔ اختلاف')))
assert.ok(lens.released > 0 && lens.acquiring > 0 && lens.natural > 0 && lens.governmental > 0 && lens.review > 0 && (lens.critical > 0 || lens.risk > 0))
assert.ok(k.ownerCount > 20 && k.overdueActions >= 0)
// Article 9: legal clocks, stay, status
const bySt = (t) => rows.find((r) => r.parcel.title.includes(t))
const inWindow = bySt('در مهلت پرداخت'), late = bySt('مهلت پرداخت گذشته'), prep = bySt('تهیهٔ صورت‌جلسه')
assert.ok(inWindow && late && prep)
const pay = (r) => r.clocks.find((c) => c.key === 'art9_payment')
assert.equal(pay(inWindow).status, 'due_soon'); assert.ok(pay(inWindow).daysLeft > 10 && pay(inWindow).daysLeft < 30, String(pay(inWindow).daysLeft))
assert.equal(pay(late).status, 'overdue'); assert.ok(late.stay && late.status === 'critical' && !late.released, 'stayed parcel is critical and not free')
assert.ok(late.clocks.some((c) => c.key === 'art9_stay'))
assert.ok(inWindow.released && !inWindow.stay, 'possession frees the land'); assert.ok(!prep.released && prep.clocks.length === 0)
assert.ok(k.legalOverdue >= 1 && k.legalSoon >= 1 && k.stayed === 1, JSON.stringify([k.legalOverdue, k.legalSoon, k.stayed]))
assert.ok(buildActions(rows, TODAY, { horizonDays: 90 }).some((a) => a.kind === 'legal_deadline'))
// repo operations
const p0 = data.parcels[0]
await repo.updateParcel(p0.id, { title: 'x' }); await repo.saveStage(p0.id, { ...p0.stages[0], status: 'in_progress' })
const o = await repo.saveOwner(p0.id, { parcelId: p0.id, name: 'ت', contact: '', sharePct: 100, agreement: 'agreed', estAmount: 1, finalAmount: null, payment: 'unpaid', released: false, notes: '' })
await repo.deleteOwner(o.id)
const t = await repo.transfer(p0.id, 'risk'); assert.equal(t.target, 'risk')
assert.equal((await repo.load('mp1')).parcels.find((p) => p.id === p0.id).riskId, t.id)
await repo.clearDemo('mp1'); assert.equal((await repo.load('mp1')).parcels.length, 0)
assert.equal(makeStages().length, 14)
console.log('landacq/repo+demo: all assertions passed')
const dist = {}; for (const r of rows) dist[r.early.state] = (dist[r.early.state] ?? 0) + 1
console.log('states', JSON.stringify(dist), 'levels', JSON.stringify(rows.reduce((a, r) => ((a[r.crit.level] = (a[r.crit.level] ?? 0) + 1), a), {})))
