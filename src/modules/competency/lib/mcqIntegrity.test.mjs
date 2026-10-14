import assert from 'node:assert/strict'
import { readIntegrity } from './mcqIntegrity.ts'
const none = { counts: {}, awayMs: 0, total: 0 }
assert.equal(readIntegrity({ scorePercent: 70, secondsPerQuestion: 40, summary: none }).level, 'CLEAN')
assert.equal(readIntegrity({ scorePercent: 97, secondsPerQuestion: 40, summary: none }).level, 'REVIEW')
assert.equal(readIntegrity({ scorePercent: 97, secondsPerQuestion: 40, summary: { counts: { HIDDEN: 4 }, awayMs: 90000, total: 4 } }).level, 'CONFIRM')
assert.equal(readIntegrity({ scorePercent: 60, secondsPerQuestion: 40, summary: { counts: { COPY: 1 }, awayMs: 0, total: 1 } }).level, 'REVIEW')
console.log('mcqIntegrity ok')
