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
export interface Candidate { x: number; y: number; w: number; h: number; areaPx: number; lengthPx: number; confidence: number; type: 'slag_inclusion' | 'porosity' | 'other'; /** darker than its surroundings (less density: a void, slag, lack of penetration) */ dark: boolean }

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

/**
 * median of a 1-D window along the weld (h = along rows, v = along columns): the bead edges, uniform along the weld,
 * cancel out, and an indication shorter than half the window does not pull its own background (a mean would)
 */
export function lineMedian(g: Gray, axis: 'h' | 'v', r: number): Gray {
  const { w, h, d } = g, out = new Uint8Array(w * h)
  const L = axis === 'h' ? w : h, M = axis === 'h' ? h : w
  const at = (line: number, i: number) => (axis === 'h' ? line * w + i : i * w + line)
  const hist = new Uint32Array(256)
  for (let line = 0; line < M; line++) {
    hist.fill(0)
    let n = 0
    for (let i = 0; i <= Math.min(L - 1, r); i++) { hist[d[at(line, i)]]++; n++ }
    for (let i = 0; i < L; i++) {
      if (i > 0) { const add = i + r, drop = i - r - 1; if (add < L) { hist[d[at(line, add)]]++; n++ } if (drop >= 0) { hist[d[at(line, drop)]]--; n-- } }
      let acc = 0, v = 0; const half = n / 2
      for (; v < 255; v++) { acc += hist[v]; if (acc >= half) break }
      out[at(line, i)] = v
    }
  }
  return { w, h, d: out }
}

/** `axis`: direction of the weld when known (beadBand) — the background is then taken along the weld */
export function detectCandidates(g0: Gray, opt: { minArea?: number; max?: number; axis?: 'h' | 'v' | null } = {}): Candidate[] {
  const minArea = opt.minArea ?? 25, max = opt.max ?? 25
  const g = gaussian5(clahe(g0)), { w, h } = g
  const mean = opt.axis ? lineMedian(g, opt.axis, Math.max(30, Math.round((opt.axis === 'h' ? w : h) / 2.5))) : boxMean(g, 15)
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
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0, dsum = 0, ssum = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w
      area++; dsum += diff[p]; ssum += g.d[p] - mean.d[p]
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
    out.push({ x: x0, y: y0, w: cw, h: ch, areaPx: area, lengthPx: Math.max(cw, ch), confidence, type, dark: ssum < 0 })
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, max)
}

// ── where the weld is, and what a candidate probably is ───────────────────────────────────────────────────────────
export interface Band { axis: 'h' | 'v'; from: number; to: number; strength: number }

/**
 * The weld bead on a radiograph is a band of different density running along the film. The profile of row means
 * (horizontal weld) or column means (vertical weld) is smoothed; the band is the stretch above half way between the
 * profile's floor and peak, around the peak. The stronger of the two directions wins. null = no clear band.
 */
export function beadBand(g: Gray): Band | null {
  const prof = (axis: 'h' | 'v') => {
    const L = axis === 'h' ? g.h : g.w, M = axis === 'h' ? g.w : g.h, p = new Float64Array(L)
    for (let i = 0; i < L; i++) { let s = 0; for (let j = 0; j < M; j++) s += axis === 'h' ? g.d[i * g.w + j] : g.d[j * g.w + i]; p[i] = s / M }
    const r = Math.max(2, Math.round(L / 60)), sm = new Float64Array(L)
    for (let i = 0; i < L; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = i + k; if (q >= 0 && q < L) { s += p[q]; c++ } } sm[i] = s / c }
    return sm
  }
  let best: Band | null = null
  for (const axis of ['h', 'v'] as const) {
    const p = prof(axis), L = p.length
    let lo = Infinity, hi = -Infinity, at = 0
    for (let i = 0; i < L; i++) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) { hi = p[i]; at = i } }
    const strength = hi - lo
    if (strength < 8) continue
    const cut = lo + strength / 2
    let a = at, b = at
    while (a > 0 && p[a - 1] >= cut) a--
    while (b < L - 1 && p[b + 1] >= cut) b++
    const share = (b - a + 1) / L
    if (share < 0.06 || share > 0.75) continue
    if (!best || strength > best.strength) best = { axis, from: a, to: b, strength }
  }
  return best
}

