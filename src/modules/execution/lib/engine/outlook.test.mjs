import assert from 'node:assert/strict'
import { activityModel, outlook, monthWeather, worstWx, WX_OF } from './outlook.ts'
import { addDays } from '../periods.ts'

const ALL = [0, 1, 2, 3, 4, 5, 6]
const sc = (o = {}) => ({ manPct: 0, equipPct: 0, climate: 'hot_dry', workDays: ALL, ...o })

// ── a known world: output = 10 · (man/30)^0.8 · (equip/15)^0.3 · (0.5 on rain days); crew sizes vary
const start = '2026-03-21'
const days = Array.from({ length: 90 }, (_, i) => {
  const man = 20 + ((i * 7) % 21), equip = 10 + ((i * 3) % 11), rain = i % 6 === 5
  const y = 10 * (man / 30) ** 0.8 * (equip / 15) ** 0.3 * (rain ? 0.5 : 1)
  return { date: addDays(start, i), man, equip, wx: rain ? 'rain' : 'clear', ground: 'dry', out: { a: y } }
})
const today = days[days.length - 1].date
const m = activityModel(days, 'a', today).model
// the ridge pulls toward 0.6 / 0.3; with this much variation the data must win most of the way
assert.ok(m.alpha > 0.68 && m.alpha <= 0.85, `alpha ${m.alpha}`)
assert.ok(Math.abs(m.beta - 0.3) < 0.12, `beta ${m.beta}`)
assert.ok(m.alphaData > 0.5, 'manpower variation is informative')
// rain halves output: the estimate lies between the prior (0.65) and the truth (0.5), close to the truth with 15 rain days
assert.ok(m.wx.rain.factor < 0.6 && m.wx.rain.factor > 0.45, `rain ${m.wx.rain.factor}`)
assert.equal(m.wx.clear.factor, 1)
assert.ok(m.backtest && m.backtest.origins > 0, 'backtest ran')
// noise-free world: the resource model must beat the plain average and get the larger blend weight
assert.ok(m.backtest.modelErrPct < m.backtest.naiveErrPct, `model ${m.backtest.modelErrPct} vs naive ${m.backtest.naiveErrPct}`)
assert.ok(m.backtest.blendWeight > 0.5)

// more crew → faster, with diminishing returns (α < 1)
const base = outlook({ days, activities: [{ id: 'a', title: 'A', unit: 'm', group: 'g', weight: 100, baseQty: 2000, doneQty: 0, plannedEnd: null }], today, scenario: sc() })
const more = outlook({ days, activities: [{ id: 'a', title: 'A', unit: 'm', group: 'g', weight: 100, baseQty: 2000, doneQty: 0, plannedEnd: null }], today, scenario: sc({ manPct: 50 }) })
assert.ok(more.activities[0].next28 > base.activities[0].next28, 'more manpower, more output')
assert.ok(more.activities[0].next28 < base.activities[0].next28 * 1.5, 'but less than proportional')
assert.ok(more.finish < base.finish, 'and an earlier finish')

