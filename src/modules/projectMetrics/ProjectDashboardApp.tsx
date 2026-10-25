import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Calculator, Clock3, Coins, Gauge, HelpCircle, LayoutDashboard, Loader2, PieChart as PieIcon, Wallet } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useModuleStore, type ModuleKey } from '../../store/useModuleStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { loadProjectMetrics } from './projectMetricsLoader'
import type { ProjectMetrics, Slice } from './projectMetricsCore'
import './projectDashboard.css'

const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${fa(v, d)}٪`)
const idx = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : fa(v, 2))
/** rial → billion rial, the unit every money figure on the page uses */
const bn = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : fa(v / 1e9, Math.abs(v) >= 1e12 ? 0 : 1))
const jMonth = (iso: string) => formatJalali(iso).slice(0, 7)

const C = { planned: '#3b82f6', earned: '#22c55e', cost: '#a855f7', spi: '#14b8a6', cpi: '#f59e0b', tcpi: '#f43f5e' }
const PIE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#84cc16', '#64748b']
const RISK_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' }

/**
 * داشبورد پروژه — the project's headline picture in one page. Every number comes from projectMetrics (the lifecycle engine
 * over the master plan, the EPC modules for the execution phase, the finance module for money), the same computations
 * the radar, Stage-Gate and each module show.
 */
export function ProjectDashboardApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const [m, setM] = useState<ProjectMetrics | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll()
  }, [])
  useEffect(() => {
    if (!projectId) return
    let alive = true
    setM(undefined); setErr(null)
    loadProjectMetrics(projectId).then((x) => { if (alive) setM(x) }).catch((e) => { if (alive) { setErr(String(e?.message ?? e)); setM(null) } })
    return () => { alive = false }
  }, [projectId])

  return (
    <div className="pdb" dir="rtl">
      <header className="pdb-top">
        <div className="pdb-brand">
          <span className="pdb-brand-ico"><LayoutDashboard size={18} /></span>
          <span>
            <b>داشبورد پروژه</b>
            <small>{project?.officialName ?? '—'}</small>
          </span>
        </div>
        <div className="pdb-top-end">
          {m && <span className="pdb-date"><CalendarDays size={14} aria-hidden /> تاریخ داده: <b>{formatJalali(m.asOf)}</b></span>}
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>
      {!projectId ? <Empty text="ابتدا از رادار پروژه یک پروژه را انتخاب کنید." />
        : m === undefined ? <Skeleton />
        : m === null ? <Empty text={err ? `خطا در خواندن داده‌ها: ${err}` : 'چرخهٔ عمر این پروژه خوانده نشد.'} />
        : <Body m={m} />}
    </div>
  )
}

function Body({ m }: { m: ProjectMetrics }) {
  const e = m.evm
  const spark = useMemo(() => m.curve.filter((c) => c.earned != null), [m.curve])
  const spiSeries = spark.map((c) => (c.planned > 0 ? (c.earned as number) / c.planned : null))
  const cpiSeries = spark.map((c) => (c.cost && c.cost > 0 ? (c.earned as number) / c.cost : null))
  const noPlan = !m.phases.some((p) => p.start && p.finish)
  return (
    <main className="pdb-main">
      {noPlan && (
        <div className="pdb-note"><AlertTriangle size={15} aria-hidden /> برای این پروژه هنوز مستر پلن (بازه‌های فازها) در «برنامه‌ریزی ← مستر پلن چرخه عمر» تعریف نشده؛ درصد برنامه‌ای تا تعریف آن برابر واقعی فرض می‌شود.</div>
      )}
      <section className="pdb-kpis" aria-label="شاخص‌های پیشرفت و عملکرد">
        <Kpi label="پیشرفت برنامه‌ای" en="Planned %" value={pct(m.planned, 2)} color={C.planned} help="میانگین وزنی پیشرفت برنامه‌ای فازهای چرخهٔ عمر؛ فازهای غیر EPC از مستر پلن، فاز EPC از برنامهٔ ماژول‌ها" visual={<Ring v={m.planned} color={C.planned} />} />
        <Kpi label="پیشرفت واقعی (کسب‌شده)" en="Earned %" value={pct(m.earned, 2)} color={C.earned} help="میانگین وزنی پیشرفت واقعی فازها — همان عدد رادار و چرخهٔ عمر" visual={<Ring v={m.earned} color={C.earned} />} />
        <Kpi label="هزینهٔ واقعی" en="Actual cost %" value={pct(m.costPct, 2)} color={C.cost} help="کارکرد تأییدشدهٔ قراردادها تا امروز ÷ بودجهٔ پروژه (BAC)" visual={<Ring v={m.costPct ?? 0} color={C.cost} />} />
        <Kpi label="شاخص عملکرد زمانی" en="SPI" value={idx(e.spi)} color={C.spi} tone={tone(e.spi)} help="پیشرفت واقعی ÷ پیشرفت برنامه‌ای" visual={<Spark values={spiSeries} color={C.spi} />} />
        <Kpi label="شاخص عملکرد هزینه" en="CPI" value={idx(e.cpi)} color={C.cpi} tone={tone(e.cpi)} help="ارزش کسب‌شده (BAC × پیشرفت واقعی) ÷ هزینهٔ واقعی (کارکرد تأییدشده)" visual={<Spark values={cpiSeries} color={C.cpi} />} />
        <Kpi label="شاخص لازم برای تکمیل" en="TCPI" value={idx(e.tcpi)} color={C.tcpi} tone={e.tcpi == null ? undefined : e.tcpi <= 1 ? 'good' : e.tcpi <= 1.1 ? 'warn' : 'bad'} help="(BAC − EV) ÷ (BAC − AC): کارایی هزینه‌ای لازم برای ماندن در بودجه" visual={<Spark values={spark.map((c) => c.cost)} color={C.tcpi} />} />
      </section>

      <section className="pdb-row pdb-row-2">
        <Panel title="منحنی S" sub="برنامه‌ای، کسب‌شده و هزینهٔ واقعی (٪ تجمعی)" icon={<Gauge size={15} />}>
          <SCurve m={m} />
        </Panel>
        <Panel title="پیشرفت هفتگی" sub="ده هفتهٔ اخیر — برنامه‌ای در برابر کسب‌شده" icon={<Clock3 size={15} />}>
          <Weekly m={m} />
        </Panel>
      </section>

      <section className="pdb-money" aria-label="ارزش کسب‌شده (میلیارد ریال)">
        <Money label="بودجهٔ تکمیل" en="BAC" value={bn(e.bac)} icon={<Wallet size={18} />} sub={e.bacSource === 'budget' ? 'بودجهٔ مصوب ماژول مالی' : e.bacSource === 'contracts' ? 'ارزش جاری قراردادها' : e.bacSource === 'master' ? 'مبلغ قرارداد در اطلاعات پایه' : 'ثبت نشده'} />
        <Money label="برآورد هزینهٔ تمام‌شده" en="EAC" value={bn(e.eac)} icon={<Calculator size={18} />} sub="BAC ÷ CPI" />
        <Money label="انحراف هزینه" en="CV" value={bn(e.cv)} signed={e.cv} sub="EV − AC" />
        <Money label="انحراف زمان" en="SV" value={bn(e.sv)} signed={e.sv} sub="EV − PV" />
        <Money label="هزینهٔ باقی‌مانده" en="ETC" value={bn(e.etc)} icon={<Clock3 size={18} />} sub="EAC − AC" />
        <Money label="انحراف در پایان" en="VAC" value={bn(e.vac)} signed={e.vac} sub="BAC − EAC" />
      </section>

      <section className="pdb-row pdb-row-4">
        <Panel title="تفکیک هزینهٔ واقعی" sub="کارکرد تأییدشده به تفکیک نوع قرارداد" icon={<Coins size={15} />}>
          <Donut data={m.costBreakdown} unit="bn" empty="هنوز کارکردی تأیید نشده است." />
        </Panel>
        <Panel title="تفکیک کار EPC" sub="وزن و پیشرفت مهندسی، تدارکات و اجرا" icon={<PieIcon size={15} />}>
          <EpcBreakdown m={m} />
        </Panel>
        <Panel title="وضعیت ریسک‌ها" sub="ریسک‌های فعال به تفکیک سطح" icon={<AlertTriangle size={15} />}>
          <Donut data={m.risks} colors={m.risks.map((r) => RISK_COLOR[r.key] ?? '#64748b')} empty="ریسک فعالی ثبت نشده است." />
        </Panel>
        <Panel title="علل اصلی تأخیر" sub="ساعات توقف ثبت‌شده در گزارش‌های روزانه" icon={<Clock3 size={15} />}>
          <Reasons data={m.delays} />
        </Panel>
      </section>

      <Panel title="فازهای چرخهٔ عمر" sub="فازهای غیر EPC با مستر پلن کنترل می‌شوند؛ فاز EPC برنامه و پیشرفتش را از ماژول‌ها می‌گیرد" icon={<CalendarDays size={15} />}>
        <Phases m={m} />
      </Panel>

      <details className="pdb-how">
        <summary><HelpCircle size={14} aria-hidden /> نحوهٔ محاسبه</summary>
        <ul>
          <li>پیشرفت پروژه = میانگین وزنی فازهای چرخهٔ عمر (وزن هر فاز در مستر پلن؛ بدون وزن، سهم مساوی). همین عدد در رادار، کارت پروژه، چرخهٔ عمر و ماژول مالی نمایش داده می‌شود.</li>
          <li>فازهای غیر EPC: واقعی از درصد فعالیت‌های مستر پلن (طراحی پایه از درصد ثبت‌شده)، برنامه‌ای از بازهٔ برنامه‌ای فاز.</li>
          <li>فاز EPC: مهندسی از مدارک (تهیه و تأیید وزنی)، تدارکات از مراحل تأمین کالا (ارزش‌محور)، اجرا از کارکرد تأییدشدهٔ گزارش‌های روزانه؛ با وزن‌های E/P/C فرم «اطلاعات پایه پروژه» (یا سهم مساوی).</li>
          <li>EV = BAC × پیشرفت واقعی، PV = BAC × پیشرفت برنامه‌ای، AC = کارکرد تأییدشدهٔ قراردادها تا امروز. مبالغ به میلیارد ریال.</li>
          <li>منحنی گذشته: فاز EPC از تاریخ‌های ثبت‌شده در ماژول‌ها بازسازی می‌شود؛ سایر فازها از تاریخ شروع و پایان واقعی (یا سابقهٔ درصد طراحی پایه).</li>
        </ul>
      </details>
    </main>
  )
}

type Tone = 'good' | 'warn' | 'bad'
const tone = (v: number | null): Tone | undefined => (v == null ? undefined : v >= 1 ? 'good' : v >= 0.9 ? 'warn' : 'bad')

function Kpi({ label, en, value, color, visual, help, tone: t }: { label: string; en: string; value: string; color: string; visual: ReactNode; help: string; tone?: Tone }) {
  return (
    <article className={`pdb-kpi ${t ? `is-${t}` : ''}`} style={{ '--ac': color } as CSSProperties} title={help}>
      <div className="pdb-kpi-text">
        <span className="pdb-kpi-en" dir="ltr">{en}</span>
        <span className="pdb-kpi-label">{label}</span>
        <b className="pdb-kpi-value">{value}</b>
      </div>
      <div className="pdb-kpi-vis" aria-hidden>{visual}</div>
    </article>
  )
}

function Ring({ v, color }: { v: number; color: string }) {
  const r = 22, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, v)) / 100
  return (
    <svg viewBox="0 0 56 56" className="pdb-ring">
      <circle cx="28" cy="28" r={r} className="pdb-ring-track" />
      <circle cx="28" cy="28" r={r} stroke={color} strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 28 28)" className="pdb-ring-fill" />
    </svg>
  )
}

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((x): x is readonly [number, number] => x[1] != null && Number.isFinite(x[1]))
  if (pts.length < 2) return <span className="pdb-spark-empty">—</span>
  const ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1
  const n = values.length - 1 || 1
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${(i / n) * 96 + 2},${38 - ((v - lo) / span) * 34}`).join(' ')
  return <svg viewBox="0 0 100 40" className="pdb-spark" preserveAspectRatio="none"><path d={d} stroke={color} /></svg>
}

