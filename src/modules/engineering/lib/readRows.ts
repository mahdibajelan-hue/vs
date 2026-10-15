/** First worksheet as an array of rows, limited to a sane window — MDL workbooks declare thousands of empty columns. */
export async function readSheetRows(file: File, maxCols = 40, maxRows = 3000): Promise<unknown[][]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const ref = ws['!ref']
  if (ref) { const r = XLSX.utils.decode_range(ref); r.e.c = Math.min(r.e.c, maxCols - 1); r.e.r = Math.min(r.e.r, maxRows - 1); ws['!ref'] = XLSX.utils.encode_range(r) }
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
}
