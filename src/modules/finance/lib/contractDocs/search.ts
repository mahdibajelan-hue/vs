import { normalizeFa, tokenize, tokenizeAll } from './text'
import { articleOf, type Chunk } from './chunk'

/**
 * Contract question engine. A question is first read as contract CONCEPTS («تعدیل قیمت», «کار اضافی», «فسخ», …), each recognised
 * by its own multi-word phrases — so «تعدیل قیمت و کار اضافی» looks for adjustment clauses and for extra-work clauses, not for every
 * sentence containing «کار» or «قیمت». Words left over are matched with BM25, ignoring words that occur almost everywhere.
 * Answers are always quotations of the contract; nothing is written by the system.
 */
interface Concept { key: string; label: string; triggers: string[]; strong: string[]; weak?: string[] }
export const CONCEPTS: Concept[] = [
  { key: 'adjust', label: 'تعدیل قیمت', triggers: ['تعدیل', 'تعدیل قیمت', 'افزایش قیمت', 'نوسان قیمت', 'تغییر قیمت', 'شاخص قیمت'], strong: ['تعدیل', 'شاخص', 'ضریب تعدیل', 'شاخص های قیمت', 'نوسان قیمت', 'افزایش قیمت'] },
  { key: 'extra', label: 'کار اضافی و تغییر مقادیر', triggers: ['کار اضافی', 'کارهای اضافی', 'اضافه کار', 'مقادیر اضافی', 'افزایش مقادیر', 'کاهش مقادیر', 'تغییر مقادیر', 'تغییر در کار', 'تغییر در کارها', 'تغییرات کار', 'کار جدید', 'کارهای جدید', 'دستور تغییر', 'کار اضافه'], strong: ['کار اضافی', 'کارهای اضافی', 'مقادیر اضافی', 'افزایش مقادیر', 'کاهش مقادیر', 'تغییر مقادیر', 'تغییر در کارها', 'تغییر در کار', 'کار جدید', 'کارهای جدید', 'دستور تغییر', 'بیست و پنج درصد', '25 درصد', 'افزایش یا کاهش'] },
  { key: 'terminate', label: 'فسخ', triggers: ['فسخ'], strong: ['فسخ'] },
  { key: 'end', label: 'خاتمه پیمان', triggers: ['خاتمه', 'انحلال', 'لغو پیمان', 'لغو قرارداد'], strong: ['خاتمه', 'انحلال'] },
  { key: 'suspend', label: 'تعلیق', triggers: ['تعلیق', 'توقف کار', 'تعطیل کار'], strong: ['تعلیق', 'توقف کار', 'تعطیل کار', 'تعطیل موقت'] },
  { key: 'mobil', label: 'تجهیز و برچیدن کارگاه', triggers: ['تجهیز کارگاه', 'برچیدن کارگاه', 'تجهیز و برچیدن', 'تحویل کارگاه', 'تحویل زمین', 'کارگاه'], strong: ['تجهیز کارگاه', 'برچیدن کارگاه', 'تجهیز و برچیدن', 'تحویل کارگاه', 'تحویل زمین'], weak: ['کارگاه'] },
  { key: 'advance', label: 'پیش‌پرداخت', triggers: ['پیش پرداخت', 'مساعده', 'علی الحساب'], strong: ['پیش پرداخت', 'مساعده', 'علی الحساب'] },
  { key: 'guarantee', label: 'تضمین‌ها و ضمانت‌نامه‌ها', triggers: ['تضمین', 'ضمانت', 'ضمانت نامه', 'ضمانتنامه', 'تضامین'], strong: ['تضمین', 'ضمانت نامه', 'ضمانتنامه', 'تضامین', 'تضمین انجام تعهدات'] },
  { key: 'retention', label: 'حسن انجام کار و کسور', triggers: ['حسن انجام کار', 'کسور', 'سپرده', 'آزادسازی'], strong: ['حسن انجام کار', 'کسور', 'سپرده', 'آزاد'] },
  { key: 'delay', label: 'خسارت تأخیر و جریمه', triggers: ['جریمه', 'خسارت تاخیر', 'وجه التزام', 'تاخیر'], strong: ['خسارت تاخیر', 'جریمه', 'وجه التزام', 'تاخیر در'], weak: ['تاخیر', 'خسارت'] },
  { key: 'duration', label: 'مدت پیمان و تمدید', triggers: ['مدت پیمان', 'مدت قرارداد', 'تمدید', 'افزایش مدت', 'مدت اجرا', 'برنامه زمانی'], strong: ['مدت پیمان', 'مدت قرارداد', 'تمدید', 'افزایش مدت', 'مدت اجرا', 'برنامه زمانی'] },
  { key: 'force', label: 'قوهٔ قاهره و حوادث قهری', triggers: ['قوه قاهره', 'حوادث قهری', 'فورس ماژور', 'حوادث غیرمترقبه', 'حوادث غیر مترقبه', 'بلایای طبیعی'], strong: ['قوه قاهره', 'حوادث قهری', 'قهری', 'فورس ماژور', 'غیرمترقبه', 'غیر مترقبه'] },
  { key: 'dispute', label: 'حل اختلاف و داوری', triggers: ['حل اختلاف', 'داوری', 'اختلاف', 'دادگاه', 'مرجع رسیدگی'], strong: ['حل اختلاف', 'داوری', 'اختلاف', 'شورای عالی فنی', 'دادگاه'] },
  { key: 'insurance', label: 'بیمه', triggers: ['بیمه'], strong: ['بیمه'] },
  { key: 'provisional', label: 'تحویل موقت', triggers: ['تحویل موقت'], strong: ['تحویل موقت'] },
  { key: 'final', label: 'تحویل قطعی و دورهٔ تضمین', triggers: ['تحویل قطعی', 'دوره تضمین', 'دوره نگهداری'], strong: ['تحویل قطعی', 'دوره تضمین', 'دوره نگهداری'] },
  { key: 'statement', label: 'صورت‌وضعیت و پرداخت', triggers: ['صورت وضعیت', 'صورتوضعیت', 'صورتحساب', 'پرداخت'], strong: ['صورت وضعیت', 'صورتوضعیت', 'صورتحساب', 'پرداخت'] },
  { key: 'price', label: 'مبلغ پیمان', triggers: ['مبلغ پیمان', 'مبلغ قرارداد', 'مبلغ کل', 'قیمت کل', 'ارزش قرارداد', 'مبلغ'], strong: ['مبلغ پیمان', 'مبلغ قرارداد', 'مبلغ کل', 'قیمت کل', 'مبلغ'] },
  { key: 'unitprice', label: 'قیمت واحد و فهرست بها', triggers: ['قیمت واحد', 'فهرست بها', 'بهای واحد', 'جدول قیمت', 'قیمت تجهیز', 'قیمت'], strong: ['قیمت واحد', 'فهرست بها', 'بهای واحد', 'جدول قیمت', 'قیمت'], weak: ['ریال'] },
  { key: 'consultant', label: 'مشاور و دستگاه نظارت', triggers: ['مشاور', 'دستگاه نظارت', 'ناظر', 'نظارت'], strong: ['مشاور', 'دستگاه نظارت', 'ناظر', 'نظارت'] },
  { key: 'tax', label: 'مالیات، عوارض و گمرک', triggers: ['مالیات', 'عوارض', 'گمرک', 'گمرکی', 'ارزش افزوده'], strong: ['مالیات', 'عوارض', 'گمرک', 'ارزش افزوده'] },
  { key: 'hse', label: 'ایمنی، بهداشت و محیط زیست', triggers: ['ایمنی', 'بهداشت', 'محیط زیست', 'hse'], strong: ['ایمنی', 'بهداشت', 'محیط زیست'] },
  { key: 'subcontract', label: 'واگذاری و پیمانکار جزء', triggers: ['واگذاری', 'پیمانکار جزء', 'پیمانکاران جزء', 'انتقال پیمان'], strong: ['واگذار', 'پیمانکار جزء', 'پیمانکاران جزء', 'انتقال'] },
  { key: 'claim', label: 'ادعا و مطالبه', triggers: ['ادعا', 'کلیم', 'مطالبه'], strong: ['ادعا', 'مطالبه'] },
  { key: 'notice', label: 'اخطار، ابلاغ و اقامتگاه', triggers: ['اخطار', 'ابلاغ', 'اقامتگاه', 'مکاتبات'], strong: ['اخطار', 'ابلاغ', 'اقامتگاه', 'مکاتبات'] },
  { key: 'design', label: 'طراحی و مدارک فنی', triggers: ['طراحی', 'مدارک فنی', 'نقشه'], strong: ['طراحی', 'مدارک فنی', 'نقشه'] },
  { key: 'procure', label: 'تأمین کالا و تجهیزات', triggers: ['تامین کالا', 'خرید کالا', 'تجهیزات', 'مصالح'], strong: ['تامین کالا', 'خرید', 'تجهیزات', 'مصالح'] },
  { key: 'staff', label: 'نیروی انسانی', triggers: ['نیروی انسانی', 'کارکنان', 'پرسنل'], strong: ['نیروی انسانی', 'کارکنان', 'پرسنل'] },
]

