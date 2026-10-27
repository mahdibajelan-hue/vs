import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Activity, AlertTriangle, Camera, Download, Map as MapIcon, Pencil, Tablet, Trash2, BookOpen, CheckCircle2, ClipboardCheck, FileSignature, Flame, Gauge, ListChecks, Loader2, Paperclip, Plus, Printer, Settings2, ShieldCheck, Stamp, Users, X } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { usePssrStore, type PssrAdvisories } from './store/usePssrStore'
import { FormHeader, OfficialChecklist, SummaryBox, printOfficialForm } from './OfficialForm'
import { canSign, permitApprovers, projectReadiness, STAGE_COLOR, STAGE_FA, STAGE_ORDER, systemStatus, type ChainPerson, type PssrStage, type SignerRow, type SystemStatus } from './lib/pssrCore'
import { CHECK_FA, DEFAULT_SIGN_CHAIN, GASIN_CHECKS, GASIN_LOG_FA, GASIN_STATUS_FA, KIND_FA, PUNCH_CAT_FA, PUNCH_STATUS_FA, type CheckStatus, type GasinLog, type GasinLogKind, type GasinPermit, type PssrCheck, type PssrKind, type PssrPunch, type PssrSystem, type PunchCategory } from './types'
import { PssrGuide } from './PssrGuide'
import { ReadinessMap } from './ReadinessMap'
import './pssr.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const today = () => new Date().toISOString().slice(0, 10)
const AFTER_RFSU: PssrStage[] = ['rfsu', 'permit', 'gasin', 'live']
type Tab = 'dash' | 'map' | 'systems' | 'punches' | 'settings'
/** tablet (field) mode: big touch targets, one-tap check status, camera evidence, one-tap gas-in events */
const TabletCtx = createContext(false)
const TABLET_KEY = 'pssr.tablet.v1'

/**
 * PSSR — ایمنی و آمادگی پیش از راه‌اندازی. Per commissioning system: the PSSR checklist, the PSSR meeting, punch items
 * (A blocks RFSU), and the RFSU certificate signed in order by the project's sign chain. Rules live in lib/pssrCore.
 */
export function PssrApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = usePssrStore()
  const [tab, setTab] = useState<Tab>('dash')
  const [openSys, setOpenSys] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const [tablet, setTablet] = useState(() => { try { return localStorage.getItem(TABLET_KEY) === '1' } catch { return false } })
  const switchTablet = () => setTablet((v) => { try { localStorage.setItem(TABLET_KEY, v ? '0' : '1') } catch { /* private mode */ } return !v })
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  // the sign chain in force: the project's own, or the default steps (no emails → only an admin can sign)
  const chain: SignerRow[] = useMemo(() => (st.signers.length ? st.signers : DEFAULT_SIGN_CHAIN), [st.signers])
  const statusOf = useMemo(() => {
    const m = new Map<string, SystemStatus>()
    for (const sys of st.systems) m.set(sys.id, systemStatus({ checks: st.checks.filter((c) => c.systemId === sys.id), meetings: st.meetings.filter((x) => x.systemId === sys.id), punches: st.punches.filter((p) => p.systemId === sys.id), signers: chain, signoffs: st.signoffs.filter((x) => x.systemId === sys.id), permit: st.permits.find((x) => x.systemId === sys.id) ?? null, summary: sys.summary }))
    return m
  }, [st.systems, st.checks, st.meetings, st.punches, st.signoffs, st.permits, chain])
  const summary = projectReadiness([...statusOf.values()])
  const missingTables = !!st.error && /pssr_|relation|schema cache/i.test(st.error)

  return (
    <TabletCtx.Provider value={tablet}>
    <div className={`ps ${tablet ? 'is-tablet' : ''}`} dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico"><ShieldCheck size={18} /></span>
          <span><b>PSSR — ایمنی پیش از راه‌اندازی</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end">
          <button type="button" className={`ps-btn ${tablet ? 'is-on' : ''}`} aria-pressed={tablet} onClick={switchTablet} title="دکمه‌های بزرگ برای کار در کارگاه با تبلت: ثبت یک‌ضربه‌ای وضعیت، عکس با دوربین، ثبت سریع رویداد تزریق گاز"><Tablet size={15} /> حالت تبلت</button>
          <button type="button" className="ps-btn is-primary" onClick={() => setGuide(true)}><BookOpen size={15} /> راهنما</button>
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      <nav className="ps-tabs" aria-label="بخش‌ها">
        {([['dash', 'داشبورد آمادگی', ClipboardCheck], ['map', 'نقشهٔ آمادگی', MapIcon], ['systems', 'سیستم‌ها', ListChecks], ['punches', 'پانچ‌لیست', AlertTriangle], ['settings', 'تنظیمات', Settings2]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={`ps-tab ${tab === k && !openSys ? 'is-on' : ''}`} onClick={() => { setTab(k); setOpenSys(null) }}><I size={15} aria-hidden />{l}</button>
        ))}
      </nav>
      <main className="ps-main">
        {!projectId ? <Empty text="ابتدا از رادار پروژه یک پروژه را انتخاب کنید." />
          : missingTables ? <Empty text="جدول‌های ماژول PSSR هنوز در پایگاه داده ساخته نشده‌اند. فایل‌های supabase/pssr/001_pssr.sql و 003_pssr_chain_gasin.sql را یک بار در SQL Editor اجرا کنید." />
          : st.loading ? <p className="ps-loading"><Loader2 size={16} className="animate-spin" /> در حال بارگذاری…</p>
          : openSys ? <SystemPage id={openSys} status={statusOf.get(openSys)} chain={chain} onBack={() => setOpenSys(null)} />
          : tab === 'dash' ? <Dashboard summary={summary} statusOf={statusOf} onOpen={setOpenSys} onNew={() => setTab('systems')} />
          : tab === 'map' ? <ReadinessMap statusOf={statusOf} onOpen={setOpenSys} />
          : tab === 'systems' ? <Systems statusOf={statusOf} onOpen={setOpenSys} />
          : tab === 'punches' ? <PunchList onOpen={setOpenSys} />
          : <Settings chain={chain} />}
        {st.error && !missingTables && <p className="ps-err">{st.error}</p>}
      </main>
      {guide && <PssrGuide onClose={() => setGuide(false)} />}
    </div>
    </TabletCtx.Provider>
  )
}

// ── dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ summary, statusOf, onOpen, onNew }: { summary: ReturnType<typeof projectReadiness>; statusOf: Map<string, SystemStatus>; onOpen: (id: string) => void; onNew: () => void }) {
  const systems = usePssrStore((s) => s.systems)
  if (!systems.length) {
    return (
      <div className="ps-hero-empty">
        <ShieldCheck size={30} aria-hidden />
        <b>هنوز سیستمی برای راه‌اندازی تعریف نشده است</b>
        <p>پروژه را به سیستم‌ها یا بخش‌های راه‌اندازی تقسیم کنید (مثلاً هر قطعهٔ خط، هر ایستگاه). برای هر سیستم چک‌لیست PSSR خودکار ساخته می‌شود.</p>
        <button type="button" className="ps-btn is-primary" onClick={onNew}><Plus size={15} /> تعریف اولین سیستم</button>
      </div>
    )
  }
  return (
    <>
      <section className="ps-kpis">
        <Kpi label="سیستم‌ها" value={fa(summary.systems)} sub={`میانگین آمادگی ${fa(summary.avgReadiness)}٪`} color="#3b82f6" />
        <Kpi label="RFSU صادرشده" value={`${fa(summary.withRfsu)} از ${fa(summary.systems)}`} sub={`${fa(summary.rfsuPct)}٪ سیستم‌ها`} color="#10b981" />
        <Kpi label="تحت گاز" value={`${fa(summary.live)} از ${fa(summary.systems)}`} sub={summary.byStage.gasin ? `${fa(summary.byStage.gasin)} سیستم در حال تزریق` : `${fa(summary.livePct)}٪ سیستم‌ها`} color="#16a34a" />
        <Kpi label="پانچ A باز" value={fa(summary.openA)} sub={`B: ${fa(summary.openB)} · C: ${fa(summary.openC)}${summary.overdue ? ` · ${fa(summary.overdue)} سررسیدگذشته` : ''}`} color={summary.openA ? '#ef4444' : '#10b981'} />
      </section>
      <AdvisoryPanel />
      <section className="ps-flow" aria-label="سیستم‌ها در هر مرحله">
        {STAGE_ORDER.map((stg, i) => (
          <div key={stg} className="ps-flow-col" style={{ '--c': STAGE_COLOR[stg] } as CSSProperties}>
            <header><span className="ps-flow-n">{fa(i + 1)}</span><b>{STAGE_FA[stg]}</b><em>{fa(summary.byStage[stg])}</em></header>
            {systems.filter((s) => statusOf.get(s.id)?.stage === stg).map((s) => {
              const x = statusOf.get(s.id)!
              return (
                <button type="button" key={s.id} className="ps-flow-card" onClick={() => onOpen(s.id)}>
                  <span className="ps-code" dir="ltr">{s.code}</span>
                  <b>{s.name}</b>
                  <span className="ps-bar"><span style={{ width: `${x.readiness}%` }} /></span>
                  <small>آمادگی {fa(x.readiness)}٪{x.punches.A.open ? ` · ${fa(x.punches.A.open)} پانچ A` : ''}{s.targetGasIn ? ` · تزریق ${jd(s.targetGasIn)}` : ''}</small>
                </button>
              )
            })}
          </div>
        ))}
      </section>
    </>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return <article className="ps-kpi" style={{ '--c': color } as CSSProperties}><small>{label}</small><b>{value}</b><span>{sub}</span></article>
}

