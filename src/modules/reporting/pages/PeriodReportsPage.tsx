import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, Building2, CalendarCheck, CalendarDays, CalendarRange, ClipboardCheck, Factory, FileSpreadsheet, FileStack, Gavel, HardHat, HeartPulse,
  Loader2, Package, Presentation, Printer, ShieldAlert, ShieldCheck, TimerOff, TrendingUp, Truck, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { BarList, Columns, Donut, Gauge, KpiTile, SideSheet, Spark } from '../../executive/components/viz'
import { buildExecutiveSummary, buildSiteReport, shiftPeriod, type Chart, type DetailTable, type PeriodKind, type PeriodReport, type Tile, type Tone } from '../lib/periodReportCore'
import { latestReportDate, loadSiteInput } from '../lib/periodReportLoader'
import type { ProjectFacts } from '../lib/analyticsCore'
import { FactsGate, ScopeBar, inScope, type Scope } from '../components/rpx'
import './periodReports.css'

type Kind = PeriodKind | 'executive'
const ICON: Record<string, LucideIcon> = { TrendingUp, Factory, ClipboardCheck, Users, Truck, TimerOff, ShieldCheck, FileStack, Package, Wallet, AlertTriangle, Gavel, CalendarCheck, HeartPulse, Activity, ShieldAlert, Building2 }
const TONE_C: Record<Tone, string> = { bad: '#f43f5e', warn: '#f59e0b', good: '#22c55e', none: '#64748b' }
const TONE_FA: Record<Tone, string> = { bad: 'نیازمند اقدام', warn: 'زیر نظر', good: 'مطلوب', none: 'بدون داوری' }
const KINDS: { key: Kind; title: string; sub: string; icon: LucideIcon; color: string }[] = [
  { key: 'daily', title: 'گزارش روزانهٔ کارگاه', sub: 'تولید، احجام کار، نفرات، ماشین‌آلات، توقفات، کیفیت و کالا در یک روز', icon: HardHat, color: '#0ea5e9' },
  { key: 'weekly', title: 'گزارش هفتگی', sub: 'روند روزبه‌روز هفته با مالی، تصمیم‌ها و مقایسه با هفتهٔ قبل', icon: CalendarDays, color: '#14b8a6' },
  { key: 'monthly', title: 'گزارش ماهانه', sub: 'همهٔ بخش‌های پروژه در ماه شمسی، با پیشرفت، مالی، مهندسی و تأمین', icon: CalendarRange, color: '#6366f1' },
  { key: 'executive', title: 'خلاصهٔ مدیریتی', sub: 'سلامت، پیشرفت، هزینه، تصمیم‌ها و ریسک همهٔ پروژه‌های محدوده', icon: Presentation, color: '#ec4899' },
]
const todayIso = () => new Date().toISOString().slice(0, 10)

/** the four periodic reports: a graphic first page of section tiles; each tile opens the tables behind it */
export function PeriodReportsPage({ initialProject, initialKind = 'daily' }: { initialProject: string | null; initialKind?: string }) {
  return <FactsGate>{(all) => <Reports all={all} initialProject={initialProject} initialKind={(KINDS.some((k) => k.key === initialKind) ? initialKind : 'daily') as Kind} />}</FactsGate>
}