/** phrase → space-padded string of light-stemmed words, so «کارهای اضافی» matches «کار اضافی» and phrases only match on whole words */
const phraseKey = (p: string): string => ` ${tokenizeAll(p).join(' ')} `
const CK = CONCEPTS.map((c) => ({ ...c, tk: c.triggers.map(phraseKey).sort((a, b) => b.length - a.length), sk: c.strong.map(phraseKey), wk: (c.weak ?? []).map(phraseKey) }))
export const conceptLabel = (key: string): string => CONCEPTS.find((c) => c.key === key)?.label ?? key

export interface Hit { chunk: Chunk; docId: string; score: number; concepts: string[]; matched: string[] }
interface Doc { docId: string; chunk: Chunk; tf: Map<string, number>; len: number; head: string; body: string; norm: string }
export interface Index { docs: Doc[]; df: Map<string, number>; avg: number }

export function buildIndex(items: { docId: string; chunk: Chunk }[]): Index {
  const df = new Map<string, number>()
  let total = 0
  const docs = items.map(({ docId, chunk }): Doc => {
    const toks = tokenize(`${chunk.path} ${chunk.text}`)
    const tf = new Map<string, number>(); for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    total += toks.length
    return { docId, chunk, tf, len: toks.length, head: ` ${tokenizeAll(`${chunk.path} ${chunk.heading}`).join(' ')} `, body: ` ${tokenizeAll(chunk.text).join(' ')} `, norm: normalizeFa(chunk.text).toLowerCase() }
  })
  return { docs, df, avg: docs.length ? total / docs.length : 1 }
}

