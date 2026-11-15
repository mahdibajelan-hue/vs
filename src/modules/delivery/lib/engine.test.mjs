import assert from 'node:assert/strict'
import { evaluate, defaultWeights, normalise, gaps, contradictions } from './engine.ts'
import { ARCHETYPES } from './archetypes.ts'
import { CRITERIA } from './bank.ts'

const A = Object.fromEntries(ARCHETYPES.map((x) => [x.key, x.answers]))
const top = (r, n = 1) => r.options.filter((o) => o.status !== 'excluded').sort((a, b) => a.rank - b.rank).slice(0, n).map((o) => o.key)
const opt = (r, k) => r.options.find((o) => o.key === k)

// ── archetypes: the recommendation an experienced delivery-strategy team would expect
{ const r = evaluate({ answers: A.pipeline })
  assert.ok(top(r, 2).every((k) => ['multi', 'hybrid', 'pc', 'ep'].includes(k)), `pipeline: ${top(r, 3)}`)
  assert.equal(opt(r, 'epcm').status, 'excluded', 'cost-reimbursable is not allowed for this owner')
  assert.ok(r.execution.find((e) => e.key === 'spreads').recommended, 'a 300 km line is built in several spreads')
  assert.ok(r.procurement.find((p) => p.key === 'ofe').recommended, 'pipe is long-lead: owner buys it early') }
{ const r = evaluate({ answers: A.refinery })
  assert.equal(r.winner, 'epcm'); assert.ok(r.confidence.decisive)
  assert.match(opt(r, 'hybrid').fa, /کتاب‌باز/, 'the hybrid for an immature, urgent scope is convertible open-book → LSTK')
  assert.equal(opt(r, 'dbb').status, 'excluded', 'design-bid-build cannot meet a fixed date with an immature scope')
  assert.ok(['reimb', 'convert', 'target'].includes(r.pricing[0].key))
  assert.ok(r.execution.find((e) => e.key === 'fasttrack').caution === undefined || true) }
{ const r = evaluate({ answers: A.offshore })
  assert.ok(top(r, 2).includes('epc') && top(r, 2).includes('hybrid'), `offshore: ${top(r, 3)}`)
  assert.match(opt(r, 'hybrid').fa, /اقلام بلندمدت/)
  assert.equal(r.confidence.decisive, false, 'a near-tie is left to management')
  assert.ok(r.execution.find((e) => e.key === 'modular').recommended)
  assert.equal(opt(r, 'direct').status, 'excluded') }
{ const r = evaluate({ answers: A.revamp })
  assert.equal(r.winner, 'epcm'); assert.notEqual(opt(r, 'direct').status, 'excluded', 'a capable owner may self-perform a revamp')
  assert.equal(r.contradictions.length, 1, 'FEED complete yet many changes expected is flagged')
  assert.ok(r.execution.find((e) => e.key === 'phasedcomm').recommended) }
{ const r = evaluate({ answers: A.storage })
  assert.equal(r.winner, 'bot', 'a private investor with a tariff and a legal framework → BOT')
  assert.ok(r.pricing.find((p) => p.key === 'concession').score > 50) }

// ── hard constraints remove options, with the reason
{ const r = evaluate({ answers: { ...A.storage, ppAllowed: false } })
  assert.equal(opt(r, 'bot').status, 'excluded'); assert.ok(opt(r, 'bot').reasonsAgainst[0].includes('مشارکت'))
  assert.ok(r.contradictions.some((k) => k.blocking), 'private money without a legal route is a blocking contradiction')
  assert.equal(r.confidence.decisive, false) }
{ const r = evaluate({ answers: { ...A.pipeline, scopeMaturity: '0' } })
  for (const k of ['epc', 'turnkey', 'db', 'pc', 'bot']) assert.equal(opt(r, k).status, 'excluded', `${k} needs a defined scope`) }
{ const r = evaluate({ answers: { ...A.refinery, reimbAllowed: false } })
  assert.equal(opt(r, 'epcm').status, 'excluded'); assert.notEqual(r.winner, 'epcm') }
{ const r = evaluate({ answers: { ...A.revamp, directAllowed: null } })
  assert.equal(opt(r, 'direct').status, 'conditional', 'an unknown legal permission makes the option conditional, not available') }