export type Guess = 'IP' | 'IF' | 'ESI' | 'ISI' | 'P' | 'CP' | 'BT' | 'IU' | 'EU' | 'C'
export interface Annotated extends Candidate { code: Guess | null; why: string; inBead: boolean }

/**
 * A first guess of the imperfection code, from shape, density and place across the bead — explained in words so the
 * interpreter sees why. Rules (radiographic appearance of pipeline weld imperfections):
 *   on the bead centreline, dark, elongated along the weld      → IP  (unfused root)
 *   on the centreline, dark, compact and large                  → BT  (burn-through)
 *   at the bead edge, thin, elongated                           → IF / undercut-like (IF; EU/IU decided visually)
 *   elongated, wider than a hairline, off the centreline        → ESI (slag line)
 *   compact, round, small                                       → P;   three or more within a small area → CP
 *   compact, irregular                                          → ISI
 *   lighter than the surroundings                               → no code (denser: excess penetration, spatter, marker)
 *   outside the bead                                            → no code, confidence lowered (film marks, letters)
 */
export function annotate(cands: Candidate[], band: Band | null): Annotated[] {
  const out: Annotated[] = cands.map((c) => {
    const along = band?.axis === 'v' ? c.h : c.w, across = band?.axis === 'v' ? c.w : c.h
    const elong = along / Math.max(1, across)
    const pos = band ? ((band.axis === 'h' ? c.y + c.h / 2 : c.x + c.w / 2) - band.from) / Math.max(1, band.to - band.from) : 0.5
    const inBead = !band || (pos > -0.15 && pos < 1.15)
    const centre = pos > 0.35 && pos < 0.65, edge = pos < 0.2 || pos > 0.8
    const round = elong < 1.6 && elong > 0.6
    let code: Guess | null = null, why = ''
    if (!inBead) { why = 'بیرون از نوار جوش (احتمالاً نشانه یا حروف سربی، خراش فیلم)'; return { ...c, code, why, inBead, confidence: Math.max(0.1, Math.round(c.confidence * 0.5 * 100) / 100) } }
    if (!c.dark) { why = 'روشن‌تر از اطراف (چگالی بیشتر: نفوذ اضافی، پاشش یا جسم خارجی)'; return { ...c, code, why, inBead } }
    if (centre && elong >= 3) { code = 'IP'; why = 'خط تیرهٔ کشیده روی خط مرکز جوش — الگوی نفوذ ناقص ریشه' }
    else if (centre && round && c.areaPx > 400) { code = 'BT'; why = 'لکهٔ تیرهٔ بزرگ و فشرده روی خط مرکز — الگوی سوختگی؛ تیرگی نسبت به فلز پایه را بررسی کنید' }
    else if (edge && elong >= 4) { code = 'IF'; why = 'خط تیرهٔ نازک در لبهٔ نوار جوش — الگوی ذوب ناقص یا بریدگی کناره' }
    else if (elong >= 3) { code = 'ESI'; why = 'نشانهٔ تیرهٔ کشیده خارج از خط مرکز — الگوی آخال سربارهٔ کشیده (Wagon track)' }
    else if (round && c.areaPx < 150) { code = 'P'; why = 'نقطهٔ تیرهٔ گرد و کوچک — الگوی تخلخل' }
    else { code = 'ISI'; why = 'نشانهٔ تیرهٔ فشرده و نامنظم — الگوی آخال منفرد' }
    return { ...c, code, why, inBead }
  })
  // three or more pores close together → cluster porosity
  const pores = out.filter((c) => c.code === 'P')
  for (const p of pores) {
    const near = pores.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 6 * Math.max(p.w, p.h, 4))
    if (near.length >= 3) for (const q of near) { q.code = 'CP'; q.why = 'چند حفرهٔ نزدیک به هم — الگوی تخلخل خوشه‌ای' }
  }
  return out.sort((a, b) => Number(b.inBead) - Number(a.inBead) || b.confidence - a.confidence)
}

