import assert from 'node:assert/strict'
import * as v from '../../../../supabase/functions/im-ai/validate.ts'

const s = v.sanitizeSuggestion({ category: 'hacker', severity: 'urgent', acceptance_criteria: '  x  '.repeat(300), tasks: ['a', '', 5, 'b', 'c', 'd', 'e', 'f'], reasons: 'nope' })
assert.equal(s.category, null); assert.equal(s.severity, 'medium'); assert.ok(s.acceptance_criteria.length <= 400); assert.deepEqual(s.tasks, ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 6).filter((t) => t)); assert.deepEqual(s.reasons, [])
assert.equal(v.sanitizeSuggestion({ category: 'hse', severity: 'critical' }).category, 'hse')
const c = v.sanitizeCandidates({ candidates: [{ title: 'ab' }, { title: 'تأخیر در تأیید نقشه', category: 'engineering', severity: 'high', description: 'd' }, null, { title: 'مورد دوم بدون دسته', category: 'zzz' }] })
assert.equal(c.length, 2); assert.equal(c[1].category, null); assert.equal(c[1].severity, 'medium')
assert.equal(v.sanitizeCandidates({ candidates: 'x' }).length, 0)
const f = v.sanitizeFilter({ q: 'نقشه', stage: 'DROP TABLE', severity: 'critical', category: 'x', overdueOnly: 'true', blockedOnly: true, explanation: ['ok'] })
assert.deepEqual(f, { explanation: ['ok'], q: 'نقشه', severity: 'critical', blockedOnly: true }) // junk dropped, strict booleans only
assert.equal(v.sanitizeFilter({ stage: 'closed' }).stage, 'closed')
const m = v.sanitizeSummary({ summary: 'خلاصه', next_actions: ['x', 'y', 'z', 'w'], risks: [1] })
assert.equal(m.next_actions.length, 4); assert.deepEqual(m.risks, [])
const r = v.redact('تماس: ali@corp.ir و 09123456789 کارت 6037991234567890 متن')
assert.ok(!r.includes('ali@corp.ir') && !r.includes('09123456789') && !r.includes('6037991234567890') && r.includes('[email]') && r.includes('[phone]') && r.includes('[card]'))
assert.equal(v.redact('x'.repeat(10000), 100).length, 100)
console.log('ai validate ok')
