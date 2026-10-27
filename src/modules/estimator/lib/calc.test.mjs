import assert from 'node:assert/strict'
import { annualCashFlow, buildCashFlowTimeline, buildDefaultInputs, compareResults, computeEstimate, estimateKpis, estimateRange, maturityOf, scopeLabels } from './calc.ts'

const project = { name: 'T', hasOnshore: true, hasOffshore: false, hasCompressorStation: true, tieInCount: 2, hasTelecomScada: true }
const inputs = buildDefaultInputs(null, project)
const r = computeEstimate(project, inputs)
assert.ok(r.grand > r.direct && r.direct > 0)
// no source reference leaks into section notes
for (const s of r.sections) assert.ok(!/راهنما|وزارت|۲۰۱۹/.test(s.note ?? ''), s.key)

// accuracy range: concept is the default and is skewed upward
assert.equal(maturityOf(inputs), 'concept')
const rg = estimateRange(1000, 'concept')
assert.equal(rg.low, 700); assert.equal(rg.high, 1500)
assert.ok(estimateRange(1000, 'basic').high < rg.high)

// yearly cash flow folds months and keeps the grand total
const cf = buildCashFlowTimeline(inputs, r)
const years = annualCashFlow(cf)
assert.equal(years.length, Math.ceil(cf.length / 12))
assert.ok(Math.abs(years.reduce((a, y) => a + y.usd, 0) - r.grand) < 1e-6 * r.grand)
assert.ok(Math.abs(years[years.length - 1].cumulativeUsd - r.grand) < 1e-6 * r.grand)

// KPIs
const k = estimateKpis(project, inputs, r, cf)
assert.equal(k.lengthKm, inputs.specs.onshore.lengthKm)
assert.ok(Math.abs(k.usdPerKm * k.lengthKm - r.grand) < 1e-6 * r.grand)
assert.ok(k.peakMonthlyUsd === Math.max(...cf.map((p) => p.monthlyUsd)))
assert.equal(k.lateLongLead, 1, 'only the compressor (16 months) outruns consultant + basic design')

// version comparison: a removed section shows as a negative mover, grand delta matches
const r2 = computeEstimate({ ...project, hasCompressorStation: false }, inputs)
const c = compareResults(r, r2)
assert.equal(c.sections[0].key, 'compressor')
assert.ok(c.sections[0].delta < 0 && c.sections[0].b === 0)
assert.ok(Math.abs(c.grand.delta - (r2.grand - r.grand)) < 1e-6)

assert.deepEqual(scopeLabels(project), ['خط لوله خشکی', 'ایستگاه تقویت فشار', '2 انشعاب', 'مخابرات و اسکادا'])
console.log('estimator calc ok')
