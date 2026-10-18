/** Writes a workbook with right-to-left sheets; `sheets` = name → array of rows (first row = headers). */
export async function downloadWorkbook(fileName: string, sheets: Record<string, (string | number | null)[][]>): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c == null ? '' : c))))
    ws['!cols'] = (rows[0] ?? []).map((_, i) => ({ wch: Math.min(60, Math.max(10, ...rows.slice(0, 80).map((r) => String(r[i] ?? '').length + 2))) }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  wb.Workbook = { Views: sheets ? Object.keys(sheets).map(() => ({ RTL: true })) : [] }
  XLSX.writeFile(wb, fileName)
}
export function downloadText(fileName: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