// ── systems list + new system ────────────────────────────────────────────────
function Systems({ statusOf, onOpen }: { statusOf: Map<string, SystemStatus>; onOpen: (id: string) => void }) {
  const systems = usePssrStore((s) => s.systems)
  const [adding, setAdding] = useState(systems.length === 0)
  return (
    <>
      <div className="ps-row-head">
        <div><b>سیستم‌های راه‌اندازی</b><small>هر سیستم چک‌لیست، جلسه، پانچ‌لیست و گواهی RFSU خودش را دارد.</small></div>
        <button type="button" className="ps-btn is-primary" onClick={() => setAdding(true)}><Plus size={15} /> سیستم جدید</button>
      </div>
      {adding && <NewSystem onDone={(id) => { setAdding(false); if (id) onOpen(id) }} />}
      <div className="ps-list">
        {systems.map((s) => {
          const x = statusOf.get(s.id)!
          return (
            <button type="button" key={s.id} className="ps-sys" onClick={() => onOpen(s.id)} style={{ '--c': STAGE_COLOR[x.stage] } as CSSProperties}>
              <span className="ps-code" dir="ltr">{s.code}</span>
              <span className="ps-sys-main"><b>{s.name}</b><small>{KIND_FA[s.kind]}{s.kmFrom != null ? ` · کیلومتر ${fa(s.kmFrom)} تا ${fa(s.kmTo ?? s.kmFrom)}` : ''}{s.targetGasIn ? ` · تزریق گاز هدف ${jd(s.targetGasIn)}` : ''}</small></span>
              <span className="ps-chip"><i />{STAGE_FA[x.stage]}</span>
              <span className="ps-sys-num"><b>{fa(x.readiness)}٪</b><small>آمادگی</small></span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function NewSystem({ onDone }: { onDone: (id: string | null) => void }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [f, setF] = useState({ code: '', name: '', kind: 'pipeline' as PssrKind, kmFrom: '', kmTo: '', target: '', note: '' })
  const [busy, setBusy] = useState(false)
  const n = st.templates.filter((t) => t.active && (t.kind === 'all' || t.kind === f.kind)).length
  const save = async () => {
    if (!f.code.trim() || !f.name.trim()) return
    setBusy(true)
    const id = await st.addSystem({ code: f.code, name: f.name, kind: f.kind, kmFrom: f.kmFrom ? Number(f.kmFrom) : null, kmTo: f.kmTo ? Number(f.kmTo) : null, targetGasIn: f.target || null, note: f.note }, email)
    setBusy(false)
    onDone(id)
  }
  return (
    <section className="ps-card ps-form">
      <header className="ps-card-head"><b>تعریف سیستم راه‌اندازی</b><button type="button" className="ps-x" onClick={() => onDone(null)} aria-label="بستن"><X size={16} /></button></header>
      <div className="ps-grid">
        <Field label="کد سیستم *"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="مثلاً SYS-01" dir="ltr" /></Field>
        <Field label="نام *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً قطعهٔ کیلومتر ۰ تا ۸۰" /></Field>
        <Field label="نوع"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PssrKind })}>{Object.entries(KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="از کیلومتر"><input type="number" value={f.kmFrom} onChange={(e) => setF({ ...f, kmFrom: e.target.value })} /></Field>
        <Field label="تا کیلومتر"><input type="number" value={f.kmTo} onChange={(e) => setF({ ...f, kmTo: e.target.value })} /></Field>
        <Field label="تاریخ هدف تزریق گاز"><input type="date" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
      </div>
      <p className="ps-hint">با ذخیره، {fa(n)} بند چک‌لیست PSSR متناسب با نوع «{KIND_FA[f.kind]}» برای این سیستم ساخته می‌شود.</p>
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={busy || !f.code.trim() || !f.name.trim()} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />} ذخیرهٔ سیستم</button></div>
    </section>
  )
}

// ── one system ───────────────────────────────────────────────────────────────
function SystemPage({ id, status, chain, onBack }: { id: string; status?: SystemStatus; chain: SignerRow[]; onBack: () => void }) {
  const st = usePssrStore()
  const sys = st.systems.find((s) => s.id === id)
  const [editing, setEditing] = useState(false)
  if (!sys || !status) return <Empty text="سیستم یافت نشد." />
  const stageIdx = STAGE_ORDER.indexOf(status.stage)
  const official = st.checks.some((c) => c.systemId === id && !!c.priority)
  return (
    <div className="ps-sysp" style={{ '--acc': STAGE_COLOR[status.stage] } as CSSProperties}>
      <nav className="ps-sysnav">
        <button type="button" className="ps-btn is-primary" onClick={onBack}>→ بازگشت به فهرست</button>
        <ol className="ps-stepper" aria-label="مراحل">
          {STAGE_ORDER.map((s, i) => <li key={s} className={i < stageIdx ? 'is-done' : i === stageIdx ? 'is-on' : ''} style={{ '--c': STAGE_COLOR[s] } as CSSProperties}><span>{fa(i + 1)}</span>{STAGE_FA[s]}</li>)}
        </ol>
      </nav>
      <header className="ps-hero">
        <div className="ps-hero-id">
          <span className="ps-hero-code" dir="ltr">{sys.code}</span>
          <div><h2>{sys.name}</h2><p>{KIND_FA[sys.kind]}{sys.kmFrom != null ? ` · کیلومتر ${fa(sys.kmFrom)}${sys.kmTo != null && sys.kmTo !== sys.kmFrom ? ` تا ${fa(sys.kmTo)}` : ''}` : ' · بدون کیلومتر'} · تزریق گاز هدف: {jd(sys.targetGasIn)}</p></div>
          <button type="button" className="ps-btn is-ghost" onClick={() => setEditing((v) => !v)}><Pencil size={14} /> ویرایش</button>
        </div>
        {editing && <EditSystem sys={sys} onDone={(deleted) => { setEditing(false); if (deleted) onBack() }} />}
        <div className="ps-hero-stats">
          <div><small>آمادگی برای RFSU</small><b>{fa(status.readiness)}٪</b></div>
          <div><small>چک‌لیست</small><b>{fa(status.checks.ok + status.checks.na)} / {fa(status.checks.total)}</b></div>
          <div className={status.punches.A.open ? 'is-bad' : ''}><small>پانچ A باز</small><b>{fa(status.punches.A.open)}</b></div>
          <div><small>وضعیت</small><b className="ps-hero-text">{STAGE_FA[status.stage]}</b></div>
        </div>
        {status.blockers.length > 0 && (
          <div className="ps-blockers">
            <b><AlertTriangle size={14} /> موانع صدور RFSU ({fa(status.blockers.length)})</b>
            <ul>{status.blockers.slice(0, 6).map((b, i) => <li key={i}>{b.label}</li>)}{status.blockers.length > 6 && <li>و {fa(status.blockers.length - 6)} مورد دیگر…</li>}</ul>
          </div>
        )}
      </header>
      <Section n={1} id="ps-checks" title={official ? 'چک‌لیست PSSR خطوط لوله و تأسیسات وابسته' : 'چک‌لیست PSSR'} mode="input" hint={official ? 'سربرگ فرم را پر کنید، سپس به هر بند «بلی»، «خیر» یا «بدون کاربرد» پاسخ دهید و توضیح یا مدرک بگذارید. «خیر» خودکار پانچی با اولویت همان بند باز می‌کند؛ بندهای اولویت A باید پیش از RFSU «بلی» یا «بدون کاربرد» باشند.' : 'برای هر بند وضعیت را انتخاب کنید و مدرک (شمارهٔ صورت‌جلسه، لینک یا توضیح) را بنویسید. بندهای الزامی باید «بلی» یا «بدون کاربرد» باشند.'}>
        <FormHeader sys={sys} official={official} locked={stageIdx >= STAGE_ORDER.indexOf('rfsu')} />
        <Checklist systemId={id} />
      </Section>
      <Section n={2} id="ps-meet" title="جلسهٔ PSSR" mode="input" hint="تاریخ، حاضران و خلاصهٔ جلسهٔ بازدید PSSR را ثبت کنید. یافته‌های جلسه را در بخش بعد به‌صورت پانچ وارد کنید.">
        <Meetings systemId={id} />
      </Section>
      <Section n={3} id="ps-punch" title="یافته‌ها و پانچ‌لیست" mode="input" hint="هر نقص را با دسته ثبت کنید: A باید پیش از RFSU بسته و توسط فرد دیگری تأیید شود؛ B پیش از تحویل موقت؛ C بهبود.">
        <Punches systemId={id} />
      </Section>
      <Section n={4} id="ps-rfsu" title="گواهی RFSU — آمادگی برای راه‌اندازی" mode="input" hint="وقتی همهٔ موانع رفع شد، به ترتیب امضا می‌شود: پیمانکار ← مشاور ← کارفرما (سیستمی)، سپس نمایندهٔ بهره‌بردار فرم کاغذی را دستی امضا می‌کند و مدیر پروژهٔ کارفرما با پیوست اسکن آن، مهر تأیید سیستمی می‌زند.">
        <Rfsu sys={sys} status={status} />
      </Section>
      <Section n={5} id="ps-gasin" title="مجوز و ثبت عملیات تزریق گاز" mode="input" hint="پس از RFSU، چک‌لیست روز تزریق را تأیید کنید؛ کارفرما (مدیر پروژه یا مسئول HSE) مجوز را صادر می‌کند. سپس شروع، قرائت‌های فشار، باز و بسته شدن شیرها و پایان یا توقف عملیات را ثبت کنید.">
        <GasIn sys={sys} status={status} chain={chain} />
      </Section>
    </div>
  )
}

function EditSystem({ sys, onDone }: { sys: PssrSystem; onDone: (deleted: boolean) => void }) {
  const st = usePssrStore()
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [f, setF] = useState({ name: sys.name, kind: sys.kind, kmFrom: sys.kmFrom?.toString() ?? '', kmTo: sys.kmTo?.toString() ?? '', target: sys.targetGasIn ?? '', note: sys.note })
  const [confirm, setConfirm] = useState('')
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const bad = f.kmFrom !== '' && f.kmTo !== '' && Number(f.kmTo) < Number(f.kmFrom)
  return (
    <div className="ps-edit">
      <div className="ps-grid">
        <Field label="نام"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="نوع"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PssrKind })}>{Object.entries(KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label={f.kind === 'station' ? 'کیلومتر محل' : 'از کیلومتر'}><input type="number" value={f.kmFrom} onChange={(e) => setF({ ...f, kmFrom: e.target.value })} /></Field>
        {f.kind !== 'station' && <Field label="تا کیلومتر"><input type="number" value={f.kmTo} onChange={(e) => setF({ ...f, kmTo: e.target.value })} aria-invalid={bad} /></Field>}
        <Field label="تاریخ هدف تزریق گاز"><input type="date" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
        <Field label="یادداشت" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      {bad && <p className="ps-hint is-warn">«تا کیلومتر» نباید کمتر از «از کیلومتر» باشد.</p>}
      <div className="ps-actions">
        <button type="button" className="ps-btn is-primary" disabled={!f.name.trim() || bad} onClick={async () => { if (await st.updateSystem(sys.id, { name: f.name.trim(), kind: f.kind, kmFrom: num(f.kmFrom), kmTo: f.kind === 'station' ? num(f.kmFrom) : num(f.kmTo), targetGasIn: f.target || null, note: f.note })) onDone(false) }}>ذخیرهٔ تغییرات</button>
        <button type="button" className="ps-btn is-ghost" onClick={() => onDone(false)}>انصراف</button>
        {isAdmin && (
          <span className="ps-danger">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`برای حذف، ${sys.code} را بنویسید`} dir="ltr" aria-label="تأیید حذف" />
            <button type="button" className="ps-btn is-bad" disabled={confirm !== sys.code} onClick={async () => { if (await st.deleteSystem(sys.id)) onDone(true) }}><Trash2 size={14} /> حذف سیستم و همهٔ سوابق</button>
          </span>
        )}
      </div>
    </div>
  )
}

function Section({ n, id, title, mode, hint, children }: { n: number; id: string; title: string; mode: 'input' | 'view'; hint: string; children: ReactNode }) {
  return (
    <section id={id} className={`ps-sec is-${mode}`}>
      <header className="ps-sec-head"><span className="ps-num">{fa(n)}</span><div><h3>{title}</h3><p>{hint}</p></div><span className={`ps-badge is-${mode}`}>{mode === 'input' ? '✎ ورود اطلاعات' : 'فقط نمایش'}</span></header>
      <div className="ps-sec-body">{children}</div>
    </section>
  )
}

function Checklist({ systemId }: { systemId: string }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const list = st.checks.filter((c) => c.systemId === systemId)
  const cats = [...new Set(list.map((c) => c.category))]
  const adv = st.advisories
  if (!list.length) return <p className="ps-hint">برای این سیستم بندی ساخته نشده؛ قالب چک‌لیست را در «تنظیمات» ببینید.</p>
  if (list.some((c) => c.priority)) {
    const sys = st.systems.find((x) => x.id === systemId)
    return <OfficialChecklist systemId={systemId} advice={(t) => (adv ? adviceFor(t, adv, sys) : null)} />
  }
  return (
    <div className="ps-checks">
      {cats.map((cat) => (
        <div key={cat} className="ps-cat">
          <h4>{cat}</h4>
          {list.filter((c) => c.category === cat).map((c) => <CheckRow key={c.id} systemId={systemId} check={c} meta={c.checkedBy ? `${c.checkedBy} · ${jd(c.checkedAt)}` : ''} onSave={(s, e, f) => st.setCheck(c.id, s, e, email, f)} advice={adv ? adviceFor(c.title, adv, st.systems.find((x) => x.id === systemId)) : null} />)}
        </div>
      ))}
    </div>
  )
}

const CHECK_TONE: Record<CheckStatus, string> = { pending: '#64748b', ok: '#10b981', fail: '#ef4444', na: '#0ea5e9' }

function CheckRow({ systemId, check, meta, onSave, advice }: { systemId: string; check: PssrCheck; meta: string; onSave: (s: CheckStatus, e: string, fileUrl?: string | null) => Promise<boolean>; advice?: string | null }) {
  const { status, evidence } = check
  const tablet = useContext(TabletCtx)
  const st = usePssrStore()
  const [s, setS] = useState(status), [e, setE] = useState(evidence), [busy, setBusy] = useState(false)
  useEffect(() => { setS(status); setE(evidence) }, [status, evidence])
  const dirty = s !== status || e !== evidence
  const save = async (ns: CheckStatus, ne: string, file?: File) => {
    setBusy(true)
    const url = file ? await st.uploadScan(systemId, file) : undefined
    if (file && !url) { setBusy(false); return }
    await onSave(ns, ne, url)
    setBusy(false)
  }
  const photo = (
    <label className={`ps-btn is-ghost ps-photo ${busy ? 'is-busy' : ''}`} title="گرفتن یا پیوست عکس / مدرک">
      <Camera size={tablet ? 18 : 14} aria-hidden /> {check.fileUrl ? 'عکس جدید' : 'عکس'}
      <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ''; if (f) void save(s, e, f) }} />
    </label>
  )
  return (
    <div className={`ps-check is-${status}`}>
      <div className="ps-check-title"><span className={`ps-dot is-${status}`} />{check.title}{check.mandatory && <em>الزامی</em>}</div>
      {tablet ? (
        <div className="ps-check-tab">
          <div className="ps-seg" role="group" aria-label="وضعیت">
            {(['ok', 'fail', 'na', 'pending'] as CheckStatus[]).map((k) => (
              <button key={k} type="button" aria-pressed={status === k} disabled={busy} style={{ '--c': CHECK_TONE[k] } as CSSProperties} onClick={() => k !== status && save(k, e)}>{CHECK_FA[k]}</button>
            ))}
          </div>
          <input value={e} onChange={(x) => setE(x.target.value)} onBlur={() => { if (e !== evidence) void save(status, e) }} placeholder="مدرک / توضیح" />
          {photo}
        </div>
      ) : (
        <div className="ps-check-edit">
          <select value={s} onChange={(x) => setS(x.target.value as CheckStatus)} aria-label="وضعیت">{(Object.keys(CHECK_FA) as CheckStatus[]).map((k) => <option key={k} value={k}>{CHECK_FA[k]}</option>)}</select>
          <input value={e} onChange={(x) => setE(x.target.value)} placeholder="مدرک / توضیح (شمارهٔ صورت‌جلسه، لینک…)" />
          <button type="button" className="ps-btn" disabled={!dirty || busy} onClick={() => save(s, e)}>{busy ? <Loader2 size={13} className="animate-spin" /> : 'ذخیره'}</button>
          {photo}
        </div>
      )}
      {advice && <small className={`ps-advice ${status === 'ok' ? 'is-strong' : ''}`}><AlertTriangle size={12} aria-hidden /> {advice}{status === 'ok' ? ' — با وجود این، بند «تأیید» شده است؛ دوباره بررسی کنید.' : ''}</small>}
      {(meta || check.fileUrl) && <small className="ps-meta">{meta && `آخرین ثبت: ${meta}`}{check.fileUrl && <> · <button type="button" className="ps-link" onClick={() => st.openScan(check.fileUrl!)}><Paperclip size={11} /> مدرک پیوست</button></>}</small>}
    </div>
  )
}

