import assert from 'node:assert/strict'
import { drDisciplines, drLocations, drRegisters, drNarrative, drResources, STATION_DR_TEMPLATE, missingDrRows, CIVIL_LOCATIONS } from './stationDr.ts'
import { buildReport, typeOf } from './reportBuilder.ts'

// figures of the attached site report DR-591 (۲۶ آبان ۱۴۰۵, Ahvaz 1+1 compressor station)
const act = (id, chapter, area, title, unit, base) => ({ id, projectId: 'p', itemNo: id, title, unit, chapter, area, baseQty: base, unitPrice: 0, weight: 0, weightGroup: '', active: true, approval: 'approved', sort: 0, plannedStart: null, plannedEnd: null })
const activities = [
  act('a1', 'سیویل صنعتی', 'توربوکمپرسورها', 'خاک‌برداری', 'متر مکعب', 116.40),
  act('a2', 'سیویل صنعتی', 'اسلیپر هدر اصلی', 'خاک‌برداری', 'متر مکعب', 283.67),
  act('a3', 'سیویل صنعتی', 'فونداسیون صاعقه‌گیر', 'خاک‌برداری', 'متر مکعب', 213.46),
  act('a4', 'محوطه‌سازی', 'محوطه', 'خاک‌برداری', 'متر مکعب', 21176.89),
]
const rep = (id, date, front = 'ایستگاه', notes = '') => ({ id, projectId: 'p', formKey: 'work', reportNo: id, reportDate: date, front, station: '', status: 'approved', notes, contractorOrgId: null })
const reports = [rep('r0', '2026-11-16'), rep('r1', '2026-11-17', 'محوطه', 'ادامه عملیات حفاری فونداسیون صاعقه گیر\nادامه عملیات بتن ریزی کف دیچ آب‌های سطحی')]
const line = (id, reportId, activityId, qty) => ({ id, reportId, activityId, qty, status: 'approved', approvedQty: qty, detail: {} })
const lines = [line('l1', 'r0', 'a1', 113.40), line('l2', 'r0', 'a2', 276.69), line('l3', 'r0', 'a3', 106.50), line('l4', 'r1', 'a3', 35.00), line('l5', 'r0', 'a4', 13775)]
const resources = [{ reportId: 'r1', kind: 'man', section: 'سیویل', name: 'آرماتوربند', totalQty: 2, activeQty: 2, idleQty: 0, leaveQty: 0, stoppedQty: 0, repairQty: 0, note: '' },
  { reportId: 'r1', kind: 'man', section: 'سیویل', name: 'بتن‌ریز', totalQty: 2, activeQty: 1, idleQty: 0, leaveQty: 1, stoppedQty: 0, repairQty: 0, note: 'مرخصی' },
  { reportId: 'r1', kind: 'equip', section: 'ماشین‌آلات راه‌سازی', name: 'لودر', totalQty: 3, activeQty: 2, idleQty: 1, leaveQty: 0, stoppedQty: 0, repairQty: 0, note: 'آماده به کار' }]
const stoppages = [{ reportId: 'r1', category: 'permit', hours: 8, description: 'عدم صدور پرمیت اجرایی و ایمنی از سوی بهره‌بردار' }]
const ctx = { activities, reports, lines, resources, stoppages, baseOf: (a) => a.baseQty, employer: 'off' }
const day = { from: '2026-11-17', to: '2026-11-17', label: '۲۶ آبان ۱۴۰۵' }

const loc = drLocations(ctx, day)
const turbo = loc.rows.find((r) => r[1].v === 'توربوکمپرسورها')
assert.equal(turbo[4].v, 116.4); assert.equal(turbo[5].v, 113.4); assert.equal(turbo[6].v, 0); assert.equal(turbo[8].v, 3); assert.equal(turbo[9].v, '۹۷٫۴۲٪')
const light = loc.rows.find((r) => r[1].v === 'فونداسیون صاعقه‌گیر')
assert.equal(light[6].v, 35); assert.equal(light[7].v, 141.5); assert.equal(light[8].v, 71.96)

