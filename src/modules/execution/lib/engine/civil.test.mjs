import assert from 'node:assert/strict'
import { civilRate, civilForecast, isCivilSection } from './civil.ts'
import { addDays } from '../periods.ts'

const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`)
const ALL = [0, 1, 2, 3, 4, 5, 6]
// 3 excavators × 8 h; 40 m³ per machine-hour for 20 days, then 50 for the last 10
const days = Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-08-01', i), machines: { 'بیل مکانیکی': { active: 3, hours: 8 } }, out: { t: (i < 20 ? 40 : 50) * 24 } }))
const today = days[29].date
const r = civilRate(days, 't', today)
near(r.history, (20 * 40 + 10 * 50) / 30, 1e-9) // ratio of sums
near(r.recent, (4 * 40 + 10 * 50) / 14, 1e-9)
assert.ok(r.estimate > r.history && r.estimate < 50, 'recency weighting leans toward the recent rate')
assert.ok(r.low <= r.estimate && r.estimate <= r.high)
assert.ok(r.trendPerWeek > 0, 'faster lately')
// a shorter day weighs less: ratio of sums, not mean of ratios
const mixed = [
  { date: '2026-08-01', machines: { b: { active: 1, hours: 10 } }, out: { x: 100 } },
  { date: '2026-08-02', machines: { b: { active: 1, hours: 2 } }, out: { x: 60 } },
]
near(civilRate(mixed, 'x', '2026-08-02').history, 160 / 12, 1e-9)

// forecast: 3 machines × 8 h at ≈ the estimate; finish = remaining ÷ per-day
const f = civilForecast({ days, activity: { id: 't', title: 'حفاری', unit: 'm3', remaining: 24000, plannedEnd: addDays(today, 10) }, today, workDays: ALL })
near(f.fleet.machines, 3, 1e-9); near(f.fleet.hoursPerDay, 8, 1e-9)
near(f.perDay, f.rate.estimate * 24, 1e-6)
assert.equal(f.workDaysLeft, Math.ceil(24000 / f.perDay))
assert.ok(f.finishEarly <= f.finish && f.finish <= f.finishLate)
// to finish in 10 working days: 24000 ÷ (estimate × 8 × 10)
assert.equal(f.machinesNeeded, Math.ceil(24000 / (f.rate.estimate * 80)))
assert.ok(f.recentVsHistoryPct > 0)
assert.equal(f.machines[0].name, 'بیل مکانیکی'); near(f.machines[0].share, 1, 1e-9)
assert.ok(f.months.length >= 1 && f.months.every((x) => x.rate > 0))
// a bigger fleet finishes sooner
const f2 = civilForecast({ days, activity: { id: 't', title: 'حفاری', unit: 'm3', remaining: 24000, plannedEnd: null }, today, workDays: ALL, fleetOverride: { machines: 6 } })
assert.ok(f2.finish < f.finish)
// nothing done yet: no rate, no date
const f3 = civilForecast({ days, activity: { id: 'z', title: 'z', unit: 'm3', remaining: 10, plannedEnd: null }, today, workDays: ALL })
assert.equal(f3.rate.estimate, null); assert.equal(f3.finish, null)

assert.ok(isCivilSection('حفاری کانال')); assert.ok(isCivilSection('خاک سرندی، بکفیل و گرده‌ماهی')); assert.ok(isCivilSection('مسیرسازی')); assert.ok(!isCivilSection('جوشکاری و خمکاری'))
console.log('execution/engine/civil: all assertions passed')
