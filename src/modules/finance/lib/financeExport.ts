/** Generic Excel export for the Financial Reports page — plain row objects straight into one sheet, same convention as riskExport.ts. */
export async function exportFinanceReportToExcel(rows: Record<string, string | number>[], filename: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'گزارش مالی')
  XLSX.writeFile(wb, filename)
}