/** concepts named in the question (longest phrase first, each word used once) and the words left over */
export function readQuery(q: string): { concepts: string[]; rest: string[] } {
  let s = ` ${tokenizeAll(q).join(' ')} `
  const found: { key: string; at: number }[] = []
  // collect every trigger occurrence, longest phrases first, and blank it out so «قیمت» inside «تعدیل قیمت» is not read twice
  const all = CK.flatMap((c) => c.tk.map((k) => ({ key: c.key, k }))).sort((a, b) => b.k.length - a.k.length)
  for (const { key, k } of all) {
    const at = s.indexOf(k)
    if (at < 0) continue
    if (!found.some((f) => f.key === key)) found.push({ key, at })
    s = s.slice(0, at) + ' ' + ' '.repeat(k.length - 2) + ' ' + s.slice(at + k.length)
  }
  found.sort((a, b) => a.at - b.at)
  const rest = tokenize(s)
  return { concepts: found.map((f) => f.key), rest }
}

const count = (hay: string, needle: string): number => { let n = 0, i = hay.indexOf(needle); while (i >= 0) { n++; i = hay.indexOf(needle, i + needle.length - 1) } return n }

function conceptScore(d: Doc, key: string): number {
  const c = CK.find((x) => x.key === key)!
  let s = 0
  for (const k of c.sk) { const inBody = count(d.body, k), inHead = count(d.head, k); s += Math.log2(1 + inBody) * 1 + (inHead ? 2.5 : 0) }
  for (const k of c.wk) s += Math.log2(1 + count(d.body, k)) * 0.25
  return s
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
  percent: /\d+(?:[.,]\d+)?\s*(?:درصد|%|٪)|(?:بیست و پنج|ده|پنج|پانزده|بیست|سی|پنجاه)\s*درصد/g,
}