// ── constant history: 10/day, clear, fixed crew. 100 left → about 10 working days (the climate costs a little)
const flat = Array.from({ length: 20 }, (_, i) => ({ date: addDays('2026-06-01', i), man: 30, equip: 10, wx: 'clear', ground: 'dry', out: { b: 10 } }))
const t2 = flat[19].date
const o = outlook({ days: flat, activities: [{ id: 'b', title: 'B', unit: 'm', group: 'g', weight: 100, baseQty: 300, doneQty: 200, plannedEnd: addDays(t2, 8) }], today: t2, scenario: sc() })
const a = o.activities[0]
assert.equal(a.remaining, 100)
assert.ok(a.finish >= addDays(t2, 10) && a.finish <= addDays(t2, 13), `finish ${a.finish}`)
assert.ok(a.finishP10 <= a.finish && a.finish <= a.finishP90, 'band brackets the expected date')
assert.ok(a.slipDays >= 2, 'later than planned')
assert.equal(o.finish, a.finish)
assert.ok(Math.abs(o.curve[0].expected - 200 / 300) < 1e-9, 'curve starts at today’s progress')
assert.ok(o.curve[o.curve.length - 1].expected > 0.99, 'and reaches 100%')
// a fixed crew says nothing about crew size: the elasticities stay at the prior, flagged as not from the data
const mf = activityModel(flat, 'b', t2).model
assert.ok(Math.abs(mf.alpha - 0.6) < 1e-6 && mf.alphaData < 1e-6, `fixed crew alpha ${mf.alpha}`)
// working days: a 5-day week stretches the calendar
const o5 = outlook({ days: flat, activities: [{ id: 'b', title: 'B', unit: 'm', group: 'g', weight: 100, baseQty: 300, doneQty: 200, plannedEnd: null }], today: t2, scenario: sc({ workDays: [0, 1, 2, 3, 4] }) })
assert.ok(o5.activities[0].finish > a.finish)

// ── an activity with no output yet cannot be forecast: the project date is withheld, the known part is kept
const o3 = outlook({ days: flat, activities: [
  { id: 'b', title: 'B', unit: 'm', group: 'g', weight: 50, baseQty: 300, doneQty: 200, plannedEnd: null },
  { id: 'x', title: 'X', unit: 'm', group: 'g', weight: 50, baseQty: 50, doneQty: 0, plannedEnd: null },
], today: t2, scenario: sc() })
assert.equal(o3.activities[1].reason, 'no_history')
assert.equal(o3.finish, null); assert.equal(o3.unforecastable, 1); assert.ok(o3.finishKnown)
// …unless it has planned dates: then its planned duration, scaled by how the started work runs against its plan
const o6 = outlook({ days: flat, activities: [
  { id: 'b', title: 'B', unit: 'm', group: 'g', weight: 50, baseQty: 400, doneQty: 200, plannedStart: '2026-06-01', plannedEnd: addDays('2026-06-01', 19) }, // planned 20/day, runs 10/day → PI ≈ 0.5
  { id: 'x', title: 'X', unit: 'm', group: 'g', weight: 50, baseQty: 50, doneQty: 0, plannedStart: addDays(t2, 1), plannedEnd: addDays(t2, 10) },
], today: t2, scenario: sc() })
assert.ok(o6.performanceIndex > 0.4 && o6.performanceIndex < 0.55, `PI ${o6.performanceIndex}`)
assert.equal(o6.activities[1].reason, 'plan_based'); assert.equal(o6.planBased, 1); assert.equal(o6.unforecastable, 0)
assert.ok(o6.activities[1].finish >= addDays(t2, 19) && o6.activities[1].finish <= addDays(t2, 23), `plan-based finish ${o6.activities[1].finish}`) // 10 planned days ÷ ~0.5
assert.ok(o6.finish && o6.curve[o6.curve.length - 1].expected > 0.99, 'with it, the project gets a full date and reaches 100%')
// a finished activity needs nothing
const o4 = outlook({ days: flat, activities: [{ id: 'b', title: 'B', unit: 'm', group: 'g', weight: 100, baseQty: 100, doneQty: 100, plannedEnd: null }], today: t2, scenario: sc() })
assert.equal(o4.activities[0].reason, 'done'); assert.equal(o4.finish, t2)

// ── weather calendar: wetter climate in winter, the project's own record shifts it
const mw = monthWeather([], 'cold_mountain')
assert.ok(mw[9].snow > mw[3].snow, 'دی has more snow than تیر')
for (const s of mw) assert.ok(Math.abs(Object.values(s).reduce((x, y) => x + y, 0) - 1) < 1e-9)
assert.equal(worstWx('clear', 'rain'), 'rain'); assert.equal(worstWx(null, 'cloudy'), 'cloudy'); assert.equal(WX_OF.partly, 'clear')

console.log('execution/engine/outlook: all assertions passed')
