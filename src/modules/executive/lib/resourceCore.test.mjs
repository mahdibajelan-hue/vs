import assert from 'node:assert/strict'
import { byProject, byResource, flagsOf, latestMonthRows, monthlyTrend } from './resourceCore.ts'

const r = (projectId, ym, kind, name, avgTotal, avgActive, avgIdle = 0, avgUnavailable = 0) =>
  ({ projectId, ym, kind, name, days: 20, avgTotal, avgActive, avgIdle, avgUnavailable, peakTotal: avgTotal, lastDate: `${ym}-20` })

const rows = [
  r('p1', '2026-09', 'man', 'جوشکار', 8, 8),
  r('p1', '2026-10', 'man', 'جوشکار', 10, 9.6),
  r('p1', '2026-10', 'equip', 'ساید بوم', 4, 2.8, 0.8, 0.4),
  r('p2', '2026-10', 'man', 'جوشکار', 6, 6),
]
assert.equal(latestMonthRows(rows).length, 3)
const res = byResource(rows, [{ projectId: 'p1', name: 'Welder', kind: 'labor', maxUnits: 20, execMatch: 'جوشکار' }])
const w = res.find((l) => l.name === 'جوشکار')
assert.equal(w.deployed, 16); assert.equal(w.planned, 20); assert.equal(w.gap, -4)
assert.deepEqual(flagsOf(w).sort(), ['shared', 'short'])
const sb = res.find((l) => l.name === 'ساید بوم')
assert.ok(Math.abs(sb.utilisation - 0.7) < 1e-9)
assert.deepEqual(flagsOf(sb).sort(), ['idle'])
assert.equal(res[0].kind, 'man')
// a plan row without max units or unknown kind is ignored
assert.equal(byResource([], [{ projectId: 'p', name: 'x', kind: 'material', maxUnits: 5, execMatch: '' }]).length, 0)

const pj = byProject(rows)
assert.equal(pj.find((p) => p.projectId === 'p1').manDeployed, 10)
assert.equal(pj.find((p) => p.projectId === 'p1').equipIdle, 0.8)
assert.deepEqual(monthlyTrend(rows).map((t) => [t.ym, t.man]), [['2026-09', 8], ['2026-10', 16]])
console.log('resourceCore ok')