function Meetings({ systemId }: { systemId: string }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const list = st.meetings.filter((m) => m.systemId === systemId)
  const [f, setF] = useState({ date: today(), attendees: '', notes: '' })
  return (
    <div className="ps-stack">
      {list.map((m) => (
        <article key={m.id} className="ps-meet">
          <header><Users size={14} /> <b>جلسهٔ {jd(m.heldOn)}</b><small>{m.createdBy}</small></header>
          {m.attendees && <p><b>حاضران:</b> {m.attendees}</p>}
          {m.notes && <p><b>خلاصه:</b> {m.notes}</p>}
          <small>{st.punches.filter((p) => p.meetingId === m.id).length ? `${fa(st.punches.filter((p) => p.meetingId === m.id).length)} یافته از این جلسه` : 'یافته‌ای به این جلسه وصل نشده'}</small>
        </article>
      ))}
      <div className="ps-inline-form">
        <Field label="تاریخ جلسه"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="حاضران (نام و سمت)"><input value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} placeholder="مثلاً: مهندس ناظر، HSE، بهره‌بردار…" /></Field>
        <Field label="خلاصهٔ جلسه" wide><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button type="button" className="ps-btn is-primary" disabled={!f.date} onClick={async () => { if (await st.addMeeting(systemId, f.date, f.attendees, f.notes, email)) setF({ date: today(), attendees: '', notes: '' }) }}><Plus size={14} /> ثبت جلسه</button>
      </div>
    </div>
  )
}

