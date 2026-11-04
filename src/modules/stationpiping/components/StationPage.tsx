import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, CheckCircle2, Paintbrush, ShieldCheck, Sparkles, ExternalLink, FileUp, Flame, Layers, ListChecks, Map as MapIcon, Pencil, Plus, Save, Trash2, Upload, XCircle } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { ShamsiDate } from '../../../components/common/ShamsiField'
import { SCurveChart } from '../../../components/charts/SCurveChart'
import { todayTehran } from '../../../lib/today'
import { useRemembered } from '../../../lib/navMemory'
import { tableFromSheet } from '../../landacq/lib/routeImport'
import { useSpStore } from '../store/useSpStore'
import {
  AUTO_DISC, COAT_TYPES, DEFAULT_WEIGHTS, JOINT_DISC, DISC_COLOR, DISC_FA, DISCIPLINES, JOINT_FA, KIND_FA, NDT_FA, diOf, progressCurve, scopeTemplate, stationProgress, weldFromSheet,
  type Discipline, type Item, type JointType, type NdtResult, type StationKind, type Weld,
} from '../lib/spCore'
import { DRAWING_KIND_FA, DRAWING_STATUS_FA, drawingUrl, type DrawingKind, type DrawingStatus, type StationRec } from '../repo'
import { Bar, fa, jd, pct } from '../StationPipingApp'
import { WeldMap } from './WeldMap'

type Sub = 'overview' | 'scope' | 'welds' | 'drawings' | 'map'

export function StationPage({ station, onBack }: { station: StationRec; onBack: () => void }) {
  const st = useSpStore()
  const [sub, setSub] = useRemembered<Sub>('stationSub', 'overview', (v) => typeof v === 'string')
  const items = st.items.filter((i) => i.stationId === station.id)
  const welds = st.welds.filter((w) => w.stationId === station.id)
  const p = useMemo(() => stationProgress(station, items, st.logs.filter((l) => l.stationId === station.id), welds, todayTehran()), [station, items, st.logs, welds])
  return (
    <div className="ps-stack">
      <nav className="ps-sysnav">
        <button type="button" className="ps-btn is-primary" onClick={onBack}><ArrowRight size={14} /> بازگشت</button>
        <div className="spx-subtabs" role="tablist">
          {([['overview', 'نمای کلی', Layers], ['scope', 'محدودهٔ کار', ListChecks], ['welds', 'خطوط و جوش‌ها', Flame], ['drawings', 'نقشه‌ها', FileUp], ['map', 'نقشهٔ جوش', MapIcon]] as const).map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)}><I size={14} aria-hidden /> {l}</button>
          ))}
        </div>
      </nav>
      <header className="ps-card spx-head">
        <div><b dir="ltr">{station.code}</b><span>{station.name}</span><small>{KIND_FA[station.kind]}{station.km != null ? ` · کیلومتر ${fa(station.km, 3)}` : ''} · برنامه {jd(station.plannedStart)} ← {jd(station.plannedFinish)}</small></div>
        <div className="spx-head-pct"><b>{pct(p.actual)}</b><small>برنامه {pct(p.planned)}</small><Bar actual={p.actual} planned={p.planned} /></div>
      </header>
      {sub === 'overview' ? <Overview station={station} p={p} />
        : sub === 'scope' ? <Scope station={station} items={items} />
        : sub === 'welds' ? <Welds station={station} />
        : sub === 'drawings' ? <Drawings station={station} />
        : <WeldMap station={station} />}
    </div>
  )
}

