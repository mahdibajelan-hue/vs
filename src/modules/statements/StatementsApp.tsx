import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BookOpen, FilePlus2, LayoutDashboard, ListChecks, Loader2, ReceiptText, Settings2 } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { usePstStore, type Contract, type Statement } from './store/usePstStore'
import { PART_META, PARTS, STATUS_FA, periodOf, type Part, type StStatus } from './lib/stmtCore'
import { NewStatement } from './NewStatement'
import { StatementPage } from './StatementPage'
import { SettingsPage } from './SettingsPage'
import { StatementsGuide } from './StatementsGuide'
import { fa, PartChip, pct, short, StatusChip } from './ui'
import '../pssr/pssr.css'
import './statements.css'

type Tab = 'dash' | 'list' | 'new' | 'settings'

/**
 * تولید صورت‌وضعیت — monthly E / P / C payment statements of the project's contracts, generated from the engineering,
 * material and execution modules, reviewed and approved here, then posted to the finance register.
 */
export function StatementsApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = usePstStore()
  const [tab, setTab] = useState<Tab>('dash')
  const [open, setOpen] = useState<string | null>(null)
  const [preset, setPreset] = useState<{ contractId?: string; part?: Part } | undefined>()
  const [cfgContract, setCfgContract] = useState('')
  const [guide, setGuide] = useState(false)
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => usePstStore.setState({ flash: null }), 3200); return () => clearTimeout(t) }, [st.flash])
  useEffect(() => { if (!cfgContract && st.contracts[0]) setCfgContract(st.contracts[0].id) }, [st.contracts, cfgContract])
  const go = (t: Tab) => { setTab(t); setOpen(null); if (t !== 'new') setPreset(undefined) }
  const startNew = (p?: { contractId?: string; part?: Part }) => { setPreset(p); setOpen(null); setTab('new') }

  return (
    <div className="ps pst" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico" style={{ background: 'linear-gradient(135deg,#0f766e,#10b981)' }}><ReceiptText size={18} /></span>
          <span><b>تولید صورت‌وضعیت — E · P · C</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end">
          <button type="button" className="ps-btn is-primary" onClick={() => setGuide(true)}><BookOpen size={15} /> راهنما</button>
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      <nav className="ps-tabs" aria-label="بخش‌ها">
        {([['dash', 'داشبورد', LayoutDashboard], ['list', 'صورت‌وضعیت‌ها', ListChecks], ['new', 'صورت‌وضعیت جدید', FilePlus2], ['settings', 'تنظیمات و توالی پرداخت', Settings2]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={`ps-tab ${tab === k && !open ? 'is-on' : ''}`} onClick={() => go(k)}><I size={15} aria-hidden />{l}</button>
        ))}
      </nav>
      <main className="ps-main">
        {!projectId ? <div className="pst-empty"><b>پروژه‌ای انتخاب نشده است.</b>ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</div>
          : st.error ? <div className="pst-empty"><b>خطا</b>{st.error}</div>
          : st.loading && !st.contracts.length ? <div className="pst-empty"><Loader2 className="animate-spin" /> در حال بارگذاری…</div>
          : !st.contracts.length ? <div className="pst-empty"><b>این پروژه قراردادی ندارد.</b>قراردادها را در ماژول «قراردادها و مالی» تعریف کنید؛ صورت‌وضعیت‌ها برای هر قرارداد ساخته می‌شوند.</div>
          : open ? <StatementPage id={open} onBack={() => setOpen(null)} />
          : tab === 'dash' ? <Dashboard onOpen={setOpen} onNew={startNew} />
          : tab === 'list' ? <List onOpen={setOpen} />
          : tab === 'new' ? <NewStatement key={JSON.stringify(preset ?? {})} initial={preset} onDone={(id) => { if (id) setOpen(id); setTab('list') }} />
          : <SettingsPage contractId={cfgContract} onContract={setCfgContract} />}
      </main>
      {st.flash && <div className="pst-flash" role="status">{st.flash}</div>}
      {guide && <StatementsGuide onClose={() => setGuide(false)} />}
    </div>
  )
}

function Dashboard({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: (p?: { contractId?: string; part?: Part }) => void }) {
  const st = usePstStore()
  const waiting = st.statements.filter((s) => s.status === 'submitted')
  const drafts = st.statements.filter((s) => s.status === 'draft' || s.status === 'rejected')
  const ready = st.statements.filter((s) => s.status === 'approved')
  const posted = st.statements.filter((s) => s.status === 'posted')
  const kpi = (label: string, value: string, sub: string, c: string) => <div className="ps-kpi" style={{ '--c': c } as CSSProperties}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
  return (
    <div className="ps-stack">
      <div className="ps-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))' }}>
        {kpi('پیش‌نویس / برگشتی', fa(drafts.length), 'منتظر تکمیل و ارسال', '#64748b')}
        {kpi('در انتظار بررسی', fa(waiting.length), waiting.length ? `خالص ${short(waiting.reduce((a, s) => a + s.payable, 0))} ریال` : 'کارتابل خالی است', '#3b82f6')}
        {kpi('تأییدشده، ثبت‌نشده در مالی', fa(ready.length), ready.length ? `خالص ${short(ready.reduce((a, s) => a + s.payable, 0))} ریال` : '—', '#10b981')}
        {kpi('ثبت‌شده در مالی', fa(posted.length), `ناخالص ${short(posted.reduce((a, s) => a + s.thisAmount, 0))} ریال`, '#8b5cf6')}
      </div>
      {!st.statements.length && (
        <div className="pst-empty"><b>هنوز صورت‌وضعیتی ساخته نشده است.</b>یک قرارداد، بخش و ماه را انتخاب کنید؛ صورت‌وضعیت از داده‌های ماژول‌های مهندسی، کالا و اجرا ساخته می‌شود.<button type="button" className="ps-btn is-primary" onClick={() => onNew()}><FilePlus2 size={14} /> اولین صورت‌وضعیت</button></div>
      )}
      <div className="pst-contracts">{st.contracts.map((c) => <ContractCard key={c.id} c={c} onOpen={onOpen} onNew={onNew} />)}</div>
    </div>
  )
}

