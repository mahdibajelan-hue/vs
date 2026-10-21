import JSZip from 'jszip'

/**
 * A Word document reduced to what a contract search needs: paragraphs (style, list numbering) and tables as rows of cell texts.
 * A streaming walk over the XML (no DOM, so it also runs in the unit tests) that copes with what real contracts contain:
 * empty / self-closing paragraphs, text boxes, content controls, alternate content (read once), nested tables, tables of
 * contents (skipped — they only repeat the headings), and «altChunk» parts (documents pasted in as embedded .docx / HTML / text).
 */
export type DocBlock =
  | { type: 'p'; text: string; style: string; list?: string }
  | { type: 'table'; rows: string[][] }

export interface ParseReport { paragraphs: number; tables: number; tocSkipped: number; embedded: number; chars: number }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌' }
export const decodeXml = (s: string): string => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return ENT[e] ?? m
})
const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*"([^"]*)"`).exec(attrs) ?? new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*'([^']*)'`).exec(attrs)
  return m ? m[1] : null
}
const clean = (s: string): string => s.replace(/[  ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim()
/** a table-of-contents line: the heading text followed by leader dots / a tab and a page number */
const TOC_LINE = /(\.{3,}|…{2,}|\t)\s*[\d۰-۹]{1,4}\s*$/

interface Para { text: string; style: string; numId: string | null; ilvl: number; toc: boolean }
interface Table { rows: string[][]; row: string[] | null; cell: string[] | null }

/** Parses one WordprocessingML part (document.xml or an embedded docx's). `alt` receives embedded-part ids in order. */
export function parseWordXml(xml: string, opts: { onAltChunk?: (rid: string) => void; report?: ParseReport } = {}): (DocBlock | { type: 'alt'; rid: string })[] {
  const out: (DocBlock | { type: 'alt'; rid: string })[] = []
  const rep = opts.report
  const paras: Para[] = []
  const tables: Table[] = []
  const counters = new Map<string, number[]>()
  let inText = false, inFallback = 0, sdtTocDepth = 0
  const sdtStack: boolean[] = []
  const nextNumber = (id: string, lvl: number): string => {
    const c = counters.get(id) ?? []
    c.length = lvl + 1
    for (let i = 0; i <= lvl; i++) c[i] = c[i] ?? (i < lvl ? 1 : 0)
    c[lvl] += 1
    counters.set(id, c)
    return c.slice(0, lvl + 1).join('.')
  }
  const emitText = (text: string, p: Para) => {
    const t = clean(text.replace(/\t/g, ' '))
    if (!t) return
    const cell = tables.length ? tables[tables.length - 1].cell : null
    if (cell) { cell.push(t); return }
    if (p.toc || sdtTocDepth > 0 || /^toc\s*\d|^تیتر فهرست|^فهرست مطالب\s*\d/i.test(p.style) || TOC_LINE.test(text.trim())) { if (rep) rep.tocSkipped++; return }
    out.push({ type: 'p', text: t, style: p.style, list: p.numId ? nextNumber(p.numId, p.ilvl) : undefined })
    if (rep) { rep.paragraphs++; rep.chars += t.length }
  }
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const [, close, name, attrs = '', selfClose, cdata, text] = m
    if (text !== undefined || cdata !== undefined) {
      if (inText && !inFallback && paras.length) paras[paras.length - 1].text += decodeXml(text ?? cdata ?? '')
      continue
    }
    if (!name) continue
    // alternate content: read the modern choice, skip the fallback copy of the same text
    if (name === 'mc:Fallback') { if (close) inFallback = Math.max(0, inFallback - 1); else if (!selfClose) inFallback++; continue }
    if (inFallback) continue
    if (close) {
      switch (name) {
        case 'w:t': inText = false; break
        case 'w:p': { const p = paras.pop(); if (p) emitText(p.text, p); break }
        case 'w:tc': { const t = tables[tables.length - 1]; if (t?.cell && t.row) { t.row.push(t.cell.join(' ')); t.cell = null } break }
        case 'w:tr': { const t = tables[tables.length - 1]; if (t?.row) { if (t.row.some(Boolean)) t.rows.push(t.row); t.row = null } break }
        case 'w:tbl': {
          const t = tables.pop()
          if (!t || !t.rows.length) break
          const parent = tables[tables.length - 1]
          if (parent?.cell) parent.cell.push(t.rows.map((r) => r.filter(Boolean).join(' | ')).join(' ؛ '))
          else { out.push({ type: 'table', rows: t.rows }); if (rep) { rep.tables++; rep.chars += t.rows.flat().join(' ').length } }
          break
        }
        case 'w:sdt': { const toc = sdtStack.pop(); if (toc) sdtTocDepth--; break }
      }
      continue
    }
    switch (name) {
      case 'w:p': if (!selfClose) paras.push({ text: '', style: '', numId: null, ilvl: 0, toc: false }); break
      case 'w:t': if (!selfClose) inText = true; break
      case 'w:tab': case 'w:ptab': if (paras.length) paras[paras.length - 1].text += '\t'; break
      case 'w:br': case 'w:cr': if (paras.length) paras[paras.length - 1].text += '\n'; break
      case 'w:noBreakHyphen': case 'w:softHyphen': if (paras.length) paras[paras.length - 1].text += '-'; break
      case 'w:sym': { const c = attr(attrs, 'w:char'); if (c && paras.length) { const n = parseInt(c, 16); if (n >= 0x20 && n < 0xf000) paras[paras.length - 1].text += String.fromCharCode(n) } break }
      case 'w:pStyle': if (paras.length) paras[paras.length - 1].style = attr(attrs, 'w:val') ?? ''; break
      case 'w:numId': if (paras.length) { const v = attr(attrs, 'w:val'); paras[paras.length - 1].numId = v && v !== '0' ? v : null } break
      case 'w:ilvl': if (paras.length) paras[paras.length - 1].ilvl = Number(attr(attrs, 'w:val') ?? 0) || 0; break
      case 'w:tbl': if (!selfClose) tables.push({ rows: [], row: null, cell: null }); break
      case 'w:tr': if (!selfClose && tables.length) tables[tables.length - 1].row = []; break
      case 'w:tc': if (!selfClose && tables.length) tables[tables.length - 1].cell = []; break
      case 'w:sdt': if (!selfClose) sdtStack.push(false); break
      case 'w:docPartGallery': {
        const v = attr(attrs, 'w:val') ?? ''
        if (/table of contents/i.test(v) && sdtStack.length && !sdtStack[sdtStack.length - 1]) { sdtStack[sdtStack.length - 1] = true; sdtTocDepth++ }
        break
      }
      case 'w:altChunk': { const rid = attr(attrs, 'r:id'); if (rid) { out.push({ type: 'alt', rid }); opts.onAltChunk?.(rid); if (rep) rep.embedded++ } break }
    }
  }
  return out
}

/** paragraphs of an HTML / MHT part (an altChunk pasted from a web page or another editor) */
export function htmlToBlocks(html: string): DocBlock[] {
  let h = html
  // MHT: quoted-printable body
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(h)) h = h.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x: string) => String.fromCharCode(parseInt(x, 16)))
  try { const bytes = Uint8Array.from(h, (c) => c.charCodeAt(0) & 255); if (/[À-ÿ][\u0080-¿]/.test(h)) h = new TextDecoder('utf-8').decode(bytes) } catch { /* keep as is */ }
  h = h.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
  const blocks: DocBlock[] = []
  for (const tb of h.split(/(<table[\s\S]*?<\/table>)/i)) {
    if (/^<table/i.test(tb)) {
      const rows = [...tb.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => clean(decodeXml(c[1].replace(/<[^>]+>/g, ' ')))))
      if (rows.length) blocks.push({ type: 'table', rows: rows.filter((r) => r.some(Boolean)) })
      continue
    }
    for (const part of tb.split(/<\/(?:p|div|h[1-6]|li)>|<br\s*\/?>/i)) {
      const t = clean(decodeXml(part.replace(/<[^>]+>/g, ' ')))
      const style = /<h([1-6])/i.exec(part) ? `heading${/<h([1-6])/i.exec(part)![1]}` : ''
      if (t && !TOC_LINE.test(t)) blocks.push({ type: 'p', text: t, style })
    }
  }
  return blocks
}

