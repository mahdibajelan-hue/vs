import { clahe, gaussian5, type Gray } from './detect'

/**
 * Film files: scans arrive as TIFF (often 16-bit greyscale, 20 MB and more) that browsers cannot show. A film is
 * converted once, when it is uploaded, into a viewable 8-bit copy; the original is kept untouched beside it.
 *
 *   decode   TIFF (8 / 16-bit grey, RGB) or any image the browser reads
 *   levels   16-bit → 8-bit with a percentile window (0.5 % – 99.5 %), so the weld's density range fills the screen
 *   enhance  optional: noise reduction (3×3 median), local contrast (CLAHE), sharpening (unsharp mask)
 *   metrics  contrast, dynamic range, edge sharpness and noise → a first «good / fair / poor» read of image quality
 */

export interface Wide { w: number; h: number; d: Uint16Array | Uint8Array; bits: 8 | 16 }
export interface Enhance { denoise: boolean; clahe: boolean; sharpen: number }
export interface Metrics { contrast: number; range: number; sharpness: number; noise: number; verdict: 'good' | 'fair' | 'poor'; notes: string[] }

export const isTiff = (name: string, type: string) => /\.tiff?$/i.test(name) || /image\/tiff/i.test(type)

/** TIFF bytes → the largest image of the file as grey samples (16-bit kept as 16-bit) */
export async function decodeTiff(buf: ArrayBuffer): Promise<Wide> {
  const UTIF = (await import('utif')).default as typeof import('utif')
  const ifds = UTIF.decode(buf)
  if (!ifds.length) throw new Error('این فایل TIFF تصویری ندارد.')
  const area = (i: Record<string, unknown>) => Number((i.t256 as number[] | undefined)?.[0] ?? 0) * Number((i.t257 as number[] | undefined)?.[0] ?? 0)
  const ifd = [...ifds].sort((a, b) => area(b as Record<string, unknown>) - area(a as Record<string, unknown>))[0]
  UTIF.decodeImage(buf, ifd)
  const w = ifd.width, h = ifd.height
  const t = ifd as unknown as Record<string, number[] | undefined>
  const bps = t.t258?.[0] ?? 8, spp = t.t277?.[0] ?? 1, photo = t.t262?.[0] ?? 1
  if (bps === 16 && spp === 1) {
    const raw = ifd.data as Uint8Array
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const out = new Uint16Array(w * h)
    for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, true) // UTIF hands 16-bit samples back little-endian whatever the file's byte order
    if (photo === 0) for (let i = 0; i < out.length; i++) out[i] = 65535 - out[i]
    return { w, h, d: out, bits: 16 }
  }
  const rgba = UTIF.toRGBA8(ifd)
  const out = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000
  return { w, h, d: out, bits: 8 }
}

/** percentile window → 8-bit (applied to 8-bit images too: a faint scan gains contrast) */
export function levels(img: Wide, lo = 0.005, hi = 0.995): Gray {
  const bins = img.bits === 16 ? 65536 : 256
  const hist = new Uint32Array(bins)
  for (let i = 0; i < img.d.length; i++) hist[img.d[i]]++
  const N = img.d.length
  let acc = 0, a = 0, b = bins - 1
  for (let k = 0; k < bins; k++) { acc += hist[k]; if (acc > N * lo) { a = k; break } }
  acc = 0
  for (let k = bins - 1; k >= 0; k--) { acc += hist[k]; if (acc > N * (1 - hi)) { b = k; break } }
  if (b <= a) { a = 0; b = bins - 1 }
  const out = new Uint8Array(N), s = 255 / (b - a)
  for (let i = 0; i < N; i++) { const v = (img.d[i] - a) * s; out[i] = v < 0 ? 0 : v > 255 ? 255 : v }
  return { w: img.w, h: img.h, d: out }
}

export function median3(g: Gray): Gray {
  const { w, h, d } = g, out = new Uint8Array(w * h), v = new Array<number>(9)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let k = 0
    for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) v[k++] = d[yy * w + Math.min(w - 1, Math.max(0, x + dx))] }
    v.sort((p, q) => p - q); out[y * w + x] = v[4]
  }
  return { w, h, d: out }
}

/** unsharp mask: g + amount × (g − blur(g)) */
export function sharpen(g: Gray, amount: number): Gray {
  if (amount <= 0) return g
  const b = gaussian5(g), out = new Uint8Array(g.d.length)
  for (let i = 0; i < out.length; i++) { const v = g.d[i] + amount * (g.d[i] - b.d[i]); out[i] = v < 0 ? 0 : v > 255 ? 255 : v }
  return { w: g.w, h: g.h, d: out }
}

export function enhance(g: Gray, o: Enhance): Gray {
  let x = g
  if (o.denoise) x = median3(x)
  if (o.clahe) x = clahe(x, 2.5)
  if (o.sharpen > 0) x = sharpen(x, o.sharpen)
  return x
}

/** image-quality figures of a film (on a ≤ 1200 px copy is enough) and a first verdict for the interpreter */
export function metrics(g: Gray): Metrics {
  const { w, h, d } = g, N = d.length
  let sum = 0; for (let i = 0; i < N; i++) sum += d[i]
  const mean = sum / N
  let v = 0; for (let i = 0; i < N; i++) v += (d[i] - mean) ** 2
  const contrast = Math.sqrt(v / N)
  const sorted = Uint8Array.from(d).sort()
  const range = sorted[Math.floor(N * 0.99)] - sorted[Math.floor(N * 0.01)]
  // Laplacian: variance = edge sharpness; median |Laplacian| ≈ noise
  const lap: number[] = []
  let lsum = 0, lsq = 0, cnt = 0
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const L = 4 * d[y * w + x] - d[y * w + x - 1] - d[y * w + x + 1] - d[(y - 1) * w + x] - d[(y + 1) * w + x]
    lsum += L; lsq += L * L; cnt++; lap.push(Math.abs(L))
  }
  const sharpness = cnt ? lsq / cnt - (lsum / cnt) ** 2 : 0
  lap.sort((a, b) => a - b)
  const noise = lap.length ? lap[Math.floor(lap.length / 2)] : 0
  const notes: string[] = []
  if (contrast < 18) notes.push('کنتراست کلی پایین است')
  if (range < 70) notes.push('دامنهٔ تیرگی محدود است (فیلم کم‌نور یا پرنور)')
  if (sharpness < 25) notes.push('لبه‌ها تیز نیستند (احتمال حرکت، Ug زیاد یا اسکن مات)')
  if (noise > 12) notes.push('نویز تصویر زیاد است')
  const bad = (contrast < 12 ? 1 : 0) + (range < 45 ? 1 : 0) + (sharpness < 12 ? 1 : 0)
  return { contrast: Math.round(contrast * 10) / 10, range, sharpness: Math.round(sharpness), noise, verdict: bad >= 1 || notes.length >= 3 ? 'poor' : notes.length ? 'fair' : 'good', notes }
}

/** a downscaled copy for measurement / the assistant */
export function shrink(g: Gray, maxSide: number): { g: Gray; k: number } {
  const k = Math.min(1, maxSide / Math.max(g.w, g.h))
  if (k === 1) return { g, k }
  const w = Math.max(1, Math.round(g.w * k)), h = Math.max(1, Math.round(g.h * k)), out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = g.d[Math.min(g.h - 1, Math.floor(y / k)) * g.w + Math.min(g.w - 1, Math.floor(x / k))]
  return { g: { w, h, d: out }, k }
}
