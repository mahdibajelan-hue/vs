import type { DocBlock } from './docx'
import { normalizeFa } from './text'

export interface Chunk {
  ord: number
  /** «ماده ۱۲» / «12-3» / '' — the clause number as written in the contract */
  clauseNo: string
  /** title of the clause (first heading line) */
  heading: string
  /** breadcrumb of the headings above, e.g. «ماده ۱۲ › 12-3» */
  path: string
  text: string
  kind: 'clause' | 'row'
}

const MAX = 1100
const ART = /^(?:ماده|article)\s*(\d+(?:[-–.]\d+)*|واحده)\s*[-–:.)]*\s*(.*)$/i
const NUM = /^(\d+(?:[-–.]\d+)+|\d{1,3})\s*[-–.):]\s*(\S.*)$/
const SUB = /^(?:بند|تبصره|الف|ب|ج|د)\s*(\d*)\s*[-–:.)]\s*(.*)$/

interface Head { level: number; no: string; title: string }
function headOf(b: Extract<DocBlock, { type: 'p' }>): Head | null {
  const t = normalizeFa(b.text).replace(/\n/g, ' ').trim()
  const hs = /^heading\s*(\d)|^عنوان\s*(\d)|^title$/i.exec(b.style)
  const a = ART.exec(t)
  if (a) return { level: 1, no: `ماده ${a[1]}`, title: a[2] || '' }
  if (hs && t.length <= 160) return { level: Number(hs[1] ?? hs[2] ?? 1), no: '', title: t }
  const n = NUM.exec(t)
  if (n && /[-–.]/.test(n[1])) return { level: Math.min(4, n[1].split(/[-–.]/).length + 1), no: n[1], title: n[2].length <= 140 ? n[2] : n[2].slice(0, 80) }
  if (b.list && t.length <= 140) return { level: Math.min(4, b.list.split('.').length + 1), no: b.list, title: t }
  if (n && t.length <= 140) return { level: 2, no: n[1], title: n[2] }
  const s = SUB.exec(t)
  if (s && t.length <= 100) return { level: 3, no: s[1] ? `بند ${s[1]}` : '', title: s[2] }
  return null
}

const numeric = (c: string): boolean => /^[\d\s.,٫٬/%-]+$/.test(normalizeFa(c))

/** Splits a parsed contract into searchable chunks: one per clause (long ones cut at paragraph boundaries), plus one per table row with its column titles, so «price of an item» finds the row. */
export function buildChunks(blocks: DocBlock[]): Chunk[] {
  const out: Chunk[] = []
  const stack: Head[] = []
  let cur: { head: Head | null; parts: string[] } = { head: null, parts: [] }
  const crumb = (): string => stack.map((h) => [h.no, h.title].filter(Boolean).join(' ')).filter(Boolean).join(' › ')
  const flush = () => {
    const h = cur.head
    let buf = ''
    const emit = () => {
      const text = buf.trim()
      if (text) out.push({ ord: out.length, clauseNo: h?.no ?? '', heading: h?.title ?? '', path: crumb(), text, kind: 'clause' })
      buf = ''
    }
    for (const p of cur.parts) {
      if (buf && buf.length + p.length > MAX) emit()
      if (p.length > MAX) { for (const s of p.split(/(?<=[.؛;!؟?])\s+/)) { if (buf && buf.length + s.length > MAX) emit(); buf += (buf ? ' ' : '') + s } } else buf += (buf ? '\n' : '') + p
    }
    emit()
    cur = { head: h, parts: [] }
  }
  for (const b of blocks) {
    if (b.type === 'p') {
      const h = headOf(b)
      if (h) {
        flush()
        while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
        stack.push(h)
        cur = { head: h, parts: [] }
        // a numbered line that is a whole sentence is clause text as well as a heading
        if (h.title.length > 60 || !ART.test(normalizeFa(b.text))) cur.parts.push(b.text.replace(/\n/g, ' '))
      } else cur.parts.push(b.text.replace(/\n/g, ' '))
    } else {
      flush()
      const header = b.rows.length > 1 && b.rows[0].every((c) => c && !numeric(c)) ? b.rows[0] : null
      const rows = header ? b.rows.slice(1) : b.rows
      for (const r of rows) {
        const text = header ? r.map((c, i) => (c ? `${header[i] ?? `ستون ${i + 1}`}: ${c}` : '')).filter(Boolean).join(' | ') : r.filter(Boolean).join(' : ')
        if (text) out.push({ ord: out.length, clauseNo: cur.head?.no ?? '', heading: cur.head?.title ?? '', path: crumb(), text, kind: 'row' })
      }
    }
  }
  flush()
  return out.map((c, i) => ({ ...c, ord: i }))
}
