import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Archive, ArchiveRestore, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Grid3x3, Handshake, LayoutDashboard, ListChecks, Loader2, Mail, MessageSquareWarning,
  MessagesSquare, Pencil, Phone, Plus, Search, Sparkles, Target, TriangleAlert, UserRound, UsersRound, X,
} from 'lucide-react'
import { ShamsiDate } from '../../components/common/ShamsiField'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { useStakeholderStore, type ConcernInput, type LogInput, type StakeholderInput } from './store/useStakeholderStore'
import { isOpenConcern, isOverdueConcern, isOverdueFollowUp, nextCode, quadrantOf, suggestStrategy, summarise, viewOf, type StakeholderView } from './lib/stakeholderCore'
import {
  ATTITUDE_COLOR, ATTITUDE_FA, CATEGORY_FA, CONCERN_CAT_FA, CONCERN_STATUS_FA, ENGAGEMENT_FA, ENGAGEMENT_ORDER, KIND_FA, PRIORITY_COLOR, PRIORITY_FA, QUADRANT_FA, SENTIMENT_COLOR, SENTIMENT_FA,
  type Attitude, type Category, type Concern, type ConcernCategory, type ConcernPriority, type ConcernStatus, type Engagement, type EngagementKind, type Quadrant, type Sentiment, type Stakeholder,
} from './types'
import { StakeholderOrbit } from './components/StakeholderOrbit'
import { useRemembered } from '../../lib/navMemory'
import { NavScroller } from '../../components/common/NavScroller'
import './stakeholders.css'
import { pressable } from '../../lib/pressable'

const fa = (n: number) => n.toLocaleString('fa-IR')
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
type Tab = 'dash' | 'register' | 'grid' | 'engagement' | 'log' | 'concerns'
type Dialog = { kind: 'stakeholder'; id?: string } | { kind: 'log'; stakeholderId?: string } | { kind: 'concern'; stakeholderId?: string; id?: string } | null

/**
 * مدیریت ذینفعان — the project's stakeholder register (power, interest, attitude, current and desired engagement), the
 * power/interest grid and the engagement assessment matrix, the log of interactions with their follow-ups, and the
 * concerns stakeholders raise. Rules live in lib/stakeholderCore; nothing is deleted (stakeholders are archived).
 */
