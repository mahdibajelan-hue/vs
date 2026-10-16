import { useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { code39Runs } from '../lib/code39'
import { KIND_FA, type CardData, type PersonKind } from '../lib/personnelForms'
import type { PersonSig } from '../lib/registers'
import { jdLatin } from './PersonSheet'

/** Code 39 barcode as an inline SVG (so it survives printing and image export) */
export function Barcode({ text, height = 34 }: { text: string; height?: number }) {
  const runs = code39Runs(text)
  if (!runs) return <span style={{ fontSize: 9, color: '#b91c1c' }}>شناسه برای بارکد مناسب نیست (فقط حروف لاتین، عدد و - . )</span>
  const quiet = 10, total = runs.reduce((a, b) => a + b, 0) + quiet * 2
  let x = quiet
  const bars: React.ReactElement[] = []
  runs.forEach((n, i) => { if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={n} height={height} fill="#000" />); x += n })
  return <svg role="img" aria-label={`بارکد ${text}`} viewBox={`0 0 ${total} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}><rect width={total} height={height} fill="#fff" />{bars}</svg>
}

const NAVY = '#0b2545', ACC = '#0ea5e9'
const side: React.CSSProperties = { width: 454, height: 286, boxSizing: 'border-box', borderRadius: 14, background: '#fff', color: '#0f172a', overflow: 'hidden', position: 'relative', fontFamily: 'Vazirmatn, Tahoma, sans-serif', border: '1px solid #cbd5e1' }
const lab: React.CSSProperties = { fontSize: 9, color: '#64748b', lineHeight: 1.1 }
const val: React.CSSProperties = { fontSize: 11, fontWeight: 700, lineHeight: 1.25, direction: 'ltr', textAlign: 'right', unicodeBidi: 'plaintext' }

/** A qualification card shown as designed web content: front (photo, name, Welder ID = national code, stamp, scope, validity, barcode) and back (qualification table and the two signatures). Print or save as PDF / PNG. */
export function IdCard({ kind, data, photo, cardNo, projectName, barcodeText, sigA, sigB, labelA, labelB }: { kind: PersonKind; data: CardData; photo: string; cardNo: string; projectName: string; barcodeText: string; sigA: PersonSig | null; sigB: PersonSig | null; labelA: string; labelB: string }) {
  const front = useRef<HTMLDivElement>(null), back = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(data.validityRaw) ? data.validityRaw : ''
  const open = data.validityRaw === 'END'
  const expired = !!iso && iso < today
  const shell = (children: React.ReactNode, ref: React.RefObject<HTMLDivElement | null>) => <div ref={ref} style={side}>{children}</div>
  const header = (
    <div style={{ background: NAVY, color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'ltr' }}>
      <div><div style={{ fontSize: 13, fontWeight: 800 }}>{data.title}</div><div style={{ fontSize: 9, opacity: 0.85 }}>{projectName}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 9, opacity: 0.8 }}>CARD NO</div><div style={{ fontSize: 13, fontWeight: 800 }}>{cardNo || '—'}</div></div>
    </div>
  )
  const exportName = `${cardNo || barcodeText}-${KIND_FA[kind]}`
  const printBoth = () => {
    const win = window.open('', '_blank', 'width=900,height=700'); if (!win || !front.current || !back.current) return
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${exportName}</title><style>@page{size:A5 landscape;margin:8mm}body{margin:0;display:grid;gap:10mm;justify-content:center;padding:6mm;font-family:Vazirmatn,Tahoma,sans-serif}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${front.current.outerHTML}${back.current.outerHTML}</body></html>`)
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300)
  }
  const save = async (as: 'png' | 'pdf') => {
    if (!front.current || !back.current) return
    setBusy(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const shots = [await html2canvas(front.current, { scale: 3, backgroundColor: '#ffffff' }), await html2canvas(back.current, { scale: 3, backgroundColor: '#ffffff' })]
      if (as === 'png') {
        const both = document.createElement('canvas'); both.width = shots[0].width; both.height = shots[0].height + shots[1].height + 30
        const g = both.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, both.width, both.height); g.drawImage(shots[0], 0, 0); g.drawImage(shots[1], 0, shots[0].height + 30)
        const a = document.createElement('a'); a.href = both.toDataURL('image/png'); a.download = `${exportName}.png`; a.click()
      } else {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [86, 54] })
        shots.forEach((sh, i) => { if (i) pdf.addPage([86, 54], 'landscape'); pdf.addImage(sh.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 86, 54) })
        pdf.save(`${exportName}.pdf`)
      }
    } finally { setBusy(false) }
  }
  const sign = (label: string, g: PersonSig | null) => (
    <div style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>
      <div style={{ height: 44, display: 'grid', placeItems: 'center' }}>{g?.image ? <img src={g.image} alt="" style={{ maxHeight: 42, maxWidth: '100%' }} /> : null}</div>
      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 2 }}><b>{g?.name || '—'}</b></div><div style={lab}>{label}{g?.at ? ` · ${jdLatin(g.at.slice(0, 10))}` : ''}</div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {shell(<>
          {header}
          <div style={{ display: 'flex', gap: 12, padding: '10px 14px', direction: 'ltr' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4, alignContent: 'start' }}>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{data.name || '—'}</div>
              <div style={{ display: 'flex', gap: 14 }}>
                <div><div style={lab}>Welder ID</div><div style={val}>{data.nationalId || '—'}</div></div>
                <div><div style={lab}>Stamp</div><div style={val}>{data.stamp}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>{data.rows.slice(0, 8).map(([k, v]) => <div key={k}><div style={lab}>{k}</div><div style={{ ...val, fontSize: 10.5 }}>{v}</div></div>)}</div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: expired ? '#b91c1c' : '#047857' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: expired ? '#ef4444' : '#10b981' }} />{data.validity ? `Card validity: ${open ? 'End of project' : data.validity}${expired ? ' (expired)' : ''}` : 'Card validity: —'}</div>
            </div>
            <div style={{ width: 96, height: 124, borderRadius: 8, overflow: 'hidden', background: '#e2e8f0', flex: 'none', border: `2px solid ${ACC}` }}>{photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, color: '#64748b' }}>Photo</div>}</div>
          </div>
          <div style={{ position: 'absolute', insetInline: 14, bottom: 8 }}><Barcode text={barcodeText} height={28} /><div style={{ textAlign: 'center', fontSize: 10, letterSpacing: 2, direction: 'ltr', fontWeight: 700 }}>{barcodeText}</div></div>
        </>, front)}
        {shell(<>
          {header}
          <div style={{ padding: '8px 14px', direction: 'ltr' }}>
            {data.table && data.table.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr style={{ background: '#e0f2fe' }}>{data.table.map(([h]) => <th key={h} style={{ padding: '3px 4px', textAlign: 'left', border: '1px solid #cbd5e1' }}>{h}</th>)}</tr></thead>
                <tbody><tr>{data.table.map(([h, v]) => <td key={h} style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 700 }}>{v}</td>)}</tr></tbody>
              </table>
            ) : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 10px' }}>{data.rows.slice(8).map(([k, v]) => <div key={k}><div style={lab}>{k}</div><div style={val}>{v}</div></div>)}</div>}
            {data.dirs && (data.dirs.fill || data.dirs.root) && <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 10 }}>{[['Root & Hot', data.dirs.root], ['Filling & Cap', data.dirs.fill]].map(([k, d]) => <div key={k}><b>{k}:</b> {d === 'up' ? '✓ Up Hill' : '☐ Up Hill'} &nbsp; {d === 'down' ? '✓ Down Hill' : '☐ Down Hill'}</div>)}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>{sign(labelA, sigA)}{sign(labelB, sigB)}</div>
            <div style={{ marginTop: 8, fontSize: 8.5, color: '#475569', lineHeight: 1.4 }}>اعتبار این کارت با اسکن بارکد و تطبیق با رجیستر پروژه کنترل می‌شود.</div>
          </div>
        </>, back)}
      </div>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={printBoth}><Printer size={13} /> چاپ کارت</button>
        <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void save('pdf')}><Download size={13} /> ذخیره PDF</button>
        <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void save('png')}><Download size={13} /> ذخیره تصویر</button>
      </div>
    </div>
  )
}
