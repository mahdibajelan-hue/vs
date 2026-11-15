import { useMemo, useState } from 'react'
import { Printer, Search, Users } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { codeOf, fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { CODES, CODE_FA, type Code } from '../lib/api1104'
import { PASS_FA, VERDICT_FA } from '../lib/rules'
import { PASSES } from '../lib/crew'
import { natural, pipeEnds } from '../lib/passport'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * جست‌وجوی عیوب — which welds of a section carry a given imperfection (e.g. cracks, when a hydrotest section loses
 * pressure and the leak has to be dug for), and which welds a given welder made there. The list prints as a field sheet.
 */
export function WqSearch({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const project = useMasterDataStore((x) => x.projects.find((p) => p.id === st.projectId))
  const [codes, setCodes] = useState<Code[]>(['C']), [sec, setSec] = useState(''), [welder, setWelder] = useState(''), [state, setState] = useState<'any' | 'open' | 'accepted_as_is' | 'repaired'>('any'), [mode, setMode] = useState<'defect' | 'welder'>('defect')
  const sections = useMemo(() => [...new Set(st.welds.map((w) => w.sec).filter(Boolean))].sort(natural), [st.welds])
  const ends = useMemo(() => pipeEnds(st.welds, st.pipes), [st.welds, st.pipes])
  const weldersOf = (r: (typeof q.rows)[number]) => [...new Set([...PASSES.flatMap((p) => r.weld.stampsBy[p]), ...r.crew.filter((c) => !c.removed).map((c) => c.welderKey)])]
  const allWelders = useMemo(() => [...new Set(q.rows.flatMap(weldersOf))].sort(natural), [q.rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // who made the most of the chosen imperfections (in the chosen section)
  const ranking = useMemo(() => {
    const m = new Map<string, { n: number; welds: Set<string> }>()
    for (const d of st.defects) { if (d.removed || !codes.includes(codeOf(d) as Code)) continue; const w = st.welds.find((x) => x.id === d.weldId); if (!w || (sec && w.sec !== sec)) continue; for (const k of d.welders) { const x = m.get(k) ?? { n: 0, welds: new Set<string>() }; x.n++; x.welds.add(d.weldId); m.set(k, x) } }
    return [...m].map(([k, v]) => ({ k, n: v.n, welds: v.welds.size })).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [st.defects, st.welds, codes, sec])

  const rows = useMemo(() => q.rows.filter((r) => !sec || r.weld.sec === sec).map((r) => {
    const all = st.defects.filter((d) => d.weldId === r.weld.id && !d.removed)
    const hit = all.filter((d) => codes.includes(codeOf(d) as Code) && (!welder || d.welders.includes(welder)))
    const mine = !welder || weldersOf(r).includes(welder)
    const repaired = st.repairs.some((x) => x.weldId === r.weld.id)
    return { r, all, hit, mine, repaired }
  }).filter((x) => (mode === 'welder' ? x.mine && !!welder : x.hit.length > 0)).filter((x) => state === 'any' || (state === 'open' ? !x.r.joint?.closed : state === 'repaired' ? x.repaired : x.hit.some((d) => d.verdict === 'accept')))
    .sort((a, b) => natural(a.r.weld.sec, b.r.weld.sec) || natural(a.r.weld.weld, b.r.weld.weld)), [q.rows, st.defects, st.repairs, codes, sec, welder, state, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = mode === 'welder' ? `سرجوش‌های جوشکار ${welder}${q.nameOf(welder) !== welder ? ` (${q.nameOf(welder)})` : ''}` : `سرجوش‌های دارای ${codes.map((c) => c).join('، ')}`
  const line = (d: (typeof st.defects)[number]) => `${codeOf(d) || d.type} ${fa(d.lengthMm, 0)}mm${d.clock != null ? ` ساعت ${fa(d.clock, 1)}` : ''}${d.pass ? ` · ${PASS_FA[d.pass]}` : ''}${d.round ? ` · RS${fa(d.round)}` : ''}${d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}`
  const print = () => {
    const win = window.open('', '_blank'); if (!win) return
    const tr = rows.map((x, i) => { const e = ends.get(x.r.weld.id), ds = (mode === 'welder' ? x.all : x.hit); return `<tr><td>${i + 1}</td><td dir="ltr"><b>${esc(weldLabel(x.r.weld))}</b></td><td dir="ltr">${esc(e?.a || '—')} ← ${esc(e?.b || x.r.weld.pipe || '—')}</td><td>${x.r.weld.tieKm != null ? esc(x.r.weld.tieKm) : '—'}</td><td>${esc(faDate(x.r.weld.weldDate || null))}</td><td>${ds.map((d) => esc(line(d))).join('<br>') || '—'}</td><td>${esc([...new Set(ds.flatMap((d) => d.welders))].join('، ') || weldersOf(x.r).join('، '))}</td><td>${x.repaired ? 'تعمیر شده' : '—'}</td><td>${x.r.joint?.closed ? esc(VERDICT_FA[x.r.joint.finalStatus ?? 'accept']) : 'باز'}</td><td class="chk"></td></tr>` }).join('')
    win.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap"><style>@page{size:A4 landscape;margin:10mm}body{font:10.5px/1.6 Vazirmatn,Tahoma,sans-serif;color:#0f172a;margin:0}h1{font-size:15px;margin:0}p{margin:2px 0 8px;color:#475569}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:3px 6px;text-align:right;vertical-align:top}th{background:#e2e8f0}.chk{width:60px}</style></head><body><h1>${esc(title)}${sec ? ` — مقطع ${esc(sec)}` : ''}</h1><p>${esc(project?.officialName ?? '')} · ${fa(rows.length)} سرجوش · ${esc(faDate(new Date().toISOString()))} · برگهٔ بازدید میدانی</p><table><thead><tr><th>#</th><th>مقطع / سرجوش</th><th>لولهٔ قبل ← بعد</th><th>کیلومتر</th><th>تاریخ جوش</th><th>ناپیوستگی‌ها</th><th>جوشکار</th><th>تعمیر</th><th>وضعیت</th><th>بازدید</th></tr></thead><tbody>${tr}</tbody></table></body></html>`)
    win.document.close(); void (win.document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(() => { try { win.focus(); win.print() } catch { /* closed */ } }, 400))
  }

  return (
    <div className="wq-assist">
      <section className="wq-card">
        <header className="wq-card-head"><Search size={16} aria-hidden /><h3>جست‌وجوی سرجوش بر اساس عیب، مقطع و جوشکار</h3><button type="button" className="ps-btn is-primary wq-head-link" disabled={!rows.length} onClick={print}><Printer size={14} aria-hidden /> چاپ فهرست ({fa(rows.length)})</button></header>
        <div className="wq-seg" role="group" aria-label="نوع جست‌وجو"><button type="button" aria-pressed={mode === 'defect'} onClick={() => setMode('defect')}>سرجوش‌های دارای عیب</button><button type="button" aria-pressed={mode === 'welder'} onClick={() => setMode('welder')}>همهٔ سرجوش‌های یک جوشکار</button></div>
        <div className="wq-form is-row" style={{ marginTop: '.6rem' }}>
          <label><span>مقطع (سکشن)</span><select value={sec} onChange={(e) => setSec(e.target.value)}><option value="">همهٔ مقطع‌ها</option>{sections.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          <label><span>جوشکار</span><select value={welder} onChange={(e) => setWelder(e.target.value)}><option value="">{mode === 'welder' ? 'انتخاب جوشکار…' : 'همهٔ جوشکاران'}</option>{allWelders.map((k) => <option key={k} value={k}>{k}{q.nameOf(k) !== k ? ` — ${q.nameOf(k)}` : ''}</option>)}</select></label>
          <label><span>وضعیت</span><select value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="any">همه</option><option value="open">پروندهٔ باز</option><option value="repaired">تعمیرشده</option><option value="accepted_as_is">عیب پذیرفته‌شده بدون تعمیر</option></select></label>
        </div>
        {mode === 'defect' && <div className="wq-codes" role="group" aria-label="نوع عیب">{CODES.map((c) => <button key={c} type="button" aria-pressed={codes.includes(c)} onClick={() => setCodes(codes.includes(c) ? codes.filter((x) => x !== c) : [...codes, c])} title={CODE_FA[c]}>{c}</button>)}<small className="ps-meta">{codes.map((c) => CODE_FA[c]).join('، ') || 'هیچ کدی انتخاب نشده'}</small></div>}
      </section>

      {mode === 'defect' && ranking.length > 0 && (
        <section className="wq-card">
          <header className="wq-card-head"><Users size={16} aria-hidden /><h3>جوشکاران با بیشترین این عیب{sec ? ` در مقطع ${sec}` : ''}</h3><span className="ps-meta">روی نام بزنید تا همهٔ سرجوش‌های او{sec ? ' در همین مقطع' : ''} بیاید</span></header>
          <div className="wq-rank">{ranking.map((x) => <button key={x.k} type="button" onClick={() => { setWelder(x.k); setMode('welder') }}><b className="ps-code">{x.k}</b><span>{q.nameOf(x.k) !== x.k ? q.nameOf(x.k) : '—'}</span><strong>{fa(x.n)}</strong><small>در {fa(x.welds)} سرجوش</small></button>)}</div>
        </section>
      )}

      <section className="wq-card">
        <header className="wq-card-head"><h3>{title}{sec ? ` — مقطع ${sec}` : ''}</h3><span className="ps-meta">{fa(rows.length)} سرجوش</span></header>
        {rows.length ? (
          <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>سرجوش</th><th>لولهٔ قبل ← بعد</th><th>تاریخ جوش</th><th>{mode === 'welder' ? 'ناپیوستگی‌های سرجوش' : 'ناپیوستگی‌های یافت‌شده'}</th><th>جوشکار</th><th>تعمیر</th><th>وضعیت</th></tr></thead>
            <tbody>{rows.map((x) => { const e = ends.get(x.r.weld.id), ds = mode === 'welder' ? x.all : x.hit; return (
              <tr key={x.r.weld.id} className="is-click" tabIndex={0} onClick={() => onOpen(x.r.weld.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen(x.r.weld.id) }}>
                <th scope="row">{weldLabel(x.r.weld)}</th><td><small dir="ltr">{e?.a || '—'} ← {e?.b || x.r.weld.pipe || '—'}</small></td><td>{faDate(x.r.weld.weldDate || null)}</td>
                <td>{ds.length ? ds.map((d) => <small key={d.id} style={{ display: 'block' }}>{line(d)}</small>) : <small className="ps-meta">بدون ناپیوستگی ثبت‌شده</small>}</td>
                <td><small>{[...new Set(ds.flatMap((d) => d.welders))].join('، ') || weldersOf(x.r).join('، ') || '—'}</small></td>
                <td>{x.repaired ? 'تعمیر شده' : '—'}</td><td className={x.r.joint?.finalStatus === 'cut_out' ? 'is-bad' : x.r.joint?.closed ? 'is-ok' : ''}>{x.r.joint?.closed ? VERDICT_FA[x.r.joint.finalStatus ?? 'accept'] : 'باز'}</td>
              </tr>
            ) })}</tbody></table></div>
        ) : <p className="ps-hint">{mode === 'welder' && !welder ? 'یک جوشکار انتخاب کنید.' : 'سرجوشی با این شرط‌ها پیدا نشد.'}</p>}
      </section>
    </div>
  )
}
