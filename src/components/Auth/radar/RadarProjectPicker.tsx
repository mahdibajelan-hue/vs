import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, CalendarCheck2, Layers, MapPin, Radar as RadarIcon, Search, Clock, Waypoints, Gauge, FlaskConical, Database, Cpu, Network, Factory, TrendingUp, TrendingDown, Minus, Hourglass, Activity, type LucideIcon } from 'lucide-react'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE, type MasterProject } from '../../../modules/masterdata/types'
import { formatJalali } from '../../../lib/jalali'
import { orderProjects, projectEnd, recentProjects, timeElapsed } from './projectNav'
import { loadPickerProgress } from './pickerProgress'
import { ModuleHeaderActions } from '../../common/ModuleHeaderActions'
import { syncRecentFromServer } from './projectVisits'
import type { PickerProgress } from './pickerProgressCore'

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
  // visit order: the local copy at once, then the server's (all devices) when it arrives
  const [recentIds, setRecentIds] = useState<string[]>(() => recentProjects())
  useEffect(() => { let alive = true; void syncRecentFromServer().then((ids) => { if (alive) setRecentIds(ids) }); return () => { alive = false } }, [])
  const recent = useMemo(() => new Set(recentIds.slice(0, 3)), [recentIds])
  // lifecycle progress per project (Stage-Gate); undefined while loading, a map (possibly empty) once known
  const [progress, setProgress] = useState<Map<string, PickerProgress> | undefined>(undefined)
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  useEffect(() => {
    let alive = true
    loadPickerProgress(projectIds, (m) => { if (alive) setProgress(m) }).then((m) => { if (alive) setProgress(m) }).catch(() => { if (alive) setProgress((m) => m ?? new Map()) })
    return () => { alive = false }
  }, [projectIds])

  const ordered = useMemo(() => orderProjects(projects, recentIds), [projects, recentIds])
  const usedPortfolios = portfolios.filter((p) => projects.some((x) => x.portfolioId === p.id))
  const needle = q.trim()
  const list = ordered.filter((p) => (!pf || p.portfolioId === pf) && (!needle || [p.officialName, p.shortName, p.projectCode, p.projectIdCode, p.location].some((v) => v?.includes(needle))))
  const nameOf = (arr: { id: string; name: string }[], id: string | null) => (id ? arr.find((x) => x.id === id)?.name ?? '' : '')

  return (
    <div dir="rtl" className="rpk-shell">
      <div className="radar-page-texture" aria-hidden="true" />
      {/* the same shortcut bar as every module (inbox, search, theme, home) */}
      <header className="rpk-top">
        <span className="rpk-brand"><span className="rpk-brand-ico"><RadarIcon size={18} /></span><span><b>رادار پروژه‌ها</b><small>انتخاب پروژه</small></span></span>
        <ModuleHeaderActions onExitToHub={onBack} hideModuleHome />
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
              progress={progress === undefined ? 'loading' : progress.get(p.id) ?? null}
              portfolio={nameOf(portfolios, p.portfolioId)} program={nameOf(programs, p.programId)}
              onHover={setHot} onPick={onPick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** What kind of asset the project builds — gives each card its own icon and hue. Read from the project's category
 * (master data); the name is only a fallback when the category is empty. The label shown is the category itself. */
const KINDS: { re: RegExp; icon: LucideIcon; hue: string; label: string }[] = [
  { re: /SCADA|پایش|هوشمند|سامانه|نشت/, icon: Cpu, hue: '#f472b6', label: 'پایش هوشمند' },
  { re: /خط لوله|خطوط لوله|انتقال گاز/, icon: Waypoints, hue: '#22d3ee', label: 'خط لوله' },
  { re: /تقویت فشار|ایستگاه/, icon: Gauge, hue: '#a78bfa', label: 'ایستگاه' },
  { re: /شیرین|پالایش|فرآورش|گوگرد|واحد/, icon: FlaskConical, hue: '#fbbf24', label: 'فرآورش' },
  { re: /مخزن|مخازن|ذخیره/, icon: Database, hue: '#fb923c', label: 'ذخیره‌سازی' },
  { re: /توزیع|شبکه/, icon: Network, hue: '#60a5fa', label: 'شبکهٔ توزیع' },
]
const OTHER = { icon: Factory, hue: '#34d399', label: 'تأسیسات' }
function kindOf(p: MasterProject) {
  const cat = p.projectCategory?.trim()
  if (cat) return { ...(KINDS.find((k) => k.re.test(cat)) ?? OTHER), label: cat }
  return KINDS.find((k) => k.re.test(p.officialName)) ?? OTHER
}

function ProjectCard({ p, index, recent, portfolio, program, progress, onHover, onPick }: {
  p: MasterProject; index: number; recent: boolean; portfolio: string; program: string
  progress: PickerProgress | null | 'loading'
  onHover: (id: string | null) => void; onPick: (id: string) => void
}) {
  const tone = TONE[PROJECT_STATUS_TONE[p.status] ?? 'neutral']
  const used = timeElapsed(p)
  const end = projectEnd(p)
  const code = p.projectIdCode || p.projectCode
  const prog = progress === 'loading' ? null : progress
  const kind = kindOf(p)
  const Icon = kind.icon
  return (
    <button
      type="button"
      className="rpk-card"
      style={{ '--tone': tone, '--hue': kind.hue, animationDelay: `${Math.min(index, 12) * 35}ms` } as CSSProperties}
      onClick={() => onPick(p.id)}
      onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)} onBlur={() => onHover(null)}
      aria-label={`${p.officialName}${prog ? ` — ${prog.mode === 'epc' ? 'پیشرفت EPC' : 'پیشرفت چرخهٔ عمر'} ${faNum(prog.pct)}٪، فاز ${prog.phaseTitle}` : ''}`}
    >
      <span className="rpk-card-glow" aria-hidden />
      <span className="rpk-card-top">
        <span className="rpk-kind" title={kind.label}><Icon size={17} strokeWidth={2} aria-hidden /></span>
        <span className="rpk-status"><i aria-hidden />{PROJECT_STATUS_LABEL_FA[p.status] ?? p.status}</span>
        {recent && <span className="rpk-recent"><Clock size={11} aria-hidden /> اخیر</span>}
        {code && <span className="rpk-code" dir="ltr">{code}</span>}
      </span>
      <span className="rpk-card-body">
        <span className="rpk-card-main">
          <span className="rpk-kind-label">{kind.label}</span>
          <ProjectName name={p.officialName} />
          <span className="rpk-meta">
            {p.location && <span><MapPin size={12} aria-hidden />{p.location}</span>}
            {(portfolio || program) && <span><Layers size={12} aria-hidden />{[portfolio, program].filter(Boolean).join(' › ')}</span>}
          </span>
        </span>
        <GateDial progress={progress} elapsed={used} />
      </span>
      <span className="rpk-clock">
        {prog && prog.phaseActual != null && <PhaseBar title={prog.phaseTitle} code={prog.phaseCode} actual={prog.phaseActual} planned={prog.phasePlanned ?? prog.phaseActual} />}
        {used == null ? (
          <span className="text-muted">تاریخ‌های قرارداد هنوز ثبت نشده</span>
        ) : (
          <>
            <span className="rpk-clock-row">
              <span><Hourglass size={12} aria-hidden /> زمان سپری‌شدهٔ قرارداد</span>
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

/** The current phase's own progress: solid = actual, light fill + tick = planned; colour says ahead / behind. */
function PhaseBar({ title, code, actual, planned }: { title: string; code: string; actual: number; planned: number }) {
  const gap = actual - planned
  const tone = gap >= -5 ? '#10b981' : gap >= -20 ? '#f59e0b' : '#ef4444'
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return (
    <span className="rpk-phase" style={{ '--ph': tone } as CSSProperties}>
      <span className="rpk-clock-row">
        <span><Activity size={12} aria-hidden /> پیشرفت فاز <b className="rpk-phase-name">{title}</b> <i dir="ltr">{code}</i></span>
        <span className="rpk-phase-nums"><b>{faNum(actual)}٪</b> <small>برنامه {faNum(planned)}٪</small></span>
      </span>
      <span className="rpk-ptrack" title={`واقعی ${faNum(actual)}٪ — برنامه ${faNum(planned)}٪`}>
        <span className="rpk-ptrack-plan" style={{ width: `${clamp(planned)}%` }} />
        <span className="rpk-ptrack-act" style={{ width: `${clamp(actual)}%` }} />
        <span className="rpk-ptrack-tick" style={{ insetInlineStart: `${clamp(planned)}%` }} />
      </span>
    </span>
  )
}

const UNIT = /^(اینچ|کیلومتر|کیلوولت|مگاوات|متر|هکتار|تن|مترمکعب|میلیون|هزار)$/
/** The project's name as a title: figures and their unit lifted out in the accent, the section after a dash on its own line. */
function ProjectName({ name }: { name: string }) {
  const [main, ...rest] = name.split(/\s+[-–—]\s+/)
  const words = main.split(/\s+/)
  const parts: ReactNode[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    // only a measure (figure + unit, e.g. «۴۲ اینچ») is lifted out; bare numbers stay part of the text
    if (/^[0-9۰-۹.٫/]+$/.test(w) && words[i + 1] && UNIT.test(words[i + 1])) {
      parts.push(<b key={i} className="rpk-name-fig">{w}<small>{words[++i]}</small></b>)
    } else parts.push(<span key={i}>{w}</span>)
    if (i < words.length - 1) parts.push(' ')
  }
  return (
    <span className="rpk-name">
      <span className="rpk-name-main">{parts}</span>
      {rest.length > 0 && <span className="rpk-name-sec">{rest.join(' — ')}</span>}
    </span>
  )
}

// gate dial geometry: a 270° arc opening at the bottom, one segment per gate, G1 at the lower left
const DIAL = { c: 60, r: 46, from: 135, sweep: 270, gap: 4 }
const polar = (deg: number, r = DIAL.r) => {
  const a = (deg * Math.PI) / 180
  return [DIAL.c + r * Math.cos(a), DIAL.c + r * Math.sin(a)] as const
}
const arc = (a0: number, a1: number) => {
  const [x0, y0] = polar(a0), [x1, y1] = polar(a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${DIAL.r} ${DIAL.r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
/** one colour per gate along the lifecycle: definition violet → design/tender blue → execution amber → handover green */
const GATE_HUES = ['#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#22d3ee', '#fbbf24', '#fb923c', '#34d399', '#22c55e']
/** pace = lifecycle progress against the share of contract time spent */
function paceOf(pct: number, elapsed: number | null): { color: string; label: string; Icon: LucideIcon } {
  if (elapsed == null) return { color: '#38bdf8', label: 'بدون تاریخ قرارداد', Icon: Minus }
  const d = pct - elapsed
  if (d >= -5) return { color: '#22c55e', label: d > 5 ? `جلوتر ${faNum(Math.round(d))}٪` : 'مطابق زمان', Icon: d > 5 ? TrendingUp : Minus }
  return { color: d >= -20 ? '#f0a836' : '#f87171', label: `عقب ${faNum(Math.round(-d))}٪`, Icon: TrendingDown }
}

/** Counts up to `to` once (skipped under reduced motion). */
function useCountUp(to: number | null, ms = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (to == null) return
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return v
}

/** Gate dial: each Stage-Gate phase is one coloured arc segment filled by its own completion; the needle points at the
 * overall progress, the white tick marks how much contract time is spent, the badge below says ahead or behind. */
function GateDial({ progress, elapsed }: { progress: PickerProgress | null | 'loading'; elapsed: number | null }) {
  const loading = progress === 'loading'
  const prog = loading ? null : progress
  const segs = prog?.segments ?? Array.from({ length: 9 }, (_, i) => ({ code: `G${i + 1}`, pct: 0, state: 'upcoming' as const }))
  const step = DIAL.sweep / segs.length
  const shown = useCountUp(prog?.pct ?? null)
  const pace = prog ? paceOf(prog.pct, elapsed) : null
  const tickAt = elapsed == null ? null : DIAL.from + (DIAL.sweep * Math.min(100, Math.max(0, elapsed))) / 100
  const needleDeg = prog ? DIAL.from + (DIAL.sweep * prog.pct) / 100 : DIAL.from
  const curIdx = segs.findIndex((x) => x.state === 'current')
  const curHue = GATE_HUES[Math.max(0, curIdx)] ?? GATE_HUES[8]
  return (
    <span className={`rpk-dial ${loading ? 'is-loading' : ''} ${!prog && !loading ? 'is-empty' : ''}`} style={{ '--pace': pace?.color ?? 'var(--text-muted)', '--cur': curHue } as CSSProperties}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <radialGradient id="rpk-dial-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--cur)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--cur)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {prog && <circle cx={DIAL.c} cy={DIAL.c} r={36} fill="url(#rpk-dial-core)" className="rpk-dial-core" />}
        {segs.map((sg, i) => {
          const a0 = DIAL.from + i * step + DIAL.gap / 2
          const a1 = a0 + step - DIAL.gap
          const fillTo = a0 + ((a1 - a0) * sg.pct) / 100
          const hue = GATE_HUES[Math.round((i / Math.max(1, segs.length - 1)) * (GATE_HUES.length - 1))]
          return (
            <g key={sg.code} className={`rpk-seg is-${sg.state}`} style={{ '--seg': hue } as CSSProperties}>
              <path d={arc(a0, a1)} className="rpk-seg-track" />
              {sg.pct > 0 && <path d={arc(a0, fillTo)} pathLength={1} className="rpk-seg-fill" style={{ animationDelay: `${120 + i * 80}ms` }} />}
              <title>{`${sg.code}: ${faNum(sg.pct)}٪`}</title>
            </g>
          )
        })}
        {tickAt != null && (() => {
          const [x0, y0] = polar(tickAt, DIAL.r - 6), [x1, y1] = polar(tickAt, DIAL.r + 9)
          return <line x1={x0} y1={y0} x2={x1} y2={y1} className="rpk-dial-tick"><title>{`زمان سپری‌شدهٔ قرارداد: ${faNum(elapsed ?? 0)}٪`}</title></line>
        })()}
        {prog && (
          <g className="rpk-needle" style={{ '--to': `${needleDeg}deg` } as CSSProperties}>
            {/* a short pointer just inside the arc, clear of the number in the centre */}
            <line x1={DIAL.c + 28} y1={DIAL.c} x2={DIAL.c + DIAL.r - 9} y2={DIAL.c} />
            <circle cx={DIAL.c + DIAL.r - 9} cy={DIAL.c} r={2.6} />
          </g>
        )}
      </svg>
      <span className="rpk-dial-center">
        {prog ? (
          <>
            <b className="rpk-dial-pct">{faNum(shown)}<small>٪</small></b>
            <span className="rpk-dial-phase" dir="ltr">{prog.phaseCode}</span>
          </>
        ) : (
          <b className="rpk-dial-pct is-muted">{loading ? '' : '—'}</b>
        )}
      </span>
      <span className="rpk-dial-cap">{prog ? prog.phaseTitle : loading ? '\u00a0' : 'بدون دادهٔ چرخهٔ عمر'}</span>
      {pace && <span className="rpk-pace"><pace.Icon size={11} strokeWidth={2.5} aria-hidden />{pace.label}</span>}
    </span>
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
