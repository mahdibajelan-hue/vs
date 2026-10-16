import { useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { KIND_FA, type CardData, type PersonKind } from '../../lib/personnelForms'
import type { PersonSig } from '../../lib/personnel'
import { jdLatin } from './util'

const NAVY = '#0b2545', NAVY2 = '#14407a', AMBER = '#f59e0b', INK = '#0f172a', MUTE = '#64748b'
const FONT = 'Vazirmatn, Tahoma, sans-serif'
const card: React.CSSProperties = { width: 454, height: 286, boxSizing: 'border-box', borderRadius: 16, background: '#fff', color: INK, overflow: 'hidden', position: 'relative', fontFamily: FONT, border: '1px solid #cbd5e1', boxShadow: '0 6px 18px rgba(15,23,42,.12)', display: 'flex', direction: 'ltr' }
const lab: React.CSSProperties = { fontSize: 8, color: MUTE, letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 1.1 }
const val: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, lineHeight: 1.25, direction: 'ltr', textAlign: 'left', unicodeBidi: 'plaintext' }

/**
 * Qualification card as designed web content. Front: photo and stamp number on a dark panel, name, Welder ID (national code), scope, validity and a QR code that any phone reads.
 * Back: the qualification record and the two signatures. Print or save as PDF / PNG.
 */
