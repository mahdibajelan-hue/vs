import assert from 'node:assert/strict'
import { epcCurves, esForecast, combineForecasts, curveTicks } from './epcCurves.ts'

const near = (a, b, e = 0.6) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`)
const DAY = 86400000
const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

// a straight plan: 0% on 2026-01-01 to 100% on 2026-11-28 (331 days)
const start = '2026-01-01', end = '2026-11-28', today = '2026-07-01'
const planned = (d) => Math.max(0, Math.min(100, (days(start, d) / days(start, end)) * 100))
const curveAtHalfPace = curveTicks(start, end, today).map((d) => ({ date: d, planned: planned(d), actual: d <= today ? planned(d) * 0.5 : null }))
const f = esForecast(curveAtHalfPace, today)
assert.ok(!('reason' in f))
near(f.spi, 0.5, 0.03) // the work earns half a day of plan per day
// the plan reached today's actual (~27.5%) about 91 days in; the remaining 240 plan-days at half pace take ~480 days
near(days(today, f.endDate), (days(start, end) - days(start, f.esDate)) / f.spi, 2)
near(f.slipDays, days(f.esDate, end) / f.spi - days(today, end), 3) // ≈ 332 days late
assert.ok(f.points.every((p, i) => i === 0 || p.value >= f.points[i - 1].value - 1e-9))
near(f.at(f.endDate), 100)

// on plan: the forecast is the plan
const onPlan = esForecast(curveTicks(start, end, today).map((d) => ({ date: d, planned: planned(d), actual: d <= today ? planned(d) : null })), today)
near(onPlan.spi, 1, 0.03); assert.ok(Math.abs(onPlan.slipDays) <= 3)

// not started yet and not due: the plan is assumed
const later = esForecast(curveTicks('2026-09-01', '2027-03-01', today).map((d) => ({ date: d, planned: Math.max(0, Math.min(100, days('2026-09-01', d) / 181 * 100)), actual: d <= today ? 0 : null })), today)
assert.equal(later.assumed, true); assert.equal(later.spi, 1)

// no plan: reason
assert.ok('reason' in esForecast([{ date: today, planned: null, actual: 3 }], today))

// curves from the shared source: actual stops at today
const at = (d) => ({ eng: { actual: 10, planned: 20 }, proc: null, cons: { actual: 5, planned: 8 }, weights: { e: 1, p: 1, c: 1 }, overall: { actual: 7.5, planned: 14 } })
const c = epcCurves(at, { start, finish: end }, today)
assert.equal(c.proc, null); assert.ok(c.eng.every((p) => (p.date <= today) === (p.actual != null)))

// total: weighted, ends with the latest part
const tot = combineForecasts([{ f, w: 3, label: 'P' }, { f: onPlan, w: 1, label: 'C' }], today, end)
assert.equal(tot.endDate, f.endDate)
near(tot.at(today), (3 * f.at(today) + onPlan.at(today)) / 4)
// a discipline whose plan starts later in the window and is far behind (like construction): forecast is late, not early
const cs = '2026-04-01', ce = '2027-01-01'
const cPlan = (d) => Math.max(0, Math.min(100, days(cs, d) / days(cs, ce) * 100))
const behind = esForecast(curveTicks(start, ce, today).map((d) => ({ date: d, planned: cPlan(d), actual: d <= today ? Math.max(0, days('2026-06-01', d)) * 0.1 : null })), today)
assert.ok(behind.spi < 0.3, `spi ${behind.spi}`); assert.ok(behind.slipDays > 200, `slip ${behind.slipDays}`)
console.log('epc curves & forecast: all assertions passed')
