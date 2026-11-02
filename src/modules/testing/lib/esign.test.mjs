import assert from 'node:assert/strict'
import { fingerprint, withSign, withoutSign, signsOf, signValid, signTableHtml, SIGN_ROLES } from './esign.ts'
const d = { p1: '2000', rows: [{ a: 1, b: 2 }], note: 'x' }
assert.equal(fingerprint(d), fingerprint({ note: 'x', rows: [{ b: 2, a: 1 }], p1: '2000' })) // key order does not matter
assert.notEqual(fingerprint(d), fingerprint({ ...d, p1: '2001' }))
assert.notEqual(fingerprint(d, 'pass'), fingerprint(d, 'fail'))
const s1 = withSign(d, 'site', { name: 'رئیس کارگاه', email: 'a@b' }, '2026-11-02T08:00:00Z', 'pass')
assert.equal(fingerprint(s1, 'pass'), fingerprint(d, 'pass')) // signatures do not change the fingerprint
const s2 = withSign(s1, 'consultant', { name: 'ناظر', email: 'c@d' }, '2026-11-02T09:00:00Z', 'pass')
assert.equal(Object.keys(signsOf(s2)).length, 2)
assert.equal(signValid(signsOf(s2).site, s2, 'pass'), true)
const edited = { ...s2, p1: '1999' }
assert.equal(signValid(signsOf(edited).site, edited, 'pass'), false)
assert.equal(Object.keys(signsOf(withoutSign(s2, 'site'))).length, 1)
const html = signTableHtml(SIGN_ROLES.hydro, edited, 'pass', (x) => x)
assert.ok(html.includes('باطل')); assert.ok(signTableHtml(SIGN_ROLES.hydro, s2, 'pass', (x) => x).includes('es-ok'))
console.log('testing/esign: all assertions passed')