function Reports({ all, initialProject, initialKind }: { all: ProjectFacts[]; initialProject: string | null; initialKind: Kind }) {
  const projects = useMasterDataStore((s) => s.projects)
  const [kind, setKind] = useState<Kind>(initialKind)
  const [projectId, setProjectId] = useState<string | null>(initialProject ?? projects[0]?.id ?? null)
  const [date, setDate] = useState<string>(todayIso())
  const [execPeriod, setExecPeriod] = useState<'weekly' | 'monthly'>('monthly')
  const [scope, setScope] = useState<Scope>({ level: 'all', id: null })
  const [input, setInput] = useState<Awaited<ReturnType<typeof loadSiteInput>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [dateTouched, setDateTouched] = useState(false)
  const today = todayIso()
  const name = projects.find((p) => p.id === projectId)?.officialName ?? ''
  const facts = useMemo(() => all.find((f) => f.id === projectId) ?? null, [all, projectId])

  useEffect(() => {
    if (!projectId || kind === 'executive') return
    let live = true
    setLoading(true)
    loadSiteInput(projectId, name, facts).then((x) => {
      if (!live) return
      setInput(x); setLoading(false)
      // a daily report opens on the last day the site reported, unless the reader chose a date
      if (!dateTouched) setDate(latestReportDate(projectId) ?? today)
    })
    return () => { live = false }
  }, [projectId, kind === 'executive', facts]) // eslint-disable-line react-hooks/exhaustive-deps

  const report: PeriodReport | null = useMemo(() => {
    if (kind === 'executive') {
      const list = all.filter((f) => inScope(f, scope))
      const label = scope.level === 'all' ? 'همهٔ پروژه‌های در دسترس' : scope.level === 'project' ? list[0]?.name ?? '' : scope.level === 'program' ? `طرح ${list[0]?.program?.name ?? ''}` : `پورتفولیوی ${list[0]?.portfolio?.name ?? ''}`
      return buildExecutiveSummary(execPeriod, date, list, label, today)
    }
    return input && input.projectId === projectId ? buildSiteReport(kind, date, input, today) : null
  }, [kind, input, projectId, date, all, scope, execPeriod, today])
  const tile = report?.tiles.find((t) => t.key === open) ?? null

  const openProject = (id: string) => { setProjectId(id); setKind('monthly'); setOpen(null) }
  const onTile = (t: Tile) => (t.projectId ? openProject(t.projectId) : t.empty ? undefined : setOpen(t.key))

  return (
    <div className="prx" dir="rtl">
      <div className="prx-kinds" role="tablist" aria-label="نوع گزارش">
        {KINDS.map((k, i) => (
          <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className={`prx-kind${kind === k.key ? ' is-on' : ''}`} style={{ '--c': k.color, '--i': i } as CSSProperties} onClick={() => { setKind(k.key); setOpen(null) }}>
            <span className="prx-kind-ic"><k.icon size={20} aria-hidden /></span>
            <b>{k.title}</b><small>{k.sub}</small>
          </button>
        ))}
      </div>

      <div className="prx-bar no-print">
        {kind === 'executive' ? (
          <>
            <ScopeBar scope={scope} onChange={setScope} />
            <div className="vz-seg" role="tablist" aria-label="دوره">
              {(['weekly', 'monthly'] as const).map((p) => <button key={p} type="button" role="tab" aria-selected={execPeriod === p} onClick={() => setExecPeriod(p)}>{p === 'weekly' ? 'هفتگی' : 'ماهانه'}</button>)}
            </div>
          </>
        ) : (
          <select className="rpx-select" aria-label="پروژه" value={projectId ?? ''} onChange={(e) => { setProjectId(e.target.value || null); setDateTouched(false); setOpen(null) }} style={{ maxWidth: '22rem' }}>
            {!projectId && <option value="">پروژه‌ای انتخاب کنید</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
          </select>
        )}
        <span className="prx-step">
          <button type="button" className="rpx-btn" onClick={() => { setDate(shiftPeriod(kind === 'executive' ? execPeriod : kind, date, -1)); setDateTouched(true) }} aria-label="دورهٔ قبل">→ {kind === 'daily' ? 'روز' : kind === 'weekly' || (kind === 'executive' && execPeriod === 'weekly') ? 'هفته' : 'ماه'} قبل</button>
          <label className="prx-date"><span>{kind === 'daily' ? 'روز گزارش' : 'تا تاریخ'}</span><JalaliDateInput value={date} onChange={(v) => { setDate(v); setDateTouched(true) }} /></label>
          <button type="button" className="rpx-btn" disabled={date >= today} onClick={() => { const n = shiftPeriod(kind === 'executive' ? execPeriod : kind, date, 1); setDate(n > today ? today : n); setDateTouched(true) }} aria-label="دورهٔ بعد">بعد ←</button>
        </span>
        {report && (
          <span className="prx-tools">
            <button type="button" className="rpx-btn" onClick={() => void exportExcel(report)}><FileSpreadsheet size={13} aria-hidden /> Excel</button>
            <button type="button" className="rpx-btn" onClick={() => printReport(report)}><Printer size={13} aria-hidden /> چاپ</button>
          </span>
        )}
      </div>

      {kind !== 'executive' && !projectId ? <p className="rpx-empty">یک پروژه انتخاب کنید.</p>
        : !report || loading ? <div className="prx-skel" role="status" aria-label="در حال آماده‌سازی گزارش"><Loader2 size={16} className="animate-spin" aria-hidden /><i /><i /><i /><i /></div>
        : <ReportView key={`${report.kind}|${report.subject}|${report.from}|${report.to}`} report={report} onTile={onTile} onKpi={(k) => setOpen(k)} />}

      <SideSheet open={!!tile} onClose={() => setOpen(null)} crumb={report ? `${report.title} · ${report.periodLabel}` : ''}
        title={tile?.title ?? ''} sub={tile?.note}
        actions={tile && tile.detail.length ? <button type="button" className="rpx-btn" onClick={() => void exportExcel(report as PeriodReport, tile)}><FileSpreadsheet size={13} aria-hidden /> Excel</button> : null}>
        {tile && <TileDetail t={tile} />}
      </SideSheet>
    </div>
  )
}

function ReportView({ report, onTile, onKpi }: { report: PeriodReport; onTile: (t: Tile) => void; onKpi: (key: string) => void }) {
  const projectTiles = report.tiles.filter((t) => t.projectId)
  const sections = report.tiles.filter((t) => !t.projectId)
  const needs = sections.filter((t) => !t.empty && (t.tone === 'bad' || t.tone === 'warn')).length
  return (
    <>
      <header className="prx-head">
        <div>
          <p className="prx-eyebrow">{report.subject}</p>
          <h1>{report.title}</h1>
          <p className="prx-period"><CalendarDays size={14} aria-hidden /> {report.periodLabel} <span>· مقایسه با {report.prevLabel}</span></p>
        </div>
        <div className="prx-status">
          {(['bad', 'warn', 'good'] as Tone[]).map((t) => {
            const n = sections.filter((x) => !x.empty && x.tone === t).length
            return <span key={t} style={{ '--c': TONE_C[t] } as CSSProperties}><b>{n.toLocaleString('fa-IR')}</b>{TONE_FA[t]}</span>
          })}
        </div>
      </header>

      {report.kpis.length > 0 && (
        <div className="vz-kpis">
          {report.kpis.map((k, i) => (
            <KpiTile key={k.key} i={i} tone={k.color} label={k.label} value={k.value} spark={k.spark} onClick={() => onKpi(k.key)}
              sub={<><i className="prx-dot" style={{ background: TONE_C[k.tone ?? 'none'] }} />{k.sub}</>} />
          ))}
        </div>
      )}

      <section className="prx-highlights" aria-label="نکته‌های کلیدی">
        <h2>{needs ? `${needs.toLocaleString('fa-IR')} بخش نیازمند توجه` : 'نکته‌های کلیدی'}</h2>
        <ul>{report.highlights.map((h, i) => <li key={i} style={{ '--c': TONE_C[h.tone], '--i': i } as CSSProperties}>{h.text}</li>)}</ul>
      </section>

      <div className="prx-tiles">
        {sections.map((t, i) => <TileCard key={t.key} t={t} i={i} onOpen={() => onTile(t)} />)}
      </div>

      {projectTiles.length > 0 && (
        <section>
          <h2 className="prx-h2">پروژه‌ها <small>روی هر پروژه بزنید تا گزارش ماهانهٔ آن باز شود</small></h2>
          <div className="prx-projects">{projectTiles.map((t, i) => <ProjectCard key={t.key} t={t} i={i} onOpen={() => onTile(t)} />)}</div>
        </section>
      )}
      <ul className="prx-caveats">{report.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
    </>
  )
}

function TileCard({ t, i, onOpen }: { t: Tile; i: number; onOpen: () => void }) {
  const Icon = ICON[t.icon] ?? Activity
  const style = { '--c': t.color, '--t': TONE_C[t.tone], '--i': i } as CSSProperties
  if (t.empty) return (
    <article className="prx-tile is-empty" style={style}>
      <header><span className="prx-tile-ic"><Icon size={16} aria-hidden /></span><h3>{t.title}</h3></header>
      <p className="prx-tile-empty">{t.empty}</p>
    </article>
  )
  return (
    <div role="button" tabIndex={0} className={`prx-tile is-click t-${t.tone}`} style={style} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }} aria-label={`${t.title}: ${t.headline.label} ${t.headline.value} — جزئیات`}>
      <header><span className="prx-tile-ic"><Icon size={16} aria-hidden /></span><h3>{t.title}</h3><span className="prx-tone" title={TONE_FA[t.tone]} /></header>
      <div className="prx-tile-head">
        <span className="prx-tile-l">{t.headline.label}</span>
        <b className="prx-tile-v">{t.headline.value}</b>
        {t.headline.sub && <span className="prx-tile-s">{t.headline.sub}</span>}
      </div>
      {t.chart && <div className="prx-tile-chart"><ChartView c={t.chart} compact /></div>}
      {t.stats.length > 0 && <dl className="prx-stats">{t.stats.slice(0, 3).map((s) => <div key={s.label} className={`t-${s.tone ?? 'none'}`}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>}
      <p className="prx-tile-note">{t.note}</p>
      <span className="prx-more">جزئیات ←</span>
    </div>
  )
}

function ProjectCard({ t, i, onOpen }: { t: Tile; i: number; onOpen: () => void }) {
  const c = t.chart?.kind === 'progress' ? t.chart : null
  return (
    <button type="button" className="prx-proj" style={{ '--c': t.color, '--i': i } as CSSProperties} onClick={onOpen}>
      <span className="prx-proj-top"><b>{t.title}</b><span className="prx-proj-h" style={{ background: t.color }}>{t.stats[0]?.value}</span></span>
      {c ? <Progress actual={c.actual} planned={c.planned} /> : <span className="rpx-muted">شاخص پیشرفت ندارد</span>}
      <span className="prx-proj-foot"><span>{t.headline.value} <small>{t.headline.sub}</small></span><span className={`t-${t.stats[1]?.tone ?? 'none'}`}>{t.stats[1]?.label} {t.stats[1]?.value}</span></span>
      {t.note && <small className="rpx-muted">{t.note}</small>}
    </button>
  )
}

function TileDetail({ t }: { t: Tile }) {
  return (
    <>
      <div className="prx-detail-top" style={{ '--c': t.color } as CSSProperties}>
        <div className="prx-detail-head"><span>{t.headline.label}</span><b>{t.headline.value}</b>{t.headline.sub && <small>{t.headline.sub}</small>}</div>
        {t.stats.map((s) => <div key={s.label} className={`prx-detail-stat t-${s.tone ?? 'none'}`}><span>{s.label}</span><b>{s.value}</b></div>)}
      </div>
      {t.chart && <div className="prx-detail-chart"><ChartView c={t.chart} /></div>}
      {t.detail.length ? t.detail.map((d) => <DetailTableView key={d.title} d={d} />) : <p className="rpx-empty">جزئیاتی برای این دوره ثبت نشده است.</p>}
    </>
  )
}

function DetailTableView({ d }: { d: DetailTable }) {
  const [all, setAll] = useState(false)
  const rows = all ? d.rows : d.rows.slice(0, 40)
  return (
    <section className="prx-table">
      <h3>{d.title} <small>{d.rows.length.toLocaleString('fa-IR')} ردیف</small></h3>
      <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr>{d.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={d.tones?.[i] && d.tones[i] !== 'none' ? `tone-${d.tones[i]}` : ''}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
      {d.rows.length > 40 && !all && <button type="button" className="rpx-btn" onClick={() => setAll(true)}>نمایش همهٔ {d.rows.length.toLocaleString('fa-IR')} ردیف</button>}
      {d.note && <p className="rpx-note">{d.note}</p>}
    </section>
  )
}

function Progress({ actual, planned }: { actual: number; planned: number }) {
  const behind = actual + 0.5 < planned
  return (
    <span className="prx-progress" title={`واقعی ${actual.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪ · برنامه ${planned.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`}>
      <i className={behind ? 'is-behind' : 'is-ok'} style={{ transform: `scaleX(${Math.min(100, Math.max(0, actual)) / 100})` }} />
      <em style={{ insetInlineStart: `${Math.min(100, planned)}%` }} />
    </span>
  )
}

function ChartView({ c, compact }: { c: Chart; compact?: boolean }): ReactNode {
  switch (c.kind) {
    case 'columns': return <Columns height={compact ? 120 : 200} items={c.items.map((x) => ({ ...x, display: compact ? '' : undefined }))} format={(v) => v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} />
    case 'donut': return <Donut size={compact ? 116 : 170} parts={c.parts} sub={c.sub} center={c.center} />
    case 'bars': return <BarList items={compact ? c.items.slice(0, 4) : c.items} />
    case 'gauge': return <div className="vz-gauges"><Gauge value={c.value} min={c.min} max={c.max} bands={c.bands} target={c.target} display={c.display} label={c.label} size={compact ? 150 : 200} /></div>
    case 'progress': return <div className="prx-progress-wrap"><Progress actual={c.actual} planned={c.planned} /><small>{c.label} — خط عمودی: برنامه</small></div>
    case 'spark': return <Spark values={c.values} color={c.color} width={240} height={50} />
  }
}

/* ── export ─────────────────────────────────────────────────────────── */

async function exportExcel(r: PeriodReport, only?: Tile) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  const sheetName = (s: string) => { let n = s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28); let k = 2; while (used.has(n)) n = `${n.slice(0, 26)} ${k++}`; used.add(n); return n }
  if (!only) {
    const head = [[r.title], [r.subject], [r.periodLabel], [], ['شاخص', 'مقدار', 'توضیح'], ...r.kpis.map((k) => [k.label, k.value, k.sub ?? '']), [], ['نکته‌های کلیدی'], ...r.highlights.map((h) => [h.text]),
      [], ['بخش', 'شاخص اصلی', 'مقدار', 'وضعیت', 'نکته'], ...r.tiles.filter((t) => !t.projectId).map((t) => [t.title, t.headline.label, t.empty ? 'ثبت نشده' : t.headline.value, t.empty ? '—' : TONE_FA[t.tone], t.empty ?? t.note])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), sheetName('خلاصه'))
  }
  for (const t of only ? [only] : r.tiles) for (const d of t.detail) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([d.head, ...d.rows]), sheetName(only ? d.title : `${t.title} - ${d.title}`))
  XLSX.writeFile(wb, `${r.title}-${r.from}.xlsx`)
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
function printReport(r: PeriodReport) {
  const tone = (t: Tone) => ({ bad: '#be123c', warn: '#b45309', good: '#15803d', none: '#475569' }[t])
  const tiles = r.tiles.filter((t) => !t.projectId)
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font-family:Vazirmatn,Tahoma,sans-serif;margin:22px;color:#0f172a}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}h3{font-size:12px;margin:10px 0 4px}
.sub{color:#475569;font-size:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}.kpi{border:1px solid #e2e8f0;border-radius:10px;padding:8px}.kpi b{font-size:18px;display:block}.kpi small{color:#64748b}
ul{margin:4px 0;padding-inline-start:18px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0 8px}th,td{border:1px solid #cbd5e1;padding:3px 5px;text-align:right;vertical-align:top}th{background:#f1f5f9}
.tag{display:inline-block;font-size:10px;border-radius:8px;padding:0 6px;color:#fff}.sec{break-inside:avoid-page}
</style></head><body><h1>${esc(r.title)}</h1><div class="sub">${esc(r.subject)} · ${esc(r.periodLabel)}</div>
<div class="kpis">${r.kpis.map((k) => `<div class="kpi"><small>${esc(k.label)}</small><b>${esc(k.value)}</b><small>${esc(k.sub ?? '')}</small></div>`).join('')}</div>
<h2>نکته‌های کلیدی</h2><ul>${r.highlights.map((h) => `<li style="color:${tone(h.tone)}">${esc(h.text)}</li>`).join('')}</ul>
${tiles.map((t) => `<div class="sec"><h2>${esc(t.title)} ${t.empty ? '' : `<span class="tag" style="background:${tone(t.tone)}">${TONE_FA[t.tone]}</span>`}</h2>${t.empty ? `<p class="sub">${esc(t.empty)}</p>` : `<p class="sub">${esc(t.headline.label)}: <b>${esc(t.headline.value)}</b>${t.headline.sub ? ` — ${esc(t.headline.sub)}` : ''}${t.stats.map((s) => ` · ${esc(s.label)}: ${esc(s.value)}`).join('')}</p><p class="sub">${esc(t.note)}</p>${t.detail.map((d) => `<h3>${esc(d.title)}</h3><table><thead><tr>${d.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0, 200).map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}`}</div>`).join('')}
${r.tiles.some((t) => t.projectId) ? `<h2>پروژه‌ها</h2><table><thead><tr><th>پروژه</th><th>پیشرفت</th><th>برنامه</th><th>سلامت</th><th>انحراف مهم</th></tr></thead><tbody>${r.tiles.filter((t) => t.projectId).map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.headline.value)}</td><td>${esc(t.headline.sub ?? '')}</td><td>${esc(t.stats[0]?.value ?? '')}</td><td>${esc(t.stats[1]?.value ?? '')}</td></tr>`).join('')}</tbody></table>` : ''}
<ul class="sub">${r.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
}
