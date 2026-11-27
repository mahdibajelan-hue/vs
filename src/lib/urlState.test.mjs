import assert from 'node:assert/strict'
import { authInUrl, buildRel, locIsBare, parseLoc, setBaseForTests, setModuleCheck } from './urlState.ts'

setModuleCheck((m) => ['execution', 'risk', 'admin'].includes(m))
const L = (pathname, search = '', hash = '') => ({ pathname, search, hash })
const P = { module: 'execution', radar: false, tab: 'review', sub: '', p: 'p1', r: 'rep-9', w: 'project' }

// server build: clean paths
setBaseForTests('/')
assert.equal(buildRel(P, L('/')), '/execution/review?p=p1&r=rep-9&w=project')
assert.deepEqual(parseLoc(L('/execution/review', '?p=p1&r=rep-9&w=project')), P)
assert.equal(buildRel({ ...P, tab: 'daily', sub: 'designed', r: '', w: '' }, L('/')), '/execution/daily/designed?p=p1')
// a query the app does not own (a public token, an auth code) stays put; the app's own keys are rewritten
assert.equal(buildRel({ ...P, r: '' }, L('/risk/home', '?candidate=abc&r=old')), '/execution/review?candidate=abc&p=p1&w=project')
// hub, radar, an unknown module
assert.equal(buildRel({ module: null, radar: false, tab: 'x', sub: '', p: 'p1', r: '', w: '' }, L('/execution')), '/')
assert.equal(buildRel({ module: null, radar: true, tab: '', sub: '', p: '', r: '', w: '' }, L('/')), '/radar')
assert.equal(parseLoc(L('/radar')).radar, true)
assert.equal(parseLoc(L('/nope/x')).module, null)
assert.equal(locIsBare(L('/')), true)
assert.equal(locIsBare(L('/nope')), true)
assert.equal(locIsBare(L('/risk')), false)
// a sub-view without a tab is dropped (it would be read as the tab)
assert.equal(buildRel({ ...P, tab: '', sub: 'x', r: '', p: '', w: '' }, L('/')), '/execution')

// GitHub Pages: the page lives at /vs/, the place goes after the hash
setBaseForTests('/vs/')
assert.equal(buildRel(P, L('/vs/')), '/vs/#/execution/review?p=p1&r=rep-9&w=project')
assert.deepEqual(parseLoc(L('/vs/', '', '#/execution/review?p=p1&r=rep-9&w=project')), P)
assert.equal(buildRel({ module: null, radar: false, tab: '', sub: '', p: '', r: '', w: '' }, L('/vs/', '?candidate=t', '#/risk')), '/vs/?candidate=t')
assert.equal(locIsBare(L('/vs/', '', '')), true)
assert.equal(locIsBare(L('/vs/', '', '#/admin/users')), false)
// encoded segments round-trip
assert.equal(parseLoc(L('/vs/', '', buildRel({ ...P, tab: 'a b/c', r: '', p: '', w: '' }, L('/vs/')).slice(4))).tab, 'a b/c')

// auth redirects are left alone
assert.equal(authInUrl({ hash: '#access_token=x&type=recovery', search: '' }), true)
assert.equal(authInUrl({ hash: '', search: '?code=abc' }), true)
assert.equal(authInUrl({ hash: '#/execution/review?p=1', search: '' }), false)
console.log('urlState ok')
