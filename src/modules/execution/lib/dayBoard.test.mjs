import assert from 'node:assert/strict'
import { dayBoard, dayCell } from './dayBoard.ts'

const R = (id, formKey, status, o = {}) => ({ id, formKey, status, reportDate: '2026-11-20', front: 'F1', completionOf: null, ...o })
const reps = [
  R('a', 'string', 'draft'),
  R('b', 'bend', 'submitted'),
  R('c', 'fitup', 'approved'),
  R('d', 'lowering', 'rejected'),
  R('e', 'sand', 'approved', { front: 'F2' }),
  R('f', 'backfill', 'approved', { reportDate: '2026-11-19' }),
  R('g', 'geotextile', 'incomplete', { completionOf: 'x' }),
  R('h', 'pipe_entry', 'rejected'), R('i', 'pipe_entry', 'returned'),
]
assert.equal(dayCell(reps, 'string', '2026-11-20', 'F1').state, 'open')
assert.equal(dayCell(reps, 'string', '2026-11-20', 'F1').report.id, 'a')
assert.equal(dayCell(reps, 'bend', '2026-11-20', 'F1').state, 'sent')
assert.equal(dayCell(reps, 'fitup', '2026-11-20', 'F1').state, 'approved')
assert.equal(dayCell(reps, 'lowering', '2026-11-20', 'F1').state, 'rejected')
assert.equal(dayCell(reps, 'sand', '2026-11-20', 'F1').state, 'todo')       // other front
assert.equal(dayCell(reps, 'backfill', '2026-11-20', 'F1').state, 'todo')   // other day
assert.equal(dayCell(reps, 'geotextile', '2026-11-20', 'F1').state, 'todo') // completion report does not count
assert.equal(dayCell(reps, 'pipe_entry', '2026-11-20', 'F1').report.id, 'i') // the live one, not the rejected one
const b = dayBoard(reps, ['string', 'bend', 'fitup', 'lowering', 'sand'], '2026-11-20', 'F1')
assert.deepEqual([b.closed, b.open, b.total], [2, 1, 5])
console.log('execution/lib/dayBoard: all assertions passed')