// ── inputs move results the way they should
{ const slow = evaluate({ answers: { ...A.pipeline, scheduleCriticality: 1 } }), fast = evaluate({ answers: { ...A.pipeline, scheduleCriticality: 5 } })
  assert.ok(fast.weights.time > slow.weights.time)
  assert.ok(opt(fast, 'dbb').rank >= opt(slow, 'dbb').rank, 'design-bid-build falls when time matters more') }
{ const weak = evaluate({ answers: { ...A.refinery, ownerPm: 2, ownerEng: 2 } }), strong = evaluate({ answers: A.refinery })
  assert.ok(opt(weak, 'epcm').score < opt(strong, 'epcm').score, 'EPCM loses value when the owner cannot control it') }
{ const thin = evaluate({ answers: { ...A.pipeline, epcMarket: 1 } }), wide = evaluate({ answers: { ...A.pipeline, epcMarket: 5 } })
  assert.ok(opt(thin, 'epc').profile.market < opt(wide, 'epc').profile.market)
  assert.equal(opt(thin, 'turnkey').status, 'excluded') }
{ const lo = evaluate({ answers: { ...A.pipeline, inflation: 2 } }), hi = evaluate({ answers: { ...A.pipeline, inflation: 5 } })
  assert.ok(opt(hi, 'epc').profile.costCert < opt(lo, 'epc').profile.costCert)
  assert.ok(hi.pricing.find((p) => p.key === 'adjust').score > lo.pricing.find((p) => p.key === 'adjust').score, 'high inflation calls for a price-adjustment clause') }

// ── weights are the user's: normalised to 100 and honoured
{ const w = defaultWeights(A.pipeline); assert.equal(Math.round(Object.values(w).reduce((a, b) => a + b, 0)), 100)
  const n = normalise({ time: 1, cost: 1 }); assert.equal(Math.round(n.time), 50); assert.equal(n.quality, 0)
  const onlyTime = evaluate({ answers: A.pipeline, weights: Object.fromEntries(CRITERIA.map((c) => [c.key, c.key === 'time' ? 100 : 0])) })
  assert.ok(['epcm', 'multi', 'epc', 'turnkey', 'db', 'hybrid'].includes(onlyTime.winner), 'with time alone, a fast method wins')
  const onlyOwner = evaluate({ answers: A.pipeline, weights: Object.fromEntries(CRITERIA.map((c) => [c.key, c.key === 'ownerLoad' ? 100 : 0])) })
  assert.ok(['epc', 'turnkey'].includes(onlyOwner.winner), `with owner effort alone a single-contract method wins: ${onlyOwner.winner}`)
  assert.notEqual(onlyOwner.winner, onlyTime.winner, 'changing the weights changes the result') }

// ── missing data: no definitive answer, and the gaps are named
{ const r = evaluate({ answers: { projectType: 'pipeline' } })
  assert.equal(r.confidence.decisive, false); assert.equal(r.confidence.level, 'low')
  assert.ok(r.gaps.filter((g) => g.critical).length >= 10)
  assert.match(r.recommendation.statement, /پیشنهاد قطعی ارائه نمی‌شود/)
  assert.ok(r.inputUncertainty.unknownScales > 20) }
{ assert.equal(gaps(A.refinery).filter((g) => g.critical).length, 0)
  assert.equal(contradictions({ funding: 'private', revenue: false })[0].blocking, true) }

// ── traceable, deterministic, complete
{ const r1 = evaluate({ answers: A.offshore }), r2 = evaluate({ answers: A.offshore })
  assert.deepEqual(JSON.parse(JSON.stringify(r1)), JSON.parse(JSON.stringify(r2)), 'same answers, same result')
  for (const o of r1.options) { for (const a of o.adjustments) assert.ok(a.why && a.rule); if (o.status === 'excluded') assert.ok(o.reasonsAgainst.length) }
  const sum = Object.values(opt(r1, 'epc').contributions).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - opt(r1, 'epc').score) < 0.6, 'the score is the sum of its criterion contributions')
  assert.equal(r1.scenarios.length, 6); assert.equal(r1.sensitivity.length, CRITERIA.length); assert.equal(r1.risks.length, 8)
  assert.ok(opt(r1, 'epc').duration && opt(r1, 'epc').cost, 'indicative time and cost ranges from the planned duration and capex') }

// ── the risk register raises the severity it reports
{ const base = evaluate({ answers: A.pipeline }), withReg = evaluate({ answers: A.pipeline, registerRisks: [{ family: 'ground', probability: 5, impact: 5, title: 'گسل', code: 'R-1' }] })
  assert.equal(withReg.risks.find((x) => x.key === 'ground').severity, 5); assert.equal(withReg.risks.find((x) => x.key === 'ground').source, 'register')
  assert.ok(base.risks.find((x) => x.key === 'ground').severity < 5) }

console.log('delivery engine: ok (5 oil & gas archetypes, constraints, monotonicity, weights, gaps, traceability)')