export function StakeholdersApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = useStakeholderStore()
  const [tab, setTab] = useRemembered<Tab>('tab', 'dash', (v) => typeof v === 'string')
  const [open, setOpen] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) { setOpen(null); void useStakeholderStore.getState().load(projectId) } }, [projectId])

  const today = todayIso()
  const views = useMemo(() => st.stakeholders.map((s) => viewOf(s, st.logs, st.concerns, today)), [st.stakeholders, st.logs, st.concerns, today])
  const summary = useMemo(() => summarise(views, st.logs, st.concerns, today), [views, st.logs, st.concerns, today])
  const missing = !!st.error && /sh_|relation|schema cache/i.test(st.error)
  const nav = (t: Tab) => { setTab(t); setOpen(null) }

  return (
    <div className="sh" dir="rtl">
      <header className="sh-top">
        <div className="sh-brand">
          <span className="sh-brand-ico"><Handshake size={19} aria-hidden /></span>
          <span><b>مدیریت ذینفعان</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="sh-top-end">
          {projectId && !missing && <>
            <button type="button" className="sh-btn" onClick={() => setDialog({ kind: 'log' })} disabled={!st.stakeholders.length}><MessagesSquare size={15} aria-hidden /> ثبت تعامل</button>
            <button type="button" className="sh-btn is-primary" onClick={() => setDialog({ kind: 'stakeholder' })}><Plus size={15} aria-hidden /> ذینفع جدید</button>
          </>}
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      <NavScroller label="بخش‌ها"><nav className="sh-tabs" aria-label="بخش‌ها">
        {([
          ['dash', 'داشبورد', LayoutDashboard, 0], ['register', 'شناسنامهٔ ذینفعان', UsersRound, summary.active], ['grid', 'ماتریس قدرت و علاقه', Grid3x3, 0],
          ['engagement', 'ماتریس سطح تعامل', Target, summary.belowDesired], ['log', 'تعاملات و پیگیری‌ها', MessagesSquare, summary.overdueFollowUps], ['concerns', 'نگرانی‌ها و انتظارات', MessageSquareWarning, summary.openConcerns],
        ] as const).map(([k, l, I, n]) => (
          <button key={k} type="button" className={`sh-tab ${tab === k && !open ? 'is-on' : ''}`} onClick={() => nav(k)}>
            <I size={15} aria-hidden />{l}{n > 0 && <em className={k === 'log' || k === 'concerns' || k === 'engagement' ? 'is-warn' : ''}>{fa(n)}</em>}
          </button>
        ))}
      </nav></NavScroller>
      <main className="sh-main">
        {!projectId ? <Empty icon={<UsersRound size={28} />} title="پروژه‌ای انتخاب نشده است" text="ابتدا از رادار پروژه‌ها یک پروژه را انتخاب کنید." />
          : missing ? <Empty icon={<TriangleAlert size={28} />} title="جدول‌های ماژول ساخته نشده‌اند" text="فایل supabase/stakeholders/001_stakeholders.sql باید یک بار در پایگاه داده اجرا شود." />
          : st.loading ? <p className="sh-loading"><Loader2 size={16} className="sh-spin" aria-hidden /> در حال بارگذاری…</p>
          : open ? <Detail id={open} views={views} today={today} onBack={() => setOpen(null)} onDialog={setDialog} />
          : !st.stakeholders.length ? <Empty icon={<Handshake size={30} />} title="هنوز ذینفعی ثبت نشده است" text="ذینفعان پروژه را ثبت کنید: کارفرما، مشاور، پیمانکاران، نهادهای صدور مجوز، مدیریت محلی، مالکان اراضی و جامعهٔ محلی. برای هر ذینفع میزان قدرت و علاقه، نگرش و سطح تعامل فعلی و مطلوب را مشخص کنید." action={<button type="button" className="sh-btn is-primary" onClick={() => setDialog({ kind: 'stakeholder' })}><Plus size={15} aria-hidden /> ثبت اولین ذینفع</button>} />
          : tab === 'dash' ? <Dashboard views={views} summary={summary} onOpen={setOpen} onTab={nav} projectLabel={project?.shortName || project?.officialName || ''} />
          : tab === 'register' ? <Register views={views} onOpen={setOpen} />
          : tab === 'grid' ? <PowerGrid views={views} onOpen={setOpen} />
          : tab === 'engagement' ? <EngagementMatrix views={views} onOpen={setOpen} />
          : tab === 'log' ? <LogPage today={today} onOpen={setOpen} onNew={() => setDialog({ kind: 'log' })} />
          : <Concerns today={today} onOpen={setOpen} onEdit={(c) => setDialog({ kind: 'concern', id: c.id, stakeholderId: c.stakeholderId })} onNew={() => setDialog({ kind: 'concern' })} />}
        {st.error && !missing && <p className="sh-err" role="alert">{st.error}</p>}
      </main>
      {dialog?.kind === 'stakeholder' && <StakeholderForm id={dialog.id} onClose={() => setDialog(null)} onSaved={(id) => { setDialog(null); if (!dialog.id) setOpen(id) }} />}
      {dialog?.kind === 'log' && <LogForm stakeholderId={dialog.stakeholderId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'concern' && <ConcernForm id={dialog.id} stakeholderId={dialog.stakeholderId} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="sh-empty"><span className="sh-empty-ico" aria-hidden>{icon}</span><b>{title}</b><p>{text}</p>{action}</div>
}
const Chip = ({ color, children }: { color: string; children: ReactNode }) => <span className="sh-chip" style={{ '--c': color } as CSSProperties}><i aria-hidden />{children}</span>
const attitudeChip = (a: Attitude) => <Chip color={ATTITUDE_COLOR[a]}>{ATTITUDE_FA[a]}</Chip>
const quadChip = (q: Quadrant) => <Chip color={QUADRANT_FA[q].color}>{QUADRANT_FA[q].name}</Chip>
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')

/* ── dashboard ──────────────────────────────────────────────────────── */

function Dashboard({ views, summary, onOpen, onTab, projectLabel }: { views: StakeholderView[]; summary: ReturnType<typeof summarise>; onOpen: (id: string) => void; onTab: (t: Tab) => void; projectLabel: string }) {
  const urgent = views.filter((v) => v.s.active && v.alerts.length).sort((a, b) => b.attention - a.attention).slice(0, 8)
  const months = summary.months.map((m) => ({ ...m, label: formatJalali(`${m.month}-15`).slice(0, 7) }))
  const cats = Object.entries(views.filter((v) => v.s.active).reduce<Record<string, number>>((a, v) => { a[v.s.category] = (a[v.s.category] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1])
  const catMax = Math.max(1, ...cats.map((c) => c[1]))
  const al = summary.alignment
  const tone = al == null ? { c: '#64748b', t: 'بدون داده', I: Target } : al >= 75 ? { c: '#22c55e', t: 'هم‌راستا', I: CheckCircle2 } : al >= 50 ? { c: '#eab308', t: 'نیازمند تقویت', I: TriangleAlert } : { c: '#f97316', t: 'شکاف جدی تعامل', I: TriangleAlert }
  const StatusIco = tone.I
  return (
    <>
      <section className="sh-hero-dash" style={{ '--c': tone.c } as CSSProperties}>
        <div className="sh-hd-info">
          <span className="sh-eyebrow" dir="ltr">STAKEHOLDER ORBIT <i>·</i> Map <i>|</i> Engage <i>|</i> Align</span>
          <h1>نقشهٔ ذینفعان پروژه</h1>
          <p>جایگاه هر ذینفع بر پایهٔ قدرت، علاقه و نگرش او و فاصله‌اش از سطح تعامل مطلوب. روی هر ذینفع بزنید تا پرونده‌اش باز شود.</p>
          <div className="sh-hd-gauge">
            <AlignRing value={al} color={tone.c} />
            <span className="sh-pill"><small>وضعیت تعامل ذینفعان</small><b><StatusIco size={16} aria-hidden />{tone.t}</b></span>
          </div>
          <div className="sh-hd-stats">
            {(Object.keys(QUADRANT_FA) as Quadrant[]).map((q) => (
              <button key={q} type="button" onClick={() => onTab('grid')} style={{ '--c': QUADRANT_FA[q].color } as CSSProperties}>
                <b>{fa(summary.byQuadrant[q])}</b><small>{QUADRANT_FA[q].name}</small>
              </button>
            ))}
          </div>
        </div>
        <StakeholderOrbit views={views} onOpen={onOpen} projectLabel={projectLabel} />
      </section>

      <section className="sh-kpis">
        <Kpi icon={<UsersRound size={18} />} label="ذینفعان فعال" value={fa(summary.active)} sub={`${fa(summary.byQuadrant.manage)} نفر در گروه «مدیریت نزدیک»`} color="#8b5cf6" onClick={() => onTab('register')} />
        <Kpi icon={<Target size={18} />} label="هم‌راستایی تعامل" value={summary.alignment == null ? '—' : `${fa(summary.alignment)}٪`} sub={summary.belowDesired ? `${fa(summary.belowDesired)} ذینفع پایین‌تر از سطح مطلوب` : 'همه در سطح مطلوب یا بالاتر'} color={summary.alignment != null && summary.alignment < 60 ? '#f59e0b' : '#10b981'} onClick={() => onTab('engagement')} />
        <Kpi icon={<MessageSquareWarning size={18} />} label="نگرانی‌های باز" value={fa(summary.openConcerns)} sub={summary.overdueConcerns ? `${fa(summary.overdueConcerns)} مورد از مهلت گذشته` : 'بدون مورد سررسیدگذشته'} color={summary.overdueConcerns ? '#ef4444' : '#3b82f6'} onClick={() => onTab('concerns')} />
        <Kpi icon={<CalendarClock size={18} />} label="پیگیری‌های سررسیدگذشته" value={fa(summary.overdueFollowUps)} sub={summary.contactDue ? `${fa(summary.contactDue)} ذینفع در موعد تماس دوره‌ای` : 'تماس‌های دوره‌ای به‌موقع است'} color={summary.overdueFollowUps ? '#ef4444' : '#10b981'} onClick={() => onTab('log')} />
      </section>

      <div className="sh-cols">
        <section className="sh-card">
          <CardHead icon={<TriangleAlert size={16} />} title="نیازمند توجه" sub="ذینفعان به ترتیب فوریت؛ بر پایهٔ قدرت و علاقه، نگرش، فاصله از سطح مطلوب، نگرانی‌ها و پیگیری‌های عقب‌افتاده" />
          {urgent.length ? (
            <ul className="sh-urgent">
              {urgent.map((v, i) => (
                <li key={v.s.id} style={{ '--i': i } as CSSProperties}>
                  <button type="button" onClick={() => onOpen(v.s.id)}>
                    <Avatar s={v.s} />
                    <span className="sh-urgent-main"><b>{v.s.name}</b><small>{v.alerts.slice(0, 2).join(' · ')}</small></span>
                    <span className="sh-score" style={{ '--c': v.attention >= 70 ? '#ef4444' : v.attention >= 45 ? '#f59e0b' : '#3b82f6' } as CSSProperties}>{fa(v.attention)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="sh-hint"><CheckCircle2 size={15} aria-hidden /> ذینفعی که اکنون نیاز به اقدام داشته باشد دیده نمی‌شود.</p>}
        </section>
        <section className="sh-card">
          <CardHead icon={<MessagesSquare size={16} />} title="تعاملات شش ماه اخیر" sub="تعداد تعاملات ثبت‌شده در هر ماه به تفکیک نتیجه" />
          <div className="sh-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} reversed />
                <YAxis allowDecimals={false} orientation="right" width={28} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, direction: 'rtl', fontSize: 12 }} formatter={(v, n) => [fa(Number(v)), SENTIMENT_FA[n as Sentiment]]} />
                {(['positive', 'neutral', 'negative'] as const).map((k) => <Bar key={k} dataKey={k} stackId="a" fill={SENTIMENT_COLOR[k]} radius={k === 'negative' ? [5, 5, 0, 0] : 0} maxBarSize={34} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="sh-legend">{(['positive', 'neutral', 'negative'] as const).map((k) => <span key={k}><i style={{ background: SENTIMENT_COLOR[k] }} />{SENTIMENT_FA[k]} <b>{fa(summary.recent[k])}</b> <small>در ۳۰ روز</small></span>)}</div>
        </section>
        <section className="sh-card">
          <CardHead icon={<UsersRound size={16} />} title="ترکیب ذینفعان" sub="ذینفعان فعال به تفکیک گروه" />
          <ul className="sh-bars">
            {cats.map(([k, n]) => (
              <li key={k}><span>{CATEGORY_FA[k as Category]}</span><span className="sh-bar"><i style={{ width: `${(n / catMax) * 100}%` }} /></span><b>{fa(n)}</b></li>
            ))}
          </ul>
          <div className="sh-split">
            <span style={{ '--c': '#10b981' } as CSSProperties}><b>{fa(summary.supportive)}</b> حمایت‌گر یا پیشرو</span>
            <span style={{ '--c': '#ef4444' } as CSSProperties}><b>{fa(summary.resistant)}</b> مقاوم یا مخالف جدی</span>
          </div>
        </section>
        <section className="sh-card">
          <CardHead icon={<Grid3x3 size={16} />} title="نقشهٔ قدرت و علاقه" sub="برای دیدن جزئیات روی یک نام بزنید" />
          <PowerGrid views={views} onOpen={onOpen} compact />
        </section>
      </div>
    </>
  )
}

/** engagement alignment as a holographic ring on a pedestal */
function AlignRing({ value, color }: { value: number | null; color: string }) {
  const R = 64, Cc = 2 * Math.PI * R
  return (
    <span className="sh-aring" role="img" aria-label={`هم‌راستایی تعامل ${value == null ? 'بدون داده' : `${fa(value)} درصد`}`}>
      <svg viewBox="0 0 160 160" aria-hidden>
        {Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2 - Math.PI / 2; return <line key={i} x1={80 + 76 * Math.cos(a)} y1={80 + 76 * Math.sin(a)} x2={80 + (i % 4 ? 73 : 70) * Math.cos(a)} y2={80 + (i % 4 ? 73 : 70) * Math.sin(a)} className={value != null && i / 48 <= value / 100 ? 'on' : ''} /> })}
        <circle cx="80" cy="80" r={R} className="t" />
        <circle cx="80" cy="80" r={R} className="v" strokeDasharray={`${(Cc * (value ?? 0)) / 100} ${Cc}`} transform="rotate(-90 80 80)" style={{ stroke: color }} />
      </svg>
      <span className="sh-aring-t"><b>{value == null ? '—' : `${fa(value)}٪`}</b><small>هم‌راستایی تعامل</small></span>
    </span>
  )
}

function Kpi({ icon, label, value, sub, color, onClick }: { icon: ReactNode; label: string; value: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button type="button" className="sh-kpi" style={{ '--c': color } as CSSProperties} onClick={onClick}>
      <span className="sh-kpi-ico" aria-hidden>{icon}</span>
      <small>{label}</small><b>{value}</b><span>{sub}</span>
    </button>
  )
}
function CardHead({ icon, title, sub, end }: { icon: ReactNode; title: string; sub?: string; end?: ReactNode }) {
  return <div className="sh-card-head"><span className="sh-card-ico" aria-hidden>{icon}</span><span><b>{title}</b>{sub && <small>{sub}</small>}</span>{end && <span className="sh-card-end">{end}</span>}</div>
}
function Avatar({ s }: { s: Stakeholder }) {
  return <span className="sh-avatar" style={{ '--c': ATTITUDE_COLOR[s.attitude] } as CSSProperties} aria-hidden>{initials(s.name)}</span>
}

/* ── register ───────────────────────────────────────────────────────── */

function Register({ views, onOpen }: { views: StakeholderView[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [quad, setQuad] = useState<Quadrant | ''>('')
  const [cat, setCat] = useState<Category | ''>('')
  const [archived, setArchived] = useState(false)
  const list = views.filter((v) => (archived ? !v.s.active : v.s.active))
    .filter((v) => !quad || v.quadrant === quad).filter((v) => !cat || v.s.category === cat)
    .filter((v) => !q.trim() || `${v.s.code} ${v.s.name} ${v.s.organization} ${v.s.roleTitle} ${v.s.owner}`.includes(q.trim()))
    .sort((a, b) => b.attention - a.attention || a.s.code.localeCompare(b.s.code))
  return (
    <section className="sh-card">
      <div className="sh-filters">
        <label className="sh-search"><Search size={15} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی نام، سازمان، سمت یا مسئول" aria-label="جست‌وجو" /></label>
        <select value={quad} onChange={(e) => setQuad(e.target.value as Quadrant | '')} aria-label="راهبرد"><option value="">همهٔ راهبردها</option>{(Object.keys(QUADRANT_FA) as Quadrant[]).map((k) => <option key={k} value={k}>{QUADRANT_FA[k].name}</option>)}</select>
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="گروه"><option value="">همهٔ گروه‌ها</option>{(Object.keys(CATEGORY_FA) as Category[]).map((k) => <option key={k} value={k}>{CATEGORY_FA[k]}</option>)}</select>
        <label className="sh-check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> نمایش بایگانی‌شده‌ها</label>
      </div>
      {list.length ? (
        <div className="sh-table-wrap">
          <table className="sh-table">
            <thead><tr><th>ذینفع</th><th>گروه</th><th>قدرت / علاقه</th><th>راهبرد</th><th>نگرش</th><th>تعامل فعلی ← مطلوب</th><th>آخرین تعامل</th><th>نگرانی باز</th><th>مسئول ارتباط</th></tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.s.id} {...pressable(() => onOpen(v.s.id), { row: true })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(v.s.id) }}>
                  <td><span className="sh-who"><Avatar s={v.s} /><span><b>{v.s.name}</b><small><span dir="ltr">{v.s.code}</span>{v.s.organization && ` · ${v.s.organization}`}{v.s.roleTitle && ` · ${v.s.roleTitle}`}</small></span></span></td>
                  <td className="sh-muted">{CATEGORY_FA[v.s.category]}</td>
                  <td><Dots power={v.s.power} interest={v.s.interest} /></td>
                  <td>{quadChip(v.quadrant)}</td>
                  <td>{attitudeChip(v.s.attitude)}</td>
                  <td><span className={`sh-eng ${v.gap > 0 ? 'is-gap' : ''}`}>{ENGAGEMENT_FA[v.s.current]} ← {ENGAGEMENT_FA[v.s.desired]}</span></td>
                  <td className={v.contactDue ? 'sh-warn' : 'sh-muted'}>{v.lastContact ? `${jd(v.lastContact)}` : 'ثبت نشده'}{v.lastSentiment && <i className="sh-dot" style={{ background: SENTIMENT_COLOR[v.lastSentiment] }} title={SENTIMENT_FA[v.lastSentiment]} />}</td>
                  <td>{v.openConcerns ? <b className={v.criticalConcerns ? 'sh-bad' : ''}>{fa(v.openConcerns)}</b> : <span className="sh-muted">—</span>}</td>
                  <td className="sh-muted">{v.s.owner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="sh-hint">{archived ? 'ذینفع بایگانی‌شده‌ای وجود ندارد.' : 'ذینفعی با این فیلترها پیدا نشد.'}</p>}
    </section>
  )
}

function Dots({ power, interest }: { power: number; interest: number }) {
  const row = (n: number, c: string) => <span className="sh-dots">{[1, 2, 3, 4, 5].map((i) => <i key={i} style={i <= n ? { background: c } : undefined} />)}</span>
  return <span className="sh-pi"><span><small>قدرت</small>{row(power, '#8b5cf6')}</span><span><small>علاقه</small>{row(interest, '#0ea5e9')}</span></span>
}

/* ── power / interest grid ──────────────────────────────────────────── */

function PowerGrid({ views, onOpen, compact }: { views: StakeholderView[]; onOpen: (id: string) => void; compact?: boolean }) {
  const act = views.filter((v) => v.s.active)
  const cell = (p: number, i: number) => act.filter((v) => v.s.power === p && v.s.interest === i)
  const quads: [Quadrant, string][] = [['satisfy', 'is-tl'], ['manage', 'is-tr'], ['monitor', 'is-bl'], ['inform', 'is-br']]
  return (
    <div className={`sh-grid-wrap ${compact ? 'is-compact' : ''}`}>
      {!compact && <p className="sh-hint">هر ذینفع بر پایهٔ میزان قدرت (اثرگذاری بر تصمیم‌ها و نتایج پروژه) و میزان علاقه (اثرپذیری و توجه به پروژه) از ۱ تا ۵ جای می‌گیرد. مقدار ۴ و ۵ «زیاد» به حساب می‌آید. رنگ هر نام نگرش آن ذینفع را نشان می‌دهد.</p>}
      <div className="sh-grid" dir="ltr">
        <span className="sh-axis is-y">قدرت ←</span>
        <div className="sh-grid-board">
          {quads.map(([q, pos]) => (
            <div key={q} className={`sh-quad ${pos}`} style={{ '--c': QUADRANT_FA[q].color } as CSSProperties}><b dir="rtl">{QUADRANT_FA[q].name}</b>{!compact && <small dir="rtl">{QUADRANT_FA[q].hint}</small>}</div>
          ))}
          <div className="sh-cells">
            {[5, 4, 3, 2, 1].map((p) => [1, 2, 3, 4, 5].map((i) => (
              <div key={`${p}${i}`} className="sh-cell">
                {cell(p, i).map((v) => (
                  <button key={v.s.id} type="button" className="sh-pin" style={{ '--c': ATTITUDE_COLOR[v.s.attitude] } as CSSProperties} onClick={() => onOpen(v.s.id)} title={`${v.s.name} — ${ATTITUDE_FA[v.s.attitude]}`} dir="rtl">
                    {compact ? initials(v.s.name) : v.s.name}
                  </button>
                ))}
              </div>
            )))}
          </div>
        </div>
        <span className="sh-axis is-x">علاقه ←</span>
      </div>
      {!compact && <div className="sh-legend">{(Object.keys(ATTITUDE_FA) as Attitude[]).map((a) => <span key={a}><i style={{ background: ATTITUDE_COLOR[a] }} />{ATTITUDE_FA[a]}</span>)}</div>}
    </div>
  )
}

/* ── engagement assessment matrix ───────────────────────────────────── */

function EngagementMatrix({ views, onOpen }: { views: StakeholderView[]; onOpen: (id: string) => void }) {
  const act = views.filter((v) => v.s.active).sort((a, b) => b.gap - a.gap || b.weight - a.weight)
  return (
    <section className="sh-card">
      <CardHead icon={<Target size={16} />} title="ماتریس ارزیابی سطح تعامل" sub="ج: سطح فعلی · م: سطح مطلوب. ردیف‌ها به ترتیب فاصله از سطح مطلوب مرتب شده‌اند." />
      <div className="sh-table-wrap">
        <table className="sh-table sh-matrix">
          <thead><tr><th>ذینفع</th>{ENGAGEMENT_ORDER.map((e) => <th key={e}>{ENGAGEMENT_FA[e]}</th>)}<th>فاصله</th></tr></thead>
          <tbody>
            {act.map((v) => {
              const ci = ENGAGEMENT_ORDER.indexOf(v.s.current), di = ENGAGEMENT_ORDER.indexOf(v.s.desired)
              return (
                <tr key={v.s.id} {...pressable(() => onOpen(v.s.id), { row: true })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(v.s.id) }}>
                  <td><span className="sh-who"><Avatar s={v.s} /><span><b>{v.s.name}</b><small>{QUADRANT_FA[v.quadrant].name}</small></span></span></td>
                  {ENGAGEMENT_ORDER.map((e, i) => {
                    const between = i > Math.min(ci, di) && i < Math.max(ci, di)
                    return (
                      <td key={e} className={`sh-mcell ${between ? 'is-path' : ''}`}>
                        {i === ci && <span className={`sh-mark is-c ${ci === di ? 'is-same' : ''}`}>{ci === di ? 'ج م' : 'ج'}</span>}
                        {i === di && ci !== di && <span className="sh-mark is-d">م</span>}
                      </td>
                    )
                  })}
                  <td>{v.gap > 0 ? <b className="sh-warn">{fa(v.gap)} پله</b> : v.gap < 0 ? <span className="sh-muted">بالاتر از نیاز</span> : <CheckCircle2 size={16} className="sh-ok" aria-label="در سطح مطلوب" />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ── interactions & follow-ups ──────────────────────────────────────── */

function LogPage({ today, onOpen, onNew }: { today: string; onOpen: (id: string) => void; onNew: () => void }) {
  const st = useStakeholderStore()
  const email = useAuthStore((s) => s.profile?.email ?? '').toLowerCase()
  const [mine, setMine] = useState(false)
  const name = (id: string) => st.stakeholders.find((s) => s.id === id)?.name ?? '—'
  const pending = st.logs.filter((l) => l.nextAction && !l.nextDone && (!mine || l.nextOwnerEmail === email)).sort((a, b) => (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999'))
  return (
    <div className="sh-cols is-log">
      <section className="sh-card">
        <CardHead icon={<ListChecks size={16} />} title="پیگیری‌های باز" sub="اقدام‌های بعدی که پس از تعاملات تعیین شده‌اند"
          end={<label className="sh-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> فقط پیگیری‌های من</label>} />
        {pending.length ? (
          <ul className="sh-follow">
            {pending.map((l) => {
              const late = isOverdueFollowUp(l, today)
              return (
                <li key={l.id} className={late ? 'is-late' : ''}>
                  <button type="button" className="sh-tick" onClick={() => void st.setFollowUpDone(l.id, true)} aria-label={`انجام شد: ${l.nextAction}`} title="انجام شد"><CheckCircle2 size={18} aria-hidden /></button>
                  <span className="sh-follow-main">
                    <b>{l.nextAction}</b>
                    <small><button type="button" className="sh-link" onClick={() => onOpen(l.stakeholderId)}>{name(l.stakeholderId)}</button>{l.nextOwner && ` · ${l.nextOwner}`} · از {KIND_FA[l.kind]} {jd(l.happenedOn)}</small>
                  </span>
                  <span className={`sh-due ${late ? 'is-late' : ''}`}>{l.nextDue ? jd(l.nextDue) : 'بدون مهلت'}</span>
                </li>
              )
            })}
          </ul>
        ) : <p className="sh-hint"><CheckCircle2 size={15} aria-hidden /> پیگیری بازی وجود ندارد.</p>}
      </section>
      <section className="sh-card">
        <CardHead icon={<MessagesSquare size={16} />} title="سوابق تعامل" sub="آخرین تعاملات ثبت‌شده با ذینفعان" end={<button type="button" className="sh-btn" onClick={onNew}><Plus size={14} aria-hidden /> ثبت تعامل</button>} />
        <Timeline logs={st.logs.slice(0, 60)} nameOf={name} onOpen={onOpen} />
      </section>
    </div>
  )
}

function Timeline({ logs, nameOf, onOpen }: { logs: ReturnType<typeof useStakeholderStore.getState>['logs']; nameOf?: (id: string) => string; onOpen?: (id: string) => void }) {
  const st = useStakeholderStore()
  if (!logs.length) return <p className="sh-hint">هنوز تعاملی ثبت نشده است.</p>
  return (
    <ol className="sh-timeline">
      {logs.map((l) => (
        <li key={l.id} style={{ '--c': SENTIMENT_COLOR[l.sentiment] } as CSSProperties}>
          <span className="sh-tl-dot" aria-hidden />
          <div className="sh-tl-body">
            <div className="sh-tl-head">
              <b>{l.subject}</b>
              <Chip color={SENTIMENT_COLOR[l.sentiment]}>{SENTIMENT_FA[l.sentiment]}</Chip>
            </div>
            <small>{KIND_FA[l.kind]} · {jd(l.happenedOn)}{nameOf && <> · {onOpen ? <button type="button" className="sh-link" onClick={() => onOpen(l.stakeholderId)}>{nameOf(l.stakeholderId)}</button> : nameOf(l.stakeholderId)}</>}{l.createdBy && ` · ثبت: ${l.createdBy}`}</small>
            {l.summary && <p>{l.summary}</p>}
            {l.attendees && <p className="sh-muted">حاضران: {l.attendees}</p>}
            {l.nextAction && (
              <p className={`sh-tl-next ${l.nextDone ? 'is-done' : ''}`}>
                <ListChecks size={13} aria-hidden /> {l.nextAction}{l.nextOwner && ` — ${l.nextOwner}`}{l.nextDue && ` — مهلت ${jd(l.nextDue)}`}
                <button type="button" className="sh-link" onClick={() => void st.setFollowUpDone(l.id, !l.nextDone)}>{l.nextDone ? 'بازگشایی' : 'انجام شد'}</button>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ── concerns ───────────────────────────────────────────────────────── */

function Concerns({ today, onOpen, onEdit, onNew }: { today: string; onOpen: (id: string) => void; onEdit: (c: Concern) => void; onNew: () => void }) {
  const st = useStakeholderStore()
  const [status, setStatus] = useState<'open' | 'all' | 'done'>('open')
  const name = (id: string) => st.stakeholders.find((s) => s.id === id)?.name ?? '—'
  const order: Record<ConcernPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const list = st.concerns.filter((c) => (status === 'all' ? true : status === 'open' ? isOpenConcern(c) : !isOpenConcern(c)))
    .sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  return (
    <section className="sh-card">
      <CardHead icon={<MessageSquareWarning size={16} />} title="نگرانی‌ها و انتظارات ذینفعان" sub="هر نگرانی مسئول و مهلت پاسخ دارد و تا رفع آن پیگیری می‌شود"
        end={<span className="sh-actions">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="وضعیت"><option value="open">باز و در حال پیگیری</option><option value="done">رفع‌شده و بسته</option><option value="all">همه</option></select>
          <button type="button" className="sh-btn" onClick={onNew}><Plus size={14} aria-hidden /> نگرانی جدید</button>
        </span>} />
      {list.length ? (
        <ul className="sh-concerns">
          {list.map((c) => <ConcernRow key={c.id} c={c} late={isOverdueConcern(c, today)} who={name(c.stakeholderId)} onOpen={() => onOpen(c.stakeholderId)} onEdit={() => onEdit(c)} />)}
        </ul>
      ) : <p className="sh-hint">{status === 'open' ? 'نگرانی بازی ثبت نشده است.' : 'موردی وجود ندارد.'}</p>}
    </section>
  )
}

function ConcernRow({ c, late, who, onOpen, onEdit }: { c: Concern; late: boolean; who?: string; onOpen?: () => void; onEdit: () => void }) {
  return (
    <li className={`sh-concern ${late ? 'is-late' : ''}`} style={{ '--c': PRIORITY_COLOR[c.priority] } as CSSProperties}>
      <span className="sh-concern-main">
        <b>{c.title}</b>
        <small>
          {who && (onOpen ? <><button type="button" className="sh-link" onClick={onOpen}>{who}</button> · </> : `${who} · `)}
          {CONCERN_CAT_FA[c.category]} · ثبت {jd(c.raisedOn)}{c.owner && ` · مسئول: ${c.owner}`}
        </small>
        {c.description && <p>{c.description}</p>}
        {c.resolution && <p className="sh-res"><CheckCircle2 size={13} aria-hidden /> {c.resolution}</p>}
      </span>
      <span className="sh-concern-side">
        <Chip color={PRIORITY_COLOR[c.priority]}>{PRIORITY_FA[c.priority]}</Chip>
        <span className="sh-status">{CONCERN_STATUS_FA[c.status]}</span>
        <span className={`sh-due ${late ? 'is-late' : ''}`}>{c.dueDate ? `مهلت ${jd(c.dueDate)}` : 'بدون مهلت'}</span>
        <button type="button" className="sh-icon-btn" onClick={onEdit} aria-label={`ویرایش ${c.title}`}><Pencil size={14} aria-hidden /></button>
      </span>
    </li>
  )
}

/* ── stakeholder page ───────────────────────────────────────────────── */

function Detail({ id, views, today, onBack, onDialog }: { id: string; views: StakeholderView[]; today: string; onBack: () => void; onDialog: (d: Dialog) => void }) {
  const st = useStakeholderStore()
  const v = views.find((x) => x.s.id === id)
  if (!v) return <Empty icon={<UserRound size={28} />} title="ذینفع پیدا نشد" text="ممکن است حذف یا به پروژهٔ دیگری مربوط باشد." action={<button type="button" className="sh-btn" onClick={onBack}>بازگشت</button>} />
  const s = v.s
  const logs = st.logs.filter((l) => l.stakeholderId === id)
  const concerns = st.concerns.filter((c) => c.stakeholderId === id)
  return (
    <div className="sh-detail">
      <div className="sh-detail-bar">
        <button type="button" className="sh-btn is-ghost" onClick={onBack}><ArrowLeft size={15} aria-hidden style={{ transform: 'scaleX(-1)' }} /> بازگشت</button>
        <span className="sh-actions">
          <button type="button" className="sh-btn" onClick={() => onDialog({ kind: 'log', stakeholderId: id })}><MessagesSquare size={14} aria-hidden /> ثبت تعامل</button>
          <button type="button" className="sh-btn" onClick={() => onDialog({ kind: 'concern', stakeholderId: id })}><MessageSquareWarning size={14} aria-hidden /> ثبت نگرانی</button>
          <button type="button" className="sh-btn" onClick={() => onDialog({ kind: 'stakeholder', id })}><Pencil size={14} aria-hidden /> ویرایش</button>
          <button type="button" className="sh-btn is-ghost" onClick={() => void st.setActive(id, !s.active)}>{s.active ? <><Archive size={14} aria-hidden /> بایگانی</> : <><ArchiveRestore size={14} aria-hidden /> بازگرداندن</>}</button>
        </span>
      </div>

      <section className="sh-hero" style={{ '--c': QUADRANT_FA[v.quadrant].color } as CSSProperties}>
        <div className="sh-hero-id">
          <span className="sh-avatar is-lg" style={{ '--c': ATTITUDE_COLOR[s.attitude] } as CSSProperties} aria-hidden>{initials(s.name)}</span>
          <span>
            <h1>{s.name}{!s.active && <em className="sh-archived">بایگانی‌شده</em>}</h1>
            <small><span dir="ltr">{s.code}</span> · {CATEGORY_FA[s.category]}{s.organization && ` · ${s.organization}`}{s.roleTitle && ` · ${s.roleTitle}`}</small>
            <span className="sh-hero-chips">{quadChip(v.quadrant)}{attitudeChip(s.attitude)}<Chip color="#64748b">{s.side === 'internal' ? 'درون‌سازمانی' : 'برون‌سازمانی'}</Chip></span>
          </span>
        </div>
        <div className="sh-hero-stats">
          <div><small>قدرت و علاقه</small><Dots power={s.power} interest={s.interest} /></div>
          <div><small>سطح تعامل</small><EngagementLadder current={s.current} desired={s.desired} /></div>
          <div><small>آخرین تعامل</small><b>{v.lastContact ? jd(v.lastContact) : 'ثبت نشده'}</b><span className={v.contactDue ? 'sh-warn' : 'sh-muted'}>{v.sinceContact != null ? `${fa(v.sinceContact)} روز پیش` : ''}{s.frequencyDays ? ` · دورهٔ تماس ${fa(s.frequencyDays)} روز` : ''}</span></div>
          <div><small>شاخص فوریت</small><b style={{ color: v.attention >= 70 ? '#ef4444' : v.attention >= 45 ? '#f59e0b' : '#10b981' }}>{fa(v.attention)} از ۱۰۰</b></div>
        </div>
        {v.alerts.length > 0 && <ul className="sh-alerts">{v.alerts.map((a) => <li key={a}><TriangleAlert size={13} aria-hidden /> {a}</li>)}</ul>}
      </section>

      <div className="sh-cols">
        <section className="sh-card">
          <CardHead icon={<ClipboardList size={16} />} title="شناسنامه و راهبرد" />
          <dl className="sh-dl">
            <dt>مسئول ارتباط</dt><dd>{s.owner || '—'}{s.ownerEmail && <small dir="ltr"> {s.ownerEmail}</small>}</dd>
            <dt>راه ارتباطی</dt><dd>{s.channel || '—'}</dd>
            <dt>تماس</dt><dd className="sh-contact">{s.phone && <a href={`tel:${s.phone}`}><Phone size={13} aria-hidden /> <span dir="ltr">{s.phone}</span></a>}{s.email && <a href={`mailto:${s.email}`}><Mail size={13} aria-hidden /> <span dir="ltr">{s.email}</span></a>}{!s.phone && !s.email && '—'}</dd>
            <dt>انتظارات</dt><dd>{s.expectations || '—'}</dd>
            <dt>راهبرد تعامل</dt><dd>{s.strategy || <span className="sh-muted">{suggestStrategy(s)} <em>(پیشنهاد سامانه)</em></span>}</dd>
            {s.note && <><dt>یادداشت</dt><dd>{s.note}</dd></>}
          </dl>
        </section>
        <section className="sh-card">
          <CardHead icon={<MessageSquareWarning size={16} />} title="نگرانی‌ها" sub={`${fa(concerns.filter(isOpenConcern).length)} مورد باز`} />
          {concerns.length ? <ul className="sh-concerns">{concerns.map((c) => <ConcernRow key={c.id} c={c} late={isOverdueConcern(c, today)} onEdit={() => onDialog({ kind: 'concern', id: c.id, stakeholderId: id })} />)}</ul>
            : <p className="sh-hint">نگرانی‌ای از این ذینفع ثبت نشده است.</p>}
        </section>
      </div>
      <section className="sh-card">
        <CardHead icon={<MessagesSquare size={16} />} title="سوابق تعامل" sub={`${fa(logs.length)} تعامل ثبت‌شده`} />
        <Timeline logs={logs} />
      </section>
    </div>
  )
}

function EngagementLadder({ current, desired }: { current: Engagement; desired: Engagement }) {
  const ci = ENGAGEMENT_ORDER.indexOf(current), di = ENGAGEMENT_ORDER.indexOf(desired)
  return (
    <span className="sh-ladder" aria-label={`فعلی: ${ENGAGEMENT_FA[current]}، مطلوب: ${ENGAGEMENT_FA[desired]}`}>
      {ENGAGEMENT_ORDER.map((e, i) => <i key={e} className={`${i === ci ? 'is-c' : ''} ${i === di ? 'is-d' : ''} ${i > Math.min(ci, di) && i < Math.max(ci, di) ? 'is-path' : ''}`} title={ENGAGEMENT_FA[e]} />)}
      <b>{ENGAGEMENT_FA[current]}{ci !== di && ` ← ${ENGAGEMENT_FA[desired]}`}</b>
    </span>
  )
}

/* ── forms ──────────────────────────────────────────────────────────── */

function Modal({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <div className="sh-modal-root" dir="rtl">
      <div className="sh-modal-scrim" onClick={onClose} aria-hidden />
      <div className="sh-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><b>{title}</b><button type="button" className="sh-icon-btn" onClick={onClose} aria-label="بستن"><X size={16} aria-hidden /></button></header>
        <div className="sh-modal-body">{children}</div>
        <footer>{foot}</footer>
      </div>
    </div>,
    document.body,
  )
}
const Field = ({ label, wide, children, hint }: { label: string; wide?: boolean; children: ReactNode; hint?: string }) => (
  <label className={`sh-field ${wide ? 'is-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
)
function Scale({ value, onChange, label, color }: { value: number; onChange: (n: number) => void; label: string; color: string }) {
  return (
    <span className="sh-scale" role="radiogroup" aria-label={label} style={{ '--c': color } as CSSProperties}>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} className={n <= value ? 'is-on' : ''} onClick={() => onChange(n)}>{fa(n)}</button>)}
    </span>
  )
}

function StakeholderForm({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const st = useStakeholderStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const cur = id ? st.stakeholders.find((s) => s.id === id) : undefined
  const [f, setF] = useState<StakeholderInput>(() => cur ? { ...cur } : {
    code: nextCode(st.stakeholders.map((s) => s.code)), name: '', organization: '', roleTitle: '', category: 'other', side: 'external', phone: '', email: '',
    power: 3, interest: 3, attitude: 'neutral', current: 'neutral', desired: 'supportive', owner: '', ownerEmail: '', channel: '', frequencyDays: 30, expectations: '', strategy: '', note: '',
  })
  const [busy, setBusy] = useState(false)
  const up = <K extends keyof StakeholderInput>(k: K, v: StakeholderInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const q = quadrantOf(f)
  const save = async () => {
    if (!f.name.trim() || !f.code.trim()) return
    setBusy(true)
    const res = await st.saveStakeholder(f, email, id)
    setBusy(false)
    if (res) onSaved(res)
  }
  return (
    <Modal title={id ? `ویرایش ${cur?.name ?? 'ذینفع'}` : 'ذینفع جدید'} onClose={onClose}
      foot={<><button type="button" className="sh-btn is-ghost" onClick={onClose}>انصراف</button><button type="button" className="sh-btn is-primary" onClick={save} disabled={busy || !f.name.trim() || !f.code.trim()}>{busy ? <Loader2 size={14} className="sh-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />} ذخیره</button></>}>
      {st.error && <p className="sh-err">{st.error}</p>}
      <h4 className="sh-form-h">مشخصات</h4>
      <div className="sh-form-grid">
        <Field label="نام ذینفع یا نهاد *"><input value={f.name} onChange={(e) => up('name', e.target.value)} autoFocus /></Field>
        <Field label="کد *"><input value={f.code} onChange={(e) => up('code', e.target.value)} dir="ltr" /></Field>
        <Field label="گروه"><select value={f.category} onChange={(e) => up('category', e.target.value as Category)}>{(Object.keys(CATEGORY_FA) as Category[]).map((k) => <option key={k} value={k}>{CATEGORY_FA[k]}</option>)}</select></Field>
        <Field label="نوع"><select value={f.side} onChange={(e) => up('side', e.target.value as 'internal' | 'external')}><option value="external">برون‌سازمانی</option><option value="internal">درون‌سازمانی</option></select></Field>
        <Field label="سازمان"><input value={f.organization} onChange={(e) => up('organization', e.target.value)} /></Field>
        <Field label="سمت یا نمایندهٔ اصلی"><input value={f.roleTitle} onChange={(e) => up('roleTitle', e.target.value)} /></Field>
        <Field label="تلفن"><input value={f.phone} onChange={(e) => up('phone', e.target.value)} dir="ltr" inputMode="tel" /></Field>
        <Field label="ایمیل"><input value={f.email} onChange={(e) => up('email', e.target.value)} dir="ltr" inputMode="email" /></Field>
      </div>
      <h4 className="sh-form-h">تحلیل ذینفع</h4>
      <div className="sh-form-grid">
        <Field label="قدرت (اثرگذاری بر تصمیم‌ها)"><Scale value={f.power} onChange={(n) => up('power', n)} label="قدرت" color="#8b5cf6" /></Field>
        <Field label="علاقه (اثرپذیری از پروژه)"><Scale value={f.interest} onChange={(n) => up('interest', n)} label="علاقه" color="#0ea5e9" /></Field>
        <Field label="نگرش به پروژه"><select value={f.attitude} onChange={(e) => up('attitude', e.target.value as Attitude)}>{(Object.keys(ATTITUDE_FA) as Attitude[]).map((k) => <option key={k} value={k}>{ATTITUDE_FA[k]}</option>)}</select></Field>
        <Field label="راهبرد پیشنهادی"><span className="sh-quad-out" style={{ '--c': QUADRANT_FA[q].color } as CSSProperties}>{QUADRANT_FA[q].name}</span></Field>
        <Field label="سطح تعامل فعلی"><select value={f.current} onChange={(e) => up('current', e.target.value as Engagement)}>{ENGAGEMENT_ORDER.map((k) => <option key={k} value={k}>{ENGAGEMENT_FA[k]}</option>)}</select></Field>
        <Field label="سطح تعامل مطلوب"><select value={f.desired} onChange={(e) => up('desired', e.target.value as Engagement)}>{ENGAGEMENT_ORDER.map((k) => <option key={k} value={k}>{ENGAGEMENT_FA[k]}</option>)}</select></Field>
      </div>
      <h4 className="sh-form-h">برنامهٔ ارتباط</h4>
      <div className="sh-form-grid">
        <Field label="مسئول ارتباط"><input value={f.owner} onChange={(e) => up('owner', e.target.value)} /></Field>
        <Field label="ایمیل مسئول ارتباط" hint="برای نمایش پیگیری‌ها در کارتابل او"><input value={f.ownerEmail} onChange={(e) => up('ownerEmail', e.target.value)} dir="ltr" inputMode="email" /></Field>
        <Field label="راه ارتباطی"><input value={f.channel} onChange={(e) => up('channel', e.target.value)} placeholder="مثلاً جلسهٔ ماهانه، نامهٔ رسمی" /></Field>
        <Field label="دورهٔ تماس (روز)" hint="خالی: بدون برنامهٔ تماس دوره‌ای"><input type="number" min={1} value={f.frequencyDays ?? ''} onChange={(e) => up('frequencyDays', e.target.value ? Math.max(1, Number(e.target.value)) : null)} /></Field>
        <Field label="انتظارات و منافع" wide><textarea rows={2} value={f.expectations} onChange={(e) => up('expectations', e.target.value)} /></Field>
        <Field label="راهبرد تعامل" wide>
          <textarea rows={3} value={f.strategy} onChange={(e) => up('strategy', e.target.value)} placeholder={suggestStrategy(f)} />
          <button type="button" className="sh-link is-btn" onClick={() => up('strategy', suggestStrategy(f))}><Sparkles size={13} aria-hidden /> استفاده از پیشنهاد سامانه</button>
        </Field>
        <Field label="یادداشت" wide><textarea rows={2} value={f.note} onChange={(e) => up('note', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function LogForm({ stakeholderId, onClose }: { stakeholderId?: string; onClose: () => void }) {
  const st = useStakeholderStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const active = st.stakeholders.filter((s) => s.active)
  const owner = (sid: string) => st.stakeholders.find((s) => s.id === sid)
  const first = stakeholderId ?? active[0]?.id ?? ''
  const [f, setF] = useState<LogInput>({ stakeholderId: first, happenedOn: todayIso(), kind: 'meeting', subject: '', summary: '', attendees: '', sentiment: 'neutral', nextAction: '', nextDue: null, nextOwner: owner(first)?.owner ?? '', nextOwnerEmail: owner(first)?.ownerEmail ?? '' })
  const [busy, setBusy] = useState(false)
  const up = <K extends keyof LogInput>(k: K, v: LogInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.subject.trim() || !f.stakeholderId) return
    setBusy(true)
    const ok = await st.addLog(f, email)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal title="ثبت تعامل با ذینفع" onClose={onClose}
      foot={<><button type="button" className="sh-btn is-ghost" onClick={onClose}>انصراف</button><button type="button" className="sh-btn is-primary" onClick={save} disabled={busy || !f.subject.trim() || !f.stakeholderId}>{busy ? <Loader2 size={14} className="sh-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />} ثبت</button></>}>
      {st.error && <p className="sh-err">{st.error}</p>}
      <div className="sh-form-grid">
        <Field label="ذینفع *"><select value={f.stakeholderId} onChange={(e) => { const o = owner(e.target.value); setF((x) => ({ ...x, stakeholderId: e.target.value, nextOwner: x.nextOwner || o?.owner || '', nextOwnerEmail: x.nextOwnerEmail || o?.ownerEmail || '' })) }}>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="تاریخ"><ShamsiDate value={f.happenedOn} onChange={(v) => up('happenedOn', v || todayIso())} label="تاریخ تعامل" /></Field>
        <Field label="نوع تعامل"><select value={f.kind} onChange={(e) => up('kind', e.target.value as EngagementKind)}>{(Object.keys(KIND_FA) as EngagementKind[]).map((k) => <option key={k} value={k}>{KIND_FA[k]}</option>)}</select></Field>
        <Field label="نتیجه"><span className="sh-seg">{(Object.keys(SENTIMENT_FA) as Sentiment[]).map((k) => <button key={k} type="button" aria-pressed={f.sentiment === k} className={f.sentiment === k ? 'is-on' : ''} style={{ '--c': SENTIMENT_COLOR[k] } as CSSProperties} onClick={() => up('sentiment', k)}>{SENTIMENT_FA[k]}</button>)}</span></Field>
        <Field label="موضوع *" wide><input value={f.subject} onChange={(e) => up('subject', e.target.value)} /></Field>
        <Field label="خلاصه و نتایج" wide><textarea rows={3} value={f.summary} onChange={(e) => up('summary', e.target.value)} /></Field>
        <Field label="حاضران" wide><input value={f.attendees} onChange={(e) => up('attendees', e.target.value)} /></Field>
      </div>
      <h4 className="sh-form-h">اقدام بعدی</h4>
      <div className="sh-form-grid">
        <Field label="اقدام" wide><input value={f.nextAction} onChange={(e) => up('nextAction', e.target.value)} placeholder="مثلاً ارسال پاسخ مکتوب، برگزاری بازدید مشترک" /></Field>
        <Field label="مهلت"><ShamsiDate value={f.nextDue ?? ''} onChange={(v) => up('nextDue', v || null)} clearable disabled={!f.nextAction.trim()} label="مهلت اقدام" /></Field>
        <Field label="مسئول"><input value={f.nextOwner} onChange={(e) => up('nextOwner', e.target.value)} disabled={!f.nextAction.trim()} /></Field>
        <Field label="ایمیل مسئول" hint="پیگیری در کارتابل او نمایش داده می‌شود"><input value={f.nextOwnerEmail} onChange={(e) => up('nextOwnerEmail', e.target.value)} dir="ltr" disabled={!f.nextAction.trim()} /></Field>
      </div>
    </Modal>
  )
}

function ConcernForm({ id, stakeholderId, onClose }: { id?: string; stakeholderId?: string; onClose: () => void }) {
  const st = useStakeholderStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const cur = id ? st.concerns.find((c) => c.id === id) : undefined
  const active = st.stakeholders.filter((s) => s.active || s.id === stakeholderId)
  const sOwner = st.stakeholders.find((s) => s.id === (stakeholderId ?? active[0]?.id))
  const [f, setF] = useState<ConcernInput>(() => cur ? { ...cur } : {
    stakeholderId: stakeholderId ?? active[0]?.id ?? '', raisedOn: todayIso(), title: '', description: '', category: 'other', priority: 'medium', status: 'open',
    owner: sOwner?.owner ?? '', ownerEmail: sOwner?.ownerEmail ?? '', dueDate: null, resolution: '',
  })
  const [busy, setBusy] = useState(false)
  const up = <K extends keyof ConcernInput>(k: K, v: ConcernInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.title.trim() || !f.stakeholderId) return
    setBusy(true)
    const ok = await st.saveConcern(f, email, id)
    setBusy(false)
    if (ok) onClose()
  }
  const done = f.status === 'resolved' || f.status === 'closed'
  return (
    <Modal title={id ? 'ویرایش نگرانی' : 'ثبت نگرانی یا انتظار ذینفع'} onClose={onClose}
      foot={<><button type="button" className="sh-btn is-ghost" onClick={onClose}>انصراف</button><button type="button" className="sh-btn is-primary" onClick={save} disabled={busy || !f.title.trim() || !f.stakeholderId || (done && !f.resolution.trim())}>{busy ? <Loader2 size={14} className="sh-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />} ذخیره</button></>}>
      {st.error && <p className="sh-err">{st.error}</p>}
      <div className="sh-form-grid">
        <Field label="ذینفع *"><select value={f.stakeholderId} onChange={(e) => up('stakeholderId', e.target.value)} disabled={!!id}>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="تاریخ طرح"><ShamsiDate value={f.raisedOn} onChange={(v) => up('raisedOn', v || todayIso())} label="تاریخ طرح" /></Field>
        <Field label="عنوان *" wide><input value={f.title} onChange={(e) => up('title', e.target.value)} /></Field>
        <Field label="شرح" wide><textarea rows={3} value={f.description} onChange={(e) => up('description', e.target.value)} /></Field>
        <Field label="موضوع"><select value={f.category} onChange={(e) => up('category', e.target.value as ConcernCategory)}>{(Object.keys(CONCERN_CAT_FA) as ConcernCategory[]).map((k) => <option key={k} value={k}>{CONCERN_CAT_FA[k]}</option>)}</select></Field>
        <Field label="اولویت"><select value={f.priority} onChange={(e) => up('priority', e.target.value as ConcernPriority)}>{(Object.keys(PRIORITY_FA) as ConcernPriority[]).map((k) => <option key={k} value={k}>{PRIORITY_FA[k]}</option>)}</select></Field>
        <Field label="وضعیت"><select value={f.status} onChange={(e) => up('status', e.target.value as ConcernStatus)}>{(Object.keys(CONCERN_STATUS_FA) as ConcernStatus[]).map((k) => <option key={k} value={k}>{CONCERN_STATUS_FA[k]}</option>)}</select></Field>
        <Field label="مهلت پاسخ"><ShamsiDate value={f.dueDate ?? ''} onChange={(v) => up('dueDate', v || null)} clearable label="مهلت پاسخ" /></Field>
        <Field label="مسئول پیگیری"><input value={f.owner} onChange={(e) => up('owner', e.target.value)} /></Field>
        <Field label="ایمیل مسئول"><input value={f.ownerEmail} onChange={(e) => up('ownerEmail', e.target.value)} dir="ltr" /></Field>
        <Field label={done ? 'پاسخ یا اقدام انجام‌شده *' : 'پاسخ یا اقدام انجام‌شده'} wide hint={done ? 'برای رفع یا بستن نگرانی، پاسخ داده‌شده را بنویسید' : undefined}><textarea rows={2} value={f.resolution} onChange={(e) => up('resolution', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

export default StakeholdersApp
