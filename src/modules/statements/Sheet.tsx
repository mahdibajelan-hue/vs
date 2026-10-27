import { useState, type CSSProperties } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft } from 'lucide-react'
import { groupLines, PART_META, type GenLine, type Part, type Totals } from './lib/stmtCore'
import { fa, pct, rial, short } from './ui'

/** the five figures of a statement; «خالص قابل پرداخت» is the one finance pays */
export function Figures({ t, part }: { t: Totals; part: Part }) {
  return (
    <div className="pst-figs" style={{ '--pc': PART_META[part].color } as CSSProperties}>
      <div className="pst-fig"><small>کارکرد تجمعی پذیرفته</small><b>{short(t.cumAmount)}</b><span>سیستم: {short(t.cumSys)}</span></div>
      <div className="pst-fig"><small>تا صورت‌وضعیت قبل</small><b>{short(t.prevAmount)}</b></div>
      <div className="pst-fig is-this"><small>کارکرد این دوره (ناخالص)</small><b>{short(t.thisAmount)}</b><span>{rial(t.thisAmount)} ریال</span></div>
      <div className="pst-fig"><small>جمع کسور</small><b>{short(t.deductions.total)}</b></div>
      <div className="pst-fig is-key"><small>خالص قابل پرداخت</small><b>{short(t.payable)}</b><span>{rial(t.payable)} ریال</span></div>
    </div>
  )
}

export function Deductions({ t, rates }: { t: Totals; rates: { advRecoveryPct: number; retPct: number; taxPct: number; insPct: number } }) {
  const rows: [string, number, number][] = [['کسر استهلاک پیش‌پرداخت', rates.advRecoveryPct, t.deductions.advance], ['کسر حسن انجام کار (سپرده)', rates.retPct, t.deductions.retention], ['کسر مالیات', rates.taxPct, t.deductions.tax], ['کسر بیمه', rates.insPct, t.deductions.insurance]]
  return (
    <table className="pst-ded"><tbody>
      <tr><td>کارکرد این دوره (ناخالص)</td><td /><td>{rial(t.thisAmount)}</td></tr>
      {rows.map(([l, p, v]) => <tr key={l}><td>{l}</td><td className="pst-num" style={{ color: 'var(--text-muted)' }}>{fa(p, 2)}٪</td><td>− {rial(v)}</td></tr>)}
      <tr className="is-total"><td>خالص قابل پرداخت (ریال)</td><td /><td>{rial(t.payable)}</td></tr>
    </tbody></table>
  )
}

export function Warnings({ list }: { list: string[] }) {
  if (!list.length) return null
  return <div className="pst-warn" role="note">{list.map((w) => <span key={w}><AlertTriangle size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> {w}</span>)}</div>
}