function ContractCard({ c, onOpen, onNew }: { c: Contract; onOpen: (id: string) => void; onNew: (p?: { contractId?: string; part?: Part }) => void }) {
  const st = usePstStore()
  const mine = st.statements.filter((s) => s.contractId === c.id)
  const last = (p: Part) => mine.filter((s) => s.part === p).sort((a, b) => b.no - a.no)[0]
  const cum = (p: Part) => last(p)?.cumAmount ?? 0
  const total = PARTS.reduce((a, p) => a + cum(p), 0)
  return (
    <article className="pst-con">
      <div className="pst-con-head">
        <span className="pst-con-no" dir="ltr">{c.no}</span>
        <div><h3>{c.title}</h3><small>سقف {short(c.cap)} ریال · صورت‌وضعیت‌شده تا کنون {short(total)} <span style={total > c.cap ? { color: '#ef4444', fontWeight: 800 } : undefined}>({fa(c.cap > 0 ? (total / c.cap) * 100 : 0, 1)}٪{total > c.cap ? ' — بیش از سقف' : ''})</span></small></div>
      </div>
      <div className="pst-stack" role="img" aria-label={`سهم بخش‌ها از سقف: ${PARTS.map((p) => `${p} ${fa(pct(cum(p), c.cap), 1)}٪`).join('، ')}`}>
        {PARTS.map((p) => <i key={p} style={{ width: `${pct(cum(p), c.cap)}%`, '--pc': PART_META[p].color } as CSSProperties} />)}
      </div>
      <div className="pst-parts">
        {PARTS.map((p) => {
          const s = last(p)
          return (
            <button key={p} type="button" className="pst-pcell" style={{ '--pc': PART_META[p].color } as CSSProperties} onClick={() => (s ? onOpen(s.id) : onNew({ contractId: c.id, part: p }))}>
              <PartChip part={p} />
              <b>{short(cum(p))}</b>
              {s ? <><small>آخرین: شمارهٔ {fa(s.no)} · {periodOf(s.periodKey).label}</small><StatusChip status={s.status} /></> : <small>هنوز صورت‌وضعیتی ندارد — ساخت اولین</small>}
            </button>
          )
        })}
      </div>
      <div className="pst-bar-actions"><span className="sp" /><button type="button" className="ps-btn" onClick={() => onNew({ contractId: c.id })}><FilePlus2 size={14} /> صورت‌وضعیت جدید</button></div>
    </article>
  )
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const st = usePstStore()
  const [contract, setContract] = useState('')
  const [part, setPart] = useState<Part | ''>('')
  const [status, setStatus] = useState<StStatus | ''>('')
  const rows: Statement[] = useMemo(() => st.statements.filter((s) => (!contract || s.contractId === contract) && (!part || s.part === part) && (!status || s.status === status)), [st.statements, contract, part, status])
  const cOf = (id: string) => st.contracts.find((c) => c.id === id)
  return (
    <section className="ps-card">
      <div className="pst-bar-actions">
        <select value={contract} onChange={(e) => setContract(e.target.value)} aria-label="قرارداد" style={{ maxWidth: '20rem' }}><option value="">همهٔ قراردادها</option>{st.contracts.map((c) => <option key={c.id} value={c.id}>{c.no} — {c.title}</option>)}</select>
        <select value={part} onChange={(e) => setPart(e.target.value as Part | '')} aria-label="بخش" style={{ maxWidth: '12rem' }}><option value="">همهٔ بخش‌ها</option>{PARTS.map((p) => <option key={p} value={p}>{p} — {PART_META[p].title}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StStatus | '')} aria-label="وضعیت" style={{ maxWidth: '12rem' }}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(STATUS_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="ps-table-wrap">
        <table className="ps-table">
          <thead><tr><th>قرارداد</th><th>بخش</th><th>شماره</th><th>دوره</th><th>این ماه (ناخالص)</th><th>کسور</th><th>خالص</th><th>تجمعی</th><th>وضعیت</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="is-click" onClick={() => onOpen(s.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(s.id) }}>
                <td dir="ltr" style={{ textAlign: 'right' }}>{cOf(s.contractId)?.no}</td><td><PartChip part={s.part} /></td><td>{s.part}-{fa(s.no)}</td><td>{periodOf(s.periodKey).label}</td>
                <td className="pst-num">{short(s.thisAmount)}</td><td className="pst-num">{short(s.deductions.total)}</td><td className="pst-num"><b>{short(s.payable)}</b></td><td className="pst-num">{short(s.cumAmount)}</td><td><StatusChip status={s.status} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>صورت‌وضعیتی با این فیلتر نیست.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
