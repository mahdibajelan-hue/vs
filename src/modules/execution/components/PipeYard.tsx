import { useMemo, useState } from 'react'
import { Check, Layers, Search, Warehouse, X } from 'lucide-react'
import { fmtD } from '../../finance/components/fn'
import { fa } from './common'
import { KmInput } from './KmInput'
import { NO_FILTER, filterYard, stringRows, yardFacets, type YardFilter, type YardPipe } from '../lib/pipeYard'

/** one colour per wall thickness, thinnest first — the same colour on the chip, the tile and the pick summary */
const THK_COLORS = ['#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#10b981', '#eab308', '#fb7185']
const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v])
const inch = (v: number) => `${fa(v, 3)}″`

/**
 * «انتخاب لوله از دپو»: the stringing crew picks the day's pipes from the yard — filtered by depot, wall thickness and
 * size, oldest delivery first — and gets one row per pipe with its length and thickness from the register and, from a
 * start chainage, its place on the line. Pipes already strung never appear.
 */
export function PipeYard({ pipes, startKm, onAdd, onClose }: { pipes: YardPipe[]; startKm: number | null; onAdd: (rows: Record<string, unknown>[]) => void; onClose: () => void }) {
  const [f, setF] = useState<YardFilter>(NO_FILTER)
  const [sel, setSel] = useState<string[]>([])
  const [km, setKm] = useState<number | null>(startKm)
  const [quick, setQuick] = useState(10)
  const facets = useMemo(() => yardFacets(pipes), [pipes])
  const color = useMemo(() => new Map(facets.thks.map((t, i) => [t.value, THK_COLORS[i % THK_COLORS.length]])), [facets.thks])
  const list = useMemo(() => filterYard(pipes, f), [pipes, f])
  // pipes grouped by the day they arrived (the list is oldest first)
  const days = useMemo(() => { const m = new Map<string, YardPipe[]>(); for (const p of list) m.set(p.entryDate, [...(m.get(p.entryDate) ?? []), p]); return [...m] }, [list])
  const picked = useMemo(() => { const s = new Set(sel); return pipes.filter((p) => s.has(p.key)) }, [pipes, sel]) // kept in yard order (first in, first out)
  const meters = picked.reduce((s, p) => s + (p.lengthM ?? 0), 0)
  const byThk = useMemo(() => { const m = new Map<number, number>(); for (const p of picked) if (p.wtIn != null) m.set(p.wtIn, (m.get(p.wtIn) ?? 0) + 1); return [...m].sort((a, b) => a[0] - b[0]) }, [picked])
  const pickFirst = (n: number) => { const s = new Set(sel); for (const p of list) { if (s.size >= sel.length + n) break; s.add(p.key) } setSel([...s]) }
  const dayAll = (ps: YardPipe[]) => { const all = ps.every((p) => sel.includes(p.key)); setSel(all ? sel.filter((k) => !ps.some((p) => p.key === k)) : [...new Set([...sel, ...ps.map((p) => p.key)])]) }

  return (
    <div className="im-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="im-modal py-modal" role="dialog" aria-modal="true" aria-label="انتخاب لوله از دپو">
        <header className="py-head">
          <span className="py-ico" aria-hidden><Warehouse size={20} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="im-modal-title">انتخاب لوله از دپو</div>
            <p className="im-helper" style={{ margin: 0 }}>{fa(pipes.length)} لولهٔ ریسه‌نشده · {fa(pipes.reduce((s, p) => s + (p.lengthM ?? 0), 0), 0)} متر · قدیمی‌ترین ورود اول</p>
          </div>
          <button type="button" className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>

        <div className="py-filters">
          <label className="py-search"><Search size={14} aria-hidden /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="جستجوی شمارهٔ لوله" dir="ltr" aria-label="جستجوی شمارهٔ لوله" /></label>
          {facets.depots.length > 1 && <div className="py-row" role="group" aria-label="محل دپو"><span className="py-lbl">دپو</span>
            {facets.depots.map((d) => <button key={d.value} type="button" className="py-chip" aria-pressed={f.depots.includes(d.value)} onClick={() => setF({ ...f, depots: toggle(f.depots, d.value) })}>{d.value}<small>{fa(d.count)}</small></button>)}</div>}
          <div className="py-row" role="group" aria-label="ضخامت"><span className="py-lbl">ضخامت</span>
            {facets.thks.map((t) => <button key={t.value} type="button" className="py-chip" style={{ ['--c' as string]: color.get(t.value) }} aria-pressed={f.thks.includes(t.value)} onClick={() => setF({ ...f, thks: toggle(f.thks, t.value) })}><i className="py-sw" aria-hidden />{inch(t.value)}<small>{fa(t.count)} لوله · {fa(t.meters, 0)} متر</small></button>)}</div>
          {facets.sizes.length > 1 && <div className="py-row" role="group" aria-label="قطر"><span className="py-lbl">قطر</span>
            {facets.sizes.map((s) => <button key={s.value} type="button" className="py-chip" aria-pressed={f.sizes.includes(s.value)} onClick={() => setF({ ...f, sizes: toggle(f.sizes, s.value) })}>{fa(s.value)}″<small>{fa(s.count)}</small></button>)}</div>}
          <div className="py-row py-quick">
            <span className="im-helper" style={{ margin: 0 }}>{fa(list.length)} لوله با این فیلتر</span>
            <span className="py-q"><span>انتخاب</span><input type="number" min={1} max={500} value={quick} onChange={(e) => setQuick(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} aria-label="تعداد لوله برای انتخاب سریع" /><button type="button" className="im-btn im-btn-sm" onClick={() => pickFirst(quick)}>لولهٔ بعدی (قدیمی‌ترها)</button></span>
            {sel.length > 0 && <button type="button" className="im-btn im-btn-sm" onClick={() => setSel([])}>پاک کردن انتخاب</button>}
          </div>
        </div>

        <div className="py-yard">
          {list.length === 0 ? <p className="py-empty">{pipes.length === 0 ? 'لولهٔ ریسه‌نشده‌ای در رجیستر نیست؛ ابتدا صورتجلسهٔ ورود لوله را ثبت و ارسال کنید.' : 'لوله‌ای با این فیلتر نیست.'}</p>
            : days.map(([day, ps]) => { const on = ps.filter((p) => sel.includes(p.key)).length; return (
              <section key={day} className="py-day">
                <header><b>ورود {fmtD(day)}</b><span>{fa(ps.length)} لوله</span><button type="button" className="py-dayall" onClick={() => dayAll(ps)}>{on === ps.length ? 'برداشتن همه' : 'انتخاب همه'}</button></header>
                <div className="py-grid">
                  {ps.map((p) => { const s = sel.includes(p.key); return (
                    <button key={p.key} type="button" className="py-tile" aria-pressed={s} style={{ ['--c' as string]: p.wtIn != null ? color.get(p.wtIn) : '#64748b' }} onClick={() => setSel(s ? sel.filter((k) => k !== p.key) : [...sel, p.key])}
                      title={`${p.raw} · ${p.lengthM ?? '—'} m · ${p.wtIn ?? '—'}″ · ${p.depot}${p.pending ? ' · صورتجلسهٔ ورود هنوز تأیید نشده' : ''}`}>
                      <span className="py-pipe" aria-hidden><i /></span>
                      <b dir="ltr">{p.raw}</b>
                      <small>{p.lengthM != null ? `${fa(p.lengthM, 2)} متر` : '—'} · {p.wtIn != null ? inch(p.wtIn) : '—'}</small>
                      {p.pending && <em>در انتظار تأیید ورود</em>}
                      {s && <span className="py-check" aria-hidden><Check size={12} strokeWidth={3} /></span>}
                    </button>
                  ) })}
                </div>
              </section>
            ) })}
        </div>

        <footer className="py-foot">
          <div className="py-sum">
            <Layers size={16} aria-hidden />
            <b>{fa(picked.length)} لوله</b><span>{fa(meters, 1)} متر</span>
            {byThk.map(([t, n]) => <span key={t} className="py-mini" style={{ ['--c' as string]: color.get(t) }}><i className="py-sw" aria-hidden />{inch(t)} × {fa(n)}</span>)}
          </div>
          <label className="py-km"><span>کیلومتر شروع ریسه</span><KmInput value={km} onValue={setKm} label="کیلومتر شروع ریسه" placeholder="اختیاری" /></label>
          <button type="button" className="im-btn im-btn-primary" disabled={!picked.length} onClick={() => onAdd(stringRows(picked, km))}><Check size={15} /> افزودن {fa(picked.length)} لوله به گزارش</button>
        </footer>
      </div>
    </div>
  )
}
