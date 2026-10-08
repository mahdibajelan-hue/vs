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
const ps = b.parcels.filter((p) => p.kind !== 'station').sort((a, c) => a.kmStart - c.kmStart)
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
const stn = data.parcels.filter((p) => p.kind === 'station'); const routeParcels = data.parcels.filter((p) => p.kind !== 'station')
assert.equal(routeParcels.length, ps.length)
assert.ok(stn.length === 9 && new Set(stn.map((s) => s.stationType)).size === 7, 'all 7 station types')
assert.ok(stn.every((s) => s.stages.length === 14 && s.kmEnd - s.kmStart < 0.01))
assert.ok((data.crossings?.length ?? 0) === 13 && new Set(data.crossings.map((c) => c.crossingType)).size === 11, 'all crossing types')
// finance: ledger, budget, and prices that are plausible except the one waiting for an exception
const { benchmarkFor, unitPrice, verdictOf, priceAllowed } = await import('../lib/pricing.ts')
const { summarize } = await import('../lib/finance.ts')
assert.ok(data.payments.length > 20 && data.payments.every((x) => x.amount > 0 && x.paidDate), 'ledger')
for (const c of ['owner', 'expert', 'transfer', 'legal', 'other']) assert.ok(data.payments.some((x) => x.category === c), c)
assert.ok(data.payments.some((x) => x.parcelId), 'payments are linked to parcels')
const sumDemo = summarize(data.parcels, data.payments, data.route.settings.budgetAmount)
assert.ok(sumDemo.consumption > 0.01 && sumDemo.consumption < 1, String(sumDemo.consumption))
const odd = data.parcels.filter((q) => { const u = unitPrice(q); return u != null && !priceAllowed(u, benchmarkFor(q, data.parcels), q.priceException) })
assert.equal(odd.length, 1, `unusual prices: ${odd.map((q) => q.code)}`); assert.equal(odd[0].priceException.status, 'requested')
assert.ok(data.parcels.some((q) => q.priceException?.status === 'approved'))
assert.ok(data.parcels.every((q) => ['normal', 'art9', 'dispute'].includes(q.acquisitionRoute)))
void verdictOf
const rows = analyze(routeParcels, data.activities, TODAY, { bufferDays: 30, horizonDays: 90 })
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

// ── 4-phase method: release plan, fronts, advice, reports ──
{
  const { releasePlan, frontsOf, adviseFronts, conflictsOf, readinessOf, lastActionOf } = await import('../lib/plan.ts')
  const { buildReports, toCsv } = await import('../lib/reports.ts')
  const repo2 = createMemoryRepo([{ id: 'mp1', name: 'P', code: 'P' }])
  await repo2.replaceDemo('mp1', b)
  const d2 = await repo2.load('mp1')
  const rs = analyze(d2.parcels.filter((p) => p.kind !== 'station'), d2.activities, TODAY, { bufferDays: 30, horizonDays: 90 })
  const plan = releasePlan(rs, { bufferDays: 30 })
  assert.equal(plan.length, rs.length); assert.deepEqual(plan.map((x) => x.rank), plan.map((_, i) => i + 1))
  const firstReleased = plan.findIndex((x) => x.a.released)
  assert.ok(plan.slice(firstReleased).every((x) => x.a.released), 'released parcels come last')
  assert.ok(plan.filter((x) => !x.a.released).every((x) => x.leadDays >= 30))
  const fr = frontsOf(rs, TODAY)
  assert.ok(Math.abs(fr.reduce((n, f) => n + f.length, 0) - 100) < 0.5, 'fronts cover the route')
  for (let i = 1; i < fr.length; i++) assert.ok(fr[i].readiness !== fr[i - 1].readiness, 'neighbouring fronts differ')
  assert.ok(fr.some((f) => f.readiness === 'ready') && fr.some((f) => f.readiness !== 'ready'))
  assert.ok(rs.filter((r) => r.released).every((r) => readinessOf(r) === 'ready'))
  const adv = adviseFronts(fr, d2.activities, TODAY)
  assert.ok(adv.every((x) => x.blocked.readiness === 'not_ready' || x.blocked.readiness === 'critical') && adv.every((x) => x.idleDays >= 0))
  assert.ok(conflictsOf(rs).every((c) => c.gapDays > 0))
  const la = lastActionOf(d2.parcels.find((p) => p.stages.some((s) => s.status === 'done')), [], TODAY)
  assert.ok(la && la.date <= TODAY)
  const reps = buildReports({ rows: rs, parcels: d2.parcels, activities: d2.activities, events: [], linked: [], today: TODAY, settings: { bufferDays: 30, horizonDays: 90 } })
  assert.deepEqual(reps.map((r) => r.key), ['critical', 'constraint', 'upcoming', 'last_action', 'overdue', 'ready', 'recommended', 'conflict'])
  for (const r of reps) assert.ok(r.rows.every((x) => x.cells.length === r.columns.length), r.key)
  assert.ok(reps[0].rows.length >= 2 && reps[3].rows.length === rs.length && reps[5].rows.length > 0 && reps[7].rows.length > 0)
  assert.ok(toCsv(reps[0]).startsWith('﻿') && toCsv(reps[0]).split('\r\n').length === reps[0].rows.length + 1 && toCsv(reps[0], { project: 'P', date: 'D' }).split('\r\n').length === reps[0].rows.length + 5)
  console.log('landacq/plan+reports: all assertions passed', JSON.stringify(reps.map((r) => r.rows.length)))
}
