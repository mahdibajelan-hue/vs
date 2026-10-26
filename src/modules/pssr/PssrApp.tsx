import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, FileSignature, Flame, ListChecks, Loader2, Plus, Printer, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { usePssrStore } from './store/usePssrStore'
import { canSign, projectReadiness, STAGE_FA, STAGE_ORDER, systemStatus, type PssrStage, type SystemStatus } from './lib/pssrCore'
import { CHECK_FA, DEFAULT_SIGN_CHAIN, KIND_FA, PUNCH_CAT_FA, PUNCH_STATUS_FA, type CheckStatus, type PssrKind, type PssrPunch, type PssrSystem, type PunchCategory } from './types'
import { PssrGuide } from './PssrGuide'
import './pssr.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const today = () => new Date().toISOString().slice(0, 10)
const STAGE_COLOR: Record<PssrStage, string> = { mc: '#64748b', pssr: '#f59e0b', ready: '#3b82f6', signing: '#a855f7', rfsu: '#10b981' }
type Tab = 'dash' | 'systems' | 'punches' | 'settings'

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
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  // the sign chain in force: the project's own, or the default roles (no emails → only an admin can sign)
  const chain = useMemo(() => (st.signers.length ? st.signers.map((s) => ({ seq: s.seq, roleLabel: s.roleLabel, signerEmail: s.signerEmail })) : DEFAULT_SIGN_CHAIN.map((r, i) => ({ seq: i + 1, roleLabel: r, signerEmail: '' }))), [st.signers])
  const statusOf = useMemo(() => {
    const m = new Map<string, SystemStatus>()
    for (const sys of st.systems) m.set(sys.id, systemStatus({ checks: st.checks.filter((c) => c.systemId === sys.id), meetings: st.meetings.filter((x) => x.systemId === sys.id), punches: st.punches.filter((p) => p.systemId === sys.id), signers: chain, signoffs: st.signoffs.filter((x) => x.systemId === sys.id) }))
    return m
  }, [st.systems, st.checks, st.meetings, st.punches, st.signoffs, chain])
  const summary = projectReadiness([...statusOf.values()])
  const missingTables = !!st.error && /pssr_|relation|schema cache/i.test(st.error)

  return (
    <div className="ps" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico"><ShieldCheck size={18} /></span>
          <span><b>PSSR — ایمنی پیش از راه‌اندازی</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end">
          <button type="button" className="ps-btn is-primary" onClick={() => setGuide(true)}><BookOpen size={15} /> راهنما</button>
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      <nav className="ps-tabs" aria-label="بخش‌ها">
        {([['dash', 'داشبورد آمادگی', ClipboardCheck], ['systems', 'سیستم‌ها', ListChecks], ['punches', 'پانچ‌لیست', AlertTriangle], ['settings', 'تنظیمات', Settings2]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={`ps-tab ${tab === k && !openSys ? 'is-on' : ''}`} onClick={() => { setTab(k); setOpenSys(null) }}><I size={15} aria-hidden />{l}</button>
        ))}
      </nav>
      <main className="ps-main">
        {!projectId ? <Empty text="ابتدا از رادار پروژه یک پروژه را انتخاب کنید." />
          : missingTables ? <Empty text="جدول‌های ماژول PSSR هنوز در پایگاه داده ساخته نشده‌اند. فایل supabase/pssr/001_pssr.sql را یک بار در SQL Editor اجرا کنید." />
          : st.loading ? <p className="ps-loading"><Loader2 size={16} className="animate-spin" /> در حال بارگذاری…</p>
          : openSys ? <SystemPage id={openSys} status={statusOf.get(openSys)} onBack={() => setOpenSys(null)} />
          : tab === 'dash' ? <Dashboard summary={summary} statusOf={statusOf} onOpen={setOpenSys} onNew={() => setTab('systems')} />
          : tab === 'systems' ? <Systems statusOf={statusOf} onOpen={setOpenSys} />
          : tab === 'punches' ? <PunchList onOpen={setOpenSys} />
          : <Settings chain={chain} />}
        {st.error && !missingTables && <p className="ps-err">{st.error}</p>}
      </main>
      {guide && <PssrGuide onClose={() => setGuide(false)} />}
    </div>
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
        <Kpi label="RFSU صادرشده" value={`${fa(summary.byStage.rfsu)} از ${fa(summary.systems)}`} sub={`${fa(summary.rfsuPct)}٪ سیستم‌ها`} color="#10b981" />
        <Kpi label="پانچ A باز" value={fa(summary.openA)} sub="مانع صدور RFSU" color={summary.openA ? '#ef4444' : '#10b981'} />
        <Kpi label="پانچ B / C باز" value={`${fa(summary.openB)} / ${fa(summary.openC)}`} sub={summary.overdue ? `${fa(summary.overdue)} پانچ سررسیدگذشته` : 'بدون سررسید گذشته'} color={summary.overdue ? '#f59e0b' : '#64748b'} />
      </section>
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
function SystemPage({ id, status, onBack }: { id: string; status?: SystemStatus; onBack: () => void }) {
  const st = usePssrStore()
  const sys = st.systems.find((s) => s.id === id)
  if (!sys || !status) return <Empty text="سیستم یافت نشد." />
  const stageIdx = STAGE_ORDER.indexOf(status.stage)
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
          <div><h2>{sys.name}</h2><p>{KIND_FA[sys.kind]}{sys.kmFrom != null ? ` · کیلومتر ${fa(sys.kmFrom)} تا ${fa(sys.kmTo ?? sys.kmFrom)}` : ''} · تزریق گاز هدف: {jd(sys.targetGasIn)}</p></div>
        </div>
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
      <Section n={1} id="ps-checks" title="چک‌لیست PSSR" mode="input" hint="برای هر بند وضعیت را انتخاب کنید و مدرک (شمارهٔ صورت‌جلسه، لینک یا توضیح) را بنویسید. بندهای الزامی باید «تأیید» یا «غیرقابل‌اعمال» باشند.">
        <Checklist systemId={id} />
      </Section>
      <Section n={2} id="ps-meet" title="جلسهٔ PSSR" mode="input" hint="تاریخ، حاضران و خلاصهٔ جلسهٔ بازدید PSSR را ثبت کنید. یافته‌های جلسه را در بخش بعد به‌صورت پانچ وارد کنید.">
        <Meetings systemId={id} />
      </Section>
      <Section n={3} id="ps-punch" title="یافته‌ها و پانچ‌لیست" mode="input" hint="هر نقص را با دسته ثبت کنید: A باید پیش از RFSU بسته و توسط فرد دیگری تأیید شود؛ B پیش از تحویل موقت؛ C بهبود.">
        <Punches systemId={id} />
      </Section>
      <Section n={4} id="ps-rfsu" title="گواهی RFSU — آمادگی برای راه‌اندازی" mode="input" hint="وقتی همهٔ موانع رفع شد، امضاکنندگان به ترتیب امضا می‌کنند. با آخرین امضا گواهی RFSU صادر و مجوز ورود به مرحلهٔ تزریق گاز داده می‌شود.">
        <Rfsu sys={sys} status={status} />
      </Section>
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
  if (!list.length) return <p className="ps-hint">برای این سیستم بندی ساخته نشده؛ قالب چک‌لیست را در «تنظیمات» ببینید.</p>
  return (
    <div className="ps-checks">
      {cats.map((cat) => (
        <div key={cat} className="ps-cat">
          <h4>{cat}</h4>
          {list.filter((c) => c.category === cat).map((c) => <CheckRow key={c.id} id={c.id} title={c.title} mandatory={c.mandatory} status={c.status} evidence={c.evidence} meta={c.checkedBy ? `${c.checkedBy} · ${jd(c.checkedAt)}` : ''} onSave={(s, e) => st.setCheck(c.id, s, e, email)} />)}
        </div>
      ))}
    </div>
  )
}

function CheckRow({ title, mandatory, status, evidence, meta, onSave }: { id: string; title: string; mandatory: boolean; status: CheckStatus; evidence: string; meta: string; onSave: (s: CheckStatus, e: string) => Promise<boolean> }) {
  const [s, setS] = useState(status), [e, setE] = useState(evidence), [busy, setBusy] = useState(false)
  useEffect(() => { setS(status); setE(evidence) }, [status, evidence])
  const dirty = s !== status || e !== evidence
  return (
    <div className={`ps-check is-${status}`}>
      <div className="ps-check-title"><span className={`ps-dot is-${status}`} />{title}{mandatory && <em>الزامی</em>}</div>
      <div className="ps-check-edit">
        <select value={s} onChange={(x) => setS(x.target.value as CheckStatus)} aria-label="وضعیت">{(Object.keys(CHECK_FA) as CheckStatus[]).map((k) => <option key={k} value={k}>{CHECK_FA[k]}</option>)}</select>
        <input value={e} onChange={(x) => setE(x.target.value)} placeholder="مدرک / توضیح (شمارهٔ صورت‌جلسه، لینک…)" />
        <button type="button" className="ps-btn" disabled={!dirty || busy} onClick={async () => { setBusy(true); await onSave(s, e); setBusy(false) }}>{busy ? <Loader2 size={13} className="animate-spin" /> : 'ذخیره'}</button>
      </div>
      {meta && <small className="ps-meta">آخرین ثبت: {meta}</small>}
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

function Rfsu({ sys, status }: { sys: PssrSystem; status: SystemStatus }) {
  const st = usePssrStore()
  const profile = useAuthStore((s) => s.profile)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === sys.projectId))
  const [comment, setComment] = useState('')
  const step = status.nextStep
  const mine = canSign(step, profile?.email, !!profile?.isAdmin)
  return (
    <div className="ps-stack">
      <ol className="ps-chain">
        {status.chain.map((c) => (
          <li key={c.seq} className={`is-${c.state}`}>
            <span className="ps-chain-n">{c.state === 'signed' ? '✓' : c.state === 'rejected' ? '✕' : fa(c.seq)}</span>
            <div><b>{c.role}</b><small>{c.email || 'امضاکننده تعیین نشده (فقط مدیر سامانه)'}</small>
              {c.by && <small>{c.state === 'signed' ? 'امضا شد' : 'رد شد'}: {c.by} · {jd(c.at)}{c.comment ? ` — ${c.comment}` : ''}</small>}</div>
          </li>
        ))}
      </ol>
      {status.stage === 'rfsu' ? (
        <div className="ps-rfsu-ok"><FileSignature size={18} /> <b>گواهی RFSU در {jd(status.rfsuAt)} صادر شد.</b> این سیستم آمادهٔ مرحلهٔ تزریق گاز است.
          <button type="button" className="ps-btn" onClick={() => printRfsu(sys, status, project?.officialName ?? '')}><Printer size={14} /> چاپ گواهی</button></div>
      ) : status.blockers.length ? (
        <p className="ps-hint is-warn"><AlertTriangle size={14} /> تا رفع {fa(status.blockers.length)} مانع بالای صفحه، امضای RFSU فعال نمی‌شود.</p>
      ) : step ? (
        <div className="ps-sign">
          <p>نوبت امضا: <b>{step.role}</b>{step.email ? ` (${step.email})` : ''}</p>
          {mine ? (
            <div className="ps-inline-form">
              <Field label="توضیح (اختیاری؛ برای رد لازم است)" wide><input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
              <button type="button" className="ps-btn is-ok" onClick={async () => { await st.sign(sys.id, step.seq, step.role, 'sign', comment, profile?.email ?? ''); setComment('') }}><FileSignature size={14} /> امضا و تأیید</button>
              <button type="button" className="ps-btn is-bad" disabled={!comment.trim()} onClick={async () => { await st.sign(sys.id, step.seq, step.role, 'reject', comment, profile?.email ?? ''); setComment('') }}>رد</button>
            </div>
          ) : <p className="ps-hint">فقط {step.email || 'مدیر سامانه'} می‌تواند این مرحله را امضا کند.</p>}
        </div>
      ) : null}
      {!st.signers.length && <p className="ps-hint">زنجیرهٔ امضا هنوز برای این پروژه تعیین نشده و نقش‌های پیش‌فرض نمایش داده می‌شود؛ در «تنظیمات» ایمیل امضاکنندگان را وارد کنید.</p>}
    </div>
  )
}

function printRfsu(sys: PssrSystem, status: SystemStatus, projectName: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
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
  <table><tr><th>ردیف</th><th>سمت</th><th>امضاکننده</th><th>تاریخ</th></tr>${status.chain.map((c) => `<tr><td>${fa(c.seq)}</td><td>${esc(c.role)}</td><td>${esc(c.by ?? '')}</td><td>${esc(jd(c.at))}</td></tr>`).join('')}</table>
  </div><script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
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
          {(['all', 'A', 'B', 'C'] as const).map((k) => <button key={k} type="button" className={`ps-pill ${cat === k ? 'is-on' : ''}`} onClick={() => setCat(k)}>{k === 'all' ? 'همه' : `دستهٔ ${k}`}</button>)}
          <button type="button" className={`ps-pill ${state === 'open' ? 'is-on' : ''}`} onClick={() => setState(state === 'open' ? 'all' : 'open')}>{state === 'open' ? 'فقط باز' : 'همه وضعیت‌ها'}</button>
        </div>
      </div>
      {list.length ? <PunchTable list={list} me={email} systemOf={(id) => st.systems.find((s) => s.id === id)} /> : <Empty text="یافته‌ای با این فیلتر نیست." />}
      {st.systems.length > 0 && <p className="ps-hint">برای ثبت یافتهٔ جدید، <button type="button" className="ps-link" onClick={() => onOpen(st.systems[0].id)}>پروندهٔ سیستم</button> را باز کنید.</p>}
    </>
  )
}