function Money({ label, en, value, sub, icon, signed }: { label: string; en: string; value: string; sub: string; icon?: ReactNode; signed?: number | null }) {
  const neg = signed != null && signed < 0, pos = signed != null && signed > 0
  return (
    <article className={`pdb-money-card ${neg ? 'is-bad' : pos ? 'is-good' : ''}`} title={sub}>
      <span className="pdb-money-en" dir="ltr">{en}</span>
      <span className="pdb-money-label">{label}</span>
      <b className="pdb-money-value">{value}<small> میلیارد ریال</small></b>
      <span className="pdb-money-ico" aria-hidden>{signed != null ? (neg ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />) : icon}</span>
    </article>
  )
}

function Panel({ title, sub, icon, children }: { title: string; sub?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="pdb-panel">
      <header className="pdb-panel-head">
        <span className="pdb-panel-ico" aria-hidden>{icon}</span>
        <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
      </header>
      {children}
    </section>
  )
}

const tip = { contentStyle: { background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 12, direction: 'rtl' as const }, labelStyle: { color: 'var(--text-primary)', fontWeight: 800 } }

function SCurve({ m }: { m: ProjectMetrics }) {
  const data = m.curve.map((c) => ({ ...c, label: jMonth(c.date) }))
  const todayLabel = jMonth(m.asOf)
  if (data.length < 2) return <p className="pdb-empty-sm">برای رسم منحنی، بازه‌های مستر پلن یا برنامهٔ ماژول‌ها لازم است.</p>
  return (
    <div className="pdb-chart" dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="pdb-earned" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.earned} stopOpacity={0.28} /><stop offset="100%" stopColor={C.earned} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-soft)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${v}%`} />
          <Tooltip {...tip} formatter={(v, n) => [pct(Number(v)), n === 'planned' ? 'برنامه‌ای' : n === 'earned' ? 'کسب‌شده' : 'هزینهٔ واقعی']} labelFormatter={(l) => `${l}${l === todayLabel ? ' (امروز)' : ''}`} />
          <Line type="monotone" dataKey="planned" stroke={C.planned} strokeWidth={2.2} dot={false} />
          <Area type="monotone" dataKey="earned" stroke={C.earned} strokeWidth={2.4} fill="url(#pdb-earned)" dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="cost" stroke={C.cost} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend items={[['برنامه‌ای', C.planned], ['کسب‌شده', C.earned], ['هزینهٔ واقعی', C.cost]]} />
    </div>
  )
}

function Weekly({ m }: { m: ProjectMetrics }) {
  const data = m.weekly.map((w) => ({ ...w, label: formatJalali(w.from).slice(5) }))
  return (
    <div className="pdb-chart" dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke="var(--border-soft)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
          <Tooltip {...tip} formatter={(v, n) => [pct(Number(v), 2), n === 'planned' ? 'برنامه‌ای' : 'کسب‌شده']} labelFormatter={(l) => `هفتهٔ ${l}`} />
          <Bar dataKey="planned" fill={C.planned} radius={[4, 4, 0, 0]} />
          <Bar dataKey="earned" fill={C.earned} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Legend items={[['برنامه‌ای', C.planned], ['کسب‌شده', C.earned]]} />
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return <div className="pdb-legend" dir="rtl">{items.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
}

function Donut({ data, colors, unit, empty }: { data: Slice[]; colors?: string[]; unit?: 'bn'; empty: string }) {
  const total = data.reduce((s, x) => s + x.value, 0)
  if (!total) return <p className="pdb-empty-sm">{empty}</p>
  const col = (i: number) => colors?.[i] ?? PIE[i % PIE.length]
  return (
    <div className="pdb-donut">
      <div className="pdb-donut-chart" dir="ltr">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="56%" outerRadius="92%" paddingAngle={1.5} stroke="none">
              {data.map((d, i) => <Cell key={d.key} fill={col(i)} />)}
            </Pie>
            <Tooltip {...tip} formatter={(v, n) => [unit === 'bn' ? `${bn(Number(v))} میلیارد ریال` : fa(Number(v)), String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pdb-donut-total">{unit === 'bn' ? bn(total) : fa(total)}<small>{unit === 'bn' ? 'میلیارد' : 'مورد'}</small></span>
      </div>
      <ul className="pdb-donut-legend">
        {data.map((d, i) => (
          <li key={d.key}><i style={{ background: col(i) }} /><span>{d.label}</span><b>{fa((d.value / total) * 100)}٪</b></li>
        ))}
      </ul>
    </div>
  )
}

function EpcBreakdown({ m }: { m: ProjectMetrics }) {
  const rows = ([['engineering', 'مهندسی', m.epc.eng, m.epc.weights.e], ['material', 'تدارکات', m.epc.proc, m.epc.weights.p], ['execution', 'اجرا', m.epc.cons, m.epc.weights.c]] as const)
  const tw = rows.reduce((s, [, , d, w]) => s + (d ? w : 0), 0) || 1
  if (!rows.some(([, , d]) => d)) return <p className="pdb-empty-sm">ماژول‌های مهندسی، کالا و اجرا هنوز داده‌ای برای این پروژه ندارند.</p>
  const open = (k: ModuleKey) => useModuleStore.getState().enterModule(k, 'project')
  return (
    <div className="pdb-epc">
      {rows.map(([key, label, d, w]) => (
        <button type="button" key={key} className="pdb-epc-row" onClick={() => open(key)} disabled={!d} title={d ? `رفتن به ماژول ${label}` : 'بدون داده در ماژول'}>
          <span className="pdb-epc-head"><b>{label}</b><small>وزن {d ? fa((w / tw) * 100) : '—'}٪</small><em>{d ? pct(d.actual) : '—'}</em></span>
          <span className="pdb-bar">
            {d?.planned != null && <span className="pdb-bar-plan" style={{ width: `${Math.min(100, d.planned)}%` }} />}
            {d && <span className="pdb-bar-act" style={{ width: `${Math.min(100, d.actual)}%` }} />}
          </span>
          <small className="pdb-epc-plan">{d ? `برنامه ${pct(d.planned)}` : 'بدون داده'}</small>
        </button>
      ))}
      {m.epc.overall && <p className="pdb-epc-total">پیشرفت وزنی EPC: <b>{pct(m.epc.overall.actual)}</b> · برنامه {pct(m.epc.overall.planned)}</p>}
    </div>
  )
}

function Reasons({ data }: { data: Slice[] }) {
  const total = data.reduce((s, x) => s + x.value, 0)
  if (!total) return <p className="pdb-empty-sm">توقفی در گزارش‌های روزانه ثبت نشده است.</p>
  return (
    <ol className="pdb-reasons">
      {data.slice(0, 6).map((d, i) => (
        <li key={d.key}>
          <span className="pdb-reason-n">{fa(i + 1)}</span>
          <span className="pdb-reason-l">{d.label}</span>
          <span className="pdb-bar is-thin"><span className="pdb-bar-act" style={{ width: `${(d.value / data[0].value) * 100}%`, background: PIE[i % PIE.length] }} /></span>
          <b>{fa((d.value / total) * 100)}٪</b>
        </li>
      ))}
      <li className="pdb-reason-foot">جمع {fa(total)} ساعت توقف</li>
    </ol>
  )
}

function Phases({ m }: { m: ProjectMetrics }) {
  const open = (k: ModuleKey) => useModuleStore.getState().enterModule(k, 'project')
  return (
    <div className="pdb-table-wrap">
      <table className="pdb-table">
        <thead>
          <tr><th>فاز</th><th>منبع</th><th>وزن</th><th>بازهٔ برنامه</th><th>برنامه‌ای</th><th>واقعی</th><th>انحراف</th></tr>
        </thead>
        <tbody>
          {m.phases.map((p) => {
            const dev = p.actual - p.planned
            return (
              <tr key={p.code} className={`is-${p.state}`}>
                <td><span className="pdb-code" dir="ltr">{p.code}</span> {p.title}</td>
                <td>
                  <button type="button" className="pdb-src" onClick={() => open(p.engine === 'epc' ? 'execution' : 'scheduling')}>
                    {p.engine === 'epc' ? 'ماژول‌های EPC' : p.engine === 'basic_design' ? 'مستر پلن (طراحی پایه)' : 'مستر پلن'}
                  </button>
                </td>
                <td>{fa(p.weight, 1)}٪</td>
                <td className="pdb-nowrap">{p.start && p.finish ? `${formatJalali(p.start)} ← ${formatJalali(p.finish)}` : '—'}</td>
                <td>{pct(p.planned)}</td>
                <td>
                  <span className="pdb-cell-bar"><span style={{ width: `${Math.min(100, p.actual)}%` }} /></span>
                  {pct(p.actual)}
                </td>
                <td className={dev < -0.5 ? 'is-bad' : dev > 0.5 ? 'is-good' : ''}>{dev > 0 ? '+' : ''}{pct(dev)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>کل پروژه (وزنی)</td><td>{pct(m.planned)}</td><td>{pct(m.earned)}</td><td className={m.earned - m.planned < -0.5 ? 'is-bad' : 'is-good'}>{m.earned - m.planned > 0 ? '+' : ''}{pct(m.earned - m.planned)}</td></tr>
        </tfoot>
      </table>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <main className="pdb-main"><div className="pdb-empty"><LayoutDashboard size={26} aria-hidden /><p>{text}</p></div></main>
}

function Skeleton() {
  return (
    <main className="pdb-main" aria-busy="true">
      <p className="pdb-loading"><Loader2 size={16} className="animate-spin" aria-hidden /> در حال محاسبه از چرخهٔ عمر، ماژول‌های EPC و مالی…</p>
      <section className="pdb-kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pdb-kpi pdb-skel" />)}</section>
      <section className="pdb-row pdb-row-2"><div className="pdb-panel pdb-skel is-tall" /><div className="pdb-panel pdb-skel is-tall" /></section>
    </main>
  )
}
