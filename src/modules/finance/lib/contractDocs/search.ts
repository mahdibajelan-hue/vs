import { normalizeFa, tokenize } from './text'
import type { Chunk } from './chunk'

/** Local retrieval engine for contract questions: BM25 over clause chunks with Persian normalisation, contract-term synonyms, phrase and heading boosts, and verbatim fact extraction (amounts, durations, percentages). It only quotes the contract — it never writes an answer of its own. */

const GROUPS: string[][] = [
  ['فسخ', 'خاتمه', 'انحلال', 'لغو', 'ابطال', 'فسخ قرارداد', 'خاتمه قرارداد'],
  ['تجهیز کارگاه', 'برپایی کارگاه', 'تجهیز', 'کارگاه', 'استقرار'],
  ['قیمت', 'بها', 'مبلغ', 'هزینه', 'ریال', 'تومان', 'نرخ', 'فی', 'بهای'],
  ['جریمه', 'خسارت', 'وجه التزام', 'خسارت تاخیر', 'تاخیر'],
  ['تضمین', 'ضمانتنامه', 'ضمانت', 'ضمانت نامه', 'حسن انجام کار'],
  ['پیش پرداخت', 'علی الحساب', 'پیشپرداخت', 'مساعده'],
  ['مهلت', 'مدت', 'ظرف', 'موعد', 'زمان', 'تاریخ', 'سررسید'],
  ['صورت وضعیت', 'صورتوضعیت', 'پرداخت', 'تادیه'],
  ['کسور', 'کسر', 'سپرده', 'حسن انجام', 'نگهداری'],
  ['قوه قاهره', 'فورس ماژور', 'حوادث غیرمترقبه'],
  ['حل اختلاف', 'داوری', 'اختلاف', 'دادگاه', 'مرجع رسیدگی'],
  ['بیمه', 'بیمه نامه', 'تامین اجتماعی'],
  ['پیمانکار', 'مجری', 'طرف دوم'],
  ['کارفرما', 'طرف اول', 'مالک'],
  ['تحویل', 'تحویل موقت', 'تحویل قطعی', 'صورتجلسه تحویل'],
  ['تجهیز', 'تجهیزات', 'دستگاه', 'ماشین الات', 'کالا', 'اقلام', 'متریال'],
  ['تغییر', 'الحاقیه', 'تعدیل', 'کار اضافی', 'دستور تغییر'],
  ['تعدیل', 'شاخص', 'افزایش قیمت', 'بازنگری قیمت'],
  ['ناظر', 'مشاور', 'دستگاه نظارت', 'نظارت'],
]
const EXPAND = new Map<string, Set<string>>()
for (const g of GROUPS) {
  const toks = g.map((x) => tokenize(x))
  for (const t of toks) for (const w of t) { const s = EXPAND.get(w) ?? new Set(); for (const o of toks) for (const x of o) if (x !== w) s.add(x); EXPAND.set(w, s) }
}

export interface Hit { chunk: Chunk; docId: string; score: number; matched: string[] }
export interface Index { docs: { docId: string; chunk: Chunk; tf: Map<string, number>; len: number; head: Set<string>; norm: string }[]; df: Map<string, number>; avg: number }

export function buildIndex(items: { docId: string; chunk: Chunk }[]): Index {
  const df = new Map<string, number>()
  let total = 0
  const docs = items.map(({ docId, chunk }) => {
    const toks = tokenize(`${chunk.path} ${chunk.text}`)
    const tf = new Map<string, number>(); for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    total += toks.length
    return { docId, chunk, tf, len: toks.length, head: new Set(tokenize(`${chunk.clauseNo} ${chunk.heading}`)), norm: normalizeFa(chunk.text).toLowerCase() }
  })
  return { docs, df, avg: docs.length ? total / docs.length : 1 }
}

export type Intent = 'duration' | 'amount' | 'percent' | 'none'
export function intentOf(q: string): Intent {
  const n = normalizeFa(q)
  if (/(چند\s*(روز|ماه|هفته|سال)|مهلت|ظرف|مدت|زمان|موعد)/.test(n)) return 'duration'
  if (/(قیمت|مبلغ|بها|هزینه|ریال|تومان|نرخ|چند\s*(ریال|تومان)|چقدر)/.test(n)) return 'amount'
  if (/(درصد|جریمه|خسارت|کسور|پیش\s*پرداخت)/.test(n)) return 'percent'
  return 'none'
}
const RE = {
  duration: /\d[\d,.]*\s*(?:\(?[^\s)]{0,12}\)?\s*)?(?:روز|ماه|هفته|سال|ساعت)(?:\s*(?:کاری|تقویمی|شمسی))?/g,
  amount: /\d[\d,.]*\s*(?:میلیارد|میلیون|هزار)?\s*(?:ریال|تومان|دلار|یورو|درهم)|(?:ریال|تومان|دلار|یورو)\)?\s*[:：]\s*\d[\d,.]*/g,
  percent: /\d+(?:[.,]\d+)?\s*(?:درصد|%|٪)/g,
}

