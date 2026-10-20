import JSZip from 'jszip'

/** A Word document reduced to what a contract search needs: paragraphs (with heading level / list numbering) and tables as rows of cell texts. No DOM needed, so it also runs in the unit tests. */
export type DocBlock =
  | { type: 'p'; text: string; style: string; list?: string }
  | { type: 'table'; rows: string[][] }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string): string => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return ENT[e] ?? m
})

/** index just after the matching closing tag of the element opened at `start` (handles nesting of the same tag) */
function endOf(xml: string, start: number, tag: string): number {
  const open = new RegExp(`<${tag}[ >/]`, 'g'), close = `</${tag}>`
  let depth = 0, i = start
  for (;;) {
    open.lastIndex = i
    const o = open.exec(xml), c = xml.indexOf(close, i)
    if (c < 0) return xml.length
    if (o && o.index < c) { depth++; i = o.index + tag.length + 1; continue }
    depth--; i = c + close.length
    if (depth === 0) return i
  }
}

const paraText = (p: string): string => {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>|<w:noBreakHyphen\s*\/>/g
  for (let m = re.exec(p); m; m = re.exec(p)) {
    if (m[1] !== undefined) out += decode(m[1])
    else if (m[0].startsWith('<w:tab')) out += ' '
    else if (m[0].startsWith('<w:noBreak')) out += '-'
    else out += '\n'
  }
  return out.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
}
const paraStyle = (p: string): string => /<w:pStyle\s+w:val="([^"]*)"/.exec(p)?.[1] ?? ''
const paraNum = (p: string): { id: string; lvl: number } | null => {
  const n = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(p); if (!n) return null
  const id = /<w:numId\s+w:val="(\d+)"/.exec(n[1])?.[1]; if (!id || id === '0') return null
  return { id, lvl: Number(/<w:ilvl\s+w:val="(\d+)"/.exec(n[1])?.[1] ?? 0) }
}

export async function parseDocx(data: ArrayBuffer | Uint8Array): Promise<DocBlock[]> {
  const zip = await JSZip.loadAsync(data)
  const f = zip.file('word/document.xml')
  if (!f) throw new Error('not_docx')
  const xml = await f.async('string')
  const bodyStart = xml.indexOf('<w:body'), body = bodyStart >= 0 ? xml.slice(xml.indexOf('>', bodyStart) + 1) : xml
  const blocks: DocBlock[] = []
  const counters = new Map<string, number[]>()
  const nextNumber = (id: string, lvl: number): string => {
    const c = counters.get(id) ?? []
    c.length = lvl + 1
    for (let i = 0; i <= lvl; i++) c[i] = (c[i] ?? (i < lvl ? 1 : 0))
    c[lvl] += 1
    counters.set(id, c)
    return c.slice(0, lvl + 1).join('.')
  }
  let i = 0
  const tagRe = /<w:(tbl|p)[ >/]/g
  while (i < body.length) {
    tagRe.lastIndex = i
    const m = tagRe.exec(body); if (!m) break
    const end = endOf(body, m.index, `w:${m[1]}`)
    const el = body.slice(m.index, end)
    if (m[1] === 'tbl') {
      const rows: string[][] = []
      let r = 0
      while (r < el.length) {
        const ro = el.indexOf('<w:tr', r); if (ro < 0) break
        const re = endOf(el, ro, 'w:tr'), row = el.slice(ro, re)
        const cells: string[] = []
        let c = 0
        while (c < row.length) {
          const co = row.indexOf('<w:tc', c); if (co < 0) break
          const ce = endOf(row, co, 'w:tc'), cell = row.slice(co, ce)
          const ps = cell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
          cells.push(ps.map(paraText).filter(Boolean).join(' '))
          c = ce
        }
        if (cells.some(Boolean)) rows.push(cells)
        r = re
      }
      if (rows.length) blocks.push({ type: 'table', rows })
    } else {
      const text = paraText(el)
      if (text) {
        const num = paraNum(el)
        blocks.push({ type: 'p', text, style: paraStyle(el), list: num ? nextNumber(num.id, num.lvl) : undefined })
      }
    }
    i = end
  }
  return blocks
}
