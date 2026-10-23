import assert from 'node:assert/strict'
import * as m from './svMenu.ts'

const week = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']
const byName = new Map(m.DISHES.map((d) => [d.name, d]))

for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
  const plan = m.planWeek(week, { jm: 8, seed })
  assert.equal(plan.length, 21, 'three meals a day')
  const mains = plan.filter((x) => x.meal !== 'breakfast').map((x) => x.main)
  assert.ok(mains.every(Boolean), 'every lunch and dinner has a dish')
  assert.equal(new Set(mains).size, mains.length, `no repeated dish in the week (${seed})`)
  assert.ok(plan.some((x) => x.meal === 'lunch' && byName.get(x.main).protein === 'fish'), 'fish at least once')
  assert.ok(plan.filter((x) => x.meal === 'lunch').every((x) => x.dessert), 'lunch comes with dessert')
  assert.ok(plan.filter((x) => x.meal === 'dinner').every((x) => x.fruit && m.FRUITS[3].includes(x.fruit)), 'dinner comes with autumn fruit in Aban')
  const prot = plan.filter((x) => x.meal !== 'breakfast').map((x) => byName.get(x.main).protein)
  for (let i = 1; i < prot.length; i++) assert.notEqual(prot[i], prot[i - 1], `no protein twice in a row (${seed})`)
  assert.ok(plan.filter((x) => x.meal === 'dinner' && ['egg', 'legume', 'veg'].includes(byName.get(x.main).protein)).length >= 2, 'two light dinners')
  for (const x of plan.filter((x) => x.meal !== 'breakfast')) assert.ok(byName.get(x.main).meals.includes(x.meal), 'dish fits the meal')
}
assert.deepEqual(m.planWeek(week, { jm: 8, seed: 's' }), m.planWeek(week, { jm: 8, seed: 's' }), 'deterministic')

// low-rated dishes are left out
const avoid = ['عدس‌پلو', 'کشک بادمجان', 'آبگوشت']
for (const seed of ['1', '2', '3']) assert.ok(m.planWeek(week, { jm: 1, seed, avoid }).every((x) => !avoid.includes(x.main)))

// seasons
assert.equal(m.seasonOf(1), 1); assert.equal(m.seasonOf(6), 2); assert.equal(m.seasonOf(8), 3); assert.equal(m.seasonOf(12), 4)

// faces
assert.equal(m.faceFor(1), '😞'); assert.equal(m.faceFor(4.6), '😋'); assert.equal(m.faceFor(2.4), '🙁'); assert.equal(m.faceFor(0), '😞')

// dish scores and the alarm thresholds
const menus = [{ id: 'm1', main: 'قیمه' }, { id: 'm2', main: 'قیمه' }, { id: 'm3', main: 'جوجه' }]
const ratings = [{ menuId: 'm1', score: 2 }, { menuId: 'm1', score: 3 }, { menuId: 'm2', score: 2 }, { menuId: 'm3', score: 5 }, { menuId: 'm3', score: 1 }, { menuId: 'x', score: 1 }]
const s = m.dishScores(menus, ratings)
assert.equal(s[0].dish, 'قیمه'); assert.equal(s[0].n, 3); assert.ok(Math.abs(s[0].avg - 7 / 3) < 1e-9); assert.equal(s[0].low, true, '2.33 from 3 ratings is low')
assert.equal(s[1].low, false, 'two ratings are not enough')
assert.deepEqual(m.overall([]), { avg: 0, n: 0, low: false })
assert.equal(m.overall(Array(10).fill({ score: 3 })).low, true)
assert.equal(m.overall(Array(9).fill({ score: 1 })).low, false, 'under 10 ratings no cook alarm')
