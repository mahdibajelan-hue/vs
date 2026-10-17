import assert from 'node:assert/strict'
import { computeReadiness } from './competencyGap.ts'

const sc = (o) => ({ weight: 1, isCritical: false, requiredLevel: 3, actualLevel: 3, status: 'MEETS', confidence: 'HIGH', ...o })
assert.equal(computeReadiness([]), null)
assert.equal(computeReadiness([sc({ status: 'INSUFFICIENT_EVIDENCE', actualLevel: null })]), null)
// everything measured, met, high confidence → 100
assert.equal(computeReadiness([sc({}), sc({})]), 100)
// the same candidate with medium / low confidence evidence no longer scores 100
assert.equal(computeReadiness([sc({ confidence: 'MEDIUM' }), sc({ confidence: 'MEDIUM' })]), 90)
assert.equal(computeReadiness([sc({ confidence: 'LOW' }), sc({ confidence: 'LOW' })]), 75)
// half of the requirement weight never measured → coverage penalty (0.4 + 0.6 × 0.5 = 0.7)
assert.equal(computeReadiness([sc({}), sc({ status: 'INSUFFICIENT_EVIDENCE', actualLevel: null })]), 70)
// a shortfall counts: 2 of 3 → 67
assert.equal(computeReadiness([sc({ actualLevel: 2, status: 'GAP' })]), 67)
// a critical gap caps the number
assert.ok(computeReadiness([sc({}), sc({ actualLevel: 1, status: 'CRITICAL_GAP', isCritical: true })]) <= 59)
console.log('competencyGap readiness: all assertions passed')
