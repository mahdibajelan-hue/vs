import type { Grid } from './excel'

// Reading an uploaded spreadsheet. We use exceljs (already a dependency) rather than the SheetJS
// `xlsx` npm build: that build is unmaintained and its read path has a prototype-pollution CVE
// (CVE-2023-30533) reachable by parsing an attacker-crafted workbook. exceljs reads OOXML
// (.xlsx/.xlsm) only — legacy binary .xls is no longer supported (re-save as .xlsx).

export interface Sheet { name: string; grid: Grid }
type GridCell = Grid[number][number]
export const MAX_ROWS = 20000

/**
 * Normalise one exceljs cell value to the plain Cell union `parseExcelGrid` expects. exceljs returns
 * rich objects for formulas, hyperlinks and rich text, and native `Date` objects for date cells;
 * dates become an ISO `yyyy-mm-dd` string so `parseDate` can read them (the old xlsx path handed
 * over Excel serial numbers instead). Anything unrecognised collapses to null rather than leaking a
 * `[object Object]` string into the grid.
 */
export function cellValue(v: unknown): GridCell {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = typeof v
  if (t === 'number' || t === 'boolean' || t === 'string') return v as GridCell
  if (t === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return cellValue(o.result) // formula / shared-formula result
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('')
    if ('text' in o) return cellValue(o.text) // hyperlink
    if ('error' in o) return null // error cell (#REF! etc.)
  }
  return null
}

/** Parse workbook bytes into per-sheet grids (array of rows, each a padded array of cells). Fully
 * blank rows are dropped and at most MAX_ROWS data rows per sheet are kept. */
export async function sheetsFromBuffer(buf: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const m = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs')
  const ExcelJS = m.default ?? m
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  return wb.worksheets.map((ws) => {
    const cols = ws.actualColumnCount || ws.columnCount || 0
    const lastRow = ws.rowCount || 0
    const grid: Grid = []
    for (let r = 1; r <= lastRow && grid.length < MAX_ROWS; r++) {
      const row = ws.getRow(r)
      const cells: GridCell[] = []
      for (let c = 1; c <= cols; c++) cells.push(cellValue(row.getCell(c).value))
      if (cells.some((x) => x != null && String(x).trim() !== '')) grid.push(cells)
    }
    return { name: ws.name, grid }
  })
}

/** Browser entry point: read a user-selected file into per-sheet grids. */
export async function readSheets(file: File): Promise<Sheet[]> {
  return sheetsFromBuffer(await file.arrayBuffer())
}
