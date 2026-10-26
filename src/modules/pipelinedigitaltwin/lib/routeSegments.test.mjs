import assert from 'node:assert/strict'
import { paintSpans } from './routeSegments.ts'

// a station inside a stretch wins over it; gaps get the neutral colour; ranges are clipped to the route
let p = paintSpans([{ startMeters: 0, endMeters: 80000, color: 'a' }, { startMeters: 79800, endMeters: 80200, color: 's' }], 100000, 'g')
assert.deepEqual(p, [
  { startMeters: 0, endMeters: 79800, color: 'a' },
  { startMeters: 79800, endMeters: 80200, color: 's' },
  { startMeters: 80200, endMeters: 100000, color: 'g' },
])
// without a gap colour uncovered parts stay undrawn; same-colour neighbours merge; out-of-route spans are clipped away
p = paintSpans([{ startMeters: 0, endMeters: 10, color: 'a' }, { startMeters: 10, endMeters: 20, color: 'a' }, { startMeters: 150, endMeters: 300, color: 'b' }], 100, null)
assert.deepEqual(p, [{ startMeters: 0, endMeters: 20, color: 'a' }])
console.log('pdt/routeSegments: all assertions passed')
