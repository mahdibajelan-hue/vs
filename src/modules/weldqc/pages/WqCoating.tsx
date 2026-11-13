import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Archive, PaintRoller, Shuffle, UserCheck } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { smoothed } from '../lib/health'

const RES = { '': '—', pass: 'قبول', repair: 'نیاز به تعمیر', fail: 'مردود' } as const
const KIND = { application: 'اجرا', inspection: 'بازرسی / آزمون', repair: 'تعمیر' } as const

/** پوشش سرجوش‌ها — applicators' records, the archive of inspections and random tests, and what is still missing */
export function WqCoating({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const [only, setOnly] = useState<'all' | 'random' | 'fail'>('all')
  const apps = useMemo(() => [...q.applicators].map(([k, v]) => ({ k, ...v, rate: smoothed(v.bad, v.n, q.projectCoatRate) })).sort((a, b) => a.rate - b.rate), [q])
  const recs = st.coatings.filter((c) => !c.removed).filter((c) => only === 'all' || (only === 'random' ? c.random : c.result === 'fail' || c.result === 'repair')).reverse()
  const coated = q.rows.filter((r) => r.weld.coat.fj || r.coatings.some((c) => c.kind === 'application'))
  const noInsp = coated.filter((r) => !r.weld.coat.bond && !r.coatings.some((c) => c.kind === 'inspection'))
  const randoms = st.coatings.filter((c) => !c.removed && c.random)
  return (
    <div className="wq-coating-page">
      <div className="wq-kpis">
        {[
          { i: PaintRoller, c: '#0891b2', v: fa(coated.length), l: 'سرجوش پوشش‌شده', s: `از ${fa(q.rows.length)} سرجوش` },
          { i: UserCheck, c: '#22c55e', v: `${fa((1 - q.projectCoatRate) * 100, 1)}٪`, l: 'پوشش قبول در اولین بازرسی', s: `${fa(q.projectCoatRate * 100, 1)}٪ رد یا تعمیر` },
          { i: Shuffle, c: '#8b5cf6', v: fa(randoms.length), l: 'آزمون تصادفی', s: `${fa(randoms.filter((c) => c.result === 'pass').length)} قبول` },
          { i: Archive, c: '#f59e0b', v: fa(noInsp.length), l: 'پوشش بدون بازرسی ثبت‌شده', s: 'منتظر آزمون چسبندگی / منفذیابی' },
        ].map(({ i: I, c, v, l, s }, k) => <div key={l} className="wq-kpi wq-rise" style={{ '--c': c, '--i': k } as CSSProperties}><span className="wq-kpi-ico"><I size={17} aria-hidden /></span><b>{v}</b><span>{l}</span><small>{s}</small></div>)}
      </div>
      <section className="wq-card wq-rise"><header className="wq-card-head"><UserCheck size={16} aria-hidden /><h3>پوشش‌کاران</h3><small className="ps-meta">نرخ رد هموارشده به سمت میانگین پروژه، تا یک کار بد کسی را محکوم نکند</small></header>
        {apps.length ? <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>پوشش‌کار</th><th>سرجوش</th><th>رد / تعمیر</th><th>نرخ رد (هموارشده)</th></tr></thead>
          <tbody>{apps.map((a) => <tr key={a.k}><td><b className="ps-code">{a.k}</b> {q.nameOf(a.k) !== a.k ? q.nameOf(a.k) : ''}</td><td>{fa(a.n)}</td><td>{fa(a.bad)}</td><td><span className="wq-pct" style={{ '--c': a.rate > q.projectCoatRate + 0.05 ? '#ef4444' : a.rate > q.projectCoatRate ? '#f59e0b' : '#22c55e', '--w': `${Math.min(100, a.rate * 300)}%` } as CSSProperties}><i />{fa(a.rate * 100, 1)}٪</span></td></tr>)}</tbody></table></div>
          : <p className="ps-hint">پوشش‌کار هنوز در سوابق پوشش ثبت نشده است (در شناسنامهٔ هر سرجوش ← پوشش).</p>}
      </section>
      <section className="wq-card wq-rise" style={{ '--i': 1 } as CSSProperties}><header className="wq-card-head"><Archive size={16} aria-hidden /><h3>بایگانی پوشش</h3>
        <div className="wq-chips wq-head-link">{(['all', 'random', 'fail'] as const).map((k) => <button key={k} type="button" className={only === k ? 'is-on' : ''} onClick={() => setOnly(k)}>{k === 'all' ? 'همه' : k === 'random' ? 'آزمون‌های تصادفی' : 'رد و تعمیر'}</button>)}</div></header>
        {recs.length ? <ul className="wq-list">{recs.map((c) => { const w = st.welds.find((x) => x.id === c.weldId); return (
          <li key={c.id}><button type="button" onClick={() => onOpen(c.weldId)}><b>{w ? weldLabel(w) : '—'}</b><span>{KIND[c.kind]}{c.random ? ' · تصادفی' : ''} · {c.applicatorKey || 'پوشش‌کار —'}</span><span className="ps-meta">{faDate(c.at)}{c.holidayCount != null ? ` · ${fa(c.holidayCount)} منفذ` : ''}{c.defects ? ` · ${c.defects}` : ''}</span><span className="wq-verdict" style={{ '--c': c.result === 'pass' ? '#22c55e' : c.result ? '#ef4444' : '#64748b' } as CSSProperties}>{RES[c.result]}</span><ArrowLeft size={14} aria-hidden /></button></li>
        ) })}</ul> : <p className="ps-hint">سابقه‌ای با این شرط نیست.</p>}
      </section>
      {noInsp.length > 0 && <section className="wq-card"><header className="wq-card-head"><PaintRoller size={16} aria-hidden /><h3>پوشش‌شده ولی بدون بازرسی ثبت‌شده</h3></header>
        <ul className="wq-list">{noInsp.slice(0, 40).map((r) => <li key={r.weld.id}><button type="button" onClick={() => onOpen(r.weld.id)}><b>{weldLabel(r.weld)}</b><span className="ps-meta">{r.weld.coat.fj ? `اجرا ${faDate(r.weld.coat.fj.date)}` : ''}</span><ArrowLeft size={14} aria-hidden /></button></li>)}</ul></section>}
    </div>
  )
}