export interface Group { title: string; concepts: string[]; hits: Hit[] }
export interface Result { concepts: string[]; terms: string[]; highlight: string[]; intent: Intent; groups: Group[]; hits: Hit[] }

export function search(ix: Index, query: string, k = 6): Result {
  const { concepts, rest } = readQuery(query)
  const intent = intentOf(query)
  const highlight = [...new Set([...concepts.flatMap((key) => CONCEPTS.find((c) => c.key === key)!.strong), ...rest])]
  const N = ix.docs.length
  if (!N || (!concepts.length && !rest.length)) return { concepts, terms: rest, highlight, intent, groups: [], hits: [] }
  // a word found in more than a third of the clauses says nothing about where the answer is
  const restUseful = rest.filter((t) => (ix.df.get(t) ?? 0) / N <= 0.34 || concepts.length === 0 && rest.length <= 1)
  const k1 = 1.4, b = 0.72
  const bm25 = (d: Doc): { s: number; m: string[] } => {
    let s = 0; const m: string[] = []
    for (const t of restUseful) {
      const f = d.tf.get(t); if (!f) continue
      const df = ix.df.get(t) ?? 0, idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avg))); m.push(t)
    }
    return { s, m }
  }
  // rare words of the question (a piece of equipment, a name) must be in the answer when the contract has them anywhere
  const required = restUseful.filter((t) => { const df = ix.df.get(t) ?? 0; return df > 0 && df / N <= 0.12 })
  const scored = ix.docs.map((d) => {
    const per = new Map<string, number>()
    for (const c of concepts) { const v = conceptScore(d, c); if (v > 0) per.set(c, v) }
    const r = bm25(d)
    let s = [...per.values()].reduce((a, v) => a + v, 0) * 3 + r.s
    if (intent !== 'none' && d.norm.match(RE[intent])) s *= 1.15
    if (intent === 'amount' && d.chunk.kind === 'row') s *= 1.15
    // a question about concepts needs at least one of them in the clause; free words alone are not enough
    if (concepts.length && per.size === 0) s = r.m.length >= Math.max(2, restUseful.length) ? r.s * 0.5 : 0
    if (required.length) { const have = required.filter((t) => d.tf.has(t)).length; s *= have ? 0.4 + 0.6 * (have / required.length) + have : 0.15 }
    return { d, s, per, m: r.m }
  }).filter((x) => x.s > 0)
  const toHit = (x: (typeof scored)[number], max: number): Hit => ({ chunk: x.d.chunk, docId: x.d.docId, score: x.s / max, concepts: [...x.per.keys()], matched: x.m })
  const groups: Group[] = []
  const used = new Set<Doc>()
  if (concepts.length > 1) {
    const both = scored.filter((x) => x.per.size >= 2).sort((a, c) => c.per.size - a.per.size || c.s - a.s).slice(0, k)
    if (both.length) { const max = both[0].s; groups.push({ title: `بندهای مربوط به ${concepts.map(conceptLabel).join(' و ')}`, concepts, hits: both.map((x) => toHit(x, max)) }); both.forEach((x) => used.add(x.d)) }
    for (const c of concepts) {
      const list = scored.filter((x) => x.per.has(c) && !used.has(x.d)).sort((a, z) => (z.per.get(c)! - a.per.get(c)!) || z.s - a.s).slice(0, k)
      if (!list.length) { groups.push({ title: conceptLabel(c), concepts: [c], hits: [] }); continue }
      const max = list[0].per.get(c)!
      groups.push({ title: conceptLabel(c), concepts: [c], hits: list.map((x) => ({ ...toHit(x, 1), score: x.per.get(c)! / max })) })
      list.forEach((x) => used.add(x.d))
    }
  } else {
    const list = scored.sort((a, c) => c.s - a.s).slice(0, k + 2)
    if (list.length) groups.push({ title: concepts.length ? conceptLabel(concepts[0]) : 'نتایج', concepts, hits: list.map((x) => toHit(x, list[0].s)) })
  }
  return { concepts, terms: restUseful, highlight, intent, groups, hits: groups.flatMap((g) => g.hits) }
}

