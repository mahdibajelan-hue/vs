import assert from 'node:assert/strict'
import { activityModel, outlook, monthWeather, worstWx, WX_OF, completeCrews, suggestCrews } from './outlook.ts'
import { addDays } from '../periods.ts'

const ALL = [0, 1, 2, 3, 4, 5, 6]
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`)
// own weather record only (no climate prior), so a steady world stays steady
const STEADY = { climatePriorDays: 0 }

// ── complete crews: a spare machine or person adds nothing
const W = { 'ساید بوم': 1, 'دستگاه جوش': 2, 'جوشکار': 2 }
assert.equal(completeCrews({ 'ساید بوم': 3, 'دستگاه جوش': 4, 'جوشکار': 5 }, W, null), 2)
assert.equal(completeCrews({ 'ساید بوم': 1, 'دستگاه جوش': 9, 'جوشکار': 9 }, W, null), 1, 'one sideboom → one crew however many welders')
assert.equal(completeCrews({ 'ساید بوم': 4, 'دستگاه جوش': 8, 'جوشکار': 1 }, W, null), 0)
assert.equal(completeCrews({ a: 5 }, null, 10), 1); assert.equal(completeCrews({ a: 4 }, null, 10), 0, 'without a composition: under half the usual complement = no crew'); assert.equal(completeCrews({}, null, 10), null)

// ── a known world: output = 10 per complete crew (1…4 crews), halved on rain days
const start = '2026-03-21'
const days = Array.from({ length: 90 }, (_, i) => {
  const n = 1 + (i % 4), rain = i % 6 === 5
  return { date: addDays(start, i), crews: { W: n }, wx: rain ? 'rain' : 'clear', ground: 'dry', out: { a: 10 * n * (rain ? 0.5 : 1) } }
})
const today = days[days.length - 1].date
const m = activityModel(days, 'a', 'W', today).model
near(m.gamma, 1, 0.08); assert.ok(m.gammaData > 0.5, 'crew-count variation is informative')
near(m.perCrewRate, 10, 1.5)
assert.ok(m.wx.rain.factor < 0.6 && m.wx.rain.factor > 0.45, `rain ${m.wx.rain.factor}`)
assert.ok(m.backtest && m.backtest.modelErrPct < m.backtest.naiveErrPct, 'the crew model beats the plain average')

// ── a steady site: one crew type W (2 crews) doing A (10/day) and B (5/day); A runs out first
const flat = Array.from({ length: 28 }, (_, i) => ({ date: addDays('2026-06-01', i), crews: { W: 2 }, wx: 'clear', ground: 'dry', out: { A: 10, B: 5 } }))
const t2 = flat[27].date
const acts = (o = {}) => [
  { id: 'A', title: 'A', unit: 'm', group: 'g', weight: 50, baseQty: 330, doneQty: 280, plannedEnd: null, crew: 'W' },
  { id: 'B', title: 'B', unit: 'm', group: 'g', weight: 50, baseQty: 440, doneQty: 140, plannedEnd: null, crew: 'W' },
  ...(o.withC ? [{ id: 'C', title: 'C', unit: 'm', group: 'g', weight: 20, baseQty: 100, doneQty: 0, plannedStart: '2026-07-01', plannedEnd: '2026-07-20', crew: 'W' }] : []),
]
const sc = (o = {}) => ({ crews: {}, climate: 'hot_dry', workDays: ALL, ...o })
const o = outlook({ days: flat, activities: acts(), today: t2, scenario: sc(), params: STEADY })
const [A, B] = o.activities
assert.equal(A.finish, addDays(t2, 5), 'A: 50 left at 10/day')
// A's crews move to B with the same value per crew-day: A was 10/330·50 per day of progress, B gets it too
// progress per day = 10·(50/100)/330 + 5·(50/100)/440 throughout, so B finishes at (remaining value) ÷ (pool value rate)
const rate = 10 * 0.5 / 330 + 5 * 0.5 / 440, left = 50 * 0.5 / 330 + 300 * 0.5 / 440
assert.ok(Math.abs(Date.parse(B.finish) - Date.parse(addDays(t2, Math.ceil(left / rate - 1e-9)))) <= 86400000, `B ${B.finish}`)
// steady crews and weather → steady weekly progress until the work runs out
const gains = o.curve.slice(1).map((p, i) => ({ g: p.expected - o.curve[i].expected, end: p.date })).filter((x) => x.end < B.finish).map((x) => x.g)
assert.ok(gains.length >= 2, 'several whole weeks')
for (const g of gains) near(g, rate * 7, 1e-6)
// … and steady monthly progress (whole months while work remains)
const full = o.monthly.filter((x) => x.gain > 0)
if (full.length >= 2) near(full[0].gain / 31, rate, rate * 0.05)

// not-started work of the same crew type is taken up when the current work is done
const oq = outlook({ days: flat, activities: acts({ withC: true }), today: t2, scenario: sc(), params: STEADY })
const C = oq.activities[2]
assert.equal(C.reason, 'queued'); assert.ok(C.start >= oq.activities[1].finish, 'after B'); assert.ok(C.finish > C.start)
assert.equal(oq.queued, 1); assert.equal(oq.unforecastable, 0)

// a whole extra crew adds its full output (γ stays at the prior 1 when the crew count never varied)
const o3 = outlook({ days: flat, activities: acts(), today: t2, scenario: sc({ crews: { W: 3 } }), params: STEADY })
near((o3.curve[1].expected - o3.curve[0].expected) / (o.curve[1].expected - o.curve[0].expected), 1.5, 1e-6)
assert.ok(o3.finish < o.finish)
assert.equal(o.crews[0].crew, 'W'); near(o.crews[0].recent, 2, 1e-9); near(o3.crews[0].scenario, 3, 1e-9)
// no crew on site → no output
const o0 = outlook({ days: flat, activities: acts(), today: t2, scenario: sc({ crews: { W: 0 } }), params: STEADY })
assert.equal(o0.activities[1].next28, 0)

// a 5-day week stretches the calendar
const o5 = outlook({ days: flat, activities: acts(), today: t2, scenario: sc({ workDays: [0, 1, 2, 3, 4] }), params: STEADY })
assert.ok(o5.finish > o.finish)

// ── an activity of a crew type with no output at all: its planned duration ÷ the performance index, or no date
const plan = [{ id: 'A', title: 'A', unit: 'm', group: 'g', weight: 50, baseQty: 560, doneQty: 280, plannedStart: '2026-06-01', plannedEnd: addDays('2026-06-01', 27), crew: 'W' }]
const op = outlook({ days: flat, activities: [...plan, { id: 'X', title: 'X', unit: 'm', group: 'g', weight: 50, baseQty: 50, doneQty: 0, plannedStart: addDays(t2, 1), plannedEnd: addDays(t2, 10), crew: 'T' }], today: t2, scenario: sc(), params: STEADY })
near(op.performanceIndex, 0.5, 0.05) // planned 20/day, runs 10/day
assert.equal(op.activities[1].reason, 'plan_based'); assert.ok(op.activities[1].finish >= addDays(t2, 19) && op.activities[1].finish <= addDays(t2, 22))
const on = outlook({ days: flat, activities: [...plan, { id: 'X', title: 'X', unit: 'm', group: 'g', weight: 50, baseQty: 50, doneQty: 0, plannedEnd: null, crew: null }], today: t2, scenario: sc(), params: STEADY })
assert.equal(on.finish, null); assert.equal(on.unforecastable, 1); assert.ok(on.finishKnown)

// ── crew-type suggestion from the words of the titles; the stringing sideboom is not the welding sideboom
const secs = ['جوشکاری و خمکاری – کانکشن – اتصال نهایی', 'بارگیری، حمل، دپو و ریسه لوله', 'حفاری کانال', 'رادیوگرافی', 'ستادی و پشتیبانی']
const sg = suggestCrews([
  { id: 'w', title: 'خم زدن و جوشکاری لوله به قطر 56 اینچ' }, { id: 's', title: 'ریسه لوله 2 اینچ در کنار کانال' },
  { id: 't', title: 'حفاری کانال در زمین سخت' }, { id: 'r', title: 'رادیوگرافی سرجوش' }, { id: 'n', title: 'نصب تابلو' },
], secs)
assert.equal(sg.w, secs[0]); assert.equal(sg.s, secs[1]); assert.equal(sg.t, secs[2]); assert.equal(sg.r, secs[3]); assert.equal(sg.n, null)

// ── weather calendar
const mw = monthWeather([], 'cold_mountain')
assert.ok(mw[9].snow > mw[3].snow, 'دی has more snow than تیر')
for (const s of mw) assert.ok(Math.abs(Object.values(s).reduce((x, y) => x + y, 0) - 1) < 1e-9)
assert.equal(worstWx('clear', 'rain'), 'rain'); assert.equal(WX_OF.partly, 'clear')

console.log('execution/engine/outlook: all assertions passed')