function Punches({ systemId }: { systemId: string }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const list = st.punches.filter((p) => p.systemId === systemId)
  const meetings = st.meetings.filter((m) => m.systemId === systemId)
  const [f, setF] = useState({ category: 'A' as PunchCategory, title: '', discipline: '', owner: '', due: '', meeting: meetings[0]?.id ?? '' })
  return (
    <div className="ps-stack">
      {list.length ? <PunchTable list={list} me={email} /> : <p className="ps-hint">هنوز یافته‌ای ثبت نشده است.</p>}
      <div className="ps-inline-form">
        <Field label="دسته"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PunchCategory })}>{(['A', 'B', 'C'] as const).map((k) => <option key={k} value={k}>{PUNCH_CAT_FA[k]}</option>)}</select></Field>
        <Field label="شرح یافته *" wide><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: پلاک شناسایی شیر ۱۲ نصب نشده" /></Field>
        <Field label="رشته"><input value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} placeholder="مکانیک، برق، ابزار دقیق…" /></Field>
        <Field label="مسئول"><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
        <Field label="مهلت"><input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        {meetings.length > 0 && <Field label="جلسه"><select value={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.value })}><option value="">—</option>{meetings.map((m) => <option key={m.id} value={m.id}>{jd(m.heldOn)}</option>)}</select></Field>}
        <button type="button" className="ps-btn is-primary" disabled={!f.title.trim()} onClick={async () => { if (await st.addPunch({ systemId, meetingId: f.meeting || null, category: f.category, title: f.title.trim(), discipline: f.discipline, owner: f.owner, dueDate: f.due || null }, email)) setF({ ...f, title: '', owner: '', due: '' }) }}><Plus size={14} /> ثبت یافته</button>
      </div>
    </div>
  )
}