// ══ detector v2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// What changed from the first version, and why:
//  · it looks only inside the weld bead and a margin beside it (lead letters, IQI and film edges no longer raise alarms);
//  · an area counts only when it stands out of the film's own grain: the threshold is a multiple of the noise measured on
//    that film (robust MAD), not Otsu — a clean film now yields no candidates instead of always the «top 25»;
//  · each candidate is measured (contrast-to-noise, length, width and direction from its second moments, place across the
//    bead) — these measurements are what the learning step is trained on;
//  · a continuous line running the whole film (unbroken IP, wagon track) is uniform along the weld and was invisible to
//    the along-weld background; it is now found on the across-weld profile;
//  · films shown as positives (bead darker than the pipe) are handled: «void-like» is defined against the bead's tone.
export const DETECTOR_VERSION = 'cv2.0'
/** measurements of one candidate — the input of the learning step (learn.ts) */
export interface Feat { cnr: number; area: number; len: number; wid: number; elong: number; /** 0 = along the weld … 90 = across */ angle: number; /** 0 … 1 across the bead; outside it below 0 or above 1 */ pos: number; fill: number; voidLike: 0 | 1; lenRel: number; widRel: number; /** runs the whole film */ through: 0 | 1 }
export interface Found { x: number; y: number; w: number; h: number; lengthPx: number; widthPx: number; confidence: number; code: Guess | null; why: string; inBead: boolean; f: Feat }
export interface Analysis { band: (Band & { bright: boolean }) | null; sigma: number; items: Found[]; version: string }

const transpose = (g: Gray): Gray => { const d = new Uint8Array(g.w * g.h); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) d[x * g.h + y] = g.d[y * g.w + x]; return { w: g.h, h: g.w, d } }
const medianOf = (a: Float64Array | number[]) => { const s = Array.from(a).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0 }

/** the bead as a band lighter (film negative) or darker (digital positive) than the pipe beside it */
export function beadBand2(g: Gray): (Band & { bright: boolean }) | null {
  let best: (Band & { bright: boolean }) | null = null
  for (const axis of ['h', 'v'] as const) {
    const L = axis === 'h' ? g.h : g.w, M = axis === 'h' ? g.w : g.h, p = new Float64Array(L)
    for (let i = 0; i < L; i++) { let s = 0; for (let j = 0; j < M; j++) s += axis === 'h' ? g.d[i * g.w + j] : g.d[j * g.w + i]; p[i] = s / M }
    const r = Math.max(2, Math.round(L / 60)), sm = new Float64Array(L)
    for (let i = 0; i < L; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = i + k; if (q >= 0 && q < L) { s += p[q]; c++ } } sm[i] = s / c }
    const a0 = Math.floor(L * 0.1), b0 = Math.ceil(L * 0.9), med = medianOf(sm.slice(a0, b0))
    let hi = -Infinity, hiAt = a0, lo = Infinity, loAt = a0
    for (let i = a0; i < b0; i++) { if (sm[i] > hi) { hi = sm[i]; hiAt = i } if (sm[i] < lo) { lo = sm[i]; loAt = i } }
    for (const bright of [true, false]) {
      const prom = bright ? hi - med : med - lo, at = bright ? hiAt : loAt
      if (prom < 6 || (!bright && prom < (hi - med) * 1.5)) continue
      const cut = bright ? med + prom / 2 : med - prom / 2
      let a = at, b = at
      while (a > 0 && (bright ? sm[a - 1] >= cut : sm[a - 1] <= cut)) a--
      while (b < L - 1 && (bright ? sm[b + 1] >= cut : sm[b + 1] <= cut)) b++
      const share = (b - a + 1) / L
      if (share < 0.05 || share > 0.7) continue
      if (!best || prom > best.strength) best = { axis, from: a, to: b, strength: prom, bright }
    }
  }
  return best
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
const r2 = (x: number) => Math.round(x * 100) / 100

