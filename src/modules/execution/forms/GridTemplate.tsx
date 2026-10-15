import { useMemo, type CSSProperties } from 'react'
import { addr, type Edge, type GridStyle, type GridTemplate } from './gridTypes'

const EDGE: Record<string, string> = { thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid', double: '3px double', dashed: '1px dashed', dotted: '1px dotted', mediumDashed: '2px dashed', dashDot: '1px dashed', slantDashDot: '2px dashed' }
const edge = (e: Edge): string => (e ? `${EDGE[e[0]] ?? '1px solid'} #${e[1] === 'None' ? '000000' : e[1]}` : 'none')
const HALIGN: Record<string, CSSProperties['textAlign']> = { left: 'left', right: 'right', center: 'center', centerContinuous: 'center', justify: 'justify', fill: 'left', distributed: 'center' }
const VALIGN: Record<string, CSSProperties['verticalAlign']> = { top: 'top', center: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' }
const FALLBACK = '"Vazirmatn", "Segoe UI", Tahoma, Arial, sans-serif'
const isRtlText = (s: string) => /[؀-ۿ]/.test(s)

export function cssOf(st: GridStyle, value: string): CSSProperties {
  const [name, sz, b, i, u, col] = st.f
  const [h, v, wrap, rot] = st.a
  const rtl = isRtlText(value)
  const css: CSSProperties = {
    fontFamily: name ? `"${name}", ${FALLBACK}` : FALLBACK, fontSize: sz ? `${sz * 96 / 72}px` : undefined, fontWeight: b ? 700 : 400, fontStyle: i ? 'italic' : 'normal', textDecoration: u ? 'underline' : undefined,
    color: col ? `#${col}` : '#000', background: st.bg ? `#${st.bg}` : undefined,
    borderTop: edge(st.b[0]), borderRight: edge(st.b[1]), borderBottom: edge(st.b[2]), borderLeft: edge(st.b[3]),
    textAlign: h && h !== 'general' ? HALIGN[h] : rtl ? 'right' : 'left', verticalAlign: v ? VALIGN[v] : 'bottom',
    whiteSpace: wrap ? 'pre-wrap' : 'pre', overflow: 'hidden', padding: '0 2px', direction: rtl ? 'rtl' : 'ltr', lineHeight: 1.25, wordBreak: wrap ? 'break-word' : undefined,
  }
  if (rot === 90 || rot === 255) { css.writingMode = 'vertical-rl'; css.transform = 'rotate(180deg)' }
  return css
}

/** Draws an approved sheet exactly as its grid: same column widths, row heights, merged ranges, fonts and borders. `values` overrides the text of single cells by address (e.g. {"A2": "…"}); `logos` maps a logo anchor to an image URL. */
export function GridSheet({ tpl, values = {}, logos = {}, mark, onCell, selected }: { tpl: GridTemplate; values?: Record<string, string>; logos?: Record<string, string>; mark?: Set<string>; onCell?: (addr: string, fixed: string) => void; selected?: string }) {
  const byRow = useMemo(() => { const m = new Map<number, typeof tpl.cells>(); for (const c of tpl.cells) { const a = m.get(c.r); if (a) a.push(c); else m.set(c.r, [c]) } for (const a of m.values()) a.sort((x, y) => x.c - y.c); return m }, [tpl])
  const visCols = tpl.cols.map((c, i) => ({ ...c, i })).filter((c) => !c.hidden)
  const total = visCols.reduce((s, c) => s + c.w, 0)
  // a logo is placed over the cells it anchors to
  const logoBox = (l: (typeof tpl.logos)[number]) => {
    if (!l.from) return null
    const [r0, c0] = l.from, [r1, c1] = l.to ?? l.from
    const left = visCols.filter((c) => c.i < c0).reduce((s, c) => s + c.w, 0)
    const w = Math.max(24, visCols.filter((c) => c.i >= c0 && c.i <= c1).reduce((s, c) => s + c.w, 0))
    const top = tpl.rows.slice(0, r0).reduce((s, r) => s + (r.hidden ? 0 : r.h), 0)
    const h = Math.max(18, tpl.rows.slice(r0, r1 + 1).reduce((s, r) => s + (r.hidden ? 0 : r.h), 0))
    return { left, top, w, h }
  }
  return (
    <div className="gt-sheet" dir="ltr" style={{ position: 'relative', width: total }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: total, background: '#fff' }}>
        <colgroup>{visCols.map((c) => <col key={c.i} style={{ width: c.w }} />)}</colgroup>
        <tbody>
          {tpl.rows.map((row, r) => row.hidden ? null : (
            <tr key={r} style={{ height: row.h }}>
              {(byRow.get(r) ?? []).filter((c) => !tpl.cols[c.c].hidden).map((c) => {
                const a = addr(c.r, c.c), text = values[a] ?? c.v ?? ''
                const colSpan = c.cs ? Array.from({ length: c.cs }, (_, k) => c.c + k).filter((ci) => !tpl.cols[ci]?.hidden).length : 1
                return <td key={a} colSpan={colSpan || 1} rowSpan={c.rs} data-cell={a} onClick={onCell ? () => onCell(a, c.v ?? '') : undefined} style={{ ...(onCell ? { cursor: 'cell' } : null), ...(selected === a ? { outline: '2px solid #0ea5e9', outlineOffset: -2 } : null), ...cssOf(tpl.styles[c.s], text), ...(a in values && /^f{6}$/i.test(tpl.styles[c.s].f[5] ?? '') && (!tpl.styles[c.s].bg || /^f{6}$/i.test(tpl.styles[c.s].bg!)) ? { color: '#000' } : null), ...(a in values && !tpl.styles[c.s].a[2] ? { overflow: 'visible' } : null), boxSizing: 'border-box', outline: mark?.has(a) ? '2px solid #f59e0b' : undefined, outlineOffset: -2, background: mark?.has(a) ? '#fef3c7' : tpl.styles[c.s].bg ? `#${tpl.styles[c.s].bg}` : undefined }}>{text}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {tpl.logos.map((l, k) => {
        const b = logoBox(l); if (!b) return null
        const url = logos[`${l.from?.[0]},${l.from?.[1]}`] ?? (l.media ? logos[l.media] : undefined)
        return <div key={k} data-logo={l.media ?? l.kind} style={{ position: 'absolute', left: b.left, top: b.top, width: b.w, height: b.h, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          {l.kind === 'pic' ? (url ? <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 9, color: '#94a3b8', border: '1px dashed #94a3b8', padding: '0 3px' }}>لوگو</span>) : <span style={{ width: 12, height: 12, border: '1.5px solid #000', display: 'inline-block', background: '#fff' }} />}
        </div>
      })}
    </div>
  )
}

/** Print geometry taken from the sheet's page setup. The scale is the Excel scale, reduced when needed so that the sheet fits one page wide. */
export function printPlan(tpl: GridTemplate): { css: string; scale: number; pageW: number; excelScale: number } {
  const A4 = tpl.print.orientation === 'landscape' ? { w: 11.69, h: 8.27 } : { w: 8.27, h: 11.69 }
  const m = tpl.print.margins
  const pageW = (A4.w - m.left - m.right) * 96
  const total = tpl.cols.filter((c) => !c.hidden).reduce((s, c) => s + c.w, 0)
  const excelScale = (tpl.print.scale ?? 100) / 100
  const scale = Math.min(excelScale, pageW / total)
  const css = `@page { size: A4 ${tpl.print.orientation}; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; }`
  return { css, scale, pageW, excelScale }
}
