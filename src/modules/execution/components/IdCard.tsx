import { useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { code39Runs } from '../lib/code39'
import { cardFields, KIND_FA } from '../lib/personnelForms'
import type { Welder, WelderQual } from '../lib/registers'
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
const val: React.CSSProperties = { fontSize: 12, fontWeight: 700, lineHeight: 1.25, direction: 'ltr', textAlign: 'right', unicodeBidi: 'plaintext' }

/** A qualification card shown as designed web content: front (photo, name, ID, scope, validity, barcode of the welder number) and back (qualifications). Print or save as PNG / PDF. */
export function IdCard({ w, quals, projectName, confirmedBy, issuedBy }: { w: Welder; quals: WelderQual[]; projectName: string; confirmedBy: string; issuedBy: string }) {
  const front = useRef<HTMLDivElement>(null), back = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const c = w.card, today = new Date().toISOString().slice(0, 10)
  const valid = !!c.validity && c.validity >= today
  const code = w.raw.trim()
  const f = cardFields(w.kind)
  const get = (k: string) => (c[k] ?? '').trim()
  const rows: [string, string][] = [[f.find((x) => x.key === 'sys')!.label, get('sys')], [f.find((x) => x.key === 'pos')!.label, get('pos')], [w.kind === 'welder' ? 'Material' : 'Coating', get('spec') || get('mat')], [w.kind === 'welder' ? 'Thickness' : 'Sleeve Thk', get('thk')]].filter((r) => r[1]) as [string, string][]
  const title = w.kind === 'welder' ? 'کارت صلاحیت جوشکار' : 'کارت صلاحیت عایق‌کار'
  const shell = (children: React.ReactNode, ref: React.RefObject<HTMLDivElement | null>) => <div ref={ref} style={side}>{children}</div>
  const header = (
    <div style={{ background: NAVY, color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div><div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div><div style={{ fontSize: 9, opacity: 0.8 }}>{projectName}</div></div>
      <div style={{ textAlign: 'left', direction: 'ltr' }}><div style={{ fontSize: 9, opacity: 0.8 }}>CARD NO</div><div style={{ fontSize: 13, fontWeight: 800 }}>{w.cardNo || '—'}</div></div>
    </div>
  )
  const exportName = `${w.cardNo || w.raw}-${KIND_FA[w.kind]}`
  const printBoth = () => {
    const win = window.open('', '_blank', 'width=900,height=700'); if (!win || !front.current || !back.current) return
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${exportName}</title><style>@page{size:A5 landscape;margin:8mm}body{margin:0;display:grid;gap:10mm;justify-content:center;padding:6mm;font-family:Vazirmatn,Tahoma,sans-serif}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${front.current.outerHTML}${back.current.outerHTML}</body></html>`)
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300)
  }
  const save = async (kind: 'png' | 'pdf') => {
    if (!front.current || !back.current) return
    setBusy(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const shots = [await html2canvas(front.current, { scale: 3, backgroundColor: '#ffffff' }), await html2canvas(back.current, { scale: 3, backgroundColor: '#ffffff' })]
      if (kind === 'png') {
        const both = document.createElement('canvas'); both.width = shots[0].width; both.height = shots[0].height + shots[1].height + 30
        const g = both.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, both.width, both.height); g.drawImage(shots[0], 0, 0); g.drawImage(shots[1], 0, shots[0].height + 30)
        const a = document.createElement('a'); a.href = both.toDataURL('image/png'); a.download = `${exportName}.png`; a.click()
      } else {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [86, 54] })
        shots.forEach((s, i) => { if (i) pdf.addPage([86, 54], 'landscape'); pdf.addImage(s.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 86, 54) })
        pdf.save(`${exportName}.pdf`)
      }
    } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {shell(<>
          {header}
          <div style={{ display: 'flex', gap: 12, padding: '10px 14px' }}>
            <div style={{ width: 96, height: 124, borderRadius: 8, overflow: 'hidden', background: '#e2e8f0', flex: 'none', border: `2px solid ${ACC}` }}>{w.photo ? <img src={w.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, color: '#64748b' }}>بدون عکس</div>}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5, alignContent: 'start' }}>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{get('name') || w.fullName || '—'}</div>
              <div style={{ display: 'flex', gap: 14 }}>
                <div><div style={lab}>شناسه / ID</div><div style={val}>{get('id') || w.raw}</div></div>
                <div><div style={lab}>نشانه / Stamp</div><div style={val}>{get('stamp') || w.raw}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>{rows.slice(0, 4).map(([k, v]) => <div key={k}><div style={lab}>{k}</div><div style={{ ...val, fontSize: 11 }}>{v}</div></div>)}</div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: valid ? '#047857' : '#b91c1c' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: valid ? '#10b981' : '#ef4444' }} />{c.validity ? `${valid ? 'معتبر تا' : 'منقضی از'} ${jdLatin(c.validity)}` : 'تاریخ اعتبار ثبت نشده'}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', insetInline: 14, bottom: 8 }}><Barcode text={code} height={30} /><div style={{ textAlign: 'center', fontSize: 10, letterSpacing: 2, direction: 'ltr', fontWeight: 700 }}>{code}</div></div>
        </>, front)}
        {shell(<>
          {header}
          <div style={{ padding: '8px 14px' }}>
            {w.kind === 'welder' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, direction: 'ltr' }}>
                <thead><tr style={{ background: '#e0f2fe' }}>{['WQT NO', 'Process', 'Position', 'Thk (in)', 'Dia (in)', 'Issued', 'Expiry'].map((h) => <th key={h} style={{ padding: '3px 4px', textAlign: 'left', border: '1px solid #cbd5e1' }}>{h}</th>)}</tr></thead>
                <tbody>{quals.filter((q) => q.status === 'valid').slice(0, 6).map((q) => <tr key={q.id}>{[q.wqtNo || '—', q.process || '—', q.position || '—', `${q.thkMin ?? '…'}–${q.thkMax ?? '…'}`, `${q.diaMin ?? '…'}–${q.diaMax ?? '…'}`, q.issueDate ? jdLatin(q.issueDate) : '—', q.expiryDate ? jdLatin(q.expiryDate) : '—'].map((x, i) => <td key={i} style={{ padding: '3px 4px', border: '1px solid #cbd5e1' }}>{x}</td>)}</tr>)}
                  {quals.filter((q) => q.status === 'valid').length === 0 && <tr><td colSpan={7} style={{ padding: 6, color: '#64748b' }}>No qualification recorded</td></tr>}</tbody>
              </table>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>{f.filter((x) => !['name', 'id', 'stamp', 'dirA', 'dirB'].includes(x.key) && get(x.key)).map((x) => <div key={x.key}><div style={lab}>{x.label}</div><div style={{ ...val, fontSize: 11 }}>{x.kind === 'date' ? jdLatin(get(x.key)) : get(x.key)}</div></div>)}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12, fontSize: 10 }}>
              <div><div style={lab}>تأیید کننده</div><b>{confirmedBy || '—'}</b>{w.cardConfirmedAt && <div style={lab}>{jdLatin(w.cardConfirmedAt.slice(0, 10))}</div>}</div>
              <div><div style={lab}>صادرکننده</div><b>{issuedBy || '—'}</b>{w.cardIssuedAt && <div style={lab}>{jdLatin(w.cardIssuedAt.slice(0, 10))}</div>}</div>
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: '#475569', lineHeight: 1.5 }}>اعتبار این کارت با اسکن بارکد روی صفحهٔ روبه‌رو و تطبیق با رجیستر پروژه کنترل می‌شود. در صورت یافتن، به دفتر فنی پروژه تحویل شود.</div>
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