function classify(f: Feat): { code: Guess | null; why: string } {
  if (!f.voidLike) return { code: null, why: 'چگال‌تر از اطراف (نفوذ اضافی، پاشش جوش یا جسم خارجی) — ناپیوستگی حجمی نیست' }
  const along = f.angle < 30, across = f.angle > 55
  if (f.pos < -0.05 || f.pos > 1.05) {
    if (f.elong >= 3 && along && f.pos > -0.3 && f.pos < 1.3) return { code: 'EU', why: 'خط تیره در فلز پایه، چسبیده به لبهٔ گرده — الگوی بریدگی کناره' }
    return { code: null, why: 'بیرون از نوار جوش (نشانهٔ سربی، خراش یا لکهٔ فیلم)' }
  }
  const centre = f.pos > 0.35 && f.pos < 0.65, edge = f.pos < 0.22 || f.pos > 0.78
  if (f.through) return centre ? { code: 'IP', why: 'خط تیرهٔ پیوسته در تمام طول فیلم روی خط مرکز جوش — الگوی نفوذ ناقص ریشهٔ سراسری' } : edge ? { code: 'IF', why: 'خط تیرهٔ پیوسته در تمام طول فیلم کنار لبهٔ جوش — الگوی ذوب ناقص دیواره یا بریدگی کنارهٔ سراسری' } : { code: 'ESI', why: 'خط تیرهٔ پیوسته در تمام طول فیلم بین مرکز و لبه — الگوی خط سرباره (Wagon track)' }
  if (f.elong >= 3 && across) return { code: 'C', why: 'نشانهٔ خطی نازک عمود بر امتداد جوش — احتمال ترک عرضی؛ با بزرگ‌نمایی و نگاتیو بررسی شود' }
  if (centre && f.elong >= 3 && along) return { code: 'IP', why: 'خط تیرهٔ کشیده روی خط مرکز جوش — الگوی نفوذ ناقص ریشه' }
  if (centre && f.elong < 2 && f.widRel > 0.3) return { code: 'BT', why: 'لکهٔ تیرهٔ بزرگ و فشرده روی خط مرکز — الگوی سوختگی؛ تیرگی نسبت به فلز پایه را بررسی کنید' }
  if (edge && f.elong >= 4 && along) return { code: 'IF', why: 'خط تیرهٔ نازک در لبهٔ نوار جوش — الگوی ذوب ناقص یا بریدگی کناره' }
  if (f.elong >= 3 && along) return { code: 'ESI', why: 'نشانهٔ تیرهٔ کشیده بین مرکز و لبه — الگوی آخال سربارهٔ کشیده' }
  if (f.elong < 1.7 && f.widRel < 0.3 && f.fill > 0.55) return { code: 'P', why: 'نقطهٔ تیرهٔ گرد و کوچک — الگوی تخلخل' }
  return { code: 'ISI', why: 'نشانهٔ تیرهٔ فشرده و نامنظم — الگوی آخال منفرد' }
}

