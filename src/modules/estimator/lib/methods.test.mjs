import assert from 'node:assert/strict'
import { buildDefaultInputs, computeEstimate } from './calc.ts'
import { analogMethod, benchmarkMetrics, blendedMethod, escalate, finalResults, historicalMethod, librarySummary, runMethods, scaleResults, stats, toEur } from './methods.ts'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`)

// currency + escalation
assert.equal(toEur(100, 'EUR'), 100)
close(toEur(100, 'USD', null, 0.9), 90)
close(toEur(2_000_000, 'IRR', 1_000_000), 2)
close(escalate(100, 1400, 1402, 0.1), 121)
assert.equal(escalate(100, 1405, 1402, 0.1), 100, 'future-dated rows are not discounted')

const s = stats([4, 1, 3, 2])
assert.equal(s.median, 2.5); assert.equal(s.min, 1); assert.equal(s.max, 4); assert.equal(s.n, 4)

const bm = (id, setting, terrain, km, inch, eur, extra = {}) => ({ id, name: 'P' + id, location: '', kind: 'actual', setting, terrain, lengthKm: km, diameterIn: inch, hasCompressor: false, costYear: 1404, amount: eur, currency: 'EUR', fxRialPerEur: null, fxEurPerUsd: null, costEur: eur, notes: '', createdBy: null, createdAt: '', ...extra })
// flat-equivalent per inch-km: 1 mixed-terrain project at 1.3 × base
const m = benchmarkMetrics(bm('a', 'onshore', 'mixed', 100, 40, 40 * 100 * 1.3 * 1000), 1404, 0)
close(m.perInchKm, 1300); close(m.flatPerInchKm, 1000)

const project = { name: 'T', hasOnshore: true, hasOffshore: false, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: false }
const inputs = { ...buildDefaultInputs(null, project), overhead: { ...buildDefaultInputs().overhead, benchEscalation: 0 } }
inputs.specs.onshore = { ...inputs.specs.onshore, lengthKm: 50, diameterIn: 40, terrain: 1.0 }
const lib = [bm('a', 'onshore', 'flat', 100, 40, 4_000_000), bm('b', 'onshore', 'flat', 100, 40, 6_000_000), bm('c', 'offshore', 'flat', 10, 30, 9_000_000)]

// historical: median 1250 €/inch-km × 40 × 50 = 2.5M; p25..p75 brackets it
const h = historicalMethod({ project, inputs, benchmarks: lib, nowYear: 1404 })
assert.ok(h.available); close(h.eur, 2_500_000); assert.ok(h.low < h.eur && h.high > h.eur)
assert.equal(h.used.length, 2, 'offshore rows are not used for an onshore project')

// analog: identical diameter, half the length → each scaled by 0.5^0.95
const a = analogMethod({ project, inputs, benchmarks: lib, nowYear: 1404 })
close(a.eur, 5_000_000 * Math.pow(0.5, 0.95)); close(a.low, 4_000_000 * Math.pow(0.5, 0.95))

// no library data → unavailable with a reason; blend falls back to what exists
const none = historicalMethod({ project, inputs, benchmarks: [], nowYear: 1404 })
assert.equal(none.available, false); assert.ok(none.reason)
const p = { method: 'parametric', available: true, eur: 100, low: 70, high: 150, used: [], note: '' }
close(blendedMethod([p, none, { ...none, method: 'analog' }]).eur, 100)
close(blendedMethod([p, { ...p, method: 'historical', eur: 200 }], { parametric: 0.5, historical: 0.5, analog: 0 }).eur, 150)

// chosen method + top-down allocation keeps proportions
const run = runMethods(project, { ...inputs, method: 'historical' }, lib, 1404)
assert.equal(run.chosen.method, 'historical'); assert.equal(run.fellBack, false)
assert.equal(runMethods(project, { ...inputs, method: 'analog' }, [], 1404).chosen.method, 'parametric', 'falls back without data')
const base = computeEstimate(project, inputs)
const sc = scaleResults(base, 2)
close(sc.grand, base.grand * 2); close(sc.sections[0].totalUsd, base.sections[0].totalUsd * 2)
const fr = finalResults(project, { ...inputs, method: 'historical' }, lib, 1404)
close(fr.results.grand * inputs.overhead.fxEurPerUsd, 2_500_000)

// compressor added parametrically when library rows are pipeline-only
const pc = { ...project, hasCompressorStation: true }
const hc = historicalMethod({ project: pc, inputs, benchmarks: lib, nowYear: 1404 })
assert.ok(hc.eur > h.eur)
const hc2 = historicalMethod({ project: pc, inputs, benchmarks: lib.map((b) => ({ ...b, hasCompressor: true })), nowYear: 1404 })
close(hc2.eur, h.eur)

const sum = librarySummary(lib, 1404, 0)
assert.equal(sum.count, 3); assert.equal(sum.onshore.n, 2); close(sum.onshore.median, 1250)
console.log('estimator methods ok')
