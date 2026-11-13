import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { QC_STATE_COLOR, QC_STATE_FA, type QcState } from '../lib/analytics'
import { PASSES } from '../lib/analytics'
import { GRADE_COLOR } from '../lib/health'

const ORDER: QcState[] = ['quality', 'interpret', 'to_sign', 'repair_due', 'reshoot', 'no_film', 'accepted', 'cut_out']

/** every weld of the central register with its QC state; the list a QC person works through */
export function WqJoints({ onOpen, filter, setFilter }: { onOpen: (id: string) => void; filter: string; setFilter: (f: string) => void }) {
  const q = useQc()
  const [text, setText] = useState('')
  const counts = useMemo(() => { const c = new Map<string, number>(); for (const r of q.rows) c.set(r.state, (c.get(r.state) ?? 0) + 1); return c }, [q.rows])
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase()
    return q.rows
      .filter((r) => filter === 'all' || r.state === filter)
      .filter((r) => !t || `${r.weld.sec} ${r.weld.weld} ${r.weld.pipe} ${PASSES.flatMap((p) => r.weld.stampsBy[p]).join(' ')}`.toLowerCase().includes(t))
      .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.weld.sec + '|' + a.weld.weld).localeCompare(b.weld.sec + '|' + b.weld.weld, 'fa', { numeric: true }))
  }, [q.rows, filter, text])

  return (
    <div className="wq-joints">
      <div className="wq-toolbar">
        <label className="wq-search"><Search size={15} aria-hidden /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="جستجو: مقطع، سرجوش، لوله یا مهر جوشکار" aria-label="جستجوی سرجوش" /></label>
        <div className="wq-chips" role="tablist" aria-label="وضعیت پرونده">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>همه <i>{fa(q.rows.length)}</i></button>
          {ORDER.filter((s) => counts.get(s)).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={filter === s} className={filter === s ? 'is-on' : ''} style={{ '--c': QC_STATE_COLOR[s] } as CSSProperties} onClick={() => setFilter(s)}>{QC_STATE_FA[s]} <i>{fa(counts.get(s))}</i></button>
          ))}
        </div>
      </div>
      {!rows.length ? <p className="ps-hint">سرجوشی با این شرایط نیست.</p> : (
        <ul className="wq-jlist">
          {rows.slice(0, 400).map((r, k) => {
            return (
              <li key={r.weld.id} style={{ '--i': Math.min(k, 12), '--c': QC_STATE_COLOR[r.state] } as CSSProperties}>
                <button type="button" onClick={() => onOpen(r.weld.id)} aria-label={`پروندهٔ سرجوش ${weldLabel(r.weld)}`}>
                  <span className="wq-jl-id"><b>{weldLabel(r.weld)}</b><small>{r.weld.pipe ? `لوله ${r.weld.pipe}` : 'لوله —'}{r.weld.central.size ? ` · ${r.weld.central.size}″` : ''}{r.thk ? ` · t=${fa(r.thk, 2)}mm` : ''}</small></span>
                  <span className="wq-jl-w"><small>جوشکاران</small>{r.welders.length ? r.welders.map((s) => <b key={s} className="ps-code" title={q.nameOf(s)}>{s}</b>) : <em>ثبت نشده</em>}</span>
                  <span className="wq-jl-m"><small>جوشکاری</small>{faDate(r.weld.weldDate || null)}</span>
                  <span className="wq-jl-m"><small>فیلم / عیب</small>{fa(r.films)} / {fa(r.defects)}</span>
                  <span className="wq-jl-m"><small>راند</small>{r.round === 0 ? 'RT' : `RS${fa(r.round)}`}</span>
                  <span className="wq-jl-h" style={{ '--hc': GRADE_COLOR[r.health.grade] } as CSSProperties} title="شاخص سلامت سرجوش"><b>{r.health.score == null ? '—' : fa(r.health.score)}</b><small>سلامت</small></span>
                  <span className="wq-state">{QC_STATE_FA[r.state]}</span>
                  <ArrowLeft size={15} aria-hidden className="wq-jl-go" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > 400 && <p className="ps-meta">{fa(400)} سرجوش اول نمایش داده شد؛ با جستجو محدود کنید.</p>}
    </div>
  )
}
