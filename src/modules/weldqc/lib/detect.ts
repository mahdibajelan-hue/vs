/**
 * Candidate regions on a radiograph — classic image processing, in the browser, no upload to any service.
 *
 * What it is NOT: a trained classifier of defect types. That needs thousands of films labelled by experienced
 * interpreters. What it does: finds areas whose contrast stands out from the texture around them along the weld and
 * boxes them, with a rough type guess from their shape, so the interpreter looks there first. Every candidate must be
 * checked, typed and confirmed by the interpreter; nothing is recorded until they do.
 *
 * Steps: grey → CLAHE (contrast limited adaptive equalisation, 8×8 tiles) → Gaussian blur 5×5 → difference from the
 * local mean (31×31) → Otsu threshold → opening, closing ×2 (3×3) → connected regions → area filter, score, shape guess.
 */

export interface Gray { w: number; h: number; d: Uint8Array }
export interface Candidate { x: number; y: number; w: number; h: number; areaPx: number; lengthPx: number; confidence: number; type: 'slag_inclusion' | 'porosity' | 'other' }

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const d = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000
  return { w, h, d }
}

export function clahe(g: Gray, clip = 3, tiles = 8): Gray {
  const { w, h, d } = g, tx = Math.max(1, Math.min(tiles, w)), ty = Math.max(1, Math.min(tiles, h))
  const tw = w / tx, th = h / ty
  const maps: Uint8Array[] = []
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    const x0 = Math.floor(i * tw), x1 = Math.floor((i + 1) * tw), y0 = Math.floor(j * th), y1 = Math.floor((j + 1) * th)
    const hist = new Float64Array(256); let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[d[y * w + x]]++; n++ }
    const limit = Math.max(1, (clip * n) / 256); let excess = 0
    for (let k = 0; k < 256; k++) if (hist[k] > limit) { excess += hist[k] - limit; hist[k] = limit }
    const add = excess / 256
    const map = new Uint8Array(256); let acc = 0
    for (let k = 0; k < 256; k++) { acc += hist[k] + add; map[k] = n ? Math.min(255, Math.round((acc / n) * 255)) : k }
    maps.push(map)
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / th - 0.5, j0 = Math.max(0, Math.floor(fy)), j1 = Math.min(ty - 1, j0 + 1), ay = Math.min(1, Math.max(0, fy - j0))
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / tw - 0.5, i0 = Math.max(0, Math.floor(fx)), i1 = Math.min(tx - 1, i0 + 1), ax = Math.min(1, Math.max(0, fx - i0))
      const v = d[y * w + x]
      const a = maps[j0 * tx + i0][v], b = maps[j0 * tx + i1][v], c = maps[j1 * tx + i0][v], e = maps[j1 * tx + i1][v]
      out[y * w + x] = Math.round((a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + e * ax) * ay)
    }
  }
  return { w, h, d: out }
}

export function gaussian5(g: Gray): Gray {
  const { w, h, d } = g, k = [1, 4, 6, 4, 1], tmp = new Float32Array(w * h), out = new Uint8Array(w * h)
  const cl = (v: number, m: number) => (v < 0 ? 0 : v > m ? m : v)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let t = -2; t <= 2; t++) s += k[t + 2] * d[y * w + cl(x + t, w - 1)]; tmp[y * w + x] = s / 16 }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let t = -2; t <= 2; t++) s += k[t + 2] * tmp[cl(y + t, h - 1) * w + x]; out[y * w + x] = Math.round(s / 16) }
  return { w, h, d: out }
}

/** mean of a (2r+1)² window, edges clamped to the image (integral image) */
export function boxMean(g: Gray, r: number): Gray {
  const { w, h, d } = g, I = new Float64Array((w + 1) * (h + 1)), out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += d[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]
    out[y * w + x] = Math.round(s / ((x1 - x0) * (y1 - y0)))
  }
  return { w, h, d: out }
}

export function otsu(d: Uint8Array): number {
  const hist = new Float64Array(256); for (const v of d) hist[v]++
  let sum = 0; for (let k = 0; k < 256; k++) sum += k * hist[k]
  let wB = 0, sumB = 0, best = 0, th = 0
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue
    const wF = d.length - wB; if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; th = t }
  }
  return th
}

function morph(m: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1
    for (let dy = -1; dy <= 1 && (dilate ? !v : v); dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx
      const p = yy < 0 || yy >= h || xx < 0 || xx >= w ? 0 : m[yy * w + xx]
      if (dilate && p) { v = 1; break } if (!dilate && !p) { v = 0; break }
    }
    out[y * w + x] = v
  }
  return out
}

export function detectCandidates(g0: Gray, opt: { minArea?: number; max?: number } = {}): Candidate[] {
  const minArea = opt.minArea ?? 25, max = opt.max ?? 25
  const g = gaussian5(clahe(g0)), mean = boxMean(g, 15), { w, h } = g
  const diff = new Uint8Array(w * h)
  for (let i = 0; i < diff.length; i++) diff[i] = Math.abs(g.d[i] - mean.d[i])
  const t = otsu(diff)
  let m: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < m.length; i++) m[i] = diff[i] > t ? 1 : 0
  m = morph(morph(m, w, h, false), w, h, true) // opening
  for (let k = 0; k < 2; k++) m = morph(morph(m, w, h, true), w, h, false) // closing ×2
  const seen = new Uint8Array(w * h), out: Candidate[] = [], stack: number[] = []
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0, dsum = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w
      area++; dsum += diff[p]
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const q = yy * w + xx; if (m[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
      }
    }
    if (area < minArea) continue
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, aspect = cw / ch
    // a region running across much of the frame is the edge of the weld bead or of the film, not a defect
    if (cw > w * 0.45 || ch > h * 0.45) continue
    const confidence = Math.round(Math.min(0.95, Math.max(0.15, dsum / area / 60)) * 100) / 100
    const type = aspect > 4 || aspect < 0.25 ? 'slag_inclusion' : aspect >= 0.7 && aspect <= 1.4 && area < 150 ? 'porosity' : 'other'
    out.push({ x: x0, y: y0, w: cw, h: ch, areaPx: area, lengthPx: Math.max(cw, ch), confidence, type })
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, max)
}