export function search(ix: Index, query: string, k = 8): { hits: Hit[]; terms: string[]; intent: Intent } {
  const q = tokenize(query)
  const intent = intentOf(query)
  if (!q.length || !ix.docs.length) return { hits: [], terms: q, intent }
  const w = new Map<string, number>()
  for (const t of q) w.set(t, Math.max(w.get(t) ?? 0, 1))
  for (const t of q) for (const e of EXPAND.get(t) ?? []) w.set(e, Math.max(w.get(e) ?? 0, 0.45))
  const N = ix.docs.length, k1 = 1.4, b = 0.72
  const phrase = normalizeFa(query).toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter((x) => x.length > 1)
  const bigrams: string[] = []; for (let i = 0; i + 1 < phrase.length; i++) bigrams.push(`${phrase[i]} ${phrase[i + 1]}`)
  const hits: Hit[] = []
  for (const d of ix.docs) {
    let s = 0; const matched: string[] = []
    for (const [t, wt] of w) {
      const f = d.tf.get(t); if (!f) continue
      const idf = Math.log(1 + (N - (ix.df.get(t) ?? 0) + 0.5) / ((ix.df.get(t) ?? 0) + 0.5))
      s += wt * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avg)))
      if (wt === 1) matched.push(t)
      if (d.head.has(t)) s += wt * idf * 0.8
    }
    if (s <= 0) continue
    for (const g of bigrams) if (d.norm.includes(g)) s *= 1.25
    if (intent !== 'none') { const m = d.norm.match(RE[intent]); if (m) s *= 1 + Math.min(0.5, m.length * 0.15) }
    // asking for an amount: table rows carry the figures
    if (intent === 'amount' && d.chunk.kind === 'row') s *= 1.2
    hits.push({ chunk: d.chunk, docId: d.docId, score: s, matched })
  }
  hits.sort((a, c) => c.score - a.score)
  const top = hits.slice(0, k)
  const max = top[0]?.score ?? 1
  return { hits: top.map((h) => ({ ...h, score: h.score / max })), terms: [...new Set(q)], intent }
}

export interface Fact { text: string; value: string; docId: string; chunk: Chunk }
/** Sentences of the best hits that contain a figure of the kind asked for and one of the question's words — quoted as they are written. */
export function extractFacts(hits: Hit[], terms: string[], intent: Intent, limit = 5): Fact[] {
  if (intent === 'none') return []
  const out: Fact[] = []
  for (const h of hits.slice(0, 4)) {
    const sentences = h.chunk.text.split(/(?<=[.؛;!؟?])\s+|\n|\s\|\s/)
    for (const s of sentences) {
      const n = normalizeFa(s)
      const m = n.match(RE[intent])
      if (!m) continue
      const st = new Set(tokenize(s))
      const rel = terms.filter((t) => st.has(t) || (EXPAND.get(t) && [...EXPAND.get(t)!].some((e) => st.has(e)))).length
      if (!rel && h.chunk.kind !== 'row') continue
      out.push({ text: s.trim().slice(0, 400), value: m[0].trim(), docId: h.docId, chunk: h.chunk })
      if (out.length >= limit) return out
    }
  }
  return out
}

/** split text into [text, isMatch] pieces for highlighting */
export function highlight(text: string, terms: string[]): [string, boolean][] {
  if (!terms.length) return [[text, false]]
  const want = new Set([...terms, ...terms.flatMap((t) => [...(EXPAND.get(t) ?? [])].slice(0, 0))])
  const parts: [string, boolean][] = []
  const re = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = m[0]
    const isMatch = /[\p{L}\p{N}]/u.test(w) && tokenize(w).some((t) => want.has(t))
    const last = parts[parts.length - 1]
    if (last && last[1] === isMatch) last[0] += w; else parts.push([w, isMatch])
  }
  return parts
}

export const SUGGESTED = [
  'شرایط و بندهای فسخ قرارداد چیست؟', 'مهلت تجهیز کارگاه چند روز است؟', 'مبلغ قرارداد و نحوهٔ پرداخت چگونه است؟', 'جریمهٔ تأخیر در تحویل چقدر است؟',
  'درصد پیش‌پرداخت و تضمین حسن انجام کار', 'مدت قرارداد و تاریخ تحویل موقت', 'قیمت تجهیزات در جداول پیوست', 'نحوهٔ حل اختلاف و داوری', 'قوهٔ قاهره و حوادث غیرمترقبه', 'تعدیل قیمت و کار اضافی',
]