// ── settings: sign chain + template ──────────────────────────────────────────
function Settings({ chain }: { chain: { seq: number; roleLabel: string; signerEmail: string }[] }) {
  const st = usePssrStore()
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [rows, setRows] = useState(chain.map((c) => ({ roleLabel: c.roleLabel, signerEmail: c.signerEmail })))
  const [saved, setSaved] = useState(false)
  const [t, setT] = useState({ kind: 'all' as PssrKind | 'all', category: '', title: '', mandatory: true })
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b><FileSignature size={15} /> زنجیرهٔ امضای RFSU این پروژه</b></header>
        <p className="ps-hint">امضاها به همین ترتیب انجام می‌شوند. هر نقش را فقط کاربری با همین ایمیل (یا مدیر سامانه) می‌تواند امضا کند.</p>
        {rows.map((r, i) => (
          <div key={i} className="ps-signer">
            <span className="ps-num">{fa(i + 1)}</span>
            <input value={r.roleLabel} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, roleLabel: e.target.value } : x)))} placeholder="سمت" />
            <input value={r.signerEmail} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, signerEmail: e.target.value } : x)))} placeholder="ایمیل امضاکننده" dir="ltr" />
            <button type="button" className="ps-x" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="حذف"><X size={14} /></button>
          </div>
        ))}
        <div className="ps-actions">
          <button type="button" className="ps-btn" onClick={() => setRows([...rows, { roleLabel: '', signerEmail: '' }])}><Plus size={14} /> افزودن سمت</button>
          <button type="button" className="ps-btn is-primary" disabled={!isAdmin || rows.some((r) => !r.roleLabel.trim())} onClick={async () => { setSaved(await st.saveSigners(rows)) }}>ذخیرهٔ زنجیره</button>
          {!isAdmin && <small className="ps-meta">فقط مدیر سامانه زنجیره را تغییر می‌دهد.</small>}
          {saved && <small className="ps-meta">ذخیره شد.</small>}
        </div>
      </section>
      <section className="ps-card">
        <header className="ps-card-head"><b><ListChecks size={15} /> قالب چک‌لیست PSSR</b></header>
        <p className="ps-hint">این قالب موقت است تا فرم‌های واقعی شما جایگزین شود. هر سیستم تازه یک نسخه از بندهای نوع خودش (و «همه») می‌گیرد؛ تغییر قالب روی سیستم‌های قبلی اثر ندارد.</p>
        <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>نوع</th><th>دسته</th><th>بند</th><th>الزامی</th></tr></thead>
          <tbody>{st.templates.filter((x) => x.active).map((x) => <tr key={x.id}><td>{x.kind === 'all' ? 'همه' : KIND_FA[x.kind]}</td><td>{x.category}</td><td>{x.title}</td><td>{x.mandatory ? 'بله' : '—'}</td></tr>)}</tbody></table></div>
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