// the discipline summary sums the civil locations; landscaping stays its own discipline
const dis = drDisciplines(ctx, day)
const civil = dis.rows.find((r) => r[1].v === 'سیویل صنعتی')
assert.equal(civil[4].v, 613.53); assert.equal(civil[6].v, 35); assert.equal(civil[7].v, 531.59)
assert.ok(dis.rows.some((r) => r[1].v === 'محوطه‌سازی'))

// narrative, manpower, machinery
assert.equal(drNarrative(ctx, day).rows.length, 3)
const crew = drResources(ctx, day, 'man')
assert.equal(crew.rows.at(-1)[2].v, 4); assert.equal(crew.rows.at(-1)[3].v, 3); assert.equal(crew.rows.at(-1)[4].v, 1)
assert.equal(drResources(ctx, day, 'equip').rows[0][3].v, 2)

// registers: dia-inch fit-up / welding and equipment % by step dates
const cs = { lines: [{ id: 'L', ndtPct: 100, archived: false, testPackId: null }], spools: [], packs: [],
  welds: [{ id: 'w1', lineId: 'L', location: 'shop', sizeIn: 36, fitupDate: '2026-11-10', weldDate: '2026-11-17', ndtResult: 'pending', repairCount: 0, archived: false }, { id: 'w2', lineId: 'L', location: 'field', sizeIn: 24, fitupDate: '2026-11-17', weldDate: null, ndtResult: 'pending', repairCount: 0, archived: false }],
  equipment: [{ id: 'e', tag: 'K-101', title: 'توربوکمپرسور A', archived: false, steps: { foundation: '2026-10-01', set: '2026-10-20', level: '2026-11-17' } }] }
const reg = drRegisters(cs, day)
const fit = reg.rows.find((r) => r[1].v === 'فیت‌آپ'), wel = reg.rows.find((r) => r[1].v === 'جوشکاری')
assert.equal(fit[3].v, 60); assert.equal(fit[4].v, 36); assert.equal(fit[5].v, 24)
assert.equal(wel[5].v, 36); assert.equal(wel[6].v, 36)
const k = reg.rows.find((r) => String(r[1].v).startsWith('K-101')); assert.equal(k[4].v, '۴۰٪'); assert.equal(k[5].v, '۱۵٪'); assert.equal(k[6].v, '۵۵٪')

// the report type, end to end
const built = buildReport({ ...ctx, baselines: [], blines: [], cs }, day, typeOf('station_daily'), typeOf('station_daily').sections)
assert.deepEqual(built.tables.map((t) => t.key), ['disciplines', 'locations', 'registers', 'narrative', 'crew', 'fleet'])

// count columns (DR-591 «تعداد / حجم»): turbo-compressor foundations 3 of 3, lightning-rod foundations 4 of 6 (+1 today)
const cctx = { ...ctx, activities: ctx.activities.map((a) => (a.id === 'a1' ? { ...a, unitCount: 3 } : a.id === 'a3' ? { ...a, unitCount: 6 } : a)),
  lines: ctx.lines.map((l) => (l.id === 'l1' ? { ...l, detail: { count: 3 } } : l.id === 'l3' ? { ...l, detail: { count: 3 } } : l.id === 'l4' ? { ...l, detail: { count: 1 } } : l)) }
const cl = drLocations(cctx, day)
assert.equal(cl.head.length, 15); assert.equal(cl.head[4], 'تعداد کل')
const t2 = cl.rows.find((r) => r[1].v === 'توربوکمپرسورها'), l2 = cl.rows.find((r) => r[1].v === 'فونداسیون صاعقه‌گیر')
assert.equal(t2[4].v, 3); assert.equal(t2[6].v, 3); assert.equal(t2[12].v, 0); assert.equal(t2[14].v, '۹۷٫۴۲٪')
assert.equal(l2[8].v, 1); assert.equal(l2[10].v, 4); assert.equal(l2[12].v, 2); assert.equal(l2[11].v, 141.5)

// template
assert.equal(CIVIL_LOCATIONS.length, 16)
assert.ok(STATION_DR_TEMPLATE.length > 120)
assert.equal(missingDrRows([{ chapter: 'سیویل صنعتی', area: 'توربوکمپرسورها', title: 'خاک برداری' }]).length, STATION_DR_TEMPLATE.length - 1) // spacing/ZWNJ ignored
console.log('stationDr: ok')