// ── overview: discipline progress, curve, station settings ──────────────────
function Overview({ station, p }: { station: StationRec; p: ReturnType<typeof stationProgress> }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const today = todayTehran()
  const curve = useMemo(() => progressCurve([station], st.items.filter((i) => i.stationId === station.id), st.logs.filter((l) => l.stationId === station.id), st.welds.filter((w) => w.stationId === station.id), today), [station, st.items, st.logs, st.welds, today])
  const [f, setF] = useState({ name: station.name, kind: station.kind, km: station.km == null ? '' : String(station.km), start: station.plannedStart ?? '', finish: station.plannedFinish ?? '', weights: { ...DEFAULT_WEIGHTS, ...(station.weights ?? {}) } as Record<Discipline, number> })
  return (
    <>
      <section className="ps-card">
        <header className="ps-card-head"><b>پیشرفت رشته‌ها</b><small className="ps-meta">خط عمودی روی هر نوار = پیشرفت برنامه‌ای</small></header>
        <div className="spx-disc">
          {p.disciplines.map((d) => (
            <div key={d.discipline} className={`spx-disc-row${d.hasScope ? '' : ' is-none'}`} style={{ '--c': DISC_COLOR[d.discipline] } as CSSProperties}>
              <span className="spx-disc-name"><i />{DISC_FA[d.discipline]}<small>وزن {fa(d.weight)}</small></span>
              {d.hasScope ? <><Bar actual={d.actual} planned={d.planned} color={DISC_COLOR[d.discipline]} /><b>{pct(d.actual)}</b>
                <small className="spx-disc-basis">{AUTO_DISC.includes(d.discipline) || (JOINT_DISC.includes(d.discipline) && d.basis.unit !== 'وزن') ? (d.basis.total === 100 ? `${d.basis.unit.replace(/^٪ /, '')} · برنامه ${pct(d.planned)}` : `${fa(d.basis.done, 1)} از ${fa(d.basis.total, 1)} ${d.basis.unit}`) : `برنامه ${pct(d.planned)}`}</small></>
                : <small className="spx-disc-basis">بدون محدودهٔ کار</small>}
            </div>
          ))}
        </div>
      </section>
      {curve.length > 1 && <section className="ps-card"><header className="ps-card-head"><b>منحنی پیشرفت ایستگاه</b></header>
        <SCurveChart rows={curve.map((c) => ({ date: c.at, planned: c.planned, actual: c.actual }))} series={[{ key: 'planned', label: 'برنامه‌ای', color: '#94a3b8', kind: 'planned' }, { key: 'actual', label: 'واقعی', color: '#6366f1', kind: 'actual' }]} markers={[{ date: today, label: 'امروز', color: '#f97316', strong: true }]} h={240} /></section>}
      <section className="ps-card">
        <header className="ps-card-head"><b><Pencil size={15} /> مشخصات و وزن رشته‌ها</b><small className="ps-meta">وزن، سهم هر رشته در پیشرفت ایستگاه است</small></header>
        <div className="ps-grid">
          <label className="ps-field"><span>نام</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="ps-field"><span>نوع</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as StationKind })}>{(Object.keys(KIND_FA) as StationKind[]).map((k) => <option key={k} value={k}>{KIND_FA[k]}</option>)}</select></label>
          <label className="ps-field"><span>کیلومتر</span><input type="number" step="0.001" dir="ltr" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} /></label>
          <div className="ps-field"><span>شروع برنامه‌ای</span><ShamsiDate value={f.start} onChange={(v) => setF({ ...f, start: v })} label="شروع" clearable /></div>
          <div className="ps-field"><span>پایان برنامه‌ای</span><ShamsiDate value={f.finish} onChange={(v) => setF({ ...f, finish: v })} label="پایان" clearable /></div>
        </div>
        <div className="ps-grid">{DISCIPLINES.map((d) => <label key={d} className="ps-field"><span>{DISC_FA[d]}</span><input type="number" min={0} dir="ltr" value={f.weights[d]} onChange={(e) => setF({ ...f, weights: { ...f.weights, [d]: Number(e.target.value) || 0 } })} /></label>)}</div>
        <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void st.saveStation({ ...station, name: f.name, kind: f.kind, km: f.km === '' ? null : Number(f.km), plannedStart: f.start || null, plannedFinish: f.finish || null, weights: f.weights }, email)}><Save size={14} /> ذخیره</button></div>
      </section>
    </>
  )
}

