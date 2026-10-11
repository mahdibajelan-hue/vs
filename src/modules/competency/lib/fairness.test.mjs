import assert from 'node:assert/strict'
import { fairnessReports, ageBand } from './fairness.ts'
const c = (age, approved, dis = false) => ({ age, hasDisability: dis, approved, completed: true })
const young = Array.from({ length: 10 }, (_, i) => c(25, i < 8)), old = Array.from({ length: 10 }, (_, i) => c(55, i < 4)), few = [c(35, false), c(36, false)]
const [age, dis] = fairnessReports([...young, ...old, ...few])
assert.equal(age.groups.find((g) => g.label === 'زیر ۳۰ سال').rate, 0.8)
const o = age.groups.find((g) => g.label === '۵۰ سال و بالاتر'); assert.equal(o.ratio, 0.5); assert.ok(o.flag); assert.ok(age.note.includes('۵۰ سال'))
assert.ok(age.groups.find((g) => g.label === '۳۰ تا ۳۹').small && !age.groups.find((g) => g.label === '۳۰ تا ۳۹').flag, 'small groups are shown but never flagged')
assert.ok(dis.note.includes('کافی'), 'a single disability group cannot be compared'); assert.equal(ageBand(null), 'نامشخص')
assert.equal(fairnessReports([{ age: 30, hasDisability: false, approved: true, completed: false }])[0].groups.length, 0)
console.log('fairness ok')
