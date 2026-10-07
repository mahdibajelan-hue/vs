/**
 * Small browser-side image helpers: keep uploads light (a phone photo is 3-8 MB; the compressed copy is ~150 KB)
 * and read the capture time before compression strips the EXIF block.
 */

/** DateTimeOriginal from a JPEG's EXIF block, or null (PNG/WebP/HEIC, screenshots, edited photos). */
export async function readExifDate(file: Blob): Promise<Date | null> {
  try {
    if (!/jpe?g/i.test(file.type)) return null
    const buf = await file.slice(0, 128 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xffd8) return null
    let off = 2
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off)
      const len = v.getUint16(off + 2)
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10
        const little = v.getUint16(tiff) === 0x4949
        const u16 = (o: number) => v.getUint16(o, little)
        const u32 = (o: number) => v.getUint32(o, little)
        const readIfd = (ifd: number, wanted: number): number | null => {
          const n = u16(ifd)
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12
            if (u16(e) === wanted) return u32(e + 8)
          }
          return null
        }
        const ifd0 = tiff + u32(tiff + 4)
        const exifPtr = readIfd(ifd0, 0x8769)
        if (exifPtr == null) return null
        const dtPtr = readIfd(tiff + exifPtr, 0x9003)
        if (dtPtr == null) return null
        let s = ''
        for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(tiff + dtPtr + i))
        const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
        if (!m) return null
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
        return Number.isNaN(d.getTime()) ? null : d
      }
      if ((marker & 0xff00) !== 0xff00) break
      off += 2 + len
    }
  } catch {
    /* unreadable EXIF is simply "no date" */
  }
  return null
}

async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality))
}

/** Resizes to `maxEdge` and re-encodes as JPEG, lowering quality until the file is at most `maxBytes`. Transparent areas become white. */
export async function compressImage(file: Blob, opts: { maxEdge?: number; maxBytes?: number; quality?: number } = {}): Promise<Blob> {
  const { maxEdge = 1600, maxBytes = 350 * 1024, quality = 0.74 } = opts
  const bmp = await decode(file)
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  let q = quality
  let blob = await toBlob(canvas, q)
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.08
    blob = await toBlob(canvas, q)
  }
  return blob
}

/** Share of a row/column that is near-black or fully transparent — used to trim letterbox bars and transparent margins. */
function isEmptyLine(data: Uint8ClampedArray, width: number, index: number, vertical: boolean, height: number): boolean {
  const n = vertical ? height : width
  let empty = 0
  for (let i = 0; i < n; i++) {
    const p = vertical ? (i * width + index) * 4 : (index * width + i) * 4
    const a = data[p + 3]
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
    if (a < 24 || lum < 22) empty++
  }
  return empty / n > 0.97
}

/**
 * Profile picture: trims black / transparent borders, crops to a centred square, scales to 320 px and flattens on white —
 * so a photo with bars or a transparent PNG never shows a dark ring inside the round avatar. ~30 KB result.
 */
export async function prepareAvatar(file: Blob): Promise<Blob> {
  const bmp = await decode(file)
  const probeScale = Math.min(1, 400 / Math.max(bmp.width, bmp.height))
  const pw = Math.max(1, Math.round(bmp.width * probeScale))
  const ph = Math.max(1, Math.round(bmp.height * probeScale))
  const probe = document.createElement('canvas')
  probe.width = pw
  probe.height = ph
  const pctx = probe.getContext('2d', { willReadFrequently: true })!
  pctx.drawImage(bmp, 0, 0, pw, ph)
  const data = pctx.getImageData(0, 0, pw, ph).data
  let top = 0
  let bottom = ph - 1
  let left = 0
  let right = pw - 1
  while (top < bottom - 8 && isEmptyLine(data, pw, top, false, ph)) top++
  while (bottom > top + 8 && isEmptyLine(data, pw, bottom, false, ph)) bottom--
  while (left < right - 8 && isEmptyLine(data, pw, left, true, ph)) left++
  while (right > left + 8 && isEmptyLine(data, pw, right, true, ph)) right--
  const sx = left / probeScale
  const sy = top / probeScale
  const sw = (right - left + 1) / probeScale
  const sh = (bottom - top + 1) / probeScale
  const side = Math.min(sw, sh)
  const cx = sx + (sw - side) / 2
  const cy = sy + (sh - side) / 2
  const out = document.createElement('canvas')
  const size = 320
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bmp, cx, cy, side, side, 0, 0, size, size)
  bmp.close()
  return toBlob(out, 0.86)
}
