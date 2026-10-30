import assert from 'node:assert/strict'
import { provinceAt, routeProvinces, provinceStats, classBreaks, classOf, provinceBox } from './geoCore.ts'

/* point in province */
assert.equal(provinceAt(51.39, 35.69), 'تهران')
assert.equal(provinceAt(59.6, 36.3), 'خراسان رضوی')
assert.equal(provinceAt(48.67, 31.32), 'خوزستان') // Ahvaz
assert.equal(provinceAt(56.27, 27.18), 'هرمزگان') // Bandar Abbas
assert.equal(provinceAt(10, 10), null) // nowhere near Iran

/* a route through two provinces splits its share */
const r = routeProvinces([[51.39, 35.69], [51.4, 35.7], [52.0, 32.6]])
assert.equal(r[0].name, 'تهران'); assert.ok(Math.abs(r[0].share - 2 / 3) < 1e-9)
assert.equal(r[1].name, 'اصفهان')
assert.ok(Math.abs(r.reduce((n, x) => n + x.share, 0) - 1) < 1e-9)

/* totals: counted in every province touched, budget split by share, worst status wins */
const s = provinceStats([
  { id: 'a', status: 'good', budget: 300, provinces: [{ name: 'تهران', share: 2 / 3 }, { name: 'اصفهان', share: 1 / 3 }] },
  { id: 'b', status: 'critical', budget: 100, provinces: [{ name: 'تهران', share: 1 }] },
  { id: 'c', status: 'unknown', budget: null, provinces: [{ name: 'اصفهان', share: 1 }] },
])
assert.equal(s.get('تهران').count, 2); assert.equal(Math.round(s.get('تهران').budget), 300)
assert.equal(s.get('تهران').worst, 'critical'); assert.equal(s.get('تهران').byStatus.good, 1)
assert.equal(s.get('اصفهان').count, 2); assert.equal(Math.round(s.get('اصفهان').budget), 100); assert.equal(s.get('اصفهان').worst, 'good')
assert.deepEqual(s.get('تهران').ids, ['a', 'b'])

/* class breaks: round bounds, 0 means no value */
assert.deepEqual(classBreaks(5), [1, 2, 3, 4, 5])
assert.deepEqual(classBreaks(3), [1, 2, 2, 3, 3])
assert.deepEqual(classBreaks(830), [200, 400, 600, 800, 1000])
assert.equal(classOf(0, [1, 2, 3, 4, 5]), 0)
assert.equal(classOf(1, [1, 2, 3, 4, 5]), 1)
assert.equal(classOf(830, classBreaks(830)), 5)
assert.equal(classOf(9, [1, 2, 3, 4, 5]), 5)

/* box */
const bx = provinceBox('تهران')
assert.ok(bx[0] < 51.39 && bx[2] > 51.39 && bx[1] < 35.69 && bx[3] > 35.69)
assert.equal(provinceBox('ناکجا'), null)
console.log('executive/geoCore: all assertions passed')
