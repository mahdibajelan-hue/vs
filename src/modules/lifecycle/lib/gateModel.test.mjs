import assert from 'node:assert/strict'
import * as m from './gateModel.ts'
const it = (kind, status, isMandatory = true) => ({ kind, status, isMandatory })
// weights 50/30/20
assert.equal(m.weightedItemProgress([it('objective','completed'), it('output','not_started'), it('criterion','not_started')]), 50)
assert.equal(m.weightedItemProgress([it('objective','completed'), it('output','completed'), it('criterion','verified')]), 100)
// absent kinds renormalised
assert.equal(m.weightedItemProgress([it('objective','completed')]), 100)
assert.equal(m.weightedItemProgress([]), 0)
// criterion needs verification
assert.equal(m.weightedItemProgress([it('criterion','completed')]), 0)
// epc
assert.equal(m.epcProgress({engineering:100,procurement:100,construction:100}), 100)
assert.equal(m.epcProgress({engineering:100,procurement:0,construction:0}), 15)
// basic design log is append-only + latest wins
let log = m.appendManualPct([], {pct:20, at:'2026-01-01'})
log = m.appendManualPct(log, {pct:55, at:'2026-02-01'})
assert.equal(log.length, 2); assert.equal(m.latestManualPct(log), 55)
assert.throws(() => m.appendManualPct(log, {pct:120, at:'x'}))
assert.equal(m.gateActualProgress({engine:'basic_design', items:[], manualLog: log}), 55)
// readiness
const items = [it('criterion','verified'), it('criterion','submitted'), it('criterion','not_started', false)]
const r = m.gateReadiness(items, 100, 80)
assert.equal(r.remaining, 1); assert.equal(r.isReadyForReview, false); assert.ok(r.badge.includes('۱'))
assert.equal(m.gateReadiness([it('criterion','waived')], 90, 80).isReadyForReview, true)
// decisions
assert.ok(m.validateDecision({kind:'pass'}, r))
assert.ok(m.validateDecision({kind:'conditional', conditionText:'x'}, r))
assert.equal(m.validateDecision({kind:'conditional', conditionText:'x', conditionOwnerId:'u', conditionDeadline:'2026-01-01'}, r), null)
assert.ok(m.validateDecision({kind:'return'}, r))
assert.equal(m.decisionToStatus('cancel'), 'blocked')
assert.equal(m.overallProgress([{progress:100,weight:60},{progress:0,weight:40}]), 60)
assert.equal(m.GATE_META.length, 9)
assert.equal(m.gateProgressFromLog('epc', [], [{series:'construction',pct:100,recordedAt:'a'}]), 50)
assert.equal(m.gateProgressFromLog('epc', [it('objective','completed')], []), 100)
assert.equal(m.gateProgressFromLog('basic_design', [], [{series:'overall',pct:30,recordedAt:'a'},{series:'overall',pct:40,recordedAt:'b'}]), 40)
console.log('gateModel ok')