export function IdCard({ kind, data, photo, cardNo, projectName, payload, sigA, sigB, labelA, labelB }: { kind: PersonKind; data: CardData; photo: string; cardNo: string; projectName: string; payload: string; sigA: PersonSig | null; sigB: PersonSig | null; labelA: string; labelB: string }) {
  const front = useRef<HTMLDivElement>(null), back = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(data.validityRaw) ? data.validityRaw : ''
  const open = data.validityRaw === 'END'
  const expired = !!iso && iso < today
  const okColor = expired ? '#b91c1c' : '#047857'
  const badge = kind === 'welder' ? 'WELDER' : 'COATING APPLICATOR'
  const exportName = `${cardNo}-${KIND_FA[kind]}`
  const printBoth = () => {
    const win = window.open('', '_blank', 'width=900,height=700'); if (!win || !front.current || !back.current) return
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${exportName}</title><style>@page{size:A5 landscape;margin:8mm}body{margin:0;display:grid;gap:10mm;justify-content:center;padding:6mm;font-family:${FONT}}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${front.current.outerHTML}${back.current.outerHTML}</body></html>`)
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300)
  }
  const save = async (as: 'png' | 'pdf') => {
    if (!front.current || !back.current) return
    setBusy(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const shots = [await html2canvas(front.current, { scale: 3, backgroundColor: null }), await html2canvas(back.current, { scale: 3, backgroundColor: null })]
      if (as === 'png') {
        const both = document.createElement('canvas'); both.width = shots[0].width; both.height = shots[0].height + shots[1].height + 30
        const g = both.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, both.width, both.height); g.drawImage(shots[0], 0, 0); g.drawImage(shots[1], 0, shots[0].height + 30)
        const a = document.createElement('a'); a.href = both.toDataURL('image/png'); a.download = `${exportName}.png`; a.click()
      } else {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [86, 54] })
        shots.forEach((sh, i) => { if (i) pdf.addPage([86, 54], 'landscape'); pdf.addImage(sh.toDataURL('image/png'), 'PNG', 0, 0, 86, 54) })
        pdf.save(`${exportName}.pdf`)
      }
    } finally { setBusy(false) }
  }
  const sign = (label: string, g: PersonSig | null) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ height: 46, display: 'grid', placeItems: 'center' }}>{g?.image ? <img src={g.image} alt="" style={{ maxHeight: 44, maxWidth: '100%' }} /> : null}</div>
      <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 3, fontSize: 10.5, fontWeight: 700 }}>{g?.name || '—'}</div>
      <div style={{ ...lab, textTransform: 'none' }}>{label}{g?.at ? ` · ${jdLatin(g.at.slice(0, 10))}` : ''}</div>
    </div>
  )
  const facts = data.rows.filter(([k]) => !['Test No', 'Test Date'].includes(k) || kind === 'welder').slice(0, kind === 'welder' ? 6 : 2)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* ── front */}
        <div ref={front} style={card}>
          <div style={{ width: 138, flex: 'none', background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY2} 100%)`, color: '#fff', padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 8, letterSpacing: 0.8, opacity: 0.75, textAlign: 'center', lineHeight: 1.4 }}>{projectName}</div>
            <div style={{ width: 104, height: 132, borderRadius: 14, overflow: 'hidden', border: `3px solid ${AMBER}`, background: '#1e3a5f', boxShadow: '0 4px 12px rgba(0,0,0,.35)' }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, opacity: 0.6 }}>PHOTO</div>}
            </div>
            <div style={{ textAlign: 'center', lineHeight: 1.1 }}><div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.75 }}>STAMP</div><div style={{ fontSize: 26, fontWeight: 800, color: AMBER, direction: 'ltr' }}>{data.stamp}</div></div>
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '14px 16px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, direction: 'ltr' }}>
              <span style={{ background: NAVY, color: '#fff', fontSize: 8.5, fontWeight: 800, letterSpacing: 1, padding: '3px 9px', borderRadius: 20 }}>{badge}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, color: okColor }}><span style={{ width: 7, height: 7, borderRadius: 4, background: expired ? '#ef4444' : '#10b981' }} />{expired ? 'EXPIRED' : 'VALID'}</span>
            </div>
            <div>
              <div dir="auto" style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.15, color: NAVY, textAlign: 'start' }}>{data.name || '—'}</div>
              <div style={{ fontSize: 10, color: MUTE, direction: 'ltr', textAlign: 'left', marginTop: 2 }}>ID <b style={{ color: INK, letterSpacing: 0.5 }}>{data.nationalId || '—'}</b></div>
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg, #e2e8f0, transparent)' }} />
            {kind === 'coater' && data.scope && data.scope.length > 0 ? (
              <div style={{ display: 'grid', gap: 4, direction: 'ltr' }}><div style={lab}>Qualified for</div><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{data.scope.map((s) => <span key={s} style={{ fontSize: 9.5, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20 }}>{s}</span>)}</div></div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', direction: 'ltr' }}>{facts.map(([k, v]) => <div key={k} style={{ minWidth: 0 }}><div style={lab}>{k}</div><div style={{ ...val, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div></div>)}</div>
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', direction: 'ltr' }}>
              <div><div style={lab}>Card validity</div><div style={{ ...val, color: okColor }}>{data.validityRaw ? (open ? 'End of project' : data.validity) : '—'}</div></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 3, borderRadius: 6, border: '1px solid #e2e8f0', lineHeight: 0 }}><QRCodeSVG value={payload} size={66} level="M" marginSize={0} fgColor="#000000" bgColor="#ffffff" /></div>
                <div style={{ fontSize: 6.5, letterSpacing: 0.8, color: MUTE, marginTop: 2 }}>SCAN TO VERIFY</div>
              </div>
            </div>
          </div>
        </div>
        {/* ── back */}
        <div ref={back} style={{ ...card, flexDirection: 'column' }}>
          <div style={{ background: `linear-gradient(90deg, ${NAVY}, ${NAVY2})`, color: '#fff', padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'ltr' }}>
            <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>{data.title}</div><div style={{ fontSize: 8.5, opacity: 0.8 }}>{projectName}</div></div>
            <div style={{ fontSize: 11, fontWeight: 800, color: AMBER, letterSpacing: 1 }}>{data.stamp}</div>
          </div>
          <div style={{ padding: '10px 16px', display: 'grid', gap: 8, flex: 1, alignContent: 'start', direction: 'ltr' }}>
            {data.table && data.table.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(data.table.length, 4)}, 1fr)`, gap: 0, border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                {data.table.map(([h, v], i) => <div key={h} style={{ padding: '5px 8px', borderInlineStart: i % 4 ? '1px solid #e2e8f0' : 'none', borderTop: i >= 4 ? '1px solid #e2e8f0' : 'none', gridColumn: data.table!.length === 1 ? '1 / -1' : undefined, background: i % 2 ? '#fff' : '#f8fafc' }}><div style={lab}>{h}</div><div style={{ ...val, fontSize: 10.5 }}>{v}</div></div>)}
              </div>
            )}
            {kind === 'coater' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>{data.rows.map(([k, v]) => <div key={k} style={{ minWidth: 0 }}><div style={lab}>{k}</div><div style={{ ...val, fontSize: 10.5 }}>{v}</div></div>)}</div>}
            {data.dirs && (data.dirs.fill || data.dirs.root) && <div style={{ display: 'flex', gap: 18, fontSize: 9.5 }}>{[['Root & Hot', data.dirs.root], ['Filling & Cap', data.dirs.fill]].map(([k, d]) => <div key={k}><b>{k}:</b> {d === 'up' ? '☑' : '☐'} Up Hill &nbsp; {d === 'down' ? '☑' : '☐'} Down Hill</div>)}</div>}
            <div style={{ display: 'flex', gap: 18, marginTop: 4, direction: 'rtl' }}>{sign(labelA, sigA)}{sign(labelB, sigB)}</div>
          </div>
          <div style={{ padding: '5px 16px 8px', fontSize: 8, color: MUTE, textAlign: 'center', direction: 'rtl' }}>اعتبار این کارت با اسکن QR و تطبیق با رجیستر پروژه کنترل می‌شود · در صورت یافتن به دفتر فنی پروژه تحویل شود.</div>
        </div>
      </div>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={printBoth}><Printer size={13} /> چاپ کارت</button>
        <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void save('pdf')}><Download size={13} /> ذخیره PDF</button>
        <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void save('png')}><Download size={13} /> ذخیره تصویر</button>
      </div>
    </div>
  )
}
