import assert from 'node:assert/strict'
import { DEFAULT_SECTION_PLAN, fitupRows, lineSections, nextJointNos, sectionOf, sectionOfJoint } from './sections.ts'

const plan = { ...DEFAULT_SECTION_PLAN, startKm: 38 }
assert.equal(sectionOf(38, plan), 1)
assert.equal(sectionOf(40.109, plan), 3)
assert.equal(sectionOf(40.999, plan), 3)
assert.equal(sectionOf(41, plan), 4)
assert.equal(sectionOf(10, plan), 1) // before the start: the first section

// five pipes end to end around the km 41 boundary, then a gap
const P = (k, km, len = 12) => ({ key: k, raw: k, km, lengthM: len, thkIn: 0.562, odIn: 42 })
const pipes = [P('A', 40.964), P('B', 40.976), P('C', 40.988), P('D', 41.0), P('E', 41.012), P('F', 41.060)]
const joints = [{ before: 'A', after: 'B', sec: '3', no: 'J-0007', welded: true, rtOk: true, coated: true }]
const secs = lineSections(pipes, joints, plan)
assert.deepEqual(secs.map((s) => s.sec), [3, 4])
assert.deepEqual(secs[0].slots.map((s) => s.kind), ['done', 'free', 'boundary']) // A|B made, B|C free, C|D crosses into section 4
assert.equal(secs[0].slots[1].suggested, true) // next to the joint already made
assert.deepEqual(secs[1].slots.map((s) => s.kind), ['free', 'gap']) // D|E free, E|F 36 m apart
assert.equal(secs[1].slots[0].suggested, true) // no joint yet in the section: its first free slot
assert.deepEqual(secs[0].stats, { slots: 2, fitted: 1, welded: 1, rtOk: 1, coated: 1, ready: false })
// a pipe end used elsewhere blocks the slot
assert.equal(lineSections(pipes, [...joints, { before: 'B', after: 'X', sec: '3', no: 'J-9' }], plan)[0].slots[1].kind, 'blocked')
// ready: every inner joint made and accepted
assert.equal(lineSections(pipes.slice(0, 3), [...joints, { before: 'B', after: 'C', sec: '3', no: 'J-8', welded: true, rtOk: true, coated: true }], plan)[0].stats.ready, true)

// joint numbers in the project's style, per section
assert.deepEqual(nextJointNos('3', 2, [{ sec: '3', no: 'J-0007' }, { sec: '3', no: 'J-0002' }]), ['J-0008', 'J-0009'])
assert.deepEqual(nextJointNos('4', 1, [{ sec: '3', no: 'J-0007' }]), ['J-0001'])
assert.deepEqual(nextJointNos('1', 2, []), ['W1', 'W2']) // a project without joints: W = weld
assert.deepEqual(nextJointNos('9', 1, [{ sec: '9', no: 'W566' }]), ['W567'])
assert.deepEqual(nextJointNos('2', 1, [{ sec: '2', no: '11' }]), ['12'])

// rows: section, number, pipes before/after, facts of the pipe after
const rows = fitupRows([secs[1].slots[0], secs[0].slots[1]], [{ sec: '3', no: 'J-0007' }])
assert.deepEqual(rows, [
  { sec: '3', jointNo: 'J-0008', pipeNo2: 'B', pipeNo: 'C', lengthM: 12, thkIn: 0.562, sizeIn: 42 },
  { sec: '4', jointNo: 'J-0001', pipeNo2: 'D', pipeNo: 'E', lengthM: 12, thkIn: 0.562, sizeIn: 42 },
])

// a later form: the section of a typed joint number
assert.equal(sectionOfJoint('j-0007', [{ sec: '3', no: 'J-0007' }]), '3')
assert.equal(sectionOfJoint('J-0001', [{ sec: '3', no: 'J-0001' }, { sec: '4', no: 'J-0001' }]), null)
console.log('sections ok')
