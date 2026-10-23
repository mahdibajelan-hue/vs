import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, CalendarCheck2, Layers, MapPin, Radar as RadarIcon, Search, Clock } from 'lucide-react'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE, type MasterProject } from '../../../modules/masterdata/types'
import { formatJalali } from '../../../lib/jalali'
import { orderProjects, projectEnd, recentProjects, timeElapsed } from './projectNav'

const TONE: Record<'neutral' | 'green' | 'amber' | 'red', string> = { neutral: '#94a3b8', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }
const faNum = (n: number) => n.toLocaleString('fa-IR')
const faDate = (iso: string) => formatJalali(iso).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])

/**
 * ورودی رادار — the user names the project first; every module behind the radar then opens for that project only.
 * Cards show master-data facts only (status, place, portfolio, contract clock). The scope at the top plots the
 * same projects: angle = position in the list, distance from the centre = share of the contract time used.
 */
export function RadarProjectPicker({ onPick, onBack }: { onPick: (id: string) => void; onBack: () => void }) {
  const loaded = useMasterDataStore((s) => s.loaded)
  const projects = useMasterDataStore((s) => s.projects)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const [q, setQ] = useState('')
  const [pf, setPf] = useState<string | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const recent = useMemo(() => new Set(recentProjects()), [])

  const ordered = useMemo(() => orderProjects(projects), [projects])
  const usedPortfolios = portfolios.filter((p) => projects.some((x) => x.portfolioId === p.id))
  const needle = q.trim()
  const list = ordered.filter((p) => (!pf || p.portfolioId === pf) && (!needle || [p.officialName, p.shortName, p.projectCode, p.projectIdCode, p.location].some((v) => v?.includes(needle))))
  const nameOf = (arr: { id: string; name: string }[], id: string | null) => (id ? arr.find((x) => x.id === id)?.name ?? '' : '')

  return (
    <div dir="rtl" className="rpk-shell">
      <div className="radar-page-texture" aria-hidden="true" />
      <header className="rpk-top">
        <button type="button" onClick={onBack} className="rpk-back" title="بازگشت به صفحهٔ اصلی">
          <ArrowRight size={16} />
          <span>صفحهٔ اصلی</span>
        </button>
        <span className="rpk-brand"><RadarIcon size={16} /> رادار پروژه‌ها</span>
      </header>

      <section className="rpk-hero">
        <div className="rpk-hero-text">
          <p className="rpk-eyebrow">اتاق فرمان پروژه</p>
          <h1 className="rpk-title">روی کدام پروژه کار می‌کنید؟</h1>
          <p className="rpk-sub">پروژه را انتخاب کنید؛ رادار، برنامهٔ زمانی، مالی، ریسک، مسائل، کالا و اجرا همه برای همان پروژه باز می‌شوند. تعویض پروژه همیشه از بالای منوی کناری در دسترس است.</p>
          <div className="rpk-tools">
            <label className="rpk-search">
              <Search size={15} aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، کد یا محل پروژه" aria-label="جستجوی پروژه" />
            </label>
            {usedPortfolios.length > 1 && (
              <div className="rpk-chips" role="group" aria-label="فیلتر سبد پروژه">
                <button type="button" className={!pf ? 'is-on' : ''} onClick={() => setPf(null)}>همهٔ سبدها</button>
                {usedPortfolios.map((p) => (
                  <button type="button" key={p.id} className={pf === p.id ? 'is-on' : ''} onClick={() => setPf(p.id)}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <Scope projects={list} hot={hot} onPick={onPick} />
      </section>

      {!loaded && !projects.length ? (
        <div className="rpk-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="rpk-card is-skel" />)}</div>
      ) : !projects.length ? (
        <div className="rpk-empty">
          <Layers size={26} aria-hidden />
          <p className="font-bold">هنوز پروژه‌ای در اطلاعات پایه تعریف نشده است.</p>
          <p className="text-xs text-muted">پروژه‌ها از «مدیریت کاربران ← اطلاعات پایه ← پروژه‌ها» تعریف می‌شوند.</p>
        </div>
      ) : !list.length ? (
        <div className="rpk-empty"><p className="font-bold">پروژه‌ای با این جستجو پیدا نشد.</p></div>
      ) : (
        <div className="rpk-grid">
          {list.map((p, i) => (
            <ProjectCard
              key={p.id} p={p} index={i} recent={recent.has(p.id)}
              portfolio={nameOf(portfolios, p.portfolioId)} program={nameOf(programs, p.programId)}
              onHover={setHot} onPick={onPick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ p, index, recent, portfolio, program, onHover, onPick }: {
  p: MasterProject; index: number; recent: boolean; portfolio: string; program: string
  onHover: (id: string | null) => void; onPick: (id: string) => void
}) {
  const tone = TONE[PROJECT_STATUS_TONE[p.status] ?? 'neutral']
  const used = timeElapsed(p)
  const end = projectEnd(p)
  const code = p.projectIdCode || p.projectCode
  return (
    <button
      type="button"
      className="rpk-card"
      style={{ '--tone': tone, animationDelay: `${Math.min(index, 10) * 40}ms` } as CSSProperties}
      onClick={() => onPick(p.id)}
      onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)} onBlur={() => onHover(null)}
    >
      <span className="rpk-card-top">
        <span className="rpk-status"><i aria-hidden />{PROJECT_STATUS_LABEL_FA[p.status] ?? p.status}</span>
        {recent && <span className="rpk-recent"><Clock size={11} aria-hidden /> اخیر</span>}
        {code && <span className="rpk-code" dir="ltr">{code}</span>}
      </span>
      <span className="rpk-name">{p.officialName}</span>
      <span className="rpk-meta">
        {p.location && <span><MapPin size={12} aria-hidden />{p.location}</span>}
        {(portfolio || program) && <span><Layers size={12} aria-hidden />{[portfolio, program].filter(Boolean).join(' › ')}</span>}
      </span>
      <span className="rpk-clock">
        {used == null ? (
          <span className="text-muted">تاریخ‌های قرارداد هنوز ثبت نشده</span>
        ) : (
          <>
            <span className="rpk-clock-row">
              <span>زمان سپری‌شدهٔ قرارداد</span>
              <b>{faNum(used)}٪</b>
            </span>
            <span className="rpk-track"><span style={{ width: `${used}%` }} /></span>
          </>
        )}
        {end && <span className="rpk-end"><CalendarCheck2 size={12} aria-hidden /> پایان: {faDate(end)}</span>}
      </span>
      <span className="rpk-go">ورود به اتاق فرمان <ArrowLeft size={14} aria-hidden /></span>
    </button>
  )
}

/** The scope: rings, a sweep, and one blip per project — further out = more of its contract time spent. */
function Scope({ projects, hot, onPick }: { projects: MasterProject[]; hot: string | null; onPick: (id: string) => void }) {
  const R = 92
  const pts = projects.slice(0, 40).map((p, i, a) => {
    const ang = (i / Math.max(1, a.length)) * Math.PI * 2 - Math.PI / 2
    const used = timeElapsed(p)
    const r = 14 + ((used ?? 50) / 100) * (R - 20)
    return { p, x: 100 + Math.cos(ang) * r, y: 100 + Math.sin(ang) * r, c: TONE[PROJECT_STATUS_TONE[p.status] ?? 'neutral'], dim: used == null }
  })
  return (
    <div className="rpk-scope" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        {[R, R * 0.66, R * 0.33].map((r) => <circle key={r} cx="100" cy="100" r={r} className="rpk-ring" />)}
        <line x1="100" y1={100 - R} x2="100" y2={100 + R} className="rpk-ring" />
        <line x1={100 - R} y1="100" x2={100 + R} y2="100" className="rpk-ring" />
        {pts.map(({ p, x, y, c, dim }) => (
          <g key={p.id} className={`rpk-blip ${hot === p.id ? 'is-hot' : ''}`} onClick={() => onPick(p.id)} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
            <circle cx={x} cy={y} r={hot === p.id ? 9 : 6} fill={c} opacity={0.18} />
            <circle cx={x} cy={y} r={hot === p.id ? 4 : 2.6} fill={c} opacity={dim ? 0.5 : 1} />
          </g>
        ))}
      </svg>
      <div className="rpk-sweep" />
      <span className="rpk-scope-cap">فاصله از مرکز = زمان سپری‌شدهٔ قرارداد</span>
    </div>
  )
}
