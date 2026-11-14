import type { Feat } from './detect'

/**
 * Learning from the interpreters' own decisions — in the browser, on the measured features of each candidate.
 *
 * Every candidate the assistant shows ends as «accepted», «corrected» (real, other code) or «dismissed» (false alarm).
 * From those rows two small models are fitted each time the assistant runs:
 *   · a logistic regression «is this candidate a real indication?» — it re-ranks the candidates and pushes down the
 *     kinds of alarms the interpreters of this organisation keep dismissing;
 *   · a nearest-neighbour vote on the code the interpreters finally gave to similar candidates — it replaces the rule's
 *     guess when the past decisions agree.
 * Both wait for enough decisions (MIN_REAL / MIN_CODE) and say how many they were fitted on. This is not a trained image
 * network: it learns which of the rule-based detector's finds are worth showing. The same table is the labelled set a
 * detection network is trained on later (see the assistant page).
 */
export interface Sample { f: Feat; real: boolean; code: string | null }
export const MIN_REAL = 30, MIN_EACH = 6, MIN_CODE = 20
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const featVec = (f: Feat): number[] => [
  clamp(f.cnr, 0, 40), Math.log(Math.max(1, f.area)), clamp(f.elong, 1, 30), f.angle / 90, clamp(f.pos, -0.5, 1.5), Math.abs(clamp(f.pos, -0.5, 1.5) - 0.5),
  f.fill, f.voidLike, clamp(f.lenRel, 0, 20), clamp(f.widRel, 0, 2), f.through,
]
export interface Model { n: number; real: number; mean: number[]; sd: number[]; w: number[]; b: number; coded: { v: number[]; code: string }[]; /** share of held-out decisions the ranking got right (5-fold) */ cv: number | null }

const standardize = (X: number[][]) => {
  const k = X[0].length, mean = new Array(k).fill(0), sd = new Array(k).fill(0)
  for (const r of X) for (let j = 0; j < k; j++) mean[j] += r[j] / X.length
  for (const r of X) for (let j = 0; j < k; j++) sd[j] += (r[j] - mean[j]) ** 2 / X.length
  for (let j = 0; j < k; j++) sd[j] = Math.sqrt(sd[j]) || 1
  return { mean, sd }
}
const z = (v: number[], mean: number[], sd: number[]) => v.map((x, j) => (x - mean[j]) / sd[j])
function fit(X: number[][], y: number[], iters = 400, lr = 0.3, l2 = 0.02) {
  const k = X[0].length, w = new Array(k).fill(0); let b = 0
  // classes weighted so a few dismissals among many acceptances (or the reverse) still count
  const pos = y.reduce((s, v) => s + v, 0), neg = y.length - pos, wp = y.length / (2 * Math.max(1, pos)), wn = y.length / (2 * Math.max(1, neg))
  for (let it = 0; it < iters; it++) {
    const gw = new Array(k).fill(0); let gb = 0
    for (let i = 0; i < X.length; i++) {
      let t = b; for (let j = 0; j < k; j++) t += w[j] * X[i][j]
      const e = (1 / (1 + Math.exp(-t)) - y[i]) * (y[i] ? wp : wn)
      gb += e; for (let j = 0; j < k; j++) gw[j] += e * X[i][j]
    }
    b -= (lr * gb) / X.length; for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j])
  }
  return { w, b }
}
const prob = (v: number[], w: number[], b: number) => { let t = b; for (let j = 0; j < v.length; j++) t += w[j] * v[j]; return 1 / (1 + Math.exp(-t)) }