type L = GenLine & { id?: string }
/** the statement lines, grouped (discipline / material group / contract chapter), with the stage detail of each line */
export function LinesTable({ part, lines, editable, onEdit }: { part: Part; lines: L[]; editable?: boolean; onEdit?: (l: L, cum: number) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [onlyThis, setOnlyThis] = useState(false)
  const shown = lines.filter((l) => (!onlyThis || l.cumAmount - l.prevAmount > 0.5) && (!q.trim() || l.title.includes(q.trim()) || l.code.includes(q.trim())))
  const groups = groupLines(shown)
  const color = PART_META[part].color
  const qtyHead = part === 'E' ? 'پیشرفت مدرک' : part === 'P' ? 'مقدار معادل پرداخت' : 'مقدار تجمعی تأییدشده'
  return (
    <div className="ps-stack" style={{ '--pc': color } as CSSProperties}>
      <div className="pst-bar-actions">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`جست‌وجوی ${PART_META[part].unitWord} (کد یا شرح)`} style={{ maxWidth: '18rem' }} aria-label="جست‌وجو" />
        <label className="ps-checkbox"><input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} /> فقط ردیف‌های دارای کارکرد این دوره</label>
        <span className="sp" /><small style={{ color: 'var(--text-muted)' }}>{fa(shown.length)} از {fa(lines.length)} {PART_META[part].unitWord}</small>
      </div>
      <div className="ps-table-wrap" style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table className="pst-lines">
          <thead><tr><th>کد</th><th>شرح</th><th>واحد</th><th>مقدار پیمان</th><th>مبلغ پیمان</th><th>{qtyHead}</th><th>مبلغ سیستم</th><th>تجمعی پذیرفته</th><th>قبلی</th><th>این دوره</th></tr></thead>
          <tbody>
            {groups.map((g) => {
              const open = !closed[g.label]
              const sum = (k: 'baseAmount' | 'sysCumAmount' | 'cumAmount' | 'prevAmount') => g.lines.reduce((a, l) => a + l[k], 0)
              return [
                <tr key={`g-${g.label}`} className="g" onClick={() => setClosed((x) => ({ ...x, [g.label]: open }))}>
                  <td colSpan={4}>{open ? <ChevronDown size={13} aria-hidden /> : <ChevronLeft size={13} aria-hidden />} {g.label} <small style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({fa(g.lines.length)})</small></td>
                  <td className="n">{short(sum('baseAmount'))}</td><td /><td className="n">{short(sum('sysCumAmount'))}</td><td className="n">{short(sum('cumAmount'))}</td><td className="n">{short(sum('prevAmount'))}</td><td className="n pst-this">{short(sum('cumAmount') - sum('prevAmount'))}</td>
                </tr>,
                ...(open ? g.lines.map((l) => <LineRow key={`${l.sourceKind}:${l.sourceId}`} l={l} part={part} editable={editable} onEdit={onEdit} />) : []),
              ]
            })}
            {!groups.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>ردیفی نیست.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LineRow({ l, part, editable, onEdit }: { l: L; part: Part; editable?: boolean; onEdit?: (l: L, cum: number) => void }) {
  const [v, setV] = useState<string | null>(null)
  const d = l.detail as { stages?: { label: string; pct: number; reached: boolean }[]; steps?: { label: string; pct: number; qty: number; amount: number }[]; seq?: string; pending?: number; over?: boolean; belowPrev?: boolean; orphan?: boolean }
  const qtyCell = part === 'E' ? <>{fa(l.sysCumQty)}٪<span className="pst-meter"><i style={{ width: `${l.sysCumQty}%` }} /></span></> : <>{fa(l.sysCumQty, 2)}<span className="pst-meter"><i style={{ width: `${pct(l.sysCumQty, l.baseQty)}%` }} /></span></>
  const commit = () => { if (v == null) return; const x = Number(v.replace(/[٬,]/g, '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))); setV(null); if (Number.isFinite(x) && Math.abs(x - l.cumAmount) > 0.5) onEdit?.(l, x) }
  return (
    <tr className={`l ${l.edited ? 'is-edited' : ''}`}>
      <td className="n" dir="ltr" style={{ textAlign: 'right' }}>{l.code || '—'}</td>
      <td style={{ minWidth: '16rem' }}>
        <div>{l.title} {l.edited && <span className="pst-tag">اصلاح‌شده</span>} {d.over && <span className="pst-tag is-warn">بیش از مقدار پیمان</span>} {d.belowPrev && <span className="pst-tag is-warn">سیستم کمتر از قبلی</span>} {d.orphan && <span className="pst-tag is-warn">منبع حذف شده</span>}</div>
        {d.stages && <div className="pst-detail">{d.stages.map((s) => <span key={s.label} className={s.reached ? 'is-yes' : ''}>{s.reached ? '✓' : '○'} {s.label} {fa(s.pct)}٪</span>)}</div>}
        {d.steps && <div className="pst-detail">{d.steps.map((s) => <span key={s.label} className={s.qty > 0 ? 'is-yes' : ''}>{s.label} {fa(s.pct)}٪ · {fa(s.qty, 2)} {l.unit}</span>)}</div>}
        {!!d.pending && <div className="pst-detail"><span>در انتظار تأیید نظارت: {fa(d.pending, 2)} {l.unit}</span></div>}
      </td>
      <td>{l.unit}</td>
      <td className="n">{fa(l.baseQty, 2)}</td>
      <td className="n">{rial(l.baseAmount)}</td>
      <td className="n">{qtyCell}</td>
      <td className="n">{rial(l.sysCumAmount)}</td>
      <td className="n">{editable && l.id ? <input className="pst-cellin" inputMode="numeric" value={v ?? rial(l.cumAmount)} onFocus={() => setV(String(Math.round(l.cumAmount)))} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(null) }} aria-label={`تجمعی پذیرفتهٔ ${l.title}`} /> : rial(l.cumAmount)}</td>
      <td className="n">{rial(l.prevAmount)}</td>
      <td className="n pst-this">{rial(l.cumAmount - l.prevAmount)}</td>
    </tr>
  )
}
