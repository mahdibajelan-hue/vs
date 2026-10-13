import type { Grid } from './priceBookImport'

/** Reads every sheet of a workbook into plain grids (values and formulas) for the price-book parser. The spreadsheet library is loaded only when a file is chosen. */
export async function readWorkbookGrids(file: File): Promise<Grid[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    if (!ws['!ref']) return { name, rows: [] }
    const rg = XLSX.utils.decode_range(ws['!ref'])
    const rows: Grid['rows'] = [], formulas: NonNullable<Grid['formulas']> = []
    for (let r = 0; r <= Math.min(rg.e.r, 3000); r++) {
      const row: Grid['rows'][number] = [], frow: (string | null)[] = []
      for (let c = 0; c <= Math.min(rg.e.c, 24); c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; row.push(cell ? (cell.v as never) : null); frow.push(cell && cell.f ? cell.f : null) }
      rows.push(row); formulas.push(frow)
    }
    return { name, rows, formulas }
  })
}