// ── scope: work items by discipline ─────────────────────────────────────────
function Scope({ station, items }: { station: StationRec; items: Item[] }) {
  const st = useSpStore()
  const [rows, setRows] = useState<(Partial<Item> & { discipline: Discipline; title: string; key: string })[]>(() => items.filter((i) => !AUTO_DISC.includes(i.discipline)).sort((a, b) => DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline) || a.sort - b.sort).map((i) => ({ ...i, key: i.id })))
  const done = useMemo(() => { const m = new Map<string, number>(); for (const l of st.logs) if (l.stationId === station.id) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty); return m }, [st.logs, station.id])
  const up = (k: string, patch: Partial<Item>) => setRows(rows.map((r) => (r.key === k ? { ...r, ...patch } : r)))
  const save = () => st.saveItems(rows.filter((r) => r.title.trim()).map((r, i) => ({ id: r.id, stationId: station.id, discipline: r.discipline, code: r.code ?? '', title: r.title, unit: r.unit ?? '', qty: Number(r.qty) || 0, weight: Number(r.weight) || 0, plannedStart: r.plannedStart ?? null, plannedFinish: r.plannedFinish ?? null, sort: i })))
  return (
    <section className="ps-card">
      <header className="ps-card-head"><b><ListChecks size={15} /> محدودهٔ کار ایستگاه</b><small className="ps-meta">مقدار کل و وزن هر آیتم؛ پیشرفت از کارکرد روزانه حساب می‌شود. جوشکاری و رادیوگرافی از ثبت جوش‌ها می‌آیند؛ زنگ‌زدایی و عایق‌کاری سرجوش‌ها هم از ثبت جوش‌ها و سطح لوله‌ها از همین آیتم‌ها.</small></header>
      <div className="ps-table-wrap"><table className="ps-table spx-scope">
        <thead><tr><th>رشته</th><th>کد</th><th>شرح</th><th>واحد</th><th>مقدار کل</th><th>وزن</th><th>شروع</th><th>پایان</th><th>انجام‌شده</th><th /></tr></thead>
        <tbody>{rows.map((r) => { const d = r.id ? done.get(r.id) ?? 0 : 0; return <tr key={r.key}>
          <td><select value={r.discipline} onChange={(e) => up(r.key, { discipline: e.target.value as Discipline })}>{DISCIPLINES.filter((x) => !AUTO_DISC.includes(x)).map((x) => <option key={x} value={x}>{DISC_FA[x]}</option>)}</select></td>
          <td><input value={r.code ?? ''} dir="ltr" onChange={(e) => up(r.key, { code: e.target.value })} aria-label="کد" /></td>
          <td><input value={r.title} onChange={(e) => up(r.key, { title: e.target.value })} aria-label="شرح" style={{ minWidth: '13rem' }} /></td>
          <td><input value={r.unit ?? ''} onChange={(e) => up(r.key, { unit: e.target.value })} aria-label="واحد" style={{ width: '4.5rem' }} /></td>
          <td><input type="number" dir="ltr" value={r.qty ?? ''} onChange={(e) => up(r.key, { qty: Number(e.target.value) })} aria-label="مقدار کل" /></td>
          <td><input type="number" dir="ltr" value={r.weight ?? ''} onChange={(e) => up(r.key, { weight: Number(e.target.value) })} aria-label="وزن" style={{ width: '4.5rem' }} /></td>
          <td><ShamsiDate value={r.plannedStart ?? ''} onChange={(v) => up(r.key, { plannedStart: v || null })} label="شروع" clearable /></td>
          <td><ShamsiDate value={r.plannedFinish ?? ''} onChange={(v) => up(r.key, { plannedFinish: v || null })} label="پایان" clearable /></td>
          <td className="ps-nowrap">{fa(d, 2)} <small className="ps-meta">{r.qty ? pct((d / Number(r.qty)) * 100, 0) : ''}</small></td>
          <td><button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => { if (r.id) { if (window.confirm(`«${r.title}» و کارکردهای آن حذف شود؟`)) { void st.archiveItem(r.id); setRows(rows.filter((x) => x.key !== r.key)) } } else setRows(rows.filter((x) => x.key !== r.key)) }}><Trash2 size={13} /></button></td>
        </tr> })}</tbody>
      </table></div>
      <div className="ps-actions">
        <button type="button" className="ps-btn" onClick={() => setRows([...rows, { key: crypto.randomUUID(), discipline: 'civil', title: '', unit: '', qty: 0, weight: 1 }])}><Plus size={14} /> آیتم جدید</button>
        {rows.length === 0 && <button type="button" className="ps-btn" onClick={() => setRows(scopeTemplate(station.kind).map((t) => ({ ...t, key: crypto.randomUUID() })))}><Layers size={14} /> محدودهٔ پیش‌فرض «{KIND_FA[station.kind]}»</button>}
        <button type="button" className="ps-btn is-primary" onClick={() => void save()}><Save size={14} /> ذخیرهٔ محدودهٔ کار</button>
      </div>
    </section>
  )
}

