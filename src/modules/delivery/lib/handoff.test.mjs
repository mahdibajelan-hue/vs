import assert from 'node:assert/strict'
import { lifecycleStrategyOf } from './handoff.ts'
assert.equal(lifecycleStrategyOf(['phased', 'fasttrack'], 'epcm').key, 'fast_track')
assert.equal(lifecycleStrategyOf(['concurrent'], 'epc').key, 'overlapping')
assert.equal(lifecycleStrategyOf(['sequential'], 'epc').key, 'sequential')
assert.equal(lifecycleStrategyOf(['spreads'], 'dbb').key, 'sequential')
assert.equal(lifecycleStrategyOf(['spreads', 'phasedcomm'], 'hybrid').key, 'overlapping')
assert.equal(lifecycleStrategyOf([], null).key, 'overlapping')
console.log('delivery handoff: ok')
