import assert from 'node:assert/strict'
import { demProfile, haversineM, resample } from './elevation.ts'

// a straight east–west line of ~2 km at 36°N, as a KMZ «clamped to ground» gives it (no heights)
const A = { lon: 59.0, lat: 36.0 }, B = { lon: 59.0222, lat: 36.0 }
const L = haversineM(A, B)
assert.ok(L > 1950 && L < 2050, `length ${L}`)
const s = resample([A, B], 100)
assert.equal(s[0].d, 0); assert.ok(Math.abs(s.at(-1).d - L) < 1e-6)
assert.ok(s.length >= 20 && s.length <= 22, `samples ${s.length}`)
// no sample farther apart than the step
for (let i = 1; i < s.length; i++) assert.ok(s[i].d - s[i - 1].d <= 100 + 1e-6)
// a long line is capped at maxPts samples
assert.ok(resample([A, { lon: 60.2, lat: 36.0 }], 100, 300).length <= 301)

// heights come back in batches of ≤100 coordinates, in order, as km from the route start
const urls = []
const fetcher = async (url) => {
  urls.push(url)
  const lats = new URL(url).searchParams.get('latitude').split(',')
  const lons = new URL(url).searchParams.get('longitude').split(',').map(Number)
  return { ok: true, status: 200, json: async () => ({ elevation: lons.map((x) => 1000 + (x - 59) * 4500 + lats.length * 0) }) }
}
const long = [{ lon: 59.0, lat: 36.0 }, { lon: 59.25, lat: 36.0 }] // ~22.5 km → ~226 samples → 3 requests
const prof = await demProfile(long, 12.5, { fetcher })
assert.equal(urls.length, Math.ceil(resample(long, 100).length / 100))
assert.ok(urls.every((u) => new URL(u).searchParams.get('latitude').split(',').length <= 100))
assert.equal(prof[0].km, 12.5)
assert.ok(Math.abs(prof.at(-1).km - (12.5 + haversineM(long[0], long[1]) / 1000)) < 1e-9)
assert.ok(prof.every((p, i) => !i || p.km > prof[i - 1].km))
assert.equal(prof[0].elev, 1000); assert.ok(Math.abs(prof.at(-1).elev - 2125) < 0.2)

// failures come back as a Persian message the page can show
await assert.rejects(demProfile(long, 0, { fetcher: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), /۴۲۹|429/)
await assert.rejects(demProfile(long, 0, { fetcher: async () => { throw new TypeError('Failed to fetch') } }), /ارتباط/)
await assert.rejects(demProfile(long, 0, { fetcher: async () => ({ ok: true, status: 200, json: async () => ({ elevation: [1] }) }) }), /ناقص/)
console.log('elevation: ok')