export interface Fact { text: string; value: string; docId: string; chunk: Chunk }
/** Sentences of the best clauses that contain a figure of the kind asked for and the subject of the question — quoted as written. */
export function extractFacts(r: Result, limit = 5): Fact[] {
  if (r.intent === 'none') return []
  const keys = r.highlight.map(phraseKey)
  const out: Fact[] = []
  for (const h of r.hits.slice(0, 6)) {
    for (const s of h.chunk.text.split(/(?<=[.؛;!؟?])\s+|\n|\s\|\s/)) {
      const m = normalizeFa(s).match(RE[r.intent]); if (!m) continue
      const body = ` ${tokenizeAll(s).join(' ')} `
      if (h.chunk.kind !== 'row' && !keys.some((k) => body.includes(k))) continue
      out.push({ text: s.trim().slice(0, 500), value: m[0].trim(), docId: h.docId, chunk: h.chunk })
      if (out.length >= limit) return out
    }
  }
  return out
}

/** split text into [text, isMatch] pieces for highlighting the question's phrases and words */
export function highlight(text: string, words: string[]): [string, boolean][] {
  const keys = words.map(phraseKey).filter((k) => k.trim())
  if (!keys.length) return [[text, false]]
  // work on word tokens of the original text and mark runs that form one of the phrases
  const toks = [...text.matchAll(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu)].map((m) => m[0])
  const isWord = toks.map((t) => /[\p{L}\p{N}]/u.test(t))
  const stems = toks.map((t, i) => (isWord[i] ? tokenizeAll(t).join(' ') : ''))
  const mark = new Array<boolean>(toks.length).fill(false)
  const wordIdx = toks.map((_, i) => i).filter((i) => isWord[i])
  for (const k of keys) {
    const ph = k.trim().split(' ')
    for (let w = 0; w + ph.length <= wordIdx.length; w++) {
      let ok = true
      for (let j = 0; j < ph.length && ok; j++) ok = stems[wordIdx[w + j]] === ph[j]
      if (ok) for (let j = wordIdx[w]; j <= wordIdx[w + ph.length - 1]; j++) mark[j] = true
    }
  }
  const parts: [string, boolean][] = []
  toks.forEach((t, i) => { const last = parts[parts.length - 1]; if (last && last[1] === mark[i]) last[0] += t; else parts.push([t, mark[i]]) })
  return parts
}

export { articleOf }

export const SUGGESTED = [
  'تعدیل قیمت و کار اضافی', 'شرایط فسخ پیمان', 'مهلت تجهیز کارگاه', 'خسارت تأخیر چقدر است؟', 'درصد پیش‌پرداخت و تضمین آن',
  'مدت پیمان و تمدید آن', 'تحویل موقت و قطعی', 'قوهٔ قاهره', 'حل اختلاف و داوری', 'بیمه‌ها', 'صورت‌وضعیت و پرداخت',
]
