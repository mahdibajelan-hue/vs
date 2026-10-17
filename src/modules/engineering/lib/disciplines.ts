/** One canonical name per engineering discipline, whatever the spelling in the source (MDL workbook, hand-typed list, Persian names, the code inside the document number). */
export const DISC_BY_CODE: Record<string, string> = { CV: 'Civil', ME: 'Mechanical', EL: 'Electrical', IN: 'Instrument', PI: 'Piping', PL: 'Pipeline', PR: 'Process', GE: 'General', GT: 'Geotechnical', CP: 'Cathodic Protection', SF: 'Safety', HS: 'Safety', SU: 'Surveying of Land', PC: 'Project Control', WE: 'Welding', CT: 'Coating' }
const ALIAS: Record<string, string> = {
  civil: 'Civil', mechanic: 'Mechanical', mechanical: 'Mechanical', electric: 'Electrical', electrical: 'Electrical', instrument: 'Instrument', instrumentation: 'Instrument', piping: 'Piping', pipeline: 'Pipeline', process: 'Process', general: 'General',
  geotech: 'Geotechnical', geotechnical: 'Geotechnical', cathodic: 'Cathodic Protection', cathodicprotection: 'Cathodic Protection', cp: 'Cathodic Protection', safety: 'Safety', hse: 'Safety', surveying: 'Surveying of Land', surveyingofland: 'Surveying of Land', survey: 'Surveying of Land',
  projectcontrol: 'Project Control', welding: 'Welding', coating: 'Coating',
  'عمران': 'Civil', 'ساختمان': 'Civil', 'مکانیک': 'Mechanical', 'برق': 'Electrical', 'ابزاردقیق': 'Instrument', 'لولهکشی': 'Piping', 'خطلوله': 'Pipeline', 'فرآیند': 'Process', 'فرایند': 'Process', 'عمومی': 'General', 'ژئوتکنیک': 'Geotechnical', 'حفاظتکاتدی': 'Cathodic Protection', 'ایمنی': 'Safety', 'نقشهبرداری': 'Surveying of Land', 'کنترلپروژه': 'Project Control', 'جوشکاری': 'Welding', 'پوشش': 'Coating',
}
const key = (v: string) => v.toLowerCase().replace(/[\s_\-./ً-ٟ‌]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک')
const title = (v: string) => v.trim().replace(/\s+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase())

/** the discipline code inside a document number (791355-DP1-PLN-CV-DWG-0001 → Civil) */
export function discFromDocNo(docNo: string): string {
  for (const seg of docNo.toUpperCase().split(/[-_\s]+/)) if (seg.length === 2 && DISC_BY_CODE[seg]) return DISC_BY_CODE[seg]
  return ''
}
export function canonDiscipline(name: string, docNo = ''): string {
  const raw = (name ?? '').trim()
  if (raw) { const k = key(raw), up = raw.toUpperCase(); return ALIAS[k] ?? (DISC_BY_CODE[up] ?? title(raw)) }
  return discFromDocNo(docNo)
}
