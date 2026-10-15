import assert from 'node:assert/strict'
import { printModeOf, paperChoice } from './printMode.ts'

// default: legacy for every form, whatever the settings look like
for (const raw of [undefined, null, {}, { printMode: null }, { printMode: [] }, { printMode: { welding: 'legacy' } }, { printMode: { welding: true } }, 'x']) assert.equal(printModeOf(raw, 'welding'), 'legacy')
assert.equal(printModeOf({ printMode: { welding: 'template' } }, 'welding'), 'template')
assert.equal(printModeOf({ printMode: { welding: 'template' } }, 'fitup'), 'legacy') // per form, never global
// an approved sheet alone changes nothing
assert.equal(paperChoice({ mode: 'legacy', hasApproved: true, preview: false }), 'legacy')
assert.equal(paperChoice({ mode: 'legacy', hasApproved: false, preview: true }), 'legacy')
// template mode or explicit preview, with an approved sheet
assert.equal(paperChoice({ mode: 'template', hasApproved: true, preview: false }), 'template')
assert.equal(paperChoice({ mode: 'legacy', hasApproved: true, preview: true }), 'template')
// template mode without an approved sheet falls back to the built-in paper
assert.equal(paperChoice({ mode: 'template', hasApproved: false, preview: false }), 'legacy')
console.log('printMode: all assertions passed')
