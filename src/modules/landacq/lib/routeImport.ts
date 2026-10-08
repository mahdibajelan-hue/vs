import { parseKml, type LonLat } from './geometry'
import { fromUtm } from './utm'

/**
 * Route import helpers: KML text, KMZ (zip), and tables of IP (intersection / bend) points from Excel, CSV or pasted text,
 * in lon/lat or UTM. Pure apart from the browser's DecompressionStream used for KMZ.
 */

// ------------------------------------------------------------------------------------------------ KMZ
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

/** Returns the text of the first .kml entry of a KMZ (zip) file. */
export async function kmlFromKmz(buf: ArrayBuffer): Promise<string> {
  const b = new Uint8Array(buf)
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('فایل KMZ معتبر نیست')
  const count = u16(b, eocd + 10)
  let p = u32(b, eocd + 16)
  const td = new TextDecoder()
  for (let n = 0; n < count && u32(b, p) === 0x02014b50; n++) {
    const method = u16(b, p + 10)
    const csize = u32(b, p + 20)
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32)
    const local = u32(b, p + 42)
    const name = td.decode(b.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!name.toLowerCase().endsWith('.kml')) continue
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    const data = b.subarray(start, start + csize)
    if (method === 0) return td.decode(data)
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return td.decode(await new Response(stream).arrayBuffer())
    }
    throw new Error('روش فشرده‌سازی KMZ پشتیبانی نمی‌شود')
  }
  throw new Error('در فایل KMZ فایل KML پیدا نشد')
}

export async function readRouteFile(file: File): Promise<LonLat[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.kmz')) return parseKml(await kmlFromKmz(await file.arrayBuffer()))
  if (name.endsWith('.kml') || name.endsWith('.xml')) return parseKml(await file.text())
  throw new Error('فرمت فایل پشتیبانی نمی‌شود (KML، KMZ، Excel یا CSV)')
}

// ------------------------------------------------------------------------------------------------ IP table
export interface IpParse {
  points: LonLat[]
  /** What the numbers were: geographic degrees or UTM metres (which need a zone). */
  format: 'lonlat' | 'utm' | 'none'
  zone: number | null
  skipped: number
}

const faDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.')
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(faDigits(String(v ?? '').trim().replace(/,/g, ''))))

const COL = {
  lon: /^(lon|long|longitude|lng|x|طول\s*جغرافیایی|طول)$/i,
  lat: /^(lat|latitude|y|عرض\s*جغرافیایی|عرض)$/i,
  e: /^(e|east|easting|x\s*utm|utm\s*x|شرقی|مختصات\s*شرقی)$/i,
  n: /^(n|north|northing|y\s*utm|utm\s*y|شمالی|مختصات\s*شمالی)$/i,
  zone: /^(zone|utm\s*zone|زون)$/i,
}

/**
 * Reads rows of a table (first row may be headers) into route points. Accepts lon/lat or UTM columns; with no headers the first two
 * numeric columns are used (a pair like 51.4, 35.7 or 35.7, 51.4 is recognised as degrees, a pair of large numbers as UTM easting/northing).
 */
export function parseIpTable(rows: unknown[][], defaults: { zone: number; north: boolean } = { zone: 39, north: true }): IpParse {
  const clean = rows.map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c))).filter((r) => r.some((c) => c !== '' && c != null))
  if (!clean.length) return { points: [], format: 'none', zone: null, skipped: 0 }
  const first = clean[0]
  const hasHeader = first.some((c) => typeof c === 'string' && Number.isNaN(num(c)) && String(c).length > 0)
  let ci = { lon: -1, lat: -1, e: -1, n: -1, zone: -1 }
  const body = hasHeader ? clean.slice(1) : clean
  if (hasHeader) {
    first.forEach((h, i) => {
      const t = String(h ?? '').trim()
      ;(Object.keys(COL) as (keyof typeof COL)[]).forEach((k) => {
        if (ci[k] < 0 && COL[k].test(t)) ci = { ...ci, [k]: i }
      })
    })
  }
  const numericCols = (r: unknown[]) => r.map((c, i) => [i, num(c)] as const).filter(([, v]) => Number.isFinite(v))
  let format: IpParse['format'] = 'none'
  let swap = false
  let a = -1, b = -1
  if (ci.e >= 0 && ci.n >= 0) { format = 'utm'; a = ci.e; b = ci.n }
  else if (ci.lon >= 0 && ci.lat >= 0) { format = 'lonlat'; a = ci.lon; b = ci.lat }
  else {
    const sample = body.map(numericCols).find((c) => c.length >= 2)
    if (sample) {
      a = sample[0][0]; b = sample[1][0]
      const [x, y] = [sample[0][1], sample[1][1]]
      if (Math.abs(x) > 1000 && Math.abs(y) > 1000) format = 'utm'
      else { format = 'lonlat'; swap = x > 20 && x < 45 && y > 40 && y < 70 } // lat, lon order typical for Iran
    }
  }
  if (format === 'none') return { points: [], format, zone: null, skipped: body.length }
  const points: LonLat[] = []
  let skipped = 0
  let zone: number | null = null
  for (const r of body) {
    const x = num(r[a]), y = num(r[b])
    if (!Number.isFinite(x) || !Number.isFinite(y)) { skipped++; continue }
    if (format === 'utm') {
      const z = ci.zone >= 0 && Number.isFinite(num(r[ci.zone])) ? Math.round(num(r[ci.zone])) : defaults.zone
      zone = z
      if (x < 100000 || x > 900000 || y < 0 || y > 10000000) { skipped++; continue }
      points.push(fromUtm(x, y, z, defaults.north) as LonLat)
    } else {
      const lon = swap ? y : x, lat = swap ? x : y
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) { skipped++; continue }
      points.push([lon, lat])
    }
  }
  return { points, format, zone, skipped }
}

/** Pasted text: one point per line, values separated by tab, comma, semicolon or spaces. */
export const tableFromText = (text: string): unknown[][] =>
  text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\t;,]+|\s+/).map((c) => c.trim()).filter((c) => c !== ''))

/** Excel / CSV file -> first sheet as rows. */
export async function tableFromSheet(file: File): Promise<unknown[][]> {
  const { read, utils } = await import('xlsx')
  const wb = read(await file.arrayBuffer(), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
}