// ── piping lines and the weld register ──────────────────────────────────────
type Filter = 'all' | 'todo' | 'ndt' | 'rejected' | 'blast' | 'coat'
/** welds waiting for each stage of the chain: weld → radiography → blasting → field-joint coating (buried joints) */
const inFilter = (w: Weld, k: Filter) => k === 'all' || (k === 'todo' ? !w.weldDate : k === 'ndt' ? !!w.weldDate && w.ndtResult === 'pending' : k === 'rejected' ? w.ndtResult === 'rejected'
  : k === 'blast' ? !!w.weldDate && (w.ndtResult === 'accepted' || w.ndtResult === 'na') && !w.blastDate : w.buried && !!w.blastDate && !w.coatDate)
function Welds({ station }: { station: StationRec }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const lines = st.lines.filter((l) => l.stationId === station.id)
  const welds = st.welds.filter((w) => w.stationId === station.id).sort((a, b) => a.weldNo.localeCompare(b.weldNo, 'en', { numeric: true }))
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<(Partial<Weld> & { weldNo: string }) | null>(null)
  const [bulk, setBulk] = useState({ date: todayTehran(), welder: '', coatType: COAT_TYPES[0] })
  const [ln, setLn] = useState({ lineNo: '', isoNo: '', size: '', material: '', service: '', length: '', testPack: '' })
  const shown = welds.filter((w) => inFilter(w, filter))
  const ids = [...sel].filter((id) => shown.some((w) => w.id === id))
  const importSheet = async (file: File) => {
    const t = await tableFromSheet(file); const [h, ...body] = t as unknown[][]
    if (!h) return
    const rows = body.map((r) => Object.fromEntries((h as unknown[]).map((k, i) => [String(k ?? ''), r[i]]))).map(weldFromSheet).filter((x): x is NonNullable<typeof x> => !!x)
    if (!rows.length) { useSpStore.setState({ error: 'ستون «Weld No» (شمارهٔ جوش) در فایل پیدا نشد.' }); return }
    await st.upsertWelds(rows.map((r) => ({ ...r, stationId: station.id })), email)
  }
  return (
    <>
      <section className="ps-card">
        <header className="ps-card-head"><b>خطوط لوله (Line List)</b><small className="ps-meta">{fa(lines.length)} خط</small></header>
        {lines.length > 0 && <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>شمارهٔ خط</th><th>ایزومتریک</th><th>قطر</th><th>جنس / کلاس</th><th>سرویس</th><th>طول (m)</th><th>تست پک</th><th>جوش</th><th /></tr></thead>
          <tbody>{lines.map((l) => { const lw = welds.filter((w) => w.lineId === l.id); return <tr key={l.id}><td dir="ltr"><b>{l.lineNo}</b></td><td dir="ltr">{l.isoNo}</td><td>{l.sizeIn == null ? '—' : `${fa(l.sizeIn, 2)}″`}</td><td>{l.material}</td><td>{l.service}</td><td>{l.lengthM == null ? '—' : fa(l.lengthM, 1)}</td><td dir="ltr">{l.testPack}</td><td>{fa(lw.filter((w) => w.weldDate).length)} / {fa(lw.length)}</td>
            <td><button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => { if (window.confirm(`خط ${l.lineNo} حذف شود؟`)) void st.archiveLine(l.id) }}><Trash2 size={13} /></button></td></tr> })}</tbody></table></div>}
        <div className="ps-grid">
          <label className="ps-field"><span>شمارهٔ خط *</span><input dir="ltr" value={ln.lineNo} onChange={(e) => setLn({ ...ln, lineNo: e.target.value })} placeholder='8"-GAS-101-A1' /></label>
          <label className="ps-field"><span>شمارهٔ ایزومتریک</span><input dir="ltr" value={ln.isoNo} onChange={(e) => setLn({ ...ln, isoNo: e.target.value })} /></label>
          <label className="ps-field"><span>قطر (اینچ)</span><input type="number" dir="ltr" value={ln.size} onChange={(e) => setLn({ ...ln, size: e.target.value })} /></label>
          <label className="ps-field"><span>جنس / کلاس</span><input value={ln.material} onChange={(e) => setLn({ ...ln, material: e.target.value })} /></label>
          <label className="ps-field"><span>سرویس</span><input value={ln.service} onChange={(e) => setLn({ ...ln, service: e.target.value })} /></label>
          <label className="ps-field"><span>طول (m)</span><input type="number" dir="ltr" value={ln.length} onChange={(e) => setLn({ ...ln, length: e.target.value })} /></label>
          <label className="ps-field"><span>تست پک</span><input dir="ltr" value={ln.testPack} onChange={(e) => setLn({ ...ln, testPack: e.target.value })} /></label>
        </div>
        <div className="ps-actions"><button type="button" className="ps-btn" disabled={!ln.lineNo.trim()} onClick={async () => { if (await st.saveLine({ stationId: station.id, lineNo: ln.lineNo, isoNo: ln.isoNo, sizeIn: ln.size === '' ? null : Number(ln.size), material: ln.material, service: ln.service, lengthM: ln.length === '' ? null : Number(ln.length), testPack: ln.testPack })) setLn({ lineNo: '', isoNo: '', size: '', material: '', service: '', length: '', testPack: '' }) }}><Plus size={14} /> افزودن خط</button></div>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><Flame size={15} /> ثبت جوش‌ها (Weld Log)</b><small className="ps-meta">{fa(welds.filter((w) => w.weldDate).length)} از {fa(welds.length)} جوش · {fa(welds.reduce((s, w) => s + (w.weldDate ? diOf(w) : 0), 0), 1)} از {fa(welds.reduce((s, w) => s + diOf(w), 0), 1)} اینچ‌قطر</small></header>
        <div className="spx-toolbar">
          <div className="spx-seg" role="tablist">{([['all', 'همه'], ['todo', 'زده‌نشده'], ['ndt', 'در انتظار رادیوگرافی'], ['rejected', 'مردود'], ['blast', 'در انتظار زنگ‌زدایی'], ['coat', 'در انتظار عایق']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l} <i>{fa(welds.filter((w) => inFilter(w, k)).length)}</i></button>)}</div>
          <button type="button" className="ps-btn" onClick={() => setEdit({ weldNo: '', stationId: station.id, sizeIn: lines[0]?.sizeIn ?? 0, jointType: 'BW', ndtMethod: 'RT', ndtResult: 'pending', shopField: 'field', buried: true })}><Plus size={14} /> جوش جدید</button>
          <label className="ps-btn"><Upload size={14} /> ورود از اکسل<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) void importSheet(fl) }} /></label>
        </div>
        {ids.length > 0 && (
          <div className="spx-bulk">
            <b>{fa(ids.length)} جوش انتخاب‌شده</b>
            <ShamsiDate value={bulk.date} onChange={(v) => setBulk({ ...bulk, date: v })} max={todayTehran()} label="تاریخ" />
            <input placeholder="جوشکار (Stamp)" dir="ltr" value={bulk.welder} onChange={(e) => setBulk({ ...bulk, welder: e.target.value })} aria-label="جوشکار" />
            <button type="button" className="ps-btn is-primary" onClick={async () => { if (await st.patchWelds(ids, { weld_date: bulk.date, ...(bulk.welder ? { welder: bulk.welder } : {}) }, 'جوشکاری ثبت شد')) setSel(new Set()) }}><Flame size={13} /> ثبت جوشکاری</button>
            <button type="button" className="ps-btn" onClick={async () => { if (await st.patchWelds(ids, { ndt_date: bulk.date, ndt_result: 'accepted' }, 'NDT قبول ثبت شد')) setSel(new Set()) }}><CheckCircle2 size={13} /> NDT قبول</button>
            <button type="button" className="ps-btn" onClick={async () => { const ws = welds.filter((w) => ids.includes(w.id)); for (const w of ws) await st.patchWelds([w.id], { ndt_date: bulk.date, ndt_result: 'rejected', repairs: w.repairs + 1 }, 'NDT مردود ثبت شد'); setSel(new Set()) }}><XCircle size={13} /> NDT مردود</button>
            <button type="button" className="ps-btn" onClick={async () => { if (await st.patchWelds(ids, { blast_date: bulk.date }, 'زنگ‌زدایی سرجوش ثبت شد')) setSel(new Set()) }}><Sparkles size={13} /> زنگ‌زدایی</button>
            <select value={bulk.coatType} onChange={(e) => setBulk({ ...bulk, coatType: e.target.value })} aria-label="نوع عایق سرجوش">{COAT_TYPES.map((c) => <option key={c}>{c}</option>)}</select>
            <button type="button" className="ps-btn" onClick={async () => { const buried = welds.filter((w) => ids.includes(w.id) && w.buried).map((w) => w.id); if (!buried.length) { useSpStore.setState({ error: 'جوش‌های انتخاب‌شده روزمینی‌اند؛ سرجوش روزمینی با رنگ‌آمیزی پوشش داده می‌شود.' }); return } if (await st.patchWelds(buried, { coat_date: bulk.date, coat_type: bulk.coatType }, 'عایق‌کاری سرجوش ثبت شد')) setSel(new Set()) }}><ShieldCheck size={13} /> عایق سرجوش</button>
            <button type="button" className="ps-btn is-ghost" onClick={async () => { if (await st.patchWelds(ids, { buried: false }, 'جوش‌ها روزمینی شدند')) setSel(new Set()) }}><Paintbrush size={13} /> روزمینی</button>
            <button type="button" className="ps-btn is-ghost" onClick={async () => { if (await st.patchWelds(ids, { buried: true }, 'جوش‌ها مدفون شدند')) setSel(new Set()) }}>مدفون</button>
          </div>
        )}
        {shown.length === 0 ? <p className="ps-hint">{welds.length ? 'جوشی در این دسته نیست.' : 'هنوز جوشی ثبت نشده است. جوش‌ها را تک‌به‌تک یا از فایل اکسل (ستون‌ها: Weld No، Size، Type، Welder، Weld Date، NDT، NDT Date، NDT Result، Blast Date، Coat Date، Location) وارد کنید.'}</p> : (
          <div className="ps-table-wrap"><table className="ps-table spx-welds">
            <thead><tr><th><input type="checkbox" aria-label="انتخاب همه" checked={ids.length === shown.length} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((w) => w.id)) : new Set())} /></th><th>شمارهٔ جوش</th><th>خط</th><th>قطر</th><th>نوع</th><th>جوشکار</th><th>تاریخ جوش</th><th>رادیوگرافی / NDT</th><th>نتیجه</th><th>تعمیر</th><th>زنگ‌زدایی</th><th>عایق سرجوش</th><th>روی نقشه</th><th /></tr></thead>
            <tbody>{shown.map((w) => <tr key={w.id} className={w.ndtResult === 'rejected' ? 'is-bad' : ''}>
              <td><input type="checkbox" checked={sel.has(w.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(w.id); else n.delete(w.id); setSel(n) }} aria-label={`انتخاب ${w.weldNo}`} /></td>
              <td dir="ltr"><b>{w.weldNo}</b></td><td dir="ltr">{lines.find((l) => l.id === w.lineId)?.lineNo ?? '—'}</td><td>{fa(w.sizeIn, 2)}″</td><td>{w.jointType}{w.shopField === 'shop' ? ' · کارگاهی' : ''}</td>
              <td dir="ltr">{w.welder || '—'}</td><td>{jd(w.weldDate)}</td><td>{w.ndtMethod || '—'}{w.ndtDate ? <small className="ps-meta"> {jd(w.ndtDate)}</small> : null}</td>
              <td><span className={`spx-ndt is-${w.ndtResult}`}>{NDT_FA[w.ndtResult]}</span></td><td>{w.repairs ? fa(w.repairs) : '—'}</td><td>{jd(w.blastDate)}</td>
              <td>{w.buried ? (w.coatDate ? <>{jd(w.coatDate)}{w.coatType && <small className="ps-meta"> {w.coatType.split(' (')[0]}</small>}</> : '—') : <span className="spx-chip">روزمینی</span>}</td><td>{w.x != null ? '✓' : '—'}</td>
              <td className="ps-nowrap"><button type="button" className="ps-btn is-ghost" aria-label="ویرایش" onClick={() => setEdit(w)}><Pencil size={13} /></button>
                <button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => { if (window.confirm(`جوش ${w.weldNo} حذف شود؟`)) void st.archiveWeld(w.id) }}><Trash2 size={13} /></button></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      {edit && <WeldForm station={station} w={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
export function WeldForm({ station, w, onClose }: { station: StationRec; w: Partial<Weld> & { weldNo: string }; onClose: () => void }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const lines = st.lines.filter((l) => l.stationId === station.id)
  const [f, setF] = useState(w)
  const set = (p: Partial<Weld>) => setF({ ...f, ...p })
  const N = (k: keyof Weld, label: string, step = 0.01) => <label className="ps-field"><span>{label}</span><input type="number" step={step} dir="ltr" value={f[k] == null ? '' : String(f[k])} onChange={(e) => set({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Weld>)} /></label>
  const T = (k: keyof Weld, label: string) => <label className="ps-field"><span>{label}</span><input dir="ltr" value={String(f[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Weld>)} /></label>
  const D = (k: 'fitupDate' | 'weldDate' | 'ndtDate' | 'blastDate' | 'coatDate', label: string) => <div className="ps-field"><span>{label}</span><ShamsiDate value={f[k] ?? ''} onChange={(v) => set({ [k]: v || null })} label={label} clearable max={todayTehran()} /></div>
  return (
    <section className="ps-card spx-weld-form">
      <header className="ps-card-head"><b><Flame size={15} /> {w.id ? `ویرایش جوش ${w.weldNo}` : 'جوش جدید'}</b></header>
      <div className="ps-grid">
        {T('weldNo', 'شمارهٔ جوش *')}
        <label className="ps-field"><span>خط</span><select value={f.lineId ?? ''} onChange={(e) => { const l = lines.find((x) => x.id === e.target.value); set({ lineId: e.target.value || null, ...(l?.sizeIn && !f.sizeIn ? { sizeIn: l.sizeIn } : {}) }) }}><option value="">—</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.lineNo}</option>)}</select></label>
        {N('sizeIn', 'قطر (اینچ) *')}{N('thkMm', 'ضخامت (mm)', 0.1)}
        <label className="ps-field"><span>نوع اتصال</span><select value={f.jointType ?? 'BW'} onChange={(e) => set({ jointType: e.target.value as JointType })}>{(Object.keys(JOINT_FA) as JointType[]).map((k) => <option key={k} value={k}>{JOINT_FA[k]}</option>)}</select></label>
        <label className="ps-field"><span>محل</span><select value={f.shopField ?? 'field'} onChange={(e) => set({ shopField: e.target.value as 'shop' | 'field' })}><option value="field">سایت (Field)</option><option value="shop">کارگاهی (Shop)</option></select></label>
        {T('material', 'جنس')}{T('wps', 'WPS')}{T('welder', 'جوشکار (Stamp)')}
        {D('fitupDate', 'تاریخ فیت‌آپ')}{D('weldDate', 'تاریخ جوش')}
        <label className="ps-field"><span>روش NDT</span><select value={f.ndtMethod ?? 'RT'} onChange={(e) => set({ ndtMethod: e.target.value })}>{['RT', 'UT', 'PAUT', 'MT', 'PT', 'VT', 'none'].map((m) => <option key={m} value={m}>{m === 'none' ? 'بدون NDT' : m}</option>)}</select></label>
        {D('ndtDate', 'تاریخ NDT')}
        <label className="ps-field"><span>نتیجهٔ NDT</span><select value={f.ndtResult ?? 'pending'} onChange={(e) => set({ ndtResult: e.target.value as NdtResult })}>{(Object.keys(NDT_FA) as NdtResult[]).map((k) => <option key={k} value={k}>{NDT_FA[k]}</option>)}</select></label>
        {N('repairs', 'تعداد تعمیر', 1)}
        <label className="ps-field"><span>موقعیت سرجوش</span><select value={f.buried === false ? 'above' : 'buried'} onChange={(e) => set({ buried: e.target.value === 'buried' })}><option value="buried">مدفون — عایق سرجوش</option><option value="above">روزمینی — رنگ‌آمیزی</option></select></label>
        {D('blastDate', 'تاریخ زنگ‌زدایی (سندبلاست)')}
        {f.buried !== false && <>{D('coatDate', 'تاریخ عایق‌کاری سرجوش')}
          <label className="ps-field"><span>نوع عایق</span><select value={f.coatType ?? ''} onChange={(e) => set({ coatType: e.target.value })}><option value="">—</option>{COAT_TYPES.map((c) => <option key={c}>{c}</option>)}</select></label></>}
        <label className="ps-field is-wide"><span>توضیح</span><input value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></label>
      </div>
      <div className="ps-actions">
        <button type="button" className="ps-btn is-primary" disabled={!f.weldNo?.trim() || !(Number(f.sizeIn) > 0)} onClick={async () => { if (await st.saveWeld({ ...f, stationId: station.id, weldNo: f.weldNo }, email)) onClose() }}><Save size={14} /> ذخیرهٔ جوش</button>
        <button type="button" className="ps-btn is-ghost" onClick={onClose}>انصراف</button>
      </div>
    </section>
  )
}

// ── drawings ────────────────────────────────────────────────────────────────
function Drawings({ station }: { station: StationRec }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const list = st.drawings.filter((d) => d.stationId === station.id)
  const [f, setF] = useState({ kind: 'piping' as DrawingKind, number: '', title: '', rev: '0', status: 'afc' as DrawingStatus, file: null as File | null })
  const [busy, setBusy] = useState(false)
  const open = async (path: string, name?: string) => { try { window.open(await drawingUrl(path, name), '_blank', 'noopener') } catch (e) { useSpStore.setState({ error: (e as Error).message }) } }
  return (
    <>
      <section className="ps-card">
        <header className="ps-card-head"><b><FileUp size={15} /> بارگذاری نقشه</b><small className="ps-meta">PDF، تصویر (PNG / JPG / SVG) یا DWG تا ۳۰ مگابایت؛ برای «نقشهٔ جوش» تصویر بارگذاری کنید تا جوش‌ها روی آن علامت بخورند</small></header>
        <div className="ps-grid">
          <label className="ps-field"><span>نوع نقشه</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DrawingKind })}>{(Object.keys(DRAWING_KIND_FA) as DrawingKind[]).map((k) => <option key={k} value={k}>{DRAWING_KIND_FA[k]}</option>)}</select></label>
          <label className="ps-field"><span>شمارهٔ نقشه</span><input dir="ltr" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></label>
          <label className="ps-field"><span>عنوان</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="ps-field"><span>ویرایش</span><input dir="ltr" value={f.rev} onChange={(e) => setF({ ...f, rev: e.target.value })} /></label>
          <label className="ps-field"><span>وضعیت</span><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as DrawingStatus })}>{(Object.keys(DRAWING_STATUS_FA) as DrawingStatus[]).map((k) => <option key={k} value={k}>{DRAWING_STATUS_FA[k]}</option>)}</select></label>
          <label className="ps-field"><span>فایل *</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,.webp,.dwg,.dxf" onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} /></label>
        </div>
        <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!f.file || busy} onClick={async () => { setBusy(true); const r = await st.saveDrawing({ stationId: station.id, kind: f.kind, number: f.number, title: f.title || f.file!.name, rev: f.rev, status: f.status }, f.file, email); setBusy(false); if (r) setF({ ...f, number: '', title: '', file: null }) }}><Upload size={14} /> {busy ? 'در حال بارگذاری…' : 'بارگذاری'}</button></div>
      </section>
      <section className="ps-card">
        <header className="ps-card-head"><b>نقشه‌های ایستگاه</b><small className="ps-meta">{fa(list.length)} نقشه</small></header>
        {list.length === 0 ? <p className="ps-hint">نقشه‌ای بارگذاری نشده است.</p> : (
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>نوع</th><th>شماره</th><th>عنوان</th><th>ویرایش</th><th>وضعیت</th><th>جوش‌های علامت‌خورده</th><th>بارگذاری</th><th /></tr></thead>
            <tbody>{list.map((d) => <tr key={d.id}><td>{DRAWING_KIND_FA[d.kind]}</td><td dir="ltr">{d.number || '—'}</td><td>{d.title}</td><td dir="ltr">{d.rev}</td><td><span className="spx-chip">{DRAWING_STATUS_FA[d.status]}</span></td>
              <td>{fa(st.welds.filter((w) => w.drawingId === d.id && w.x != null).length)}</td><td className="ps-meta">{jd(d.updatedAt)}</td>
              <td className="ps-nowrap">{d.filePath && <button type="button" className="ps-btn is-ghost" onClick={() => open(d.filePath!)}><ExternalLink size={13} /> مشاهده</button>}
                <button type="button" className="ps-btn is-ghost" aria-label="بایگانی" onClick={() => { if (window.confirm(`نقشهٔ ${d.number || d.title} بایگانی شود؟`)) void st.archiveDrawing(d.id) }}><Trash2 size={13} /></button></td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  )
}
