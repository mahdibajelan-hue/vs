import assert from 'node:assert/strict'
import { asOf, dateRange, twinState, autoLayout, extentOf, lineColor, progressColor } from './csTwin.ts'

const W = (o) => ({ id: o.id, lineId: 'L1', weldNo: o.id, location: 'shop', sizeIn: 8, fitupDate: '2026-10-01', weldDate: '2026-10-05', ndtResult: 'accept', ndtDate: '2026-10-08', repairCount: 0, archived: false, ndtSelected: false, ...o })
const reg = {
  lines: [{ id: 'L1', lineNo: '8"-PG-1', area: 'واحد ۱', ndtPct: 100, testPackId: 'P', archived: false }, { id: 'L2', lineNo: '2"-IA-1', area: 'تأسیسات', ndtPct: 10, testPackId: null, archived: false }],
  welds: [W({ id: 'a' }), W({ id: 'b', weldDate: '2026-10-20', ndtDate: '2026-10-22' }), W({ id: 'c', lineId: 'L2', sizeIn: 2, weldDate: null, fitupDate: null, ndtResult: 'pending', ndtDate: null })],
  spools: [{ id: 's', lineId: 'L1', stage: 'erected', stageDates: { cut: '2026-09-01', fitup: '2026-09-10', welded: '2026-09-20', erected: '2026-10-25' }, archived: false }],
  equipment: [{ id: 'e', tag: 'K-101', kind: 'compressor', area: 'واحد ۱', steps: { foundation: '2026-08-01', set: '2026-09-01', level: '2026-10-15' }, archived: false }],
  packs: [{ id: 'P', punchA: 0, status: 'tested', testDate: '2026-11-01', reinstatedDate: null, archived: false }],
  inspections: [{ id: 'i', subjectId: 'e', result: 'reject', inspDate: '2026-10-16', archived: false }],
}
assert.deepEqual(dateRange(reg), { from: '2026-08-01', to: '2026-11-01' })

// replay: on 2026-10-10 weld b was not made, the spool was still welded (not erected), the pack not tested, level not done
const past = asOf(reg, '2026-10-10')
assert.equal(past.welds.find((w) => w.id === 'b').weldDate, null)
assert.equal(past.welds.find((w) => w.id === 'b').ndtResult, 'pending')
assert.equal(past.spools[0].stage, 'welded')
assert.equal(past.packs[0].status, 'open')
assert.deepEqual(Object.keys(past.equipment[0].steps).sort(), ['foundation', 'set'])
assert.equal(past.inspections.length, 0)

const now = twinState(reg), then = twinState(past)
assert.equal(now.lines.get('L1').pct, 1); assert.ok(Math.abs(then.lines.get('L1').pct - 0.65) < 1e-9) // b fitted-up on 10-01: 8 + 0.3×8 of 16
assert.equal(now.lines.get('L1').packState, 'tested'); assert.equal(then.lines.get('L1').packState, 'open')
assert.equal(now.equipment.get('e').pct, 0.55); assert.equal(now.equipment.get('e').issues, 1)
assert.ok(Math.abs(now.areas.get('واحد ۱').pct - (1 + 0.55) / 2) < 1e-9)
assert.equal(lineColor(now.lines.get('L1'), 'testing'), '#10b981')
assert.equal(progressColor(0), '#64748b')

// automatic layout: site, both areas, the equipment and both lines; nothing already drawn is placed again
const shapes = autoLayout(reg, [])
assert.equal(shapes.filter((s) => s.kind === 'site').length, 1)
assert.deepEqual(shapes.filter((s) => s.kind === 'area').map((s) => s.areaName).sort(), ['تأسیسات', 'واحد ۱'].sort())
assert.equal(shapes.filter((s) => s.kind === 'equipment').length, 1); assert.equal(shapes.filter((s) => s.kind === 'line').length, 2)
const drawn = shapes.map((s, i) => ({ ...s, id: String(i), projectId: 'p', archived: false }))
assert.equal(autoLayout(reg, drawn).length, 0)
const area1 = shapes.find((s) => s.kind === 'area' && s.areaName === 'واحد ۱'), k = shapes.find((s) => s.kind === 'equipment')
assert.ok(k.x >= area1.x && k.x + k.w <= area1.x + area1.w && k.y >= area1.y && k.y + k.h <= area1.y + area1.h)
const ext = extentOf(drawn); assert.ok(ext.w > 0 && ext.h > 0)
console.log('csTwin: ok')
