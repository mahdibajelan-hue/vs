/** A small, dependency-free XML reader (elements, attributes, text, CDATA, entities, comments, processing instructions). Enough for Primavera PMXML; it does not validate. Namespace prefixes are dropped. */
export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? _))
const local = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n)

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' }
  const stack: XNode[] = [root]
  let i = 0
  const n = src.length
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt < 0) { stack[stack.length - 1].text += decode(src.slice(i)); break }
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); const end = e < 0 ? n : e; stack[stack.length - 1].text += src.slice(lt + 9, end); i = e < 0 ? n : e + 3; continue }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt + 2); i = e < 0 ? n : e + 1; continue }
    // a tag: find its end honouring quoted attribute values
    let j = lt + 1, q = ''
    while (j < n) { const c = src[j]; if (q) { if (c === q) q = '' } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++ }
    if (j >= n) throw new Error('XML ناقص است (تگ بسته نشده).')
    const body = src.slice(lt + 1, j)
    i = j + 1
    if (body.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const selfClose = body.endsWith('/')
    const inner = selfClose ? body.slice(0, -1) : body
    const m = inner.match(/^\s*([^\s/>]+)([\s\S]*)$/)
    if (!m) continue
    const node: XNode = { name: local(m[1]), attrs: {}, children: [], text: '' }
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = re.exec(m[2]))) node.attrs[local(a[1])] = decode(a[3] ?? a[4] ?? '')
    stack[stack.length - 1].children.push(node)
    if (!selfClose) stack.push(node)
  }
  if (stack.length > 1) throw new Error('XML ناقص است (تگ بسته نشده).')
  return root
}

export const kids = (n: XNode, name: string): XNode[] => n.children.filter((c) => c.name === name)
export const kid = (n: XNode, name: string): XNode | undefined => n.children.find((c) => c.name === name)
export const txt = (n: XNode | undefined, name: string): string => (n ? (kid(n, name)?.text ?? '').trim() : '')
export function descendants(n: XNode, name: string, out: XNode[] = []): XNode[] {
  for (const c of n.children) { if (c.name === name) out.push(c); descendants(c, name, out) }
  return out
}
