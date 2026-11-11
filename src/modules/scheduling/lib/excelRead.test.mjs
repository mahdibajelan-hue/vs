import assert from 'node:assert/strict'
import ExcelJSImport from 'exceljs'
import { cellValue, sheetsFromBuffer } from './excelRead.ts'
import { findHeaderRow, suggestMapping, parseExcelGrid } from './excel.ts'

const ExcelJS = ExcelJSImport.default ?? ExcelJSImport

// ── cellValue: exceljs rich values normalise to the plain Cell union parseExcelGrid expects
assert.equal(cellValue(null), null)
assert.equal(cellValue(undefined), null)
assert.equal(cellValue(42), 42)
assert.equal(cellValue('x'), 'x')
assert.equal(cellValue(true), true)
assert.equal(cellValue(new Date(Date.UTC(2026, 0, 3))), '2026-01-03') // Date -> ISO string for parseDate
assert.equal(cellValue({ formula: 'B2*2', result: 40 }), 40) // formula -> its result
assert.equal(cellValue({ sharedFormula: 'A1', result: 'ok' }), 'ok')
assert.equal(cellValue({ richText: [{ text: 'ab' }, { text: 'cd' }] }), 'abcd')
assert.equal(cellValue({ hyperlink: 'http://x', text: 'lnk' }), 'lnk')
assert.equal(cellValue({ error: '#REF!' }), null) // error cell does not leak a string
assert.equal(cellValue({}), null)

// ── build a real .xlsx in memory (title row, Persian header, data with a Date cell, a formula,
//    a fully blank row, and string dates) and parse it through the shipped reader.
async function buildWorkbook() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('برنامه')
  ws.addRow(['برنامه تست']) // title row (not a header: too few mapped columns)
  ws.addRow(['کد فعالیت', 'نام فعالیت', 'مدت', 'شروع برنامه‌ای', 'پایان برنامه‌ای', 'پیش‌نیازها'])
  ws.addRow(['A100', 'مهندسی', 20, new Date(Date.UTC(2026, 0, 3)), new Date(Date.UTC(2026, 0, 28)), ''])
  const r4 = ws.addRow(['A200', 'تأمین', null, new Date(Date.UTC(2026, 0, 29)), new Date(Date.UTC(2026, 3, 14)), 'A100FS'])
  r4.getCell(3).value = { formula: 'C3+10', result: 30 } // duration from a formula -> result 30
  ws.addRow([]) // fully blank row -> must be dropped
  ws.addRow(['A300', 'اجرا', 45, '2026-04-15', '2026-06-10', 'A200FS+2']) // string dates
  return wb.xlsx.writeBuffer()
}

const buf = await buildWorkbook()
const sheets = await sheetsFromBuffer(buf)

assert.equal(sheets.length, 1, 'one worksheet')
const grid = sheets[0].grid
// title + header + A100 + A200 + A300 = 5 rows; the blank row was dropped
assert.equal(grid.length, 5, 'blank row dropped')
// the Date cell became an ISO string in the grid
assert.equal(grid[2][3], '2026-01-03', 'date cell normalised to ISO string')
// the formula cell became its numeric result
assert.equal(grid[3][2], 30, 'formula cell normalised to its result')

const headerRow = findHeaderRow(grid)
assert.equal(headerRow, 1, 'header detected on the second row (after the title row)')
const mapping = suggestMapping(grid[headerRow].map((c) => String(c ?? '')))
assert.ok(mapping.code >= 0 && mapping.name >= 0 && mapping.duration >= 0 && mapping.start >= 0, 'columns mapped')

const parsed = parseExcelGrid(grid, headerRow, mapping, { defaultWorkDays: [0, 1, 2, 3, 4] })
assert.equal(parsed.issues.filter((i) => i.level === 'error').length, 0, 'no parse errors')
assert.deepEqual(parsed.activities.map((a) => a.code), ['A100', 'A200', 'A300'], 'all three activities parsed')

const a100 = parsed.activities.find((a) => a.code === 'A100')
assert.equal(a100.origDuration, 20)
assert.equal(a100.plannedStart, '2026-01-03', 'Date cell flowed through to a parsed start date')
assert.equal(a100.plannedFinish, '2026-01-28')

const a200 = parsed.activities.find((a) => a.code === 'A200')
assert.equal(a200.origDuration, 30, 'duration came from the formula result')

const a300 = parsed.activities.find((a) => a.code === 'A300')
assert.equal(a300.plannedStart, '2026-04-15', 'string date parsed')

// relations carried over (A100 -> A200 FS, A200 -> A300 FS +2)
assert.equal(parsed.relations.length, 2, 'two relations')
const rel = parsed.relations.find((r) => r.succCode === 'A300')
assert.equal(rel.predCode, 'A200')
assert.equal(rel.type, 'FS')
assert.equal(rel.lag, 2)

console.log('scheduling/excelRead: all assertions passed')
