import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, Calculator, CheckCircle2, ClipboardCheck, Droplets, Factory, FileUp, Loader2, Plus, Settings2, ShieldCheck, Waves, X } from 'lucide-react'
import { ShamsiDate } from '../../components/common/ShamsiField'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { tableFromSheet, tableFromText } from '../landacq/lib/routeImport'
import { useTestingStore } from './store/useTestingStore'
import { COATING_KIND_FA, coveredKm, HT_FAILED_COLOR, HT_STAGE_COLOR, HT_STAGE_FA, HT_STAGES, overlapKm, pressureAtPct, sectionize, type CoatingKind, type SectionPlan } from './lib/htCore'
import { DEFAULT_HT_SETTINGS, type CtDefect, type HtSettings, type TargetKind } from './repo'
import { ProfileChart, type Band } from './components/ProfileChart'
import { TestPage } from './components/TestPage'
import { TestingGuide } from './components/TestingGuide'
import '../pssr/pssr.css'
import './testing.css'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const today = () => new Date().toISOString().slice(0, 10)
type Tab = 'dash' | 'line' | 'stations' | 'coating' | 'settings'
const CUT_FA: Record<string, string> = { elevation: 'محدودیت اختلاف ارتفاع', length: 'حداکثر طول', preferred: 'محل شیر / ایستگاه', end: 'انتهای خط' }

/**
 * آزمایش‌ها — the hydrostatic test of the line (sectioned on the elevation profile of the project's route), the hydrotest of
 * the stations' piping (test packages) and the coating tests (holiday, DCVG, CIPS…). The pipe, the route and its profile,
 * the valves and what is backfilled / coated come from the digital twin, so the numbers here and there are one.
 */
export function TestingApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = useTestingStore()
  const [tab, setTab] = useState<Tab>('dash')
  const [open, setOpen] = useState<{ kind: TargetKind; id: string } | null>(null)
  const [guide, setGuide] = useState(false)
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => useTestingStore.setState({ flash: null }), 2600); return () => clearTimeout(t) }, [st.flash])
  const missing = !!st.error && /ساخته نشده/.test(st.error)
  const go = (t: Tab) => { setTab(t); setOpen(null) }

  return (
    <div className="ps ht" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico" style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb)' }}><Droplets size={18} /></span>
          <span><b>آزمایش‌ها — هیدروتست و پوشش</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end">
          <button type="button" className="ps-btn is-primary" onClick={() => setGuide(true)}><BookOpen size={15} /> راهنما</button>
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      <nav className="ps-tabs" aria-label="بخش‌ها">
        {([['dash', 'داشبورد', ClipboardCheck], ['line', 'هیدروتست خط', Waves], ['stations', 'هیدروتست ایستگاه‌ها', Factory], ['coating', 'تست پوشش', ShieldCheck], ['settings', 'تنظیمات', Settings2]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={`ps-tab ${tab === k && !open ? 'is-on' : ''}`} onClick={() => go(k)}><I size={15} aria-hidden />{l}</button>
        ))}
      </nav>
      <main className="ps-main">
        {!projectId ? <Empty text="ابتدا از رادار پروژه یک پروژه را انتخاب کنید." />
          : missing ? <Empty text={st.error!} />
          : st.loading ? <p className="ps-loading"><Loader2 size={16} className="animate-spin" /> در حال بارگذاری…</p>
          : open ? <TestPage kind={open.kind} id={open.id} onBack={() => setOpen(null)} />
          : tab === 'dash' ? <Dashboard onOpen={(id) => setOpen({ kind: 'section', id })} onTab={go} />
          : tab === 'line' ? <LineTab onOpen={(id) => setOpen({ kind: 'section', id })} onTab={go} />
          : tab === 'stations' ? <Stations onOpen={(id) => setOpen({ kind: 'pack', id })} />
          : tab === 'coating' ? <Coating />
          : <SettingsTab />}
        {st.error && !missing && <p className="ps-err" onClick={() => useTestingStore.setState({ error: null })}>{st.error}</p>}
      </main>
      {st.flash && <div className="ht-flash" role="status">{st.flash}</div>}
      {guide && <TestingGuide onClose={() => setGuide(false)} />}
    </div>
  )
}

const bandsOf = (sections: ReturnType<typeof useTestingStore.getState>['sections']): Band[] => sections.map((s) => ({ key: s.id, from: s.kmFrom, to: s.kmTo, color: s.failed ? HT_FAILED_COLOR : HT_STAGE_COLOR[s.stage], label: `${s.code} · ${s.failed ? 'مردود' : HT_STAGE_FA[s.stage]}`, hiKm: s.elevMaxKm, loKm: s.elevMinKm }))

// ── dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onOpen, onTab }: { onOpen: (id: string) => void; onTab: (t: Tab) => void }) {
  const st = useTestingStore()
  const accepted = st.sections.filter((s) => s.stage === 'accepted')
  const kmAcc = accepted.reduce((n, s) => n + s.kmTo - s.kmFrom, 0)
  const running = st.sections.filter((s) => s.stage !== 'planned' && s.stage !== 'accepted')
  const coatedKm = coveredKm(st.coated)
  const holidayKm = coveredKm(st.records.filter((r) => r.kind === 'holiday' && r.result === 'pass').map((r) => [r.kmFrom, r.kmTo]))
  const openDefects = st.defects.filter((d) => d.status === 'open')
  const warnings = useWarnings()
  return (
    <div className="ps-stack">
      <section className="ps-kpis">
        <Kpi label="قطعه‌های هیدروتست خط" value={`${fa(accepted.length)} از ${fa(st.sections.length)}`} sub={`${fa(kmAcc, 1)} کیلومتر پذیرفته‌شده · ${fa(running.length)} در جریان`} color="#22c55e" />
        <Kpi label="هیدروتست ایستگاه‌ها" value={`${fa(st.packs.filter((p) => p.stage === 'accepted').length)} از ${fa(st.packs.length)}`} sub="بستهٔ آزمون پذیرفته‌شده" color="#0ea5e9" />
        <Kpi label="پوشش تست‌شده (هالیدی)" value={`${fa(holidayKm, 1)} km`} sub={`از ${fa(coatedKm, 1)} کیلومتر پوشش‌شده (دوقلوی دیجیتال)`} color={coatedKm - holidayKm > 0.5 ? '#f59e0b' : '#22c55e'} />
        <Kpi label="عیوب پوشش باز" value={fa(openDefects.length)} sub={`${fa(openDefects.filter((d) => d.severity === 'severe').length)} مورد شدید`} color={openDefects.length ? '#ef4444' : '#22c55e'} />
      </section>
      {warnings.length > 0 && (
        <section className="ps-card ps-adv">
          <header className="ps-card-head"><b><AlertTriangle size={15} /> ناهمسانی‌ها و هشدارها</b></header>
          <ul className="ht-warn">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}
      <section className="ps-card">
        <header className="ps-card-head"><b><Waves size={15} /> قطعه‌های آزمون روی پروفیل خط</b><button type="button" className="ps-btn" onClick={() => onTab('line')}>جزئیات قطعه‌بندی</button></header>
        {st.profile.length >= 2 && st.sections.length ? <>
          <ProfileChart profile={st.profile} bands={bandsOf(st.sections)} backfilled={st.backfilled} onPick={onOpen} height={220} />
          <Legend />
        </> : <p className="ps-hint">{st.profile.length < 2 ? 'پروفیل ارتفاعی خط در دسترس نیست؛ راهنمای بخش «هیدروتست خط» را ببینید.' : 'هنوز قطعه‌بندی ذخیره نشده است.'}</p>}
        <button type="button" className="ps-btn" onClick={() => useModuleStore.getState().enterModule('pipelinedigitaltwin', undefined, 'hydro')}>نمایش روی دوقلوی دیجیتال</button>
      </section>
    </div>
  )
}

/** what does not agree between this module and the others (the twin's construction record, the PSSR checklist) */
function useWarnings(): string[] {
  const st = useTestingStore()
  return useMemo(() => {
    const out: string[] = []
    for (const s of st.sections) {
      if (s.stage === 'planned' || s.stage === 'accepted') continue
      const nb = s.kmTo - s.kmFrom - overlapKm(s.kmFrom, s.kmTo, st.backfilled)
      if (nb > 0.01) out.push(`آزمون قطعهٔ ${s.code} شروع شده ولی ${fa(nb, 2)} کیلومتر از آن در دوقلوی دیجیتال هنوز خاک‌ریزی نشده است.`)
    }
    for (const s of st.sections.filter((x) => x.failed)) out.push(`قطعهٔ ${s.code} مردود است: ${s.failedNote}`)
    const coatedKm = coveredKm(st.coated), holidayKm = coveredKm(st.records.filter((r) => r.kind === 'holiday' && r.result === 'pass').map((r) => [r.kmFrom, r.kmTo]))
    if (coatedKm - holidayKm > 0.5) out.push(`${fa(coatedKm - holidayKm, 1)} کیلومتر پوشش سرجوش در دوقلوی دیجیتال ثبت شده که آزمون هالیدی قبول‌شده ندارد.`)
    const severe = st.defects.filter((d) => d.status === 'open' && d.severity === 'severe')
    if (severe.length) out.push(`${fa(severe.length)} عیب شدید پوشش هنوز تعمیر نشده است (کیلومتر ${severe.map((d) => fa(d.km, 1)).join('، ')}).`)
    return out
  }, [st.sections, st.backfilled, st.coated, st.records, st.defects])
}

