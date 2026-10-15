import assert from 'node:assert/strict'
import { noteRequired, noteValid } from './decisionRules.ts'
assert.equal(noteRequired('APPROVAL_REVOKED'), true)
assert.equal(noteRequired('NOT_ASSIGNED'), true)
assert.equal(noteRequired('OPEN_TO_WORK'), true)
assert.equal(noteRequired('APPROVED'), false)
assert.equal(noteRequired('ON_PROJECT'), false)
assert.equal(noteValid('NOT_APPROVED', 'کوتاه'), false)
assert.equal(noteValid('NOT_APPROVED', 'دلیل کامل و روشن برای عدم تأیید'), true)
assert.equal(noteValid('APPROVED', ''), true)
console.log('decisionNotes ok')