/** null until there are enough decisions of both kinds */
export function train(samples: Sample[]): Model | null {
  const real = samples.filter((s) => s.real).length, n = samples.length
  if (n < MIN_REAL || real < MIN_EACH || n - real < MIN_EACH) return null
  const raw = samples.map((s) => featVec(s.f)), { mean, sd } = standardize(raw)
  const X = raw.map((v) => z(v, mean, sd)), y = samples.map((s) => (s.real ? 1 : 0))
  const { w, b } = fit(X, y)
  // 5-fold check (deterministic split): how often the ranking agrees with a decision it did not see
  let ok = 0
  for (let fold = 0; fold < 5; fold++) {
    const tr = X.filter((_, i) => i % 5 !== fold), ty = y.filter((_, i) => i % 5 !== fold)
    if (!ty.some((v) => v) || ty.every((v) => v)) { ok = -1; break }
    const m = fit(tr, ty, 250)
    X.forEach((v, i) => { if (i % 5 === fold && (prob(v, m.w, m.b) >= 0.5 ? 1 : 0) === y[i]) ok++ })
  }
  return { n, real, mean, sd, w, b, cv: ok < 0 ? null : ok / n, coded: samples.map((s, i) => ({ s, v: X[i] })).filter((x) => x.s.real && x.s.code).map((x) => ({ v: x.v, code: x.s.code! })) }
}
export const pReal = (m: Model, f: Feat) => prob(z(featVec(f), m.mean, m.sd), m.w, m.b)
/** the code the interpreters gave to the k most similar real candidates, when at least 60 % of them agree */
export function learnedCode(m: Model, f: Feat, k = 7): { code: string; votes: number; of: number } | null {
  if (m.coded.length < MIN_CODE) return null
  const v = z(featVec(f), m.mean, m.sd)
  const near = m.coded.map((c) => ({ code: c.code, d: c.v.reduce((s, x, j) => s + (x - v[j]) ** 2, 0) })).sort((a, b) => a.d - b.d).slice(0, k)
  const count = new Map<string, number>(); for (const x of near) count.set(x.code, (count.get(x.code) ?? 0) + 1)
  const [code, votes] = [...count].sort((a, b) => b[1] - a[1])[0]
  return votes / near.length >= 0.6 ? { code, votes, of: near.length } : null
}

// ── how the assistant is doing, from the same record ─────────────────────────────────────────────────────────────────
export interface LogRow { action: 'accepted' | 'modified' | 'dismissed' | 'missed'; aiCode: string | null; finalCode: string | null; filmId: string; detector: string }
export interface Report { reviewed: number; accepted: number; modified: number; dismissed: number; missed: number; films: number; /** real among the reviewed candidates */ precision: number | null; /** right code among the real ones */ codeAgreement: number | null; /** found among all real indications (found + missed) */ recall: number | null; byCode: { code: string; shown: number; right: number; other: number; dismissed: number; missed: number }[] }
export function report(rows: LogRow[]): Report {
  const c = (a: LogRow['action']) => rows.filter((r) => r.action === a).length
  const accepted = c('accepted'), modified = c('modified'), dismissed = c('dismissed'), missed = c('missed'), reviewed = accepted + modified + dismissed
  const codes = new Map<string, { shown: number; right: number; other: number; dismissed: number; missed: number }>()
  const at = (k: string) => { let x = codes.get(k); if (!x) { x = { shown: 0, right: 0, other: 0, dismissed: 0, missed: 0 }; codes.set(k, x) } return x }
  for (const r of rows) {
    if (r.action === 'missed') { at(r.finalCode || '—').missed++; continue }
    const x = at(r.aiCode || '—'); x.shown++
    if (r.action === 'accepted') x.right++; else if (r.action === 'modified') x.other++; else x.dismissed++
  }
  return {
    reviewed, accepted, modified, dismissed, missed, films: new Set(rows.map((r) => r.filmId)).size,
    precision: reviewed ? (accepted + modified) / reviewed : null, codeAgreement: accepted + modified ? accepted / (accepted + modified) : null,
    recall: accepted + modified + missed ? (accepted + modified) / (accepted + modified + missed) : null,
    byCode: [...codes].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.shown + b.missed - (a.shown + a.missed)),
  }
}