function PunchTable({ list, me, systemOf }: { list: PssrPunch[]; me: string; systemOf?: (id: string) => PssrSystem | undefined }) {
  const st = usePssrStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const t = today()
  return (
    <div className="ps-table-wrap">
      <table className="ps-table">
        <thead><tr>{systemOf && <th>سیستم</th>}<th>دسته</th><th>شرح</th><th>مسئول</th><th>مهلت</th><th>وضعیت</th><th>اقدام</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const late = p.status === 'open' && p.dueDate != null && p.dueDate < t
            return (
              <tr key={p.id} className={`is-${p.status}`}>
                {systemOf && <td><span className="ps-code" dir="ltr">{systemOf(p.systemId)?.code}</span></td>}
                <td><span className={`ps-cat-badge is-${p.category}`}>{p.category}</span></td>
                <td>{p.title}{p.discipline && <small className="ps-meta"> · {p.discipline}</small>}{p.closeNote && <small className="ps-meta"><br />بستن: {p.closeNote}</small>}</td>
                <td>{p.owner || '—'}</td>
                <td className={late ? 'is-late' : ''}>{jd(p.dueDate)}{late ? ' ⚠' : ''}</td>
                <td>{PUNCH_STATUS_FA[p.status]}{p.verifiedBy && <small className="ps-meta"><br />{p.verifiedBy}</small>}</td>
                <td className="ps-nowrap">
                  {p.status === 'open' && (closing === p.id
                    ? <span className="ps-close"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="شرح اقدام انجام‌شده" /><button type="button" className="ps-btn" onClick={async () => { await st.closePunch(p.id, note, me); setClosing(null); setNote('') }}>ثبت</button></span>
                    : <button type="button" className="ps-btn" onClick={() => setClosing(p.id)}>بستن</button>)}
                  {p.status === 'closed' && (p.closedBy && p.closedBy === me
                    ? <small className="ps-meta">تأیید با فرد دیگری</small>
                    : <button type="button" className="ps-btn is-ok" onClick={() => st.verifyPunch(p.id, me)}>تأیید بستن</button>)}
                  {p.status !== 'open' && <button type="button" className="ps-btn is-ghost" onClick={() => st.reopenPunch(p.id)}>بازگشایی</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── RFSU: multi-person sign chain + the operator's manual form ──────────────
const RULE_FA = { any: 'امضای یکی از افراد کافی است', all: 'همهٔ افراد باید امضا کنند' } as const

function Rfsu({ sys, status }: { sys: PssrSystem; status: SystemStatus }) {
  const st = usePssrStore()
  const profile = useAuthStore((s) => s.profile)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === sys.projectId))
  const step = status.nextStep
  const signable = step ? step.persons.filter((p) => canSign(step, p, profile?.email, !!profile?.isAdmin)) : []
  const issued = AFTER_RFSU.includes(status.stage)
  const checks = st.checks.filter((c) => c.systemId === sys.id)
  const official = checks.some((c) => !!c.priority)
  return (
    <div className="ps-stack">
      {official && <SummaryBox sys={sys} locked={issued || status.chain.some((c) => c.state === 'signed')} />}
      {official && <div><button type="button" className="ps-btn" onClick={() => printOfficialForm(sys, status, checks, st.punches.filter((p) => p.systemId === sys.id), project?.officialName ?? '')}><Printer size={14} /> چاپ فرم کامل PSSR</button></div>}
      <ol className="ps-chain">
        {status.chain.map((c) => (
          <li key={c.seq} className={`is-${c.state}`}>
            <span className="ps-chain-n">{c.state === 'signed' ? '✓' : c.state === 'rejected' ? '✕' : fa(c.seq)}</span>
            <div className="ps-chain-body">
              <b>{c.label}{c.manual && <em className="ps-tag is-manual"><Stamp size={11} aria-hidden /> امضای دستی + تأیید سیستمی</em>}</b>
              <small>{c.manual ? 'فرم کاغذی را نمایندهٔ بهره‌بردار امضا می‌کند؛ مهر تأیید سیستمی با فرد زیر' : RULE_FA[c.rule]}</small>
              <ul className="ps-persons">
                {c.persons.map((p) => (
                  <li key={p.label} className={`is-${p.state}`}>
                    <span className="ps-person-dot" aria-hidden />
                    <span><b>{p.label}</b><small>{p.email || 'ایمیل تعیین نشده (فقط مدیر سامانه)'}</small></span>
                    <span className="ps-person-state">
                      {p.state === 'pending' ? 'در انتظار' : `${p.state === 'signed' ? (c.manual ? 'تأیید شد' : 'امضا شد') : 'رد شد'} · ${p.by ?? ''} · ${jd(p.at)}`}
                      {p.comment && <small>«{p.comment}»</small>}
                      {c.manual && p.state === 'signed' && <small>امضای دستی: {p.manualSigner || '—'} · {jd(p.manualSignedOn)}{p.fileUrl && <> · <button type="button" className="ps-link" onClick={() => st.openScan(p.fileUrl!)}><Paperclip size={11} /> اسکن فرم</button></>}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      {issued ? (
        <div className="ps-rfsu-ok"><FileSignature size={18} /> <b>گواهی RFSU در {jd(status.rfsuAt)} صادر شد.</b> این سیستم آمادهٔ مرحلهٔ تزریق گاز است.
          <button type="button" className="ps-btn" onClick={() => printRfsu(sys, status, project?.officialName ?? '')}><Printer size={14} /> چاپ گواهی</button></div>
      ) : status.blockers.length ? (
        <p className="ps-hint is-warn"><AlertTriangle size={14} /> تا رفع {fa(status.blockers.length)} مانع بالای صفحه، امضای RFSU فعال نمی‌شود.</p>
      ) : step ? (
        <div className="ps-sign">
          <p>نوبت: <b>{step.label}</b> — {step.manual ? 'پس از امضای دستی فرم توسط نمایندهٔ بهره‌بردار، اسکن آن را پیوست و تأیید کنید.' : RULE_FA[step.rule]}</p>
          {signable.length ? <SignForm key={`${step.seq}-${status.chain.map((c) => c.persons.map((p) => p.state).join()).join()}`} systemId={sys.id} seq={step.seq} label={step.label} manual={step.manual} persons={signable} />
            : <p className="ps-hint">فقط {step.persons.filter((p) => p.state !== 'signed').map((p) => p.email ? `${p.label} (${p.email})` : p.label).join(' / ')} یا مدیر سامانه می‌تواند این مرحله را {step.manual ? 'تأیید' : 'امضا'} کند.</p>}
        </div>
      ) : null}
      {!st.signers.length && <p className="ps-hint">زنجیرهٔ امضا هنوز برای این پروژه ذخیره نشده و ساختار پیش‌فرض نمایش داده می‌شود؛ در «تنظیمات» ایمیل افراد را وارد و ذخیره کنید.</p>}
    </div>
  )
}

function SignForm({ systemId, seq, label, manual, persons }: { systemId: string; seq: number; label: string; manual: boolean; persons: ChainPerson[] }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [who, setWho] = useState(persons[0].label)
  const [comment, setComment] = useState('')
  const [m, setM] = useState({ signer: '', date: today() })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const manualOk = !manual || (!!file && !!m.signer.trim() && !!m.date)
  const go = async (decision: 'sign' | 'reject') => {
    setBusy(true)
    let fileUrl: string | null = null
    if (manual && decision === 'sign' && file) { fileUrl = await st.uploadScan(systemId, file); if (!fileUrl) { setBusy(false); return } }
    await st.sign({ systemId, seq, roleLabel: label, personLabel: who, decision, comment, ...(manual && decision === 'sign' ? { manualSigner: m.signer.trim(), manualSignedOn: m.date, fileUrl } : {}) }, email)
    setBusy(false)
  }
  return (
    <div className="ps-inline-form">
      <Field label={manual ? 'تأییدکننده' : 'امضا به عنوان'}><select value={who} onChange={(e) => setWho(e.target.value)}>{persons.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}</select></Field>
      {manual && <>
        <Field label="نام نمایندهٔ بهره‌بردار (امضاکنندهٔ فرم) *"><input value={m.signer} onChange={(e) => setM({ ...m, signer: e.target.value })} /></Field>
        <Field label="تاریخ امضای دستی *"><input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field>
        <Field label="اسکن فرم امضاشده (PDF یا تصویر) *"><input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      </>}
      <Field label="توضیح (اختیاری؛ برای رد لازم است)" wide><input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <button type="button" className="ps-btn is-ok" disabled={busy || !manualOk} onClick={() => go('sign')}>{busy ? <Loader2 size={14} className="animate-spin" /> : manual ? <Stamp size={14} /> : <FileSignature size={14} />} {manual ? 'مهر تأیید سیستمی' : 'امضا و تأیید'}</button>
      <button type="button" className="ps-btn is-bad" disabled={busy || !comment.trim()} onClick={() => go('reject')}>رد</button>
    </div>
  )
}

function printRfsu(sys: PssrSystem, status: SystemStatus, projectName: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const rows = status.chain.flatMap((c) => c.persons.filter((p) => p.state === 'signed').map((p) => `<tr><td>${fa(c.seq)}</td><td>${esc(c.label)}</td><td>${esc(c.manual ? `${p.manualSigner} (امضای دستی ${jd(p.manualSignedOn)}) — تأیید: ${p.label}` : p.label)}</td><td>${esc(p.by ?? '')}</td><td>${esc(jd(p.at))}</td></tr>`)).join('')
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>RFSU ${esc(sys.code)}</title>
  <style>body{font-family:Vazirmatn,Tahoma,sans-serif;margin:32px;color:#0f172a}h1{font-size:20px;margin:0}h2{font-size:14px;color:#475569;margin:4px 0 20px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}td,th{border:1px solid #cbd5e1;padding:8px;text-align:right}th{background:#f1f5f9}
  .box{border:2px solid #0f172a;padding:20px;border-radius:8px}.ok{color:#047857;font-weight:800}</style></head><body><div class="box">
  <h1>گواهی آمادگی برای راه‌اندازی (RFSU)</h1><h2>${esc(projectName)}</h2>
  <table><tr><th>سیستم</th><td>${esc(sys.code)} — ${esc(sys.name)}</td></tr><tr><th>نوع</th><td>${esc(KIND_FA[sys.kind])}</td></tr>
  <tr><th>چک‌لیست PSSR</th><td>${fa(status.checks.ok + status.checks.na)} از ${fa(status.checks.total)} بند تأیید / غیرقابل‌اعمال</td></tr>
  <tr><th>پانچ‌های باز</th><td>A: ${fa(status.punches.A.open)} · B: ${fa(status.punches.B.open)} · C: ${fa(status.punches.C.open)}</td></tr>
  <tr><th>تاریخ صدور</th><td class="ok">${esc(jd(status.rfsuAt))}</td></tr></table>
  <p style="font-size:13px;line-height:2;margin-top:16px">بدین‌وسیله گواهی می‌شود سیستم فوق بازبینی ایمنی پیش از راه‌اندازی (PSSR) را با موفقیت پشت سر گذاشته، همهٔ یافته‌های دستهٔ A بسته و تأیید شده و برای ورود به مرحلهٔ تزریق گاز آماده است. یافته‌های دستهٔ B و C طبق برنامه پیگیری می‌شوند.</p>
  <table><tr><th>مرحله</th><th>طرف</th><th>سمت / امضاکننده</th><th>کاربر سامانه</th><th>تاریخ</th></tr>${rows}</table>
  </div><script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

// ── gas-in: permit (day-of checklist + approval) and the operation log ───────
function GasIn({ sys, status, chain }: { sys: PssrSystem; status: SystemStatus; chain: SignerRow[] }) {
  const st = usePssrStore()
  const profile = useAuthStore((s) => s.profile)
  const email = profile?.email ?? ''
  const permit = st.permits.find((p) => p.systemId === sys.id) ?? null
  const logs = permit ? st.logs.filter((l) => l.permitId === permit.id) : []
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === sys.projectId))
  const approvers = permitApprovers(chain)
  const mayApprove = !!profile?.isAdmin || approvers.some((a) => a.signerEmail && a.signerEmail.toLowerCase() === email.toLowerCase())
  const [head, setHead] = useState({ ptw: permit?.ptwNo ?? '', planned: permit?.plannedAt?.slice(0, 16) ?? '' })
  const [final, setFinal] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { setHead({ ptw: permit?.ptwNo ?? '', planned: permit?.plannedAt?.slice(0, 16) ?? '' }) }, [permit?.ptwNo, permit?.plannedAt])
  if (!AFTER_RFSU.includes(status.stage)) return <p className="ps-hint"><ShieldCheck size={14} /> مجوز تزریق گاز فقط پس از صدور گواهی RFSU قابل تنظیم است.</p>
  const editable = !permit || permit.status === 'draft' || permit.status === 'aborted'
  const toggle = (key: string, ok: boolean, value?: string) => {
    const checks = { ...(permit?.checks ?? {}), [key]: { ok, value: value ?? permit?.checks[key]?.value ?? '', by: email, at: new Date().toISOString() } }
    void st.savePermit(sys.id, { checks }, email)
  }
  return (
    <div className="ps-stack">
      <div className="ps-gas-head" style={{ '--c': STAGE_COLOR[status.stage] } as CSSProperties}>
        <Gauge size={18} aria-hidden />
        <b>{permit ? GASIN_STATUS_FA[permit.status] : 'مجوز هنوز تنظیم نشده'}</b>
        <small>چک‌لیست روز تزریق: {fa(status.gasin.checksDone)} از {fa(status.gasin.checksTotal)}{permit?.approvedBy ? ` · صادرکننده: ${permit.approvedBy} (${jd(permit.approvedAt)})` : ''}{permit?.startedAt ? ` · شروع ${jd(permit.startedAt)}` : ''}{permit?.completedAt ? ` · پایان ${jd(permit.completedAt)}` : ''}</small>
      </div>
      <div className="ps-inline-form">
        <Field label="شمارهٔ مجوز کار (PTW)"><input value={head.ptw} disabled={!editable} onChange={(e) => setHead({ ...head, ptw: e.target.value })} dir="ltr" /></Field>
        <Field label="زمان برنامه‌ریزی‌شدهٔ تزریق"><input type="datetime-local" value={head.planned} disabled={!editable} onChange={(e) => setHead({ ...head, planned: e.target.value })} /></Field>
        {editable && <button type="button" className="ps-btn" onClick={() => st.savePermit(sys.id, { ptwNo: head.ptw, plannedAt: head.planned ? new Date(head.planned).toISOString() : null }, email)}>ذخیرهٔ مجوز</button>}
      </div>
      <ul className="ps-gas-checks">
        {GASIN_CHECKS.map((g) => {
          const c = permit?.checks[g.key]
          return (
            <li key={g.key} className={c?.ok ? 'is-ok' : ''}>
              <label><input type="checkbox" checked={!!c?.ok} disabled={!editable} onChange={(e) => toggle(g.key, e.target.checked)} /> {g.label}</label>
              {g.value && <input className="ps-gas-val" defaultValue={c?.value ?? ''} disabled={!editable} placeholder={g.value} onBlur={(e) => { if (e.target.value !== (c?.value ?? '')) toggle(g.key, !!c?.ok, e.target.value) }} />}
              {c?.ok && c.by && <small className="ps-meta">{c.by} · {jd(c.at)}</small>}
            </li>
          )
        })}
      </ul>
      {editable && (
        <div className="ps-actions">
          <button type="button" className="ps-btn is-ok" disabled={!status.gasin.canApprove || !mayApprove || !permit?.ptwNo} onClick={() => st.setPermitStatus(sys.id, 'approved', email)}><Stamp size={14} /> صدور مجوز تزریق گاز</button>
          <small className="ps-meta">{!status.gasin.canApprove ? 'همهٔ بندهای چک‌لیست باید تأیید شود.' : !permit?.ptwNo ? 'شمارهٔ PTW را ثبت و ذخیره کنید.' : !mayApprove ? `صدور مجوز با ${approvers.map((a) => a.personLabel).join(' / ')} یا مدیر سامانه است.` : 'آمادهٔ صدور.'}</small>
        </div>
      )}
      {permit?.status === 'approved' && (
        <div className="ps-actions">
          <button type="button" className="ps-btn is-primary" onClick={() => st.setPermitStatus(sys.id, 'in_progress', email)}><Flame size={14} /> شروع تزریق گاز</button>
          <button type="button" className="ps-btn is-ghost" onClick={() => st.setPermitStatus(sys.id, 'draft', email)}>بازگشت به پیش‌نویس</button>
        </div>
      )}
      {permit && permit.status !== 'draft' && (
        <section className="ps-card">
          <header className="ps-card-head"><b><Activity size={15} /> ثبت عملیات تزریق گاز</b><button type="button" className="ps-btn is-ghost" onClick={() => printGasin(sys, permit, logs, project?.officialName ?? '')}><Printer size={14} /> چاپ مجوز و گزارش عملیات</button></header>
          {logs.length ? (
            <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>زمان</th><th>رویداد</th><th>فشار (bar)</th><th>محل</th><th>شرح</th><th>ثبت‌کننده</th></tr></thead>
              <tbody>{logs.map((l) => <tr key={l.id} className={l.kind === 'incident' ? 'is-late' : ''}><td className="ps-nowrap">{jd(l.at)} {new Date(l.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</td><td>{GASIN_LOG_FA[l.kind]}</td><td>{l.pressure != null ? fa(l.pressure) : '—'}</td><td>{l.location || '—'}</td><td>{l.note}</td><td>{l.by}</td></tr>)}</tbody></table></div>
          ) : <p className="ps-hint">هنوز رویدادی ثبت نشده است.</p>}
          {permit.status === 'in_progress' && <>
            <LogForm permitId={permit.id} />
            <div className="ps-inline-form">
              <Field label="فشار نهایی خط (bar)"><input type="number" value={final} onChange={(e) => setFinal(e.target.value)} /></Field>
              <button type="button" className="ps-btn is-ok" onClick={() => st.setPermitStatus(sys.id, 'completed', email, { finalPressure: final ? Number(final) : null })}><CheckCircle2 size={14} /> پایان — سیستم تحت گاز</button>
              <Field label="دلیل توقف"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <button type="button" className="ps-btn is-bad" disabled={!reason.trim()} onClick={async () => { if (await st.setPermitStatus(sys.id, 'aborted', email, { note: reason.trim() })) setReason('') }}>توقف اضطراری</button>
            </div>
          </>}
          {permit.status === 'completed' && <p className="ps-rfsu-ok"><CheckCircle2 size={16} /> سیستم در {jd(permit.completedAt)} تحت گاز رفت{permit.finalPressure != null ? ` (فشار نهایی ${fa(permit.finalPressure)} bar)` : ''}.</p>}
          {permit.status === 'aborted' && <p className="ps-hint is-warn"><AlertTriangle size={14} /> عملیات متوقف شد. پس از رفع علت، چک‌لیست را دوباره تأیید و مجوز را از نو صادر کنید.</p>}
        </section>
      )}
    </div>
  )
}

const QUICK_EVENTS: GasinLogKind[] = ['valve_open', 'valve_close', 'pressure', 'purge', 'leak_check', 'hold', 'incident']

function LogForm({ permitId }: { permitId: string }) {
  const st = usePssrStore()
  const tablet = useContext(TabletCtx)
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [f, setF] = useState({ kind: 'pressure' as GasinLogKind, pressure: '', location: '', note: '' })
  const [busy, setBusy] = useState(false)
  const add = async (kind: GasinLogKind) => {
    setBusy(true)
    if (await st.addLog(permitId, { kind, pressure: f.pressure ? Number(f.pressure) : null, location: f.location, note: f.note }, email)) setF({ ...f, kind, pressure: '', note: '' })
    setBusy(false)
  }
  if (tablet) {
    // field mode: type the reading / place once, then one tap on the event records it
    return (
      <div className="ps-quick">
        <div className="ps-inline-form">
          <Field label="فشار (bar)"><input type="number" inputMode="decimal" value={f.pressure} onChange={(e) => setF({ ...f, pressure: e.target.value })} /></Field>
          <Field label="محل (شیر / کیلومتر)"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="شرح (اختیاری)" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <div className="ps-quick-grid">
          {QUICK_EVENTS.map((k) => <button key={k} type="button" disabled={busy} className={`ps-btn ${k === 'incident' ? 'is-bad' : 'is-primary'}`} onClick={() => add(k)}>{GASIN_LOG_FA[k]}</button>)}
        </div>
      </div>
    )
  }
  return (
    <div className="ps-inline-form">
      <Field label="رویداد"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as GasinLogKind })}>{(Object.keys(GASIN_LOG_FA) as GasinLogKind[]).map((k) => <option key={k} value={k}>{GASIN_LOG_FA[k]}</option>)}</select></Field>
      <Field label="فشار (bar)"><input type="number" value={f.pressure} onChange={(e) => setF({ ...f, pressure: e.target.value })} /></Field>
      <Field label="محل (شیر / کیلومتر)"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      <Field label="شرح" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button type="button" className="ps-btn is-primary" disabled={busy || (!f.note.trim() && !f.pressure)} onClick={() => add(f.kind)}><Plus size={14} /> ثبت رویداد</button>
    </div>
  )
}

function printGasin(sys: PssrSystem, permit: GasinPermit, logs: GasinLog[], projectName: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const tm = (d: string | null) => (d ? `${jd(d)} ${new Date(d).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : '—')
  const checks = GASIN_CHECKS.map((g) => { const c = permit.checks[g.key]; return `<tr><td>${c?.ok ? '✔' : '✘'}</td><td>${esc(g.label)}${c?.value ? ` — ${esc(c.value)}` : ''}</td><td>${esc(c?.by ?? '')}</td></tr>` }).join('')
  const rows = logs.map((l) => `<tr><td>${esc(tm(l.at))}</td><td>${esc(GASIN_LOG_FA[l.kind])}</td><td>${l.pressure != null ? fa(l.pressure) : '—'}</td><td>${esc(l.location || '—')}</td><td>${esc(l.note)}</td><td>${esc(l.by)}</td></tr>`).join('')
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Gas-in ${esc(sys.code)}</title>
  <style>body{font-family:Vazirmatn,Tahoma,sans-serif;margin:28px;color:#0f172a}h1{font-size:19px;margin:0}h2{font-size:13px;color:#475569;margin:4px 0 16px}h3{font-size:14px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #cbd5e1;padding:6px;text-align:right}th{background:#f1f5f9}</style></head><body>
  <h1>مجوز و گزارش عملیات تزریق گاز</h1><h2>${esc(projectName)} — ${esc(sys.code)} ${esc(sys.name)}</h2>
  <table><tr><th>شمارهٔ PTW</th><td>${esc(permit.ptwNo || '—')}</td><th>وضعیت</th><td>${esc(GASIN_STATUS_FA[permit.status])}</td></tr>
  <tr><th>صادرکننده</th><td>${esc(permit.approvedBy ?? '—')} · ${esc(tm(permit.approvedAt))}</td><th>فشار نهایی</th><td>${permit.finalPressure != null ? fa(permit.finalPressure) + ' bar' : '—'}</td></tr>
  <tr><th>شروع</th><td>${esc(tm(permit.startedAt))}</td><th>پایان</th><td>${esc(tm(permit.completedAt))}</td></tr></table>
  <h3>چک‌لیست روز تزریق</h3><table><tr><th></th><th>بند</th><th>تأییدکننده</th></tr>${checks}</table>
  <h3>رویدادها</h3><table><tr><th>زمان</th><th>رویداد</th><th>فشار (bar)</th><th>محل</th><th>شرح</th><th>ثبت‌کننده</th></tr>${rows}</table>
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

// ── advisories from other modules ────────────────────────────────────────────
/** a checklist item's related warning from the other modules: open changes for MOC, unapproved documents for As-built, open NCRs for NDT/welds */
function adviceFor(title: string, a: PssrAdvisories, sys?: { kmFrom: number | null; kmTo: number | null }): string | null {
  if (/هیدرو|hydro/i.test(title) && a.ht.length) {
    // the sections that overlap this system's stretch (a system without a chainage: the whole line)
    const lo = sys?.kmFrom, hi = sys?.kmTo != null && lo != null && sys.kmTo > lo ? sys.kmTo : lo
    const hit = lo == null ? a.ht : a.ht.filter((h) => h.kmTo > lo! && h.kmFrom < hi! + (hi === lo ? 0.001 : 0))
    if (hit.length) { const f = hit.filter((h) => h.failed).length; return `${fa(hit.length)} قطعهٔ هیدروتست هنوز پذیرفته نشده (${hit.slice(0, 4).map((h) => h.code).join('، ')}${hit.length > 4 ? '…' : ''})${f ? ` · ${fa(f)} مردود` : ''}` }
  }
  if (/MOC|تغییر/.test(title) && a.moc.length) return `${fa(a.moc.length)} درخواست تغییر (MOC) باز در ماژول مدیریت تغییرات`
  if (/As-built|P&ID/i.test(title)) { const ab = a.docs.filter((d) => d.asBuilt).length; if (ab || a.docs.length) return ab ? `${fa(ab)} مدرک As-built تأییدنشده` : `${fa(a.docs.length)} مدرک مهندسی هنوز تأیید نهایی نشده` }
  if (/NDT|جوش/.test(title) && a.ncr.length) return `${fa(a.ncr.length)} NCR باز در ماژول اجرا`
  return null
}

function AdvisoryPanel() {
  const a = usePssrStore((s) => s.advisories)
  if (!a) return null
  const items = [
    { key: 'ncr', label: 'NCR باز (ماژول اجرا)', list: a.ncr, color: '#ef4444' },
    { key: 'docs', label: 'مدارک مهندسی تأییدنشده', list: a.docs, color: '#f59e0b' },
    { key: 'moc', label: 'تغییرات (MOC) باز', list: a.moc, color: '#a855f7' },
    { key: 'ht', label: 'قطعهٔ هیدروتست پذیرفته‌نشده', list: a.ht.map((h) => ({ code: h.code, text: `کیلومتر ${fa(h.kmFrom)} تا ${fa(h.kmTo)}${h.failed ? ' · مردود' : ''}` })), color: '#0ea5e9' },
  ]
  return (
    <section className="ps-card ps-adv">
      <header className="ps-card-head"><b><AlertTriangle size={15} /> هشدارهای خودکار از ماژول‌های دیگر</b><small className="ps-meta">پیش از تأیید بندهای مرتبط چک‌لیست بررسی شود</small></header>
      <div className="ps-adv-grid">
        {items.map((i) => (
          <details key={i.key} className="ps-adv-item" style={{ '--c': i.list.length ? i.color : '#10b981' } as CSSProperties}>
            <summary><b>{fa(i.list.length)}</b><span>{i.label}</span></summary>
            {i.list.length ? <ul>{i.list.slice(0, 8).map((x, k) => <li key={k}><span dir="ltr" className="ps-code">{x.code || '—'}</span> {x.text}</li>)}{i.list.length > 8 && <li>و {fa(i.list.length - 8)} مورد دیگر…</li>}</ul> : <p className="ps-meta">موردی نیست.</p>}
          </details>
        ))}
      </div>
    </section>
  )
}

// ── project punch list ───────────────────────────────────────────────────────
function PunchList({ onOpen }: { onOpen: (id: string) => void }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [cat, setCat] = useState<'all' | PunchCategory>('all')
  const [state, setState] = useState<'open' | 'all'>('open')
  const list = st.punches.filter((p) => (cat === 'all' || p.category === cat) && (state === 'all' || p.status !== 'verified'))
  return (
    <>
      <div className="ps-row-head">
        <div><b>پانچ‌لیست پروژه</b><small>همهٔ یافته‌های PSSR همهٔ سیستم‌ها؛ برای دیدن پروندهٔ هر سیستم روی کد آن در فهرست سیستم‌ها بزنید.</small></div>
        <div className="ps-filters">
          <button type="button" className="ps-btn is-ghost" disabled={!list.length} onClick={() => exportPunches(list, (id) => st.systems.find((s) => s.id === id)?.code ?? '')}><Download size={14} /> خروجی اکسل (CSV)</button>
          {(['all', 'A', 'B', 'C'] as const).map((k) => <button key={k} type="button" className={`ps-pill ${cat === k ? 'is-on' : ''}`} onClick={() => setCat(k)}>{k === 'all' ? 'همه' : `دستهٔ ${k}`}</button>)}
          <button type="button" className={`ps-pill ${state === 'open' ? 'is-on' : ''}`} onClick={() => setState(state === 'open' ? 'all' : 'open')}>{state === 'open' ? 'فقط باز' : 'همه وضعیت‌ها'}</button>
        </div>
      </div>
      {list.length ? <PunchTable list={list} me={email} systemOf={(id) => st.systems.find((s) => s.id === id)} /> : <Empty text="یافته‌ای با این فیلتر نیست." />}
      {st.systems.length > 0 && <p className="ps-hint">برای ثبت یافتهٔ جدید، <button type="button" className="ps-link" onClick={() => onOpen(st.systems[0].id)}>پروندهٔ سیستم</button> را باز کنید.</p>}
    </>
  )
}

/** the punch list as CSV with a BOM so Excel opens the Persian text correctly */
function exportPunches(list: PssrPunch[], codeOf: (systemId: string) => string) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = ['سیستم', 'دسته', 'شرح', 'رشته', 'مسئول', 'مهلت', 'وضعیت', 'ثبت', 'بسته‌شده توسط', 'شرح بستن', 'تأیید توسط']
  const rows = list.map((p) => [codeOf(p.systemId), p.category, p.title, p.discipline, p.owner, jd(p.dueDate), PUNCH_STATUS_FA[p.status], jd(p.raisedAt), p.closedBy ?? '', p.closeNote, p.verifiedBy ?? ''])
  const csv = '\uFEFF' + [head, ...rows].map((r) => r.map((x) => cell(String(x ?? ''))).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `pssr-punch-list-${today()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ── settings: sign chain (steps × persons) + template ────────────────────────
interface StepDraft { label: string; rule: 'any' | 'all'; manual: boolean; persons: { label: string; email: string }[] }
const toSteps = (rows: SignerRow[]): StepDraft[] => [...new Set(rows.map((r) => r.seq))].sort((a, b) => a - b).map((seq) => {
  const l = rows.filter((r) => r.seq === seq)
  return { label: l[0].roleLabel, rule: l[0].rule, manual: l.some((r) => r.manual), persons: l.map((r) => ({ label: r.personLabel, email: r.signerEmail })) }
})

function Settings({ chain }: { chain: SignerRow[] }) {
  const st = usePssrStore()
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [steps, setSteps] = useState<StepDraft[]>(() => toSteps(chain))
  const [saved, setSaved] = useState(false)
  const [t, setT] = useState({ kind: 'all' as PssrKind | 'all', category: '', title: '', mandatory: true })
  const upd = (i: number, p: Partial<StepDraft>) => { setSaved(false); setSteps(steps.map((x, j) => (j === i ? { ...x, ...p } : x))) }
  const valid = steps.length > 0 && steps.every((x) => x.label.trim() && x.persons.length && x.persons.every((p) => p.label.trim()))
  const save = async () => setSaved(await st.saveSigners(steps.flatMap((x, i) => x.persons.map((p) => ({ seq: i + 1, roleLabel: x.label, personLabel: p.label, signerEmail: p.email, rule: x.rule, manual: x.manual })))))
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><FileSignature size={15} /> زنجیرهٔ امضای RFSU این پروژه</b></header>
        <p className="ps-hint">مراحل به همین ترتیب امضا می‌شوند. هر مرحله یک یا چند نفر دارد: «یکی کافی» (مثلاً مدیر پروژه یا سرپرست کارگاه) یا «همه لازم» (مثلاً مدیر پروژه و مسئول HSE کارفرما). مرحلهٔ «دستی» فرم کاغذی است که اسکن آن را فرد تعیین‌شده پیوست و تأیید می‌کند. هر نفر را فقط کاربری با همان ایمیل (یا مدیر سامانه) امضا می‌کند.</p>
        <ol className="ps-steps-edit">
          {steps.map((x, i) => (
            <li key={i}>
              <div className="ps-step-row">
                <span className="ps-num">{fa(i + 1)}</span>
                <input value={x.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="طرف (مثلاً پیمانکار)" />
                <select value={x.rule} onChange={(e) => upd(i, { rule: e.target.value as 'any' | 'all' })} aria-label="قاعده"><option value="any">یکی کافی است</option><option value="all">همه لازم است</option></select>
                <label className="ps-checkbox"><input type="checkbox" checked={x.manual} onChange={(e) => upd(i, { manual: e.target.checked })} /> امضای دستی + تأیید سیستمی</label>
                <button type="button" className="ps-x" onClick={() => { setSaved(false); setSteps(steps.filter((_, j) => j !== i)) }} aria-label="حذف مرحله"><X size={14} /></button>
              </div>
              {x.persons.map((p, k) => (
                <div key={k} className="ps-signer">
                  <span className="ps-meta">{x.manual ? 'تأییدکننده' : 'فرد'}</span>
                  <input value={p.label} onChange={(e) => upd(i, { persons: x.persons.map((q, m) => (m === k ? { ...q, label: e.target.value } : q)) })} placeholder="سمت (مثلاً سرپرست کارگاه)" />
                  <input value={p.email} onChange={(e) => upd(i, { persons: x.persons.map((q, m) => (m === k ? { ...q, email: e.target.value } : q)) })} placeholder="ایمیل" dir="ltr" />
                  <button type="button" className="ps-x" onClick={() => upd(i, { persons: x.persons.filter((_, m) => m !== k) })} aria-label="حذف فرد"><X size={14} /></button>
                </div>
              ))}
              <button type="button" className="ps-btn is-ghost" onClick={() => upd(i, { persons: [...x.persons, { label: '', email: '' }] })}><Plus size={13} /> افزودن فرد</button>
            </li>
          ))}
        </ol>
        <div className="ps-actions">
          <button type="button" className="ps-btn" onClick={() => { setSaved(false); setSteps([...steps, { label: '', rule: 'any', manual: false, persons: [{ label: '', email: '' }] }]) }}><Plus size={14} /> افزودن مرحله</button>
          <button type="button" className="ps-btn is-primary" disabled={!isAdmin || !valid} onClick={save}>ذخیرهٔ زنجیره</button>
          {!isAdmin && <small className="ps-meta">فقط مدیر سامانه زنجیره را تغییر می‌دهد.</small>}
          {saved && <small className="ps-meta">ذخیره شد.</small>}
        </div>
      </section>
      <section className="ps-card">
        <header className="ps-card-head"><b><ListChecks size={15} /> قالب چک‌لیست PSSR</b></header>
        <p className="ps-hint">این قالب موقت است تا فرم‌های واقعی شما جایگزین شود. هر سیستم تازه یک نسخه از بندهای نوع خودش (و «همه») می‌گیرد؛ تغییر قالب روی سیستم‌های قبلی اثر ندارد.</p>
        <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>ردیف</th><th>نوع</th><th>بخش / دسته</th><th>بند</th><th>اولویت</th></tr></thead>
          <tbody>{st.templates.filter((x) => x.active).sort((a, b) => (a.refNo ?? 999) - (b.refNo ?? 999) || a.seq - b.seq).map((x) => <tr key={x.id}><td>{x.refNo != null ? fa(x.refNo) : '—'}</td><td>{x.kinds?.length ? x.kinds.map((k) => (k === 'all' ? 'همه' : KIND_FA[k as PssrKind] ?? k)).join('، ') : x.kind === 'all' ? 'همه' : KIND_FA[x.kind]}</td><td>{x.area ? `${x.area} · ` : ''}{x.category}</td><td>{x.title}</td><td>{x.priority || (x.mandatory ? 'الزامی' : '—')}</td></tr>)}</tbody></table></div>
        {isAdmin && (
          <div className="ps-inline-form">
            <Field label="نوع"><select value={t.kind} onChange={(e) => setT({ ...t, kind: e.target.value as PssrKind | 'all' })}><option value="all">همه</option>{Object.entries(KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="دسته"><input value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} /></Field>
            <Field label="عنوان بند" wide><input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
            <label className="ps-checkbox"><input type="checkbox" checked={t.mandatory} onChange={(e) => setT({ ...t, mandatory: e.target.checked })} /> الزامی</label>
            <button type="button" className="ps-btn is-primary" disabled={!t.category.trim() || !t.title.trim()} onClick={async () => { if (await st.addTemplate(t)) setT({ ...t, title: '' }) }}><Plus size={14} /> افزودن بند</button>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`ps-field ${wide ? 'is-wide' : ''}`}><span>{label}</span>{children}</label>
}
function Empty({ text }: { text: string }) {
  return <div className="ps-empty"><Flame size={24} aria-hidden /><p>{text}</p></div>
}