function Legend() {
  return <ul className="ht-legend">{HT_STAGES.map((s) => <li key={s}><i style={{ background: HT_STAGE_COLOR[s] }} />{HT_STAGE_FA[s]}</li>)}<li><i style={{ background: HT_FAILED_COLOR }} />مردود</li><li><i className="is-bf" />خاک‌ریزی‌شده (دوقلو)</li></ul>
}

// ── line hydrotest ───────────────────────────────────────────────────────────
function LineTab({ onOpen, onTab }: { onOpen: (id: string) => void; onTab: (t: Tab) => void }) {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const params = st.params()
  const [plan, setPlan] = useState<ReturnType<typeof sectionize> | null>(null)
  const started = st.sections.some((s) => s.stage !== 'planned' || s.failed)
  const pSmys = params ? pressureAtPct(100, params.smysMpa, params.odMm, params.wtMm) : 0
  const preview = params && st.profile.length >= 2 ? sectionize(st.profile, params, []) : null
  const compute = () => { if (params) setPlan(sectionize(st.profile, params, st.preferredKm.map((p) => p.km))) }
  const save = async () => { if (plan && await st.savePlan(plan.sections, email)) setPlan(null) }
  const SRC: Record<string, string> = { land: 'مسیر مشترک پروژه (KMZ ماژول تحصیل اراضی)', twin: 'مسیر دوقلوی دیجیتال', table: 'جدول پروفیل واردشده (تنظیمات)' }

  if (st.profile.length < 2) return (
    <div className="ps-hero-empty">
      <Waves size={30} aria-hidden />
      <b>پروفیل ارتفاعی خط در دسترس نیست</b>
      <p>قطعه‌بندی هیدروتست روی پروفیل خط انجام می‌شود. فایل KMZ/KML مسیر را با ارتفاع (مختصات سه‌بعدی) در ماژول تحصیل اراضی یا دوقلوی دیجیتال وارد کنید؛ اگر فایل ارتفاع ندارد، جدول پروفیل (کیلومتر، ارتفاع) را در «تنظیمات» وارد کنید.</p>
      <button type="button" className="ps-btn is-primary" onClick={() => onTab('settings')}><FileUp size={15} /> ورود جدول پروفیل</button>
    </div>
  )
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><Calculator size={15} /> مبنای محاسبه</b><small className="ps-meta">پروفیل: {SRC[st.profileSource ?? 'table']} · {fa(st.profile.length)} نقطه</small></header>
        {st.pipe && params ? (
          <div className="ht-basis">
            <Fig k="لوله (از دوقلوی دیجیتال)" v={`Ø${fa(st.pipe.diameterIn)}″ × ${fa(st.pipe.wallMm, 1)} mm`} sub={`${st.pipe.material} · SMYS ${fa(params.smysMpa)} MPa`} />
            <Fig k="فشار طراحی" v={`${fa(params.designPressureBar)} bar`} sub={`فشار در ۱۰۰٪ SMYS: ${fa(pSmys, 1)} bar`} />
            <Fig k="حداقل فشار آزمون (نقطهٔ بالا)" v={`${fa(preview?.pMin ?? 0, 1)} bar`} sub={`${fa(params.testFactor, 2)} × فشار طراحی`} />
            <Fig k="حداکثر فشار (نقطهٔ پایین)" v={`${fa(preview?.pMax ?? 0, 1)} bar`} sub={`${fa(params.maxHoopPct)}٪ SMYS`} />
            <Fig k="حداکثر اختلاف ارتفاع هر قطعه" v={`${fa(preview?.maxDeltaH ?? 0)} m`} sub={`ستون آب ${fa(0.0981 * params.density / 1000, 4)} bar در هر متر`} />
            <Fig k="حداکثر طول هر قطعه" v={`${fa(params.maxSectionKm)} km`} sub={`${fa(st.preferredKm.length)} محل شیر / ایستگاه برای برش`} />
          </div>
        ) : <p className="ps-hint is-warn">گرید لوله ({st.pipe?.material}) شناخته نشد؛ SMYS را در تنظیمات وارد کنید.</p>}
        {preview?.error && <p className="ps-hint is-warn">{preview.error}</p>}
        <div className="ps-actions">
          <button type="button" className="ps-btn is-primary" disabled={!params || !!preview?.error} onClick={compute}><Calculator size={15} /> {st.sections.length ? 'محاسبهٔ دوبارهٔ قطعه‌بندی' : 'محاسبهٔ قطعه‌بندی'}</button>
          {started && <small className="ps-meta">آزمون بعضی قطعه‌ها شروع شده؛ قطعه‌بندی جدید فقط برای مقایسه نمایش داده می‌شود.</small>}
        </div>
      </section>

      {plan && (
        <section className="ps-card ht-plan">
          <header className="ps-card-head"><b>پیشنهاد قطعه‌بندی: {fa(plan.sections.length)} قطعه</b><button type="button" className="ps-x" onClick={() => setPlan(null)} aria-label="بستن"><X size={16} /></button></header>
          {plan.error ? <p className="ps-hint is-warn">{plan.error}</p> : <>
            <ProfileChart profile={st.profile} preferred={st.preferredKm} backfilled={st.backfilled} bands={plan.sections.map((s, i) => ({ key: String(s.seq), from: s.kmFrom, to: s.kmTo, color: i % 2 ? '#38bdf8' : '#818cf8', label: `HT-${String(s.seq).padStart(2, '0')} · ${CUT_FA[s.cut]}`, hiKm: s.elevMaxKm, loKm: s.elevMinKm, dashed: true }))} />
            <p className="ps-hint">طول متوسط {fa(plan.sections.reduce((n, s) => n + s.lengthKm, 0) / plan.sections.length, 1)} کیلومتر · {Object.entries(plan.sections.reduce<Record<string, number>>((m, s) => ({ ...m, [s.cut]: (m[s.cut] ?? 0) + 1 }), {})).map(([k, v]) => `${fa(v)} برش: ${CUT_FA[k]}`).join(' · ')}</p>
            <PlanTable rows={plan.sections} />
            <div className="ps-actions">
              <button type="button" className="ps-btn is-ok" disabled={started} onClick={save}><CheckCircle2 size={15} /> ذخیرهٔ این قطعه‌بندی</button>
              {st.sections.length > 0 && !started && <small className="ps-meta">جایگزین {fa(st.sections.length)} قطعهٔ فعلی می‌شود.</small>}
            </div>
          </>}
        </section>
      )}

      {st.sections.length > 0 && (
        <section className="ps-card">
          <header className="ps-card-head"><b><Waves size={15} /> قطعه‌های آزمون ({fa(st.sections.length)})</b><small className="ps-meta">روی هر قطعه بزنید تا آزمونش را ثبت کنید</small></header>
          <ProfileChart profile={st.profile} preferred={st.preferredKm} backfilled={st.backfilled} bands={bandsOf(st.sections)} onPick={onOpen} />
          <Legend />
          <div className="ps-table-wrap"><table className="ps-table ht-table">
            <thead><tr><th>قطعه</th><th>کیلومتر</th><th>طول</th><th>Δh (m)</th><th>فشار بالا / پایین (bar)</th><th>٪SMYS پایین</th><th>سر آزمون</th><th>حجم آب</th><th>خاک‌ریزی</th><th>مرحله</th></tr></thead>
            <tbody>{st.sections.map((s) => {
              const bf = overlapKm(s.kmFrom, s.kmTo, st.backfilled) / (s.kmTo - s.kmFrom)
              return (
                <tr key={s.id} className="is-click" onClick={() => onOpen(s.id)}>
                  <td><b className="ps-code" dir="ltr">{s.code}</b></td>
                  <td className="ps-nowrap">{fa(s.kmFrom, 2)} – {fa(s.kmTo, 2)}</td>
                  <td>{fa(s.kmTo - s.kmFrom, 2)}</td>
                  <td>{fa(s.elevMax - s.elevMin)}</td>
                  <td className="ps-nowrap">{fa(s.pHigh, 1)} / {fa(s.pLow, 1)}</td>
                  <td>{fa(s.hoopLowPct, 1)}٪</td>
                  <td className="ps-nowrap">km {fa(s.headKm, 2)} · {fa(s.pHead, 1)} bar</td>
                  <td>{fa(s.volumeM3)} m³</td>
                  <td><span className="ps-bar ht-mini"><span style={{ width: `${Math.round(bf * 100)}%` }} /></span>{fa(bf * 100)}٪</td>
                  <td><span className="ps-chip" style={{ '--c': s.failed ? HT_FAILED_COLOR : HT_STAGE_COLOR[s.stage] } as CSSProperties}><i />{s.failed ? 'مردود' : HT_STAGE_FA[s.stage]}</span></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        </section>
      )}
    </div>
  )
}

function PlanTable({ rows }: { rows: SectionPlan[] }) {
  return (
    <div className="ps-table-wrap"><table className="ps-table ht-table">
      <thead><tr><th>قطعه</th><th>کیلومتر</th><th>طول</th><th>ارتفاع کمینه / بیشینه</th><th>فشار بالا / پایین</th><th>٪SMYS</th><th>سر آزمون</th><th>حجم آب</th><th>علت برش</th></tr></thead>
      <tbody>{rows.map((s) => (
        <tr key={s.seq}>
          <td className="ps-code" dir="ltr">HT-{String(s.seq).padStart(2, '0')}</td>
          <td className="ps-nowrap">{fa(s.kmFrom, 2)} – {fa(s.kmTo, 2)}</td>
          <td>{fa(s.lengthKm, 2)}</td>
          <td className="ps-nowrap">{fa(s.elevMin)} / {fa(s.elevMax)}</td>
          <td className="ps-nowrap">{fa(s.pHigh, 1)} / {fa(s.pLow, 1)}</td>
          <td>{fa(s.hoopLowPct, 1)}٪</td>
          <td className="ps-nowrap">km {fa(s.headKm, 2)} · {fa(s.pHead, 1)}</td>
          <td>{fa(s.volumeM3)} m³</td>
          <td>{CUT_FA[s.cut]}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

// ── stations ─────────────────────────────────────────────────────────────────
function Stations({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ code: '', station: st.stations[0] ?? '', title: '', dp: st.pipe ? String(st.pipe.designPressureBar) : '', tp: '', medium: 'water' as 'water' | 'air' | 'nitrogen', date: '' })
  const tpAuto = f.dp ? (Number(f.dp) * 1.5).toFixed(1) : ''
  const save = async () => { if (await st.savePack({ code: f.code, station: f.station, title: f.title, designPressureBar: Number(f.dp), testPressureBar: Number(f.tp || tpAuto), medium: f.medium, plannedDate: f.date || null }, email)) { setAdding(false); setF({ ...f, code: '', title: '', tp: '' }) } }
  const groups = [...new Set(st.packs.map((p) => p.station || '—'))]
  return (
    <div className="ps-stack">
      <div className="ps-row-head">
        <div><b>هیدروتست لوله‌کشی ایستگاه‌ها</b><small>لوله‌کشی هر ایستگاه در «بسته‌های آزمون» (Test Package) جدا آزمون می‌شود؛ فشار آزمون معمولاً ۱٫۵ برابر فشار طراحی است.</small></div>
        <button type="button" className="ps-btn is-primary" onClick={() => setAdding(true)}><Plus size={15} /> بستهٔ آزمون جدید</button>
      </div>
      {adding && (
        <section className="ps-card ps-form">
          <header className="ps-card-head"><b>بستهٔ آزمون</b><button type="button" className="ps-x" onClick={() => setAdding(false)} aria-label="بستن"><X size={16} /></button></header>
          <div className="ps-grid">
            <label className="ps-field"><span>کد بسته *</span><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="TP-ST01-01" dir="ltr" /></label>
            <label className="ps-field"><span>ایستگاه</span><input list="ht-stations" value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} /><datalist id="ht-stations">{st.stations.map((s) => <option key={s} value={s} />)}</datalist></label>
            <label className="ps-field is-wide"><span>شرح</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="هدر ورودی و شیرهای کنارگذر" /></label>
            <label className="ps-field"><span>فشار طراحی (bar) *</span><input type="number" value={f.dp} onChange={(e) => setF({ ...f, dp: e.target.value })} dir="ltr" /></label>
            <label className="ps-field"><span>فشار آزمون (bar)</span><input type="number" value={f.tp} onChange={(e) => setF({ ...f, tp: e.target.value })} placeholder={tpAuto} dir="ltr" /></label>
            <label className="ps-field"><span>سیال</span><select value={f.medium} onChange={(e) => setF({ ...f, medium: e.target.value as typeof f.medium })}><option value="water">آب</option><option value="nitrogen">نیتروژن</option><option value="air">هوا</option></select></label>
            <div className="ps-field"><span>تاریخ برنامه</span><ShamsiDate clearable value={f.date} onChange={(v) => setF({ ...f, date: v })} label="تاریخ برنامه" /></div>
          </div>
          <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!f.code.trim() || !(Number(f.dp) > 0)} onClick={save}><CheckCircle2 size={15} /> ذخیره</button></div>
        </section>
      )}
      {st.packs.length ? groups.map((g) => (
        <section key={g} className="ps-card">
          <header className="ps-card-head"><b><Factory size={15} /> {g}</b></header>
          <div className="ps-list">
            {st.packs.filter((p) => (p.station || '—') === g).map((p) => (
              <button key={p.id} type="button" className="ps-sys" onClick={() => onOpen(p.id)} style={{ '--c': p.failed ? HT_FAILED_COLOR : HT_STAGE_COLOR[p.stage] } as CSSProperties}>
                <span className="ps-code" dir="ltr">{p.code}</span>
                <span className="ps-sys-main"><b>{p.title || '—'}</b><small>طراحی {fa(p.designPressureBar)} bar · آزمون {fa(p.testPressureBar, 1)} bar · {p.medium === 'water' ? 'آب' : p.medium === 'air' ? 'هوا' : 'نیتروژن'}{p.plannedDate ? ` · ${jd(p.plannedDate)}` : ''}</small></span>
                <span className="ps-chip"><i />{p.failed ? 'مردود' : HT_STAGE_FA[p.stage]}</span>
              </button>
            ))}
          </div>
        </section>
      )) : !adding && <Empty text="هنوز بستهٔ آزمونی برای ایستگاه‌ها تعریف نشده است." />}
    </div>
  )
}

// ── coating ──────────────────────────────────────────────────────────────────
const SEV_FA = { minor: 'جزئی', moderate: 'متوسط', severe: 'شدید' } as const
const SEV_COLOR = { minor: '#eab308', moderate: '#f97316', severe: '#ef4444' } as const
const DEF_STATUS_FA = { open: 'باز', repaired: 'تعمیرشده', verified: 'تأییدشده' } as const
function Coating() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [f, setF] = useState({ kind: 'holiday' as CoatingKind, from: '', to: '', at: today(), kv: '25', result: 'pass' as 'pass' | 'fail', defects: '0', report: '', contractor: '', note: '' })
  const [d, setD] = useState({ km: '', severity: 'minor' as CtDefect['severity'], note: '' })
  const coatedKm = coveredKm(st.coated)
  const holidayKm = coveredKm(st.records.filter((r) => r.kind === 'holiday' && r.result === 'pass').map((r) => [r.kmFrom, r.kmTo]))
  const bfKm = coveredKm(st.backfilled)
  const dcvgKm = coveredKm(st.records.filter((r) => r.kind === 'dcvg' || r.kind === 'cips').map((r) => [r.kmFrom, r.kmTo]))
  const ok = f.from !== '' && f.to !== '' && Number(f.to) > Number(f.from)
  const save = async () => {
    const r = await st.addRecord({ kind: f.kind, kmFrom: Number(f.from), kmTo: Number(f.to), at: f.at, voltageKv: f.kind === 'holiday' && f.kv ? Number(f.kv) : null, result: f.result, defects: Number(f.defects) || 0, reportNo: f.report, contractor: f.contractor, note: f.note }, email)
    if (r) setF({ ...f, from: f.to, to: '', defects: '0', report: '', note: '' })
  }
  return (
    <div className="ps-stack">
      <section className="ps-kpis">
        <Kpi label="پوشش سرجوش (دوقلوی دیجیتال)" value={`${fa(coatedKm, 1)} km`} sub="ثبت‌شده روی مسیر" color="#eab308" />
        <Kpi label="آزمون هالیدی قبول‌شده" value={`${fa(holidayKm, 1)} km`} sub={coatedKm > holidayKm ? `${fa(coatedKm - holidayKm, 1)} km بدون آزمون` : 'همهٔ پوشش‌ها آزمون شده'} color={coatedKm - holidayKm > 0.5 ? '#f59e0b' : '#22c55e'} />
        <Kpi label="DCVG / CIPS پس از خاک‌ریزی" value={`${fa(dcvgKm, 1)} km`} sub={`از ${fa(bfKm, 1)} کیلومتر خاک‌ریزی‌شده`} color="#0ea5e9" />
        <Kpi label="عیوب باز" value={fa(st.defects.filter((x) => x.status === 'open').length)} sub={`${fa(st.defects.filter((x) => x.status !== 'open').length)} تعمیرشده`} color="#ef4444" />
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><ShieldCheck size={15} /> ثبت آزمون پوشش</b></header>
        <div className="ht-seg" role="group" aria-label="نوع آزمون">{(Object.keys(COATING_KIND_FA) as CoatingKind[]).map((k) => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{COATING_KIND_FA[k]}</button>)}</div>
        <div className="ps-inline-form">
          <label className="ps-field"><span>از کیلومتر *</span><input type="number" step="0.001" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} dir="ltr" /></label>
          <label className="ps-field"><span>تا کیلومتر *</span><input type="number" step="0.001" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} dir="ltr" aria-invalid={f.to !== '' && !ok} /></label>
          <div className="ps-field"><span>تاریخ</span><ShamsiDate value={f.at} max={today()} onChange={(v) => setF({ ...f, at: v })} label="تاریخ" /></div>
          {f.kind === 'holiday' && <label className="ps-field"><span>ولتاژ (kV)</span><input type="number" value={f.kv} onChange={(e) => setF({ ...f, kv: e.target.value })} dir="ltr" /></label>}
          <label className="ps-field"><span>نتیجه</span><select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value as 'pass' | 'fail' })}><option value="pass">قبول</option><option value="fail">مردود</option></select></label>
          <label className="ps-field"><span>تعداد عیب</span><input type="number" min={0} value={f.defects} onChange={(e) => setF({ ...f, defects: e.target.value })} /></label>
          <label className="ps-field"><span>شمارهٔ گزارش</span><input value={f.report} onChange={(e) => setF({ ...f, report: e.target.value })} /></label>
          <label className="ps-field"><span>انجام‌دهنده</span><input value={f.contractor} onChange={(e) => setF({ ...f, contractor: e.target.value })} /></label>
          <button type="button" className="ps-btn is-primary" disabled={!ok} onClick={save}><Plus size={14} /> ثبت</button>
        </div>
        {f.kind === 'holiday' && <p className="ps-hint">ولتاژ آزمون هالیدی بر اساس ضخامت پوشش تعیین می‌شود (برای پوشش سه‌لایهٔ پلی‌اتیلن معمولاً حدود ۲۵ کیلوولت).</p>}
      </section>

      {st.records.length > 0 && (
        <section className="ps-card">
          <header className="ps-card-head"><b>آزمون‌های ثبت‌شده</b></header>
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>نوع</th><th>کیلومتر</th><th>تاریخ</th><th>ولتاژ</th><th>نتیجه</th><th>عیب</th><th>گزارش</th><th>انجام‌دهنده</th></tr></thead>
            <tbody>{st.records.map((r) => <tr key={r.id}><td>{COATING_KIND_FA[r.kind].split(' (')[0]}</td><td className="ps-nowrap">{fa(r.kmFrom, 3)} – {fa(r.kmTo, 3)}</td><td>{jd(r.at)}</td><td>{r.voltageKv != null ? `${fa(r.voltageKv)} kV` : '—'}</td><td className={r.result === 'fail' ? 'is-late' : ''}>{r.result === 'pass' ? 'قبول' : 'مردود'}</td><td>{fa(r.defects)}</td><td>{r.reportNo}</td><td>{r.contractor}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <section className="ps-card">
        <header className="ps-card-head"><b><AlertTriangle size={15} /> عیوب پوشش</b></header>
        <div className="ps-inline-form">
          <label className="ps-field"><span>کیلومتر *</span><input type="number" step="0.001" value={d.km} onChange={(e) => setD({ ...d, km: e.target.value })} dir="ltr" /></label>
          <label className="ps-field"><span>شدت</span><select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as CtDefect['severity'] })}>{(['minor', 'moderate', 'severe'] as const).map((s) => <option key={s} value={s}>{SEV_FA[s]}</option>)}</select></label>
          <label className="ps-field is-wide"><span>شرح</span><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="مثلاً: سوراخ پوشش در محل سرجوش J-01234" /></label>
          <button type="button" className="ps-btn is-primary" disabled={d.km === ''} onClick={async () => { if (await st.addDefect({ recordId: null, km: Number(d.km), kind: 'holiday', severity: d.severity, note: d.note }, email)) setD({ km: '', severity: 'minor', note: '' }) }}><Plus size={14} /> ثبت عیب</button>
        </div>
        {st.defects.length ? (
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>کیلومتر</th><th>شدت</th><th>شرح</th><th>وضعیت</th><th>اقدام</th></tr></thead>
            <tbody>{st.defects.map((x) => <tr key={x.id}><td dir="ltr" style={{ textAlign: 'right' }}>KP {fa(x.km, 3)}</td><td><span className="ps-chip" style={{ '--c': SEV_COLOR[x.severity] } as CSSProperties}><i />{SEV_FA[x.severity]}</span></td><td>{x.note}</td><td>{DEF_STATUS_FA[x.status]}{x.repairedAt ? ` · ${jd(x.repairedAt)}` : ''}</td>
              <td className="ps-nowrap">{x.status === 'open' && <button type="button" className="ps-btn" onClick={() => st.setDefect(x.id, 'repaired')}>تعمیر شد</button>}{x.status === 'repaired' && <button type="button" className="ps-btn is-ok" onClick={() => st.setDefect(x.id, 'verified')}>تأیید تعمیر</button>}</td></tr>)}</tbody></table></div>
        ) : <p className="ps-hint">عیبی ثبت نشده است.</p>}
      </section>
    </div>
  )
}

// ── settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [x, setX] = useState<HtSettings>(st.settings)
  const [txt, setTxt] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const num = (k: keyof HtSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setX({ ...x, [k]: e.target.value === '' ? null : Number(e.target.value) })
  const parse = (rows: unknown[][]) => {
    const pts = rows.map((r) => r.map((c) => Number(String(c).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[+٫]/g, '.')))).filter((r) => r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1])).map((r) => ({ km: r[0], elev: r[1] })).sort((a, b) => a.km - b.km)
    if (pts.length < 2) { setNote('ستون کیلومتر و ارتفاع پیدا نشد.'); return null }
    setNote(`${fa(pts.length)} نقطه از کیلومتر ${fa(pts[0].km, 2)} تا ${fa(pts[pts.length - 1].km, 2)} خوانده شد.`)
    return pts
  }
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><Settings2 size={15} /> پارامترهای آزمون</b></header>
        <p className="ps-hint">قطر، ضخامت، گرید و فشار طراحی لوله از تنظیمات دوقلوی دیجیتال خوانده می‌شود ({st.pipe ? `Ø${st.pipe.diameterIn}″ × ${st.pipe.wallMm} mm، ${st.pipe.material}، ${st.pipe.designPressureBar} bar` : '—'}) تا در همهٔ ماژول‌ها یکی باشد.</p>
        <div className="ps-grid">
          <Field label="ضریب فشار آزمون مقاومت" hint="× فشار طراحی در نقطهٔ بالا (مثلاً ۱٫۲۵ یا ۱٫۵)"><input type="number" step="0.05" value={x.testFactor} onChange={num('testFactor')} /></Field>
          <Field label="حداکثر تنش در نقطهٔ پایین (٪ SMYS)" hint="معمولاً ۹۰ تا ۱۰۰"><input type="number" value={x.maxHoopPct} onChange={num('maxHoopPct')} /></Field>
          <Field label="حداکثر طول قطعه (km)"><input type="number" value={x.maxSectionKm} onChange={num('maxSectionKm')} /></Field>
          <Field label="حداقل طول قطعه (km)" hint="برش در محل شیر کوتاه‌تر از این نمی‌شود"><input type="number" step="0.1" value={x.minSectionKm} onChange={num('minSectionKm')} /></Field>
          <Field label="چگالی سیال (kg/m³)"><input type="number" value={x.density} onChange={num('density')} /></Field>
          <Field label="SMYS دستی (MPa)" hint="فقط اگر گرید از متن جنس لوله شناخته نشود"><input type="number" value={x.smysOverride ?? ''} onChange={num('smysOverride')} /></Field>
          <Field label="مدت آزمون مقاومت (ساعت)"><input type="number" value={x.strengthHoldH} onChange={num('strengthHoldH')} /></Field>
          <Field label="مدت آزمون نشتی (ساعت)"><input type="number" value={x.leakHoldH} onChange={num('leakHoldH')} /></Field>
          <Field label="حداکثر افت فشار مجاز (bar)"><input type="number" step="0.1" value={x.allowedDropBar} onChange={num('allowedDropBar')} /></Field>
        </div>
        <div className="ps-actions">
          <button type="button" className="ps-btn is-primary" disabled={!isAdmin} onClick={() => st.saveSettings(x, email)}><CheckCircle2 size={15} /> ذخیره</button>
          <button type="button" className="ps-btn is-ghost" onClick={() => setX({ ...DEFAULT_HT_SETTINGS, profile: x.profile, profileName: x.profileName })}>مقادیر پیش‌فرض</button>
          {!isAdmin && <small className="ps-meta">فقط مدیر سامانه پارامترها را تغییر می‌دهد.</small>}
        </div>
      </section>
      <section className="ps-card">
        <header className="ps-card-head"><b><FileUp size={15} /> پروفیل ارتفاعی خط</b><small className="ps-meta">منبع فعلی: {st.profileSource === 'land' ? 'KMZ ماژول تحصیل اراضی' : st.profileSource === 'twin' ? 'مسیر دوقلوی دیجیتال' : st.profileSource === 'table' ? `جدول واردشده${st.profileName ? ` (${st.profileName})` : ''}` : 'ندارد'}</small></header>
        <p className="ps-hint">اولویت با ارتفاع‌های فایل KMZ/KML مسیر پروژه است (همان فایل ماژول تحصیل اراضی). اگر فایل مسیر ارتفاع ندارد، پروفیل طولی را به‌صورت جدول دو ستونی «کیلومتر، ارتفاع» وارد کنید (اکسل، CSV یا متن).</p>
        <div className="ps-inline-form">
          <Field label="فایل اکسل / CSV"><input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (!fl) return; const pts = parse(await tableFromSheet(fl)); if (pts) await st.saveSettings({ ...st.settings, profile: pts, profileName: fl.name }, email) }} /></Field>
          <Field label="یا متن (هر خط: کیلومتر ارتفاع)" wide><textarea rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} dir="ltr" placeholder={'0 1240\n0.5 1262\n1.0 1280'} /></Field>
          <button type="button" className="ps-btn" disabled={!txt.trim()} onClick={async () => { const pts = parse(tableFromText(txt)); if (pts) { await st.saveSettings({ ...st.settings, profile: pts, profileName: 'متن واردشده' }, email); setTxt('') } }}>ذخیرهٔ پروفیل</button>
        </div>
        {note && <p className="ps-hint">{note}</p>}
      </section>
    </div>
  )
}

// ── small parts ──────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return <article className="ps-kpi" style={{ '--c': color } as CSSProperties}><small>{label}</small><b>{value}</b><span>{sub}</span></article>
}
function Fig({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div className="ht-fig"><small>{k}</small><b>{v}</b>{sub && <span>{sub}</span>}</div>
}
function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`ps-field ${wide ? 'is-wide' : ''}`}><span>{label}</span>{children}{hint && <small className="ps-meta">{hint}</small>}</label>
}
function Empty({ text }: { text: string }) {
  return <div className="ps-empty"><Droplets size={24} aria-hidden /><p>{text}</p></div>
}
