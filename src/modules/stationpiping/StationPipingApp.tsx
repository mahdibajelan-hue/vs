import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Cpu, Factory, Flame, HardHat, LayoutDashboard, Loader2, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEpcLive } from '../epc/useEpcLive'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { useAuthStore } from '../../store/useAuthStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { NavScroller } from '../../components/common/NavScroller'
import { ShamsiDate } from '../../components/common/ShamsiField'
import { SCurveChart } from '../../components/charts/SCurveChart'
import { formatJalali } from '../../lib/jalali'
import { todayTehran } from '../../lib/today'
import { useRemembered } from '../../lib/navMemory'
import { useSpStore } from './store/useSpStore'
import {
  COAT_TYPES, DISC_COLOR, DISC_FA, DISCIPLINES, KIND_FA, AUTO_DISC, doneByItem, overallProgress, progressCurve, scopeTemplate, stationProgress, weldStats, welderStats,
  type Discipline, type StationKind, type StationProgress, type Weld,
} from './lib/spCore'
import type { StationRec, TwinAsset } from './repo'
import { StationPage } from './components/StationPage'
import { SpGuide } from './components/SpGuide'
import '../pssr/pssr.css'
import './sp.css'
import { pressable } from '../../lib/pressable'

export const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${fa(v, d)}٪`)
export const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)) : '—')
type Tab = 'dash' | 'stations' | 'daily' | 'welders'

/**
 * ایستگاه‌ها: پایپینگ، جوشکاری و پیشرفت — the block-valve, launcher / receiver and PCS / CGS stations of the project: their
 * scope by discipline, daily quantities, piping and weld-map drawings, piping lines and the weld register with NDT. Progress
 * per station and per discipline is computed from what is recorded (spCore). Stations can be taken from the digital twin.
 */
export function StationPipingApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = useSpStore()
  const [tab, setTab] = useRemembered<Tab>('tab', 'dash', (v) => typeof v === 'string')
  const [open, setOpen] = useRemembered<string | null>('station', null, (v) => v === null || typeof v === 'string')
  const [guide, setGuide] = useState(false)
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => useSpStore.setState({ flash: null }), 2600); return () => clearTimeout(t) }, [st.flash])
  const missing = !!st.error && /ساخته نشده/.test(st.error)
  const go = (t: Tab) => { setTab(t); setOpen(null) }
  const station = open ? st.stations.find((s) => s.id === open) ?? null : null

  return (
    <div className="ps spx" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico" style={{ background: 'linear-gradient(135deg,#f97316,#6366f1)' }}><Factory size={18} /></span>
          <span><b>ایستگاه‌ها — پایپینگ، جوشکاری و پیشرفت</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end"><ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome onGuide={() => setGuide((g) => !g)} guideActive={guide} /></div>
      </header>
      <NavScroller label="بخش‌ها"><nav className="ps-tabs" aria-label="بخش‌ها">
        {([['dash', 'داشبورد', LayoutDashboard], ['stations', 'ایستگاه‌ها', Factory], ['daily', 'کارکرد روزانه', CalendarDays], ['welders', 'جوشکاران و NDT', Flame]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={`ps-tab ${tab === k && !station ? 'is-on' : ''}`} onClick={() => go(k)}><I size={15} aria-hidden />{l}</button>
        ))}
      </nav></NavScroller>
      <main className="ps-main">
        {!projectId ? <p className="ps-hint">ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</p>
          : missing ? <p className="ps-hint is-warn">{st.error}</p>
          : st.loading ? <p className="ps-loading"><Loader2 size={16} className="animate-spin" /> در حال بارگذاری…</p>
          : station ? <StationPage station={station} onBack={() => setOpen(null)} />
          : tab === 'dash' ? <Dashboard onOpen={setOpen} onTab={go} />
          : tab === 'stations' ? <Stations onOpen={setOpen} />
          : tab === 'daily' ? <Daily />
          : <Welders />}
        {st.error && !missing && <p className="ps-err" onClick={() => useSpStore.setState({ error: null })}>{st.error}</p>}
      </main>
      {st.flash && <div className="spx-flash" role="status">{st.flash}</div>}
      {guide && <SpGuide onClose={() => setGuide(false)} />}
    </div>
  )
}

/** progress of every station as of today (and the curve), from the store */
export function useProgress() {
  const st = useSpStore()
  return useMemo(() => {
    const today = todayTehran()
    const per = st.stations.map((s) => stationProgress(s, st.items.filter((i) => i.stationId === s.id), st.logs.filter((l) => l.stationId === s.id), st.welds.filter((w) => w.stationId === s.id), today))
    return { today, per, overall: overallProgress(per), welds: weldStats(st.welds, today) }
  }, [st.stations, st.items, st.logs, st.welds])
}

export function Bar({ actual, planned, color }: { actual: number; planned: number | null; color?: string }) {
  return (
    <span className="spx-bar"><i style={{ width: `${Math.max(0, Math.min(100, actual))}%`, background: color ?? (planned != null && actual < planned - 1 ? 'linear-gradient(270deg,#6366f1,#f59e0b)' : '#6366f1') }} />
      {planned != null && <em style={{ insetInlineStart: `${Math.min(100, planned)}%` }} title={`برنامه ${pct(planned)}`} />}</span>
  )
}
function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return <article className="spx-kpi" style={{ '--c': color } as CSSProperties}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</article>
}

// ── dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onOpen, onTab }: { onOpen: (id: string) => void; onTab: (t: Tab) => void }) {
  const st = useSpStore()
  const { today, per, overall, welds } = useProgress()
  const curve = useMemo(() => progressCurve(st.stations, st.items, st.logs, st.welds, today), [st.stations, st.items, st.logs, st.welds, today])
  const weekAgo = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10)
  const weekLogs = st.logs.filter((l) => l.at >= weekAgo).length, weekWelds = st.welds.filter((w) => w.weldDate && w.weldDate >= weekAgo).length
  if (!st.stations.length) return (
    <section className="ps-card spx-empty"><Factory size={28} aria-hidden /><b>هنوز ایستگاهی تعریف نشده است.</b>
      <p>ایستگاه‌های شیر بین‌راهی، ارسال و دریافت توپک و PCS را تعریف کنید یا از دوقلوی دیجیتال بیاورید.</p>
      <button type="button" className="ps-btn is-primary" onClick={() => onTab('stations')}><Plus size={14} /> تعریف ایستگاه‌ها</button></section>
  )
  return (
    <div className="ps-stack">
      <section className="spx-kpis">
        <Kpi label="پیشرفت کل ایستگاه‌ها" value={pct(overall.actual)} sub={`برنامه ${pct(overall.planned)} · ${fa(overall.stations)} ایستگاه دارای محدودهٔ کار`} color="#6366f1" />
        <Kpi label="جوش‌های انجام‌شده" value={`${fa(welds.welded)} از ${fa(welds.count)}`} sub={`${fa(welds.weldedDi, 1)} از ${fa(welds.totalDi, 1)} اینچ‌قطر`} color="#f97316" />
        <Kpi label="NDT قبول‌شده" value={`${fa(welds.accepted)} از ${fa(welds.ndtRequired)}`} sub={`${fa(welds.tested)} جوش آزمایش‌شده`} color="#ec4899" />
        <Kpi label="زنگ‌زدایی و عایق سرجوش" value={`${pct(welds.totalDi ? (welds.blastedDi / welds.totalDi) * 100 : null, 0)} · ${pct(welds.buriedDi ? (welds.coatedDi / welds.buriedDi) * 100 : null, 0)}`} sub={`${fa(welds.blasted)} سرجوش زنگ‌زدایی · ${fa(welds.coated)} از ${fa(welds.buried)} مدفون عایق‌شده`} color="#0891b2" />
        <Kpi label="نرخ تعمیر جوش" value={welds.repairRate == null ? '—' : pct(welds.repairRate * 100)} sub="مردود یا تعمیرشده ÷ آزمایش‌شده" color={welds.repairRate != null && welds.repairRate > 0.05 ? '#ef4444' : '#22c55e'} />
        <Kpi label="هفتهٔ اخیر" value={`${fa(weekLogs)} کارکرد`} sub={`${fa(weekWelds)} جوش زده شده`} color="#14b8a6" />
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>پیشرفت ایستگاه‌ها</b><small className="ps-meta">برای جزئیات روی هر ایستگاه بزنید</small></header>
        <div className="spx-cards">
          {per.map((p) => <StationCard key={p.station.id} p={p} onOpen={() => onOpen(p.station.id)} />)}
        </div>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>ماتریس پیشرفت: ایستگاه × رشته</b><small className="ps-meta">درصد واقعی؛ خانهٔ خالی = بدون محدودهٔ کار</small></header>
        <Matrix per={per} onOpen={onOpen} />
      </section>

      <EpcShare overall={overall} />

      {curve.length > 1 && (
        <section className="ps-card">
          <header className="ps-card-head"><b>منحنی پیشرفت ایستگاه‌ها</b><small className="ps-meta">میانگین ایستگاه‌ها؛ برنامه از تاریخ‌های برنامه‌ای آیتم‌ها و ایستگاه‌ها</small></header>
          <SCurveChart rows={curve.map((c) => ({ date: c.at, planned: c.planned, actual: c.actual }))} series={[{ key: 'planned', label: 'برنامه‌ای', color: '#94a3b8', kind: 'planned' }, { key: 'actual', label: 'واقعی', color: '#6366f1', kind: 'actual' }]} markers={[{ date: today, label: 'امروز', color: '#f97316', strong: true }]} h={280} />
        </section>
      )}
    </div>
  )
}
/** how the stations enter the project's EPC progress, and the construction figure it gives (the same as the radar's) */
function EpcShare({ overall }: { overall: { actual: number; planned: number | null } }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const live = useEpcLive(st.projectId)
  const [f, setF] = useState(st.settings)
  useEffect(() => setF(st.settings), [st.settings])
  const now = live && live !== 'loading' ? live.now : null
  const c = now?.cons ?? null, parts = now?.consParts
  const dirty = f.consShare !== st.settings.consShare || f.inEpc !== st.settings.inEpc
  return (
    <section className="ps-card spx-epc">
      <header className="ps-card-head"><b><HardHat size={15} /> سهم ایستگاه‌ها در پیشرفت EPC پروژه</b><small className="ps-meta">همان عددی که رادار، داشبورد پروژه و مرکز سلامت نشان می‌دهند</small></header>
      <div className="spx-epc-flow">
        <div><span>خط لوله (ماژول اجرا)</span><b>{parts?.line ? pct(parts.line.actual) : '—'}</b><small>سهم {fa(parts?.line ? 100 - parts.stationShare : 0)}٪</small></div>
        <i aria-hidden>+</i>
        <div className="is-st"><span>ایستگاه‌ها</span><b>{pct(overall.actual)}</b><small>سهم {fa(st.settings.inEpc ? (parts ? parts.stationShare : st.settings.consShare) : 0)}٪</small></div>
        <i aria-hidden>=</i>
        <div className="is-c"><span>اجرا (C) در EPC</span><b>{live === 'loading' ? '…' : pct(c?.actual)}</b><small>برنامه {pct(c?.planned)}</small></div>
        <i aria-hidden>→</i>
        <div className="is-t"><span>کل قرارداد EPC</span><b>{live === 'loading' ? '…' : pct(now?.overall?.actual)}</b><small>برنامه {pct(now?.overall?.planned)}</small></div>
      </div>
      <div className="ps-grid">
        <label className="ps-field"><span>سهم ایستگاه‌ها از بخش اجرا (٪)</span><input type="number" min={0} max={100} dir="ltr" value={f.consShare} onChange={(e) => setF({ ...f, consShare: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
        <label className="ps-field"><span>&nbsp;</span><span className="spx-check"><input type="checkbox" checked={f.inEpc} onChange={(e) => setF({ ...f, inEpc: e.target.checked })} /> پیشرفت ایستگاه‌ها در پیشرفت EPC و رادار حساب شود</span></label>
      </div>
      <p className="ps-hint">اجرا (C) = (۱۰۰ − سهم ایستگاه‌ها)٪ × پیشرفت خط + سهم ایستگاه‌ها٪ × میانگین پیشرفت ایستگاه‌ها. اگر پروژه هنوز فعالیت اجرایی خط نداشته باشد، ایستگاه‌ها کل بخش اجرا را تشکیل می‌دهند. سهم را بر اساس سهم ریالی ایستگاه‌ها در قرارداد اجرا تعیین کنید.</p>
      {dirty && <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void st.saveSettings(f, email)}><Save size={14} /> ذخیره</button></div>}
    </section>
  )
}

function StationCard({ p, onOpen }: { p: StationProgress; onOpen: () => void }) {
  const scoped = p.disciplines.filter((d) => d.hasScope)
  return (
    <button type="button" className="spx-card" onClick={onOpen}>
      <span className="spx-card-head"><b>{p.station.code}</b><small>{KIND_FA[p.station.kind]}{p.station.km != null ? ` · کیلومتر ${fa(p.station.km, 3)}` : ''}</small></span>
      {p.station.name && <span className="spx-card-name">{p.station.name}</span>}
      <span className="spx-card-pct"><b>{pct(p.actual)}</b><small>برنامه {pct(p.planned)}</small></span>
      <Bar actual={p.actual} planned={p.planned} />
      <span className="spx-mini">{scoped.slice(0, 6).map((d) => <span key={d.discipline} title={`${DISC_FA[d.discipline]}: ${pct(d.actual)}`}><i style={{ background: DISC_COLOR[d.discipline], height: `${Math.max(6, d.actual)}%` }} /></span>)}</span>
      <small className="spx-card-foot">{scoped.length ? `${fa(scoped.length)} رشته · ${fa(p.welds.welded)} از ${fa(p.welds.count)} جوش` : 'محدودهٔ کار تعریف نشده'}</small>
    </button>
  )
}
function Matrix({ per, onOpen }: { per: StationProgress[]; onOpen: (id: string) => void }) {
  const used = DISCIPLINES.filter((d) => per.some((p) => p.disciplines.find((x) => x.discipline === d)?.hasScope))
  return (
    <div className="ps-table-wrap"><table className="ps-table spx-matrix">
      <thead><tr><th>ایستگاه</th>{used.map((d) => <th key={d}><i style={{ background: DISC_COLOR[d] }} />{DISC_FA[d]}</th>)}<th>کل</th></tr></thead>
      <tbody>{per.map((p) => <tr key={p.station.id} className="is-click" {...pressable(() => onOpen(p.station.id), { row: true })}>
        <td className="ps-nowrap"><b>{p.station.code}</b></td>
        {used.map((d) => { const x = p.disciplines.find((y) => y.discipline === d)!; if (!x.hasScope) return <td key={d} className="spx-cell is-none">—</td>
          const late = x.planned != null && x.actual < x.planned - 5
          return <td key={d} className={`spx-cell${late ? ' is-late' : ''}`} style={{ '--v': `${x.actual}%`, '--c': DISC_COLOR[d] } as CSSProperties} title={`برنامه ${pct(x.planned)}`}>{fa(x.actual, 0)}٪</td> })}
        <td><b>{pct(p.actual)}</b></td></tr>)}</tbody>
    </table></div>
  )
}

// ── stations ─────────────────────────────────────────────────────────────────
function Stations({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const { per } = useProgress()
  const [f, setF] = useState({ code: '', name: '', kind: 'valve' as StationKind, km: '', start: '', finish: '', tpl: true })
  const [twin, setTwin] = useState<TwinAsset[] | null>(null)
  const add = async (x: { code: string; name: string; kind: StationKind; km: number | null; start: string; finish: string; twinAssetId?: string | null }, tpl: boolean) => {
    const r = await st.saveStation({ code: x.code, name: x.name, kind: x.kind, km: x.km, plannedStart: x.start || null, plannedFinish: x.finish || null, twinAssetId: x.twinAssetId ?? null }, email)
    if (r && tpl) await st.saveItems(scopeTemplate(r.kind).map((t) => ({ ...t, stationId: r.id })))
    return r
  }
  const kindOf = (k: string): StationKind => (k === 'valve' ? 'valve' : k === 'launcher' ? 'launcher_receiver' : 'other')
  const notLinked = (twin ?? []).filter((a) => !st.stations.some((s) => s.twinAssetId === a.id || s.code === a.tag))
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><Plus size={15} /> تعریف ایستگاه</b></header>
        <div className="ps-grid">
          <label className="ps-field"><span>کد ایستگاه *</span><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} dir="ltr" placeholder="BV-03" /></label>
          <label className="ps-field"><span>نام</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="ps-field"><span>نوع</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as StationKind })}>{(Object.keys(KIND_FA) as StationKind[]).map((k) => <option key={k} value={k}>{KIND_FA[k]}</option>)}</select></label>
          <label className="ps-field"><span>کیلومتر</span><input type="number" step="0.001" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} dir="ltr" /></label>
          <div className="ps-field"><span>شروع برنامه‌ای</span><ShamsiDate value={f.start} onChange={(v) => setF({ ...f, start: v })} label="شروع برنامه‌ای" clearable /></div>
          <div className="ps-field"><span>پایان برنامه‌ای</span><ShamsiDate value={f.finish} onChange={(v) => setF({ ...f, finish: v })} label="پایان برنامه‌ای" clearable /></div>
          <label className="ps-field"><span>&nbsp;</span><span className="spx-check"><input type="checkbox" checked={f.tpl} onChange={(e) => setF({ ...f, tpl: e.target.checked })} /> محدودهٔ کار پیش‌فرض این نوع ایستگاه ساخته شود</span></label>
        </div>
        <div className="ps-actions">
          <button type="button" className="ps-btn is-primary" disabled={!f.code.trim()} onClick={async () => { if (await add({ code: f.code, name: f.name, kind: f.kind, km: f.km === '' ? null : Number(f.km), start: f.start, finish: f.finish }, f.tpl)) setF({ ...f, code: '', name: '', km: '' }) }}><Save size={14} /> ثبت ایستگاه</button>
          <button type="button" className="ps-btn" onClick={async () => setTwin(await st.twinAssets())}><Cpu size={14} /> از دوقلوی دیجیتال</button>
        </div>
        {twin && (twin.length === 0 ? <p className="ps-hint">در دوقلوی دیجیتال این پروژه ایستگاه، شیر یا تلهٔ توپکی ثبت نشده است.</p> : (
          <div className="ps-table-wrap"><table className="ps-table">
            <thead><tr><th>تگ</th><th>نوع در دوقلو</th><th>نام</th><th>کیلومتر</th><th /></tr></thead>
            <tbody>{twin.map((a) => { const has = !notLinked.includes(a); return <tr key={a.id}><td dir="ltr">{a.tag}</td><td>{a.kind === 'valve' ? 'شیر' : a.kind === 'launcher' ? 'تلهٔ توپک' : 'ایستگاه'}</td><td>{a.name}</td><td>{fa(a.km, 3)}</td>
              <td>{has ? <small className="ps-meta">تعریف شده</small> : <button type="button" className="ps-btn" onClick={() => add({ code: a.tag, name: a.name, kind: kindOf(a.kind), km: a.km, start: f.start, finish: f.finish, twinAssetId: a.id }, f.tpl)}><Plus size={13} /> افزودن</button>}</td></tr> })}</tbody>
          </table>
          {notLinked.length > 1 && <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={async () => { for (const a of notLinked) await add({ code: a.tag, name: a.name, kind: kindOf(a.kind), km: a.km, start: f.start, finish: f.finish, twinAssetId: a.id }, f.tpl) }}><Plus size={14} /> افزودن همه ({fa(notLinked.length)})</button></div>}</div>
        ))}
      </section>
      {per.length > 0 && <section className="ps-card">
        <header className="ps-card-head"><b>ایستگاه‌های پروژه</b></header>
        <div className="ps-table-wrap"><table className="ps-table">
          <thead><tr><th>کد</th><th>نوع</th><th>کیلومتر</th><th>بازهٔ برنامه</th><th>پیشرفت</th><th>جوش</th><th>نقشه</th><th /></tr></thead>
          <tbody>{per.map((p) => <tr key={p.station.id} className="is-click" {...pressable(() => onOpen(p.station.id), { row: true })}>
            <td><b dir="ltr">{p.station.code}</b>{p.station.name && <small className="ps-meta"> {p.station.name}</small>}</td><td>{KIND_FA[p.station.kind]}</td><td>{p.station.km == null ? '—' : fa(p.station.km, 3)}</td>
            <td className="ps-nowrap">{jd(p.station.plannedStart)} ← {jd(p.station.plannedFinish)}</td>
            <td style={{ minWidth: '9rem' }}>{pct(p.actual)}<Bar actual={p.actual} planned={p.planned} /></td>
            <td>{fa(p.welds.welded)} / {fa(p.welds.count)}</td><td>{fa(st.drawings.filter((d) => d.stationId === p.station.id).length)}</td>
            <td><button type="button" className="ps-btn is-ghost" aria-label="بایگانی" onClick={(e) => { e.stopPropagation(); if (window.confirm(`ایستگاه ${p.station.code} بایگانی شود؟`)) void st.archiveStation(p.station.id) }}><Trash2 size={13} /></button></td></tr>)}</tbody>
        </table></div>
      </section>}
    </div>
  )
}

// ── daily log ────────────────────────────────────────────────────────────────
function Daily() {
  const st = useSpStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [date, setDate] = useState(todayTehran())
  const [sid, setSid] = useRemembered<string>('dailyStation', '', (v) => typeof v === 'string')
  const station: StationRec | undefined = st.stations.find((s) => s.id === sid) ?? st.stations[0]
  const items = station ? st.items.filter((i) => i.stationId === station.id && !AUTO_DISC.includes(i.discipline)).sort((a, b) => DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline) || a.sort - b.sort) : []
  const done = useMemo(() => doneByItem(st.logs.filter((l) => l.stationId === station?.id)), [st.logs, station?.id])
  const [q, setQ] = useState<Record<string, { qty: string; note: string }>>({})
  const todays = st.logs.filter((l) => l.stationId === station?.id && l.at === date)
  const weldsToday = st.welds.filter((w) => w.stationId === station?.id && w.weldDate === date)
  const blastToday = st.welds.filter((w) => w.stationId === station?.id && w.blastDate === date)
  const coatToday = st.welds.filter((w) => w.stationId === station?.id && w.coatDate === date)
  if (!station) return <p className="ps-hint">ابتدا در بخش «ایستگاه‌ها» یک ایستگاه تعریف کنید.</p>
  const rows = Object.entries(q).filter(([, v]) => v.qty !== '' && Number(v.qty) !== 0).map(([itemId, v]) => ({ stationId: station.id, itemId, at: date, qty: Number(v.qty), note: v.note }))
  let last: Discipline | null = null
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><ClipboardList size={15} /> ثبت کارکرد روزانه</b><small className="ps-meta">مقدار انجام‌شده در همان روز؛ عملیات سرجوش‌ها در کادر پایین ثبت می‌شود</small></header>
        <div className="ps-grid">
          <div className="ps-field"><span>تاریخ</span><ShamsiDate value={date} onChange={setDate} max={todayTehran()} label="تاریخ" /></div>
          <label className="ps-field"><span>ایستگاه</span><select value={station.id} onChange={(e) => { setSid(e.target.value); setQ({}) }}>{st.stations.map((s) => <option key={s.id} value={s.id}>{s.code}{s.name ? ` — ${s.name}` : ''}</option>)}</select></label>
        </div>
        {items.length === 0 ? <p className="ps-hint">برای این ایستگاه محدودهٔ کاری تعریف نشده است؛ از صفحهٔ ایستگاه، «محدودهٔ کار» را کامل کنید.</p> : (
          <div className="ps-table-wrap"><table className="ps-table spx-daily">
            <thead><tr><th>آیتم</th><th>واحد</th><th>کل</th><th>انجام‌شده تا کنون</th><th>باقی‌مانده</th><th>مقدار امروز</th><th>توضیح</th></tr></thead>
            <tbody>{items.map((i) => {
              const d = done.get(i.id) ?? 0, head = last !== i.discipline; last = i.discipline
              return [head && <tr key={`h-${i.discipline}`} className="spx-group"><td colSpan={7}><i style={{ background: DISC_COLOR[i.discipline] }} />{DISC_FA[i.discipline]}</td></tr>,
                <tr key={i.id}><td>{i.title}</td><td data-label="واحد">{i.unit}</td><td data-label="کل">{fa(i.qty, 2)}</td><td data-label="انجام‌شده">{fa(d, 2)} <small className="ps-meta">({pct(i.qty ? (d / i.qty) * 100 : 0, 0)})</small></td><td data-label="باقی‌مانده">{fa(Math.max(0, i.qty - d), 2)}</td>
                  <td data-label="مقدار امروز"><input type="number" inputMode="decimal" step="0.01" dir="ltr" value={q[i.id]?.qty ?? ''} onChange={(e) => setQ({ ...q, [i.id]: { qty: e.target.value, note: q[i.id]?.note ?? '' } })} aria-label={`مقدار امروز ${i.title}`} /></td>
                  <td data-label="توضیح"><input value={q[i.id]?.note ?? ''} onChange={(e) => setQ({ ...q, [i.id]: { qty: q[i.id]?.qty ?? '', note: e.target.value } })} aria-label="توضیح" /></td></tr>]
            })}</tbody>
          </table></div>
        )}
        <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!rows.length} onClick={async () => { if (await st.addLogs(rows, email)) setQ({}) }}><Save size={14} /> ثبت {fa(rows.length)} ردیف کارکرد</button></div>
      </section>
      <JointOps key={`${station.id}-${date}`} station={station} date={date} />
      <section className="ps-card">
        <header className="ps-card-head"><b>کارکرد ثبت‌شدهٔ {jd(date)} — {station.code}</b></header>
        {todays.length === 0 && weldsToday.length === 0 && blastToday.length === 0 && coatToday.length === 0 ? <p className="ps-hint">برای این روز کارکردی ثبت نشده است.</p> : <>
          {todays.length > 0 && <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>رشته</th><th>آیتم</th><th>مقدار</th><th>توضیح</th><th>ثبت‌کننده</th><th /></tr></thead>
            <tbody>{todays.map((l) => { const i = st.items.find((x) => x.id === l.itemId); return <tr key={l.id}><td>{i ? DISC_FA[i.discipline] : '—'}</td><td>{i?.title ?? '—'}</td><td>{fa(l.qty, 2)} {i?.unit}</td><td>{l.note}</td><td className="ps-meta">{l.by}</td>
              <td><button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => { if (window.confirm('این ردیف کارکرد حذف شود؟')) void st.archiveLog(l.id) }}><Trash2 size={13} /></button></td></tr> })}</tbody></table></div>}
          {weldsToday.length > 0 && <p className="ps-hint"><CheckCircle2 size={14} /> {fa(weldsToday.length)} جوش در این روز زده شده: {weldsToday.map((w) => w.weldNo).join('، ')}</p>}
          {blastToday.length > 0 && <p className="ps-hint"><Sparkles size={14} /> زنگ‌زدایی {fa(blastToday.length)} سرجوش: {blastToday.map((w) => w.weldNo).join('، ')}</p>}
          {coatToday.length > 0 && <p className="ps-hint"><ShieldCheck size={14} /> عایق‌کاری {fa(coatToday.length)} سرجوش: {coatToday.map((w) => w.weldNo).join('، ')}</p>}
        </>}
      </section>
    </div>
  )
}

/** the day's operations on the joints: welding, radiography, blasting, field-joint coating — pick the welds that were done */
type Op = 'weld' | 'rt' | 'blast' | 'coat'
const OPS: { k: Op; label: string; ready: (w: Weld) => boolean; patch: (date: string, coatType: string) => Record<string, unknown>; done: string }[] = [
  { k: 'weld', label: 'جوشکاری', ready: (w) => !w.weldDate, patch: (d) => ({ weld_date: d }), done: 'جوشکاری ثبت شد' },
  { k: 'rt', label: 'رادیوگرافی (قبول)', ready: (w) => !!w.weldDate && w.ndtResult === 'pending', patch: (d) => ({ ndt_date: d, ndt_result: 'accepted' }), done: 'رادیوگرافی قبول ثبت شد' },
  { k: 'blast', label: 'زنگ‌زدایی سرجوش', ready: (w) => !!w.weldDate && (w.ndtResult === 'accepted' || w.ndtResult === 'na') && !w.blastDate, patch: (d) => ({ blast_date: d }), done: 'زنگ‌زدایی سرجوش ثبت شد' },
  { k: 'coat', label: 'عایق‌کاری سرجوش', ready: (w) => w.buried && !!w.blastDate && !w.coatDate, patch: (d, c) => ({ coat_date: d, coat_type: c }), done: 'عایق‌کاری سرجوش ثبت شد' },
]
function JointOps({ station, date }: { station: StationRec; date: string }) {
  const st = useSpStore()
  const [op, setOp] = useState<Op>('weld')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [coatType, setCoatType] = useState(COAT_TYPES[0])
  const o = OPS.find((x) => x.k === op)!
  const ws = st.welds.filter((w) => w.stationId === station.id).sort((a, b) => a.weldNo.localeCompare(b.weldNo, 'en', { numeric: true }))
  const ready = ws.filter(o.ready)
  if (!ws.length) return null
  return (
    <section className="ps-card">
      <header className="ps-card-head"><b><Flame size={15} /> عملیات روی سرجوش‌ها</b><small className="ps-meta">زنجیرهٔ هر سرجوش: جوشکاری ← رادیوگرافی ← زنگ‌زدایی ← عایق‌کاری (سرجوش مدفون)؛ سرجوش روزمینی با رنگ‌آمیزی پوشش داده می‌شود</small></header>
      <div className="spx-seg" role="tablist">{OPS.map((x) => <button key={x.k} type="button" role="tab" aria-selected={op === x.k} onClick={() => { setOp(x.k); setSel(new Set()) }}>{x.label} <i>{fa(ws.filter(x.ready).length)}</i></button>)}</div>
      {ready.length === 0 ? <p className="ps-hint">سرجوشی آمادهٔ «{o.label}» نیست.</p> : <>
        <div className="spx-picks">{ready.map((w) => <button key={w.id} type="button" aria-pressed={sel.has(w.id)} onClick={() => { const n = new Set(sel); if (n.has(w.id)) n.delete(w.id); else n.add(w.id); setSel(n) }} dir="ltr">{w.weldNo}<small>{fa(w.sizeIn, 0)}″</small></button>)}</div>
        <div className="ps-actions">
          <button type="button" className="ps-btn is-ghost" onClick={() => setSel(sel.size === ready.length ? new Set() : new Set(ready.map((w) => w.id)))}>{sel.size === ready.length ? 'هیچ‌کدام' : 'انتخاب همه'}</button>
          {op === 'coat' && <select value={coatType} onChange={(e) => setCoatType(e.target.value)} aria-label="نوع عایق">{COAT_TYPES.map((c) => <option key={c}>{c}</option>)}</select>}
          <button type="button" className="ps-btn is-primary" disabled={!sel.size} onClick={async () => { if (await st.patchWelds([...sel], o.patch(date, coatType), o.done)) setSel(new Set()) }}><Save size={14} /> ثبت {o.label} برای {fa(sel.size)} سرجوش در {jd(date)}</button>
        </div>
      </>}
    </section>
  )
}

// ── welders & NDT ────────────────────────────────────────────────────────────
function Welders() {
  const st = useSpStore()
  const rows = useMemo(() => welderStats(st.welds), [st.welds])
  const byStation = useMemo(() => st.stations.map((s) => ({ s, w: weldStats(st.welds.filter((x) => x.stationId === s.id)) })).filter((x) => x.w.count), [st.stations, st.welds])
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><Flame size={15} /> عملکرد جوشکاران</b><small className="ps-meta">نرخ تعمیر = جوش مردود یا تعمیرشده ÷ جوش آزمایش‌شده</small></header>
        {rows.length === 0 ? <p className="ps-hint">هنوز جوشی با نام جوشکار و تاریخ جوش ثبت نشده است.</p> : (
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>جوشکار (Stamp)</th><th>تعداد جوش</th><th>اینچ‌قطر</th><th>آزمایش‌شده</th><th>قبول</th><th>مردود</th><th>نرخ تعمیر</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.welder}><td dir="ltr"><b>{r.welder}</b></td><td>{fa(r.welded)}</td><td>{fa(r.weldedDi, 1)}</td><td>{fa(r.tested)}</td><td>{fa(r.accepted)}</td><td className={r.rejected ? 'is-late' : ''}>{fa(r.rejected)}</td>
              <td><span className={`spx-rate ${r.repairRate == null ? '' : r.repairRate > 0.05 ? 'is-bad' : r.repairRate > 0.02 ? 'is-warn' : 'is-ok'}`}>{r.repairRate == null ? '—' : pct(r.repairRate * 100)}</span></td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="ps-card">
        <header className="ps-card-head"><b>وضعیت سرجوش‌های ایستگاه‌ها: جوش، رادیوگرافی، زنگ‌زدایی و عایق</b></header>
        {byStation.length === 0 ? <p className="ps-hint">جوشی ثبت نشده است.</p> : (
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>ایستگاه</th><th>جوش‌ها</th><th>زده‌شده</th><th>اینچ‌قطر</th><th>نیازمند NDT</th><th>قبول</th><th>مردود</th><th>در انتظار NDT</th><th>زنگ‌زدایی</th><th>عایق سرجوش (مدفون)</th></tr></thead>
            <tbody>{byStation.map(({ s, w }) => <tr key={s.id}><td dir="ltr"><b>{s.code}</b></td><td>{fa(w.count)}</td><td>{fa(w.welded)}</td><td>{fa(w.weldedDi, 1)} / {fa(w.totalDi, 1)}</td><td>{fa(w.ndtRequired)}</td><td>{fa(w.accepted)}</td><td className={w.rejected ? 'is-late' : ''}>{fa(w.rejected)}</td><td>{fa(Math.max(0, w.ndtRequired - w.tested))}</td><td>{fa(w.blasted)} / {fa(w.count)}</td><td>{fa(w.coated)} / {fa(w.buried)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  )
}