const relsOf = (xml: string): Map<string, string> => {
  const m = new Map<string, string>()
  for (const r of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) { const id = attr(r[1], 'Id'), t = attr(r[1], 'Target'); if (id && t) m.set(id, t) }
  return m
}

export async function parseDocx(data: ArrayBuffer | Uint8Array, report: ParseReport = { paragraphs: 0, tables: 0, tocSkipped: 0, embedded: 0, chars: 0 }, depth = 0): Promise<DocBlock[]> {
  const zip = await JSZip.loadAsync(data)
  const f = zip.file('word/document.xml')
  if (!f) throw new Error('not_docx')
  const xml = await f.async('string')
  const raw = parseWordXml(xml, { report })
  if (!raw.some((b) => b.type === 'alt')) return raw as DocBlock[]
  const rels = relsOf((await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '')
  const out: DocBlock[] = []
  for (const b of raw) {
    if (b.type !== 'alt') { out.push(b); continue }
    const target = rels.get(b.rid); if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `word/${target}`
    const part = zip.file(path); if (!part) continue
    if (/\.docx$/i.test(path) && depth < 3) out.push(...(await parseDocx(await part.async('uint8array'), report, depth + 1)))
    else if (/\.(x?html?|mht|mhtml)$/i.test(path)) { const bl = htmlToBlocks(await part.async('string')); out.push(...bl); report.paragraphs += bl.length }
    else if (/\.txt$/i.test(path)) out.push(...(await part.async('string')).split(/\r?\n/).map((t) => clean(t)).filter(Boolean).map((text): DocBlock => ({ type: 'p', text, style: '' })))
  }
  return out
}
