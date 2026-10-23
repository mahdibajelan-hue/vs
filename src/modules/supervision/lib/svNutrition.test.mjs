import assert from 'node:assert/strict'
import * as k from './svNutrition.ts'
import * as m from './svMenu.ts'

// every catalog item has a figure
for (const d of m.DISHES) assert.ok(k.NUTRITION[d.name], `dish ${d.name}`)
for (const b of m.BREAKFASTS) assert.ok(k.NUTRITION[b], `breakfast ${b}`)
for (const d of m.DESSERTS) assert.ok(k.NUTRITION[d], `dessert ${d}`)
for (const f of Object.values(m.FRUITS).flat()) assert.ok(k.NUTRITION[f], `fruit ${f}`)

// a lunch: main + side + dessert
const lunch = k.mealNutrition({ main: 'قیمه با برنج', side: 'ترشی', dessert: 'ژله', fruit: '' })
assert.equal(lunch.kcal, 760 + 20 + 90); assert.equal(lunch.complete, true); assert.equal(lunch.estimated, false)
// side parts count once each; «خیارشور» is not also «خیار»
assert.equal(k.sideNutrition('نان، ماست و گوجه').kcal, 230 + 100 + 25)
assert.equal(k.sideNutrition('نان و خیارشور').kcal, 230 + 20)
assert.equal(k.sideNutrition('ماست و خیار').kcal, 100 + 15)
assert.equal(k.sideNutrition('').kcal, 0)
// a hand-typed dish is estimated by kind; an unknown one makes the meal incomplete
const typed = k.mealNutrition({ main: 'شیشلیک کباب', side: '', dessert: '', fruit: 'سیب' })
assert.equal(typed.estimated, true); assert.equal(typed.kcal, 780 + 95)
const unknown = k.mealNutrition({ main: 'غذای ناشناخته', side: '', dessert: 'کیک خانگی', fruit: '' })
assert.equal(unknown.complete, false); assert.equal(unknown.kcal, 0)
assert.deepEqual(k.mealNutrition({ main: '', side: '', dessert: '', fruit: '' }), { kcal: 0, protein: 0, carbs: 0, fat: 0, complete: true, estimated: false })

// day level and energy split
assert.equal(k.dayLevel(1800), 'low'); assert.equal(k.dayLevel(2700), 'ok'); assert.equal(k.dayLevel(3500), 'high')
const sp = k.energySplit({ kcal: 0, protein: 25, carbs: 100, fat: 0 })
assert.deepEqual(sp, { protein: 20, carbs: 80, fat: 0 })
assert.deepEqual(k.energySplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 }), { protein: 0, carbs: 0, fat: 0 })

// a planned week lands in a sensible daily range
const week = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']
for (const seed of ['a', 'b', 'c']) {
  const plan = m.planWeek(week, { jm: 8, seed })
  for (const day of week) {
    const t = k.sumNutri(plan.filter((x) => x.day === day).map(k.mealNutrition)).kcal
    assert.ok(t >= 1300 && t <= 3300, `day ${day} = ${t} kcal (${seed})`)
  }
}
