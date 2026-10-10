/** Excel in and out for the material module. The library is loaded only when a file is read or written. */
export async function writeXlsx(rows: Record<string, string | number | null>[], filename: string, sheet = 'گزارش'): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

export async function readXlsx(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
}

/** An empty MTO sheet with the headers the importer understands. */
export async function writeMtoTemplate(): Promise<void> {
  await writeXlsx([{ 'کد کالا': '', 'شرح': '', 'گروه کالا': '', 'مشخصات فنی': '', 'سایز': '', 'واحد': 'EA', 'مقدار': '', 'قیمت واحد': '', 'ایستگاه': '', 'بخش اجرایی': '', 'شماره خط': '', 'ایزومتریک': '', 'نقشه': '', 'تگ': '', 'جبهه کاری': '', 'محل مصرف': '', 'تاریخ نیاز': '' }], 'MTO-template.xlsx', 'MTO')
}