/** the whole analysis of one film: bead, noise, measured candidates with a first code and its reason */
export function analyzeFilm(g0: Gray, opt: { max?: number } = {}): Analysis {
  const band0 = beadBand2(g0)
  if (!band0) {
    // no clear bead: the earlier whole-frame search, marked as such
    const items: Found[] = annotate(detectCandidates(g0, { max: opt.max ?? 12 }), null).map((c) => {
      const len = Math.max(c.w, c.h), wid = Math.min(c.w, c.h)
      return { x: c.x, y: c.y, w: c.w, h: c.h, lengthPx: len, widthPx: wid, confidence: r2(c.confidence * 0.6), code: c.code, why: `${c.why} (نوار جوش پیدا نشد؛ جست‌وجو در کل تصویر)`, inBead: true,
        f: { cnr: 0, area: c.areaPx, len, wid, elong: len / Math.max(1, wid), angle: c.w >= c.h ? 0 : 90, pos: 0.5, fill: c.areaPx / Math.max(1, c.w * c.h), voidLike: c.dark ? 1 : 0, lenRel: 0, widRel: 0, through: 0 } }
    })
    return { band: null, sigma: 0, items, version: DETECTOR_VERSION }
  }
  const g = band0.axis === 'v' ? transpose(g0) : g0 // the weld runs along x from here on
  const { w, h } = g, bw = band0.to - band0.from + 1, margin = Math.max(4, Math.round(bw * 0.3))
  const y0 = Math.max(0, band0.from - margin), y1 = Math.min(h - 1, band0.to + margin), rows = y1 - y0 + 1
  const s = gaussian5(g).d
  // background along the weld: running median per row, half the film wide
  const bgR = Math.max(20, Math.round(w / 4)), res = new Float32Array(rows * w), hist = new Uint32Array(256), rowMed = new Float64Array(rows)
  for (let ry = 0; ry < rows; ry++) {
    const o = (y0 + ry) * w; hist.fill(0); let n = 0
    for (let i = 0; i <= Math.min(w - 1, bgR); i++) { hist[s[o + i]]++; n++ }
    for (let x = 0; x < w; x++) {
      if (x > 0) { const add = x + bgR, drop = x - bgR - 1; if (add < w) { hist[s[o + add]]++; n++ } if (drop >= 0) { hist[s[o + drop]]--; n-- } }
      let acc = 0, v = 0; const half = n / 2
      for (; v < 255; v++) { acc += hist[v]; if (acc >= half) break }
      res[ry * w + x] = s[o + x] - v
    }
    const full = new Float64Array(w); for (let x = 0; x < w; x++) full[x] = s[o + x]
    rowMed[ry] = medianOf(full)
  }
  // noise of this film: 1.4826 × median |residual|
  const sample: number[] = []; for (let i = 0; i < res.length; i += 7) sample.push(Math.abs(res[i]))
  const sigma = Math.max(0.6, 1.4826 * medianOf(sample)), thr = Math.max(3.2 * sigma, 2.5)
  const voidSign = band0.bright ? -1 : 1 // a void is darker than a light bead, lighter than a dark one
  let m: Uint8Array = new Uint8Array(rows * w)
  for (let i = 0; i < m.length; i++) m[i] = Math.abs(res[i]) > thr ? 1 : 0
  m = morph(morph(m, w, rows, false), w, rows, true)
  m = morph(morph(m, w, rows, true), w, rows, false)
  const minArea = Math.max(8, Math.round((w / 1200) ** 2 * 14))
  interface Blob { x0: number; y0: number; x1: number; y1: number; area: number; dsum: number; ssum: number; sx: number; sy: number; sxx: number; syy: number; sxy: number }
  const blobs: Blob[] = [], seen = new Uint8Array(rows * w), stack: number[] = []
  for (let st = 0; st < m.length; st++) {
    if (!m[st] || seen[st]) continue
    const b: Blob = { x0: w, y0: rows, x1: 0, y1: 0, area: 0, dsum: 0, ssum: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }
    stack.push(st); seen[st] = 1
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w
      b.area++; b.dsum += Math.abs(res[p]); b.ssum += res[p]; b.sx += x; b.sy += y; b.sxx += x * x; b.syy += y * y; b.sxy += x * y
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= rows) continue; const q = yy * w + xx; if (m[q] && !seen[q]) { seen[q] = 1; stack.push(q) } }
    }
    if (b.area >= minArea && b.x1 - b.x0 + 1 <= w * 0.6) blobs.push(b)
  }
  // fragments of one line (same tone, in line along the weld, a short gap apart) are one indication
  blobs.sort((a, b) => a.x0 - b.x0)
  for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
    const a = blobs[i], b = blobs[j]
    if (Math.sign(a.ssum) !== Math.sign(b.ssum)) continue
    const la = a.x1 - a.x0 + 1, lb = b.x1 - b.x0 + 1, ha = a.y1 - a.y0 + 1, hb = b.y1 - b.y0 + 1
    if (la < ha * 2 && lb < hb * 2) continue // two round spots stay two (pores)
    const gap = b.x0 - a.x1, dy = Math.abs(a.sy / a.area - b.sy / b.area)
    if (gap >= 0 && gap <= 0.6 * Math.max(la, lb) && dy <= Math.max(ha, hb) * 0.8 + 1) {
      blobs[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area, dsum: a.dsum + b.dsum, ssum: a.ssum + b.ssum, sx: a.sx + b.sx, sy: a.sy + b.sy, sxx: a.sxx + b.sxx, syy: a.syy + b.syy, sxy: a.sxy + b.sxy }
      blobs.splice(j, 1); j = i
    }
  }
  const mk = (x: number, y: number, bwid: number, bh: number, f: Feat, conf: number): Found => {
    const c = classify(f), inBead = f.pos >= -0.05 && f.pos <= 1.05
    const k = (inBead ? 1 : 0.5) * (c.code ? 1 : 0.6)
    const box = band0.axis === 'v' ? { x: y, y: x, w: bh, h: bwid } : { x, y, w: bwid, h: bh }
    return { ...box, lengthPx: f.len, widthPx: f.wid, confidence: r2(Math.min(0.97, Math.max(0.05, conf * k))), code: c.code, why: c.why, inBead, f }
  }
  const items: Found[] = []
  for (const b of blobs) {
    const n = b.area, mx = b.sx / n, my = b.sy / n
    const cxx = b.sxx / n - mx * mx + 1 / 12, cyy = b.syy / n - my * my + 1 / 12, cxy = b.sxy / n - mx * my
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, dd = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    const l1 = tr / 2 + dd, l2 = Math.max(1 / 12, tr / 2 - dd)
    const len = Math.max(1, 4 * Math.sqrt(l1)), wid = Math.max(1, 4 * Math.sqrt(l2))
    const ang = Math.abs((Math.atan2(2 * cxy, cxx - cyy) / 2) * 180 / Math.PI) // major axis against x (the weld)
    const cnr = b.dsum / n / sigma
    if (cnr < 4) continue
    const f: Feat = { cnr: r2(cnr), area: n, len: r2(len), wid: r2(wid), elong: r2(len / wid), angle: r2(len / wid < 1.3 ? 0 : ang), pos: r2((y0 + my - band0.from) / Math.max(1, bw - 1)), fill: r2(n / ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1))), voidLike: Math.sign(b.ssum) === voidSign ? 1 : 0, lenRel: r2(len / bw), widRel: r2(wid / bw), through: 0 }
    items.push(mk(b.x0, y0 + b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, f, sigmoid((cnr - 5.5) / 1.3) * (n < minArea * 2 ? 0.8 : 1)))
  }
  // a line that runs the whole film: a narrow valley (or ridge) of the across-weld profile inside the bead
  const pr = Math.max(3, Math.round(bw / 5)), dev = new Float64Array(rows)
  for (let ry = 0; ry < rows; ry++) { const a = Math.max(0, ry - pr), b = Math.min(rows - 1, ry + pr); dev[ry] = (rowMed[ry] - medianOf(rowMed.slice(a, b + 1))) * voidSign }
  const pSig = Math.max(0.8, 1.4826 * medianOf(Array.from(dev, Math.abs))), pThr = Math.max(4 * pSig, 3)
  for (let ry = 0; ry < rows; ry++) {
    if (dev[ry] <= pThr) continue
    let e = ry, peak = dev[ry]; while (e + 1 < rows && dev[e + 1] > pThr) { e++; peak = Math.max(peak, dev[e]) }
    const wid = e - ry + 1, pos = (y0 + (ry + e) / 2 - band0.from) / Math.max(1, bw - 1)
    if (wid <= bw / 4 && pos > 0.08 && pos < 0.92) {
      const f: Feat = { cnr: r2(peak / pSig), area: wid * w, len: w, wid, elong: r2(w / wid), angle: 0, pos: r2(pos), fill: 1, voidLike: 1, lenRel: r2(w / bw), widRel: r2(wid / bw), through: 1 }
      items.push(mk(0, y0 + ry, w, wid, f, sigmoid((peak / pSig - 5) / 1.5) * 0.85))
    }
    ry = e
  }
  // three or more pores close together → cluster porosity
  const pores = items.filter((c) => c.code === 'P')
  for (const p of pores) { const near = pores.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 6 * Math.max(p.w, p.h, 4)); if (near.length >= 3) for (const q of near) { q.code = 'CP'; q.why = 'چند حفرهٔ نزدیک به هم — الگوی تخلخل خوشه‌ای' } }
  items.sort((a, b) => Number(b.inBead) - Number(a.inBead) || b.confidence - a.confidence)
  return { band: band0, sigma: r2(sigma), items: items.slice(0, opt.max ?? 15), version: DETECTOR_VERSION }
}
