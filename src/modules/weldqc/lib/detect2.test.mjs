import assert from 'node:assert/strict'
import { analyzeFilm, beadBand2 } from './detect.ts'

let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 6
/** a film: pipe 70, bead `bead` between rows 100 and 160, grain noise */
const film = (W, H, bead = 180, pipe = 70) => { const g = { w: W, h: H, d: new Uint8Array(W * H) }; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.d[y * W + x] = Math.max(0, Math.min(255, Math.round((y >= 100 && y < 160 ? bead : pipe) + gauss()))); return g }
const line = (g, x0, x1, y, t, v) => { for (let x = x0; x < x1; x++) for (let yy = y; yy < y + t; yy++) g.d[yy * g.w + x] = v }
const dot = (g, cx, cy, r, v) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g.d[y * g.w + x] = v }
const codes = (a) => a.items.map((i) => i.code)

// a clean film: grain only → nothing to show (the first version always returned its top 25)
const clean = analyzeFilm(film(600, 260))
assert.ok(clean.band && clean.band.axis === 'h' && clean.band.bright)
assert.equal(clean.items.length, 0, JSON.stringify(clean.items.map((i) => [i.code, i.f.cnr])))

// root line on the centreline, a pore near the edge, a slag line off-centre, lead letters outside the bead
const g = film(600, 260)
line(g, 150, 260, 129, 3, 120) // IP
dot(g, 420, 112, 3, 110) // P
line(g, 300, 360, 143, 4, 125) // ESI
for (let k = 0; k < 4; k++) dot(g, 100 + k * 30, 30, 6, 250) // letters, far from the bead
const a = analyzeFilm(g)
assert.ok(codes(a).includes('IP') && codes(a).includes('P') && codes(a).includes('ESI'), JSON.stringify(a.items.map((i) => [i.code, i.x, i.y, i.w, i.h, i.f.cnr])))
assert.ok(a.items.length <= 4, `too many: ${a.items.length}`)
const ip = a.items.find((i) => i.code === 'IP'); assert.ok(ip.f.pos > 0.4 && ip.f.pos < 0.6 && ip.f.elong > 5 && ip.f.angle < 10 && ip.x >= 145 && ip.x <= 155)
assert.ok(a.items.every((i) => i.y > 60)) // the letters are not candidates

// a dashed root line is one indication, not four
const d = film(600, 260); for (let k = 0; k < 4; k++) line(d, 120 + k * 50, 155 + k * 50, 129, 3, 120)
const da = analyzeFilm(d); assert.equal(da.items.filter((i) => i.code === 'IP').length, 1, JSON.stringify(da.items.map((i) => [i.code, i.x, i.w])))

// an unbroken root line along the whole film: found on the across-weld profile
const t = film(600, 260); line(t, 0, 600, 129, 3, 150)
const ta = analyzeFilm(t); const th = ta.items.find((i) => i.f.through); assert.ok(th && th.code === 'IP' && th.w === 600, JSON.stringify(ta.items.map((i) => [i.code, i.f.through, i.y])))

// a transverse hairline → crack warning
const c = film(600, 260); for (let y = 108; y < 150; y++) { c.d[y * 600 + 300] = 100; c.d[y * 600 + 301] = 100; c.d[y * 600 + 302] = 100 }
assert.ok(codes(analyzeFilm(c)).includes('C'), JSON.stringify(analyzeFilm(c).items.map((i) => [i.code, i.f.angle, i.f.elong])))

// a positive image (bead darker than the pipe): a void is lighter; a denser spot gets no code
const p = film(600, 260, 70, 180); line(p, 150, 260, 129, 3, 130); dot(p, 420, 130, 4, 20)
const pa = analyzeFilm(p)
assert.equal(beadBand2(p).bright, false)
assert.ok(codes(pa).includes('IP'), JSON.stringify(pa.items.map((i) => [i.code, i.f.voidLike])))
assert.ok(pa.items.some((i) => i.code === null && !i.f.voidLike))

// a vertical weld: same result, boxes in the film's own coordinates
const v = { w: 260, h: 600, d: new Uint8Array(260 * 600) }; for (let y = 0; y < 260; y++) for (let x = 0; x < 600; x++) v.d[x * 260 + y] = g.d[y * 600 + x]
const va = analyzeFilm(v); const vip = va.items.find((i) => i.code === 'IP')
assert.ok(va.band.axis === 'v' && vip && vip.h > vip.w && vip.y >= 145 && vip.y <= 155, JSON.stringify(va.items.map((i) => [i.code, i.x, i.y, i.w, i.h])))
console.log('detector v2: ok')
