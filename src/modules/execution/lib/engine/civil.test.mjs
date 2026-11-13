import assert from 'node:assert/strict'
import { civilRate, civilForecast, isCivilSection, roleOf, isHaulActivity, machinesFor, fleetBalance, defaultEarthCrew, ratePerType } from './civil.ts'
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
// ── route making: machine roles, trucks only for haulage, fleet balance
assert.equal(roleOf('بلدوزر D8'), 'dozer'); assert.equal(roleOf('ساید بوم D8'), 'other'); assert.equal(roleOf('پیکور هیدرولیک'), 'breaker'); assert.equal(roleOf('بیل مکانیکی'), 'excavator')
assert.equal(roleOf('لودر'), 'loader'); assert.equal(roleOf('کامیون کمپرسی'), 'truck'); assert.equal(roleOf('تانکر آب'), 'water'); assert.ok(isCivilSection('مسیرسازی'))
assert.ok(isHaulActivity('حمل مواد حاصل از عملیات خاکی تا فاصله ۵۰۰ متر')); assert.ok(isHaulActivity('بارگیری مواد حاصل از عملیات خاکی و تخلیه'))
assert.ok(!isHaulActivity('کندن زمین در زمین های سنگی با بولدوزر')); assert.ok(!isHaulActivity('حمل سیمان پاکتی و فولاد'))
assert.equal(machinesFor('کندن زمین با بولدوزر')('کامیون'), false); assert.equal(machinesFor('کندن زمین با بولدوزر')('بلدوزر'), true)
assert.equal(machinesFor('حمل خاک مازاد')('کامیون'), true); assert.equal(machinesFor('حمل خاک مازاد')('بلدوزر'), false)
const route = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-09-01', i), machines: { 'بلدوزر': { active: 2, hours: 8 }, 'پیکور': { active: 1, hours: 6 }, 'بیل مکانیکی': { active: 3, hours: 8 }, 'لودر': { active: 2, hours: 8 }, 'کامیون': { active: 5, hours: 9 } }, out: { cut: 400, haul: 300 } }))
assert.deepEqual(defaultEarthCrew(['بلدوزر', 'پیکور', 'کامیون']), { 'بلدوزر': 1, 'پیکور': 1 })
const fb = fleetBalance(route, null)
assert.equal(fb.crews, 1, 'one breaker → one route-making crew'); assert.equal(fb.bottleneck, 'پیکور'); assert.equal(fb.defined, false)
const L = Object.fromEntries(fb.lines.map((x) => [x.name, x]))
assert.equal(L['بیل مکانیکی'].surplus, 2); assert.equal(L['پیکور'].forNextCrew, 1); assert.equal(L['بلدوزر'].forNextCrew, 0); assert.ok(L['کامیون'].optional && L['کامیون'].surplus === 0)
const fb2 = fleetBalance(route, { 'بلدوزر': 1, 'بیل مکانیکی': 1, 'لودر': 1 })
assert.equal(fb2.crews, 2); assert.equal(fb2.bottleneck, 'بلدوزر')
// a haul activity is measured against trucks and loaders, an excavation against the rest
const fc = civilForecast({ days: route, activity: { id: 'cut', title: 'کندن', unit: 'm3', remaining: 1000, plannedEnd: null }, today: route[9].date, workDays: ALL, include: machinesFor('کندن زمین') })
near(fc.rate.history, 400 / (2 * 8 + 6 + 3 * 8 + 2 * 8), 1e-9)
const fh = civilForecast({ days: route, activity: { id: 'haul', title: 'حمل خاک', unit: 'm3', remaining: 1000, plannedEnd: null }, today: route[9].date, workDays: ALL, include: machinesFor('حمل خاک مازاد') })
near(fh.rate.history, 300 / (5 * 9 + 2 * 8), 1e-9)
near(ratePerType(route, 'cut')['پیکور'], 400 / 6, 1e-9)
console.log('execution/engine/civil: all assertions passed')
