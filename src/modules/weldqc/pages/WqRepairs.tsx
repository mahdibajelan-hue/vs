import { useMemo, type CSSProperties } from 'react'
import { ArrowLeft, Clock3, Repeat2, Scissors, ShieldCheck, Target, Users, Wrench } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { fa, faDate, monthKey, monthLabel, useQc, weldLabel } from '../lib/useQc'
import { repairAnalysis } from '../lib/analytics'
import { DEFECT_COLOR, DEFECT_FA, suggestRepair } from '../lib/rules'

/**
 * تحلیل تعمیرات — how often welds need repair, what causes it, whether repairs hold (next radiography accepted), who
 * did them and how they fared, how long a repair waits, and which welds ended in a cut-out.
 */
export function WqRepairs({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore()
  const q = useQc()
  const ra = useMemo(() => repairAnalysis({ evals: q.qEvals, defects: q.qDefects, repairs: st.repairs.map((r) => ({ weldId: r.weldId, round: r.round, performedBy: r.performedBy, method: r.method, at: r.createdAt })), forced: st.evaluations.filter((e) => e.forcedCutout).length, monthOf: monthKey }), [q, st.repairs, st.evaluations])
  const cuts = q.rows.filter((r) => r.state === 'cut_out')
  const kpis = [
    { icon: Target, c: '#f97316', v: `${fa(ra.firstRepairPct, 1)}٪`, l: 'نرخ تعمیر در اولین رادیوگرافی', s: `${fa(ra.firstRepair)} از ${fa(ra.evaluated)} سرجوش` },
    { icon: ShieldCheck, c: '#22c55e', v: ra.succeeded + ra.failed ? `${fa(ra.successPct, 0)}٪` : '—', l: 'تعمیرهای پذیرفته در رادیوگرافی بعد', s: `${fa(ra.succeeded)} موفق · ${fa(ra.failed)} ناموفق · ${fa(ra.pending)} منتظر` },
    { icon: Repeat2, c: '#ec4899', v: fa(ra.secondRepairs), l: 'تعمیر دوم', s: 'سرجوش‌هایی که یک تعمیر کافی نبود' },
    { icon: Scissors, c: '#ef4444', v: fa(ra.cutOuts), l: 'برش', s: ra.forcedCutOuts ? `${fa(ra.forcedCutOuts)} به دلیل سقف تعمیر` : 'تأییدشده توسط بازرس' },
    { icon: Clock3, c: '#0ea5e9', v: ra.medianDaysToRepair == null ? '—' : `${fa(ra.medianDaysToRepair, 1)} روز`, l: 'میانهٔ فاصلهٔ ارزیابی تا تعمیر', s: 'زمان ماندن سرجوش در انتظار تعمیر' },
  ]
  if (!ra.evaluated) return <div className="ps-hero-empty"><Wrench size={30} aria-hidden /><b>هنوز ارزیابی‌ای ثبت نشده است</b><p>پس از اولین ارزیابی و تعمیر، تحلیل علت‌ها، موفقیت تعمیرها و تعمیرکاران اینجا می‌آید.</p></div>
  return (
    <div className="wq-repairs">
      <div className="wq-kpis">{kpis.map(({ icon: I, c, v, l, s }, k) => (
        <div key={l} className="wq-kpi wq-rise" style={{ '--c': c, '--i': k } as CSSProperties}><span className="wq-kpi-ico"><I size={17} aria-hidden /></span><b>{v}</b><span>{l}</span><small>{s}</small></div>
      ))}</div>
      <div className="wq-grid2">
        <section className="wq-card wq-rise" style={{ '--i': 3 } as CSSProperties}><header className="wq-card-head"><Target size={16} aria-hidden /><h3>علت تعمیرها (عیوب ردشده در اولین رادیوگرافی)</h3></header>
          {ra.causes.length ? <ul className="wq-causes">{ra.causes.map((c) => (
            <li key={c.type}><div className="wq-bars-row"><span>{DEFECT_FA[c.type]}</span><i style={{ '--w': `${c.share}%`, '--c': DEFECT_COLOR[c.type] } as CSSProperties} /><b>{fa(c.count)} · {fa(c.share, 0)}٪</b></div><small>{suggestRepair(c.type, 'repair')}</small></li>
          ))}</ul> : <p className="ps-hint">عیب ردشده‌ای ثبت نشده است.</p>}
        </section>
        <section className="wq-card wq-rise" style={{ '--i': 4 } as CSSProperties}><header className="wq-card-head"><Users size={16} aria-hidden /><h3>تعمیرکاران</h3></header>
          {ra.byPerformer.length ? <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>جوشکار تعمیر</th><th>تعمیر</th><th>موفق</th><th>ناموفق</th><th>موفقیت</th></tr></thead>
            <tbody>{ra.byPerformer.map((p) => <tr key={p.who}><td><b className="ps-code">{p.who}</b> {q.nameOf(p.who) !== p.who ? q.nameOf(p.who) : ''}</td><td>{fa(p.repairs)}</td><td>{fa(p.succeeded)}</td><td>{fa(p.failed)}</td><td>{p.succeeded + p.failed ? `${fa(p.successPct, 0)}٪` : '—'}</td></tr>)}</tbody></table></div> : <p className="ps-hint">هنوز تعمیری ثبت نشده است.</p>}
        </section>
      </div>
      {ra.months.length > 0 && (
        <section className="wq-card wq-rise" style={{ '--i': 5 } as CSSProperties}><header className="wq-card-head"><Wrench size={16} aria-hidden /><h3>روند ماهانه</h3></header>
          <div className="wq-cols">{ra.months.map((m) => <div key={m.key} className="wq-col" title={`${fa(m.repaired)} از ${fa(m.evaluated)}`}><b>{fa(m.rate, 0)}٪</b><i style={{ '--h': `${Math.max(4, m.rate)}%`, '--c': m.rate > 10 ? '#ef4444' : m.rate > 5 ? '#f59e0b' : '#22c55e' } as CSSProperties} /><span>{monthLabel(m.key)}</span></div>)}</div>
        </section>
      )}
      <section className="wq-card wq-rise" style={{ '--i': 6 } as CSSProperties}><header className="wq-card-head"><Wrench size={16} aria-hidden /><h3>تعمیرهای ثبت‌شده</h3></header>
        {st.repairs.length ? <ul className="wq-list">{[...st.repairs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => { const w = q.byId.get(r.weldId); const next = q.last.get(`${r.weldId}#${r.round + 1}`); return (
          <li key={r.id}><button type="button" onClick={() => onOpen(r.weldId)}><b>{w ? weldLabel(w.weld) : '—'}</b><span className="ps-meta">تعمیر {r.round === 0 ? 'اول' : 'دوم'} · {r.performedBy} · {faDate(r.createdAt)} · {r.method}</span>
            <span className="wq-verdict" style={{ '--c': !next ? '#64748b' : next.overall === 'accept' ? '#22c55e' : '#ef4444' } as CSSProperties}>{!next ? 'منتظر فیلم RS' : next.overall === 'accept' ? 'پذیرفته شد' : next.overall === 'repair' ? 'تعمیر دوباره' : 'برش'}</span><ArrowLeft size={14} aria-hidden /></button></li>
        ) })}</ul> : <p className="ps-hint">—</p>}
      </section>
      {cuts.length > 0 && <section className="wq-card"><header className="wq-card-head"><Scissors size={16} aria-hidden /><h3>سرجوش‌های برش‌خورده</h3></header><ul className="wq-list">{cuts.map((r) => <li key={r.weld.id}><button type="button" onClick={() => onOpen(r.weld.id)}><b>{weldLabel(r.weld)}</b><span className="ps-meta">{faDate(r.joint?.closedAt)}</span><ArrowLeft size={14} aria-hidden /></button></li>)}</ul></section>}
    </div>
  )
}
