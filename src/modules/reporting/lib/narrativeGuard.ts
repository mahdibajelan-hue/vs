/**
 * Guard for the optional machine phrasing of an evidence report (council phase 3).
 *
 * The model only rephrases: its input is the report's own items (id + text), its output sentences must each cite the
 * ids they rest on. A sentence is rejected — and never shown — when it:
 *  - cites no id, or an id that is not in the report
 *  - contains a number that does not appear in the cited items
 *  - uses certainty words the evidence cannot carry (قطعاً، حتماً، تضمین، بدون شک، ۱۰۰٪ …)
 *  - is longer than 320 characters
 * The engine's own text always stays on the page next to the accepted sentences.
 */
import type { EvidenceReport } from './evidenceReport'

export interface NarrativeItem { id: string; text: string }
export interface NarrativeSentence { text: string; refs: string[] }
export interface GuardResult { accepted: NarrativeSentence[]; rejected: { sentence: NarrativeSentence; reason: string }[] }

const OVERCLAIM = /(قطعاً|قطعا|حتماً|حتما|تضمین|بدون شک|بی‌تردید|بی تردید|یقیناً|اثبات شده|ثابت شده)/

/** the items the model may phrase, with stable ids */
export function narrativeItems(r: EvidenceReport): NarrativeItem[] {
  const ev = (l: { source: string; ref?: string; value?: string }[]) => l.map((e) => [e.ref, e.value].filter(Boolean).join(' ')).join(' · ')
  return [
    ...r.findings.filter((f) => f.materiality !== 'ok').map((f) => ({ id: f.id, text: `${f.title}: ${f.statement} [${ev(f.evidence)}]` })),
    ...r.causes.map((c, i) => ({ id: `c-${i}`, text: `${c.strength === 'direct' ? 'علت مستقیم' : 'شاهد مرتبط'}: ${c.text}` })),
    ...r.projections.map((p) => ({ id: p.id, text: `${p.label}: ${p.value} (روش: ${p.method}؛ فرض: ${p.assumption}؛ اطمینان ${p.confidence})` })),
    ...r.recommendations.map((x) => ({ id: x.id, text: `اقدام: ${x.text}` })),
    ...r.decisions.map((d) => ({ id: d.id, text: `تصمیم لازم (${d.level}): ${d.title}${d.overdue ? ' — موعد گذشته' : ''}` })),
  ]
}

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }
/** Persian / Arabic digits → Latin, Persian decimal / thousands separators removed */
export function normaliseDigits(s: string) {
  return s.replace(/[۰-۹٠-٩]/g, (c) => DIGITS[c]).replace(/٫/g, '.').replace(/[٬,](?=\d{3})/g, '')
}
export function numbersIn(s: string): string[] {
  return (normaliseDigits(s).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
}

export function guardNarrative(sentences: NarrativeSentence[], items: NarrativeItem[]): GuardResult {
  const byId = new Map(items.map((i) => [i.id, i]))
  const out: GuardResult = { accepted: [], rejected: [] }
  for (const s of sentences) {
    const text = (s.text ?? '').trim()
    const refs = Array.isArray(s.refs) ? s.refs.filter((x) => typeof x === 'string') : []
    const reject = (reason: string) => out.rejected.push({ sentence: { text, refs }, reason })
    if (!text) continue
    if (text.length > 320) { reject('بیش از حد طولانی'); continue }
    if (!refs.length) { reject('به هیچ یافته‌ای ارجاع نمی‌دهد'); continue }
    const unknown = refs.filter((id) => !byId.has(id))
    if (unknown.length) { reject(`ارجاع به شناسهٔ ناموجود: ${unknown.join('، ')}`); continue }
    if (OVERCLAIM.test(text)) { reject('ادعای قطعیتی که شواهد پشتیبانی نمی‌کند'); continue }
    const pool = new Set(refs.flatMap((id) => numbersIn(byId.get(id)!.text)))
    const stray = numbersIn(text).filter((n) => !pool.has(n))
    if (stray.length) { reject(`عدد بدون پشتوانه در یافته‌های ارجاع‌شده: ${stray.join('، ')}`); continue }
    out.accepted.push({ text, refs })
  }
  return out
}
