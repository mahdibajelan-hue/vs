import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Flame, Layers, LineChart, Printer, Wrench } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { fa, monthKey, monthLabel, useQc, weldLabel } from '../lib/useQc'
import { PASSES, repairAnalysis, welderReport } from '../lib/analytics'
import { DEFECT_COLOR, DEFECT_FA, PASS_FA, VERDICT_FA, type DefectType } from '../lib/rules'
import { ShamsiDate } from '../../../components/common/ShamsiField'

const tone = (p: number) => (p > 10 ? '#ef4444' : p > 5 ? '#f59e0b' : '#22c55e')

/**
 * گزارش جوشکاران — per welder: the welds they worked on, how many came out of the first radiography needing repair, the
 * defects charged to their passes (which kinds most), and their month-by-month repair rate. A welder's own repairs and
 * how they fared in the next radiography are listed under the welder.
 */
export function WqWelders({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore()
  const q = useQc()
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const rows = useMemo(() => welderReport({ welds: q.qWelds, evals: q.qEvals, defects: q.qDefects, monthOf: monthKey, from: from || undefined, to: to || undefined }), [q, from, to])
  const cur = rows.find((r) => r.key === sel) ?? null
  const myRepairs = useMemo(() => (cur ? repairAnalysis({ evals: q.qEvals, defects: q.qDefects, repairs: st.repairs.filter((r) => r.performedBy === cur.key).map((r) => ({ weldId: r.weldId, round: r.round, performedBy: r.performedBy, method: r.method, at: r.createdAt })), monthOf: monthKey }) : null), [cur, q, st.repairs])
  const myDefects = useMemo(() => (cur ? st.defects.filter((d) => !d.removed && d.welders.includes(cur.key)) : []), [cur, st.defects])
  // the project figure, by the same definition as the dashboard (each weld once, not once per welder)
  const avg = useMemo(() => repairAnalysis({ evals: q.qEvals, defects: q.qDefects, repairs: [], monthOf: monthKey }).firstRepairPct, [q])

  return (
    <div className="wq-welders">
      <div className="wq-toolbar no-print">
        <label className="wq-date"><span>از تاریخ جوشکاری</span><ShamsiDate value={from} onChange={setFrom} clearable label="از تاریخ" /></label>
        <label className="wq-date"><span>تا</span><ShamsiDate value={to} onChange={setTo} clearable label="تا تاریخ" /></label>
        <button type="button" className="ps-btn" onClick={() => window.print()}><Printer size={14} aria-hidden /> چاپ</button>
        <p className="ps-meta">نرخ تعمیر پروژه: <b>{fa(avg, 1)}٪</b> در اولین رادیوگرافی</p>
      </div>

      {!rows.length ? <p className="ps-hint">هنوز جوشکاری با مهر ثبت‌شده در گزارش جوشکاری نیست.</p> : (
        <div className="wq-tbl-wrap wq-card wq-rise"><table className="wq-tbl is-click">
          <thead><tr><th>جوشکار</th><th>سرجوش</th><th>ارزیابی‌شده</th><th>تعمیر اول</th><th>نرخ تعمیر</th><th>برش</th><th>عیوب منسوب</th><th>بیشترین عیب</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key} className={sel === r.key ? 'is-sel' : ''} onClick={() => setSel(sel === r.key ? null : r.key)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSel(sel === r.key ? null : r.key) }} aria-selected={sel === r.key}>
              <td><b className="ps-code">{r.key}</b> {q.nameOf(r.key) !== r.key ? q.nameOf(r.key) : <small className="ps-meta">خارج از فهرست جوشکاران</small>}</td>
              <td>{fa(r.welds)}</td><td>{fa(r.evaluated)}</td><td>{fa(r.firstRepair)}</td>
              <td>{r.evaluated ? <span className="wq-pct" style={{ '--c': tone(r.repairPct), '--w': `${Math.min(100, r.repairPct * 4)}%` } as CSSProperties}><i />{fa(r.repairPct, 1)}٪</span> : '—'}</td>
              <td>{fa(r.cutOut)}</td><td>{fa(r.defects)}</td>
              <td>{r.top ? <span className="wq-dtype" style={{ '--c': DEFECT_COLOR[r.top] } as CSSProperties}>{DEFECT_FA[r.top]}</span> : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="ps-meta">نرخ تعمیر = سرجوش‌هایی که نتیجهٔ اولین رادیوگرافی آن‌ها «تعمیر» یا «برش» بوده ÷ سرجوش‌های ارزیابی‌شدهٔ جوشکار. هر سرجوش برای همهٔ جوشکاران پاس‌هایش شمرده می‌شود؛ هر عیب فقط به جوشکاران پاسی که در آن دیده شده نسبت داده می‌شود. روی هر ردیف بزنید.</p>

      {cur && (
        <div className="wq-welder-detail wq-rise">
          <header className="wq-wd-head">
            <span className="wq-wd-ico"><Flame size={20} aria-hidden /></span>
            <div><h3>{q.nameOf(cur.key) !== cur.key ? q.nameOf(cur.key) : 'جوشکار'} <b className="ps-code">{cur.key}</b></h3><p className="ps-meta">{fa(cur.welds)} سرجوش · {fa(cur.evaluated)} ارزیابی‌شده · نرخ تعمیر {fa(cur.repairPct, 1)}٪ (پروژه {fa(avg, 1)}٪)</p></div>
          </header>
          <div className="wq-grid2">
            <section className="wq-card"><header className="wq-card-head"><Flame size={16} aria-hidden /><h3>عیوب منسوب به تفکیک نوع</h3></header>
              {cur.defects ? <ul className="wq-bars">{(Object.entries(cur.byType) as [DefectType, number][]).sort((a, b) => b[1] - a[1]).map(([t, n]) => <li key={t}><span>{DEFECT_FA[t]}</span><i style={{ '--w': `${(n / cur.defects) * 100}%`, '--c': DEFECT_COLOR[t] } as CSSProperties} /><b>{fa(n)} · {fa((n / cur.defects) * 100)}٪</b></li>)}</ul> : <p className="ps-hint">عیبی به این جوشکار نسبت داده نشده است.</p>}
            </section>
            <section className="wq-card"><header className="wq-card-head"><Layers size={16} aria-hidden /><h3>عیوب به تفکیک پاس</h3></header>
              <ul className="wq-bars">{PASSES.map((p) => { const n = cur.byPass[p] ?? 0; return <li key={p}><span>{PASS_FA[p]}</span><i style={{ '--w': `${cur.defects ? (n / cur.defects) * 100 : 0}%`, '--c': '#8b5cf6' } as CSSProperties} /><b>{fa(n)}</b></li> })}</ul>
              <p className="ps-meta">عیوب ریشه (نفوذ ناقص، سوختگی، بریدگی داخلی) معمولاً به مهارت پاس ریشه و تنظیم گپ برمی‌گردد؛ آخال و ذوب ناقص به تمیزکاری بین‌پاسی و زاویهٔ الکترود.</p>
            </section>
          </div>
          {cur.months.length > 0 && (
            <section className="wq-card"><header className="wq-card-head"><LineChart size={16} aria-hidden /><h3>نرخ تعمیر ماه به ماه</h3></header>
              <div className="wq-cols">{cur.months.map((m) => <div key={m.key} className="wq-col" title={`${fa(m.repaired)} از ${fa(m.evaluated)}`}><b>{fa(m.rate, 0)}٪</b><i style={{ '--h': `${Math.max(4, m.rate)}%`, '--c': tone(m.rate) } as CSSProperties} /><span>{monthLabel(m.key)}</span></div>)}</div>
            </section>
          )}
          {myRepairs && myRepairs.repairs > 0 && (
            <section className="wq-card"><header className="wq-card-head"><Wrench size={16} aria-hidden /><h3>تعمیرهایی که این جوشکار انجام داده</h3></header>
              <p>{fa(myRepairs.repairs)} تعمیر · {fa(myRepairs.succeeded)} پذیرفته در رادیوگرافی بعد · {fa(myRepairs.failed)} نیاز به تعمیر یا برش دوباره · {fa(myRepairs.pending)} منتظر فیلم بعدی</p>
            </section>
          )}
          <section className="wq-card"><header className="wq-card-head"><Flame size={16} aria-hidden /><h3>فهرست عیوب منسوب</h3></header>
            {myDefects.length ? <ul className="wq-list">{myDefects.map((d) => { const w = st.welds.find((x) => x.id === d.weldId); return (
              <li key={d.id}><button type="button" onClick={() => onOpen(d.weldId)}><b>{w ? weldLabel(w) : '—'}</b><span className="wq-dtype" style={{ '--c': DEFECT_COLOR[d.type] } as CSSProperties}>{DEFECT_FA[d.type]}</span><span className="ps-meta">{fa(d.lengthMm, 1)} mm · {d.pass ? PASS_FA[d.pass] : '—'} · {d.round ? `RS${fa(d.round)}` : 'RT'}{d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}</span><ArrowLeft size={14} aria-hidden /></button></li>
            ) })}</ul> : <p className="ps-hint">—</p>}
          </section>
        </div>
      )}
    </div>
  )
}
