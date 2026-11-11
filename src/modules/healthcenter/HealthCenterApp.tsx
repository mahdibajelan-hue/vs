import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity, AlertOctagon, BookOpenText, CalendarDays, ChevronDown, ClipboardList, Download, FileSpreadsheet, HeartPulse, ListOrdered, Loader2, Printer, RefreshCw,
  ScanLine, Settings2, ShieldCheck, Stethoscope, TrendingDown, TrendingUp,
} from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../lib/jalali'
import { Seg, SideSheet } from '../executive/components/viz'
import {
  DEF, DEFAULT_SETTINGS, DOMAIN_FA, INDEX_FA, INDICATORS, STATUS_COLOR, STATUS_FA, rangeText, statusOf,
  type DomainKey, type HealthResult, type HealthSettings, type OrganKey,
} from './lib/healthCore'
import { computeProjectHealth, loadHistory, loadLatestSnapshots, loadSettings, refreshAll, saveSettings, type Snapshot } from './lib/healthLoader'
import { AnatomyHologram, OrganCards } from './components/AnatomyHologram'
import { Ecg, HoloRing, LabTable, ORGAN_FA, ScoreRing, StatusChip, StatusIcon, Trend, VitalCard, fa, spark, valueText, type VitalView } from './components/parts'
import { useRemembered } from '../../lib/navMemory'
import { NavScroller } from '../../components/common/NavScroller'
import './healthCenter.css'

type Sheet =
  | { kind: 'ind'; id: string }
  | { kind: 'organ'; key: OrganKey }
  | { kind: 'domain'; key: DomainKey }
  | { kind: 'past'; date: string }
  | { kind: 'projects' }
  | { kind: 'settings' }
  | { kind: 'catalog' }
type ImagingTab = 'xray' | 'ct' | 'mri' | 'us' | 'angio'
type Range = '30' | '90' | '180' | 'all'

const INDEX_COLOR = { good: '#22c55e', watch: '#eab308', bad: '#f97316', critical: '#ef4444' } as const
const PRIORITY_FA = { critical: 'فوری', high: 'بالا', medium: 'متوسط' } as const
const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso) : '—')

/**
 * مرکز سلامت پروژه — the project's condition read like a patient's chart: one health index, vital signs, a blood test,
 * organs, imaging, the immune system and a written diagnosis. Every figure is computed by healthCore from what the
 * other modules already store; nothing is entered here. Missing data is shown as «داده ناقص» and is never read as good.
 */
export function HealthCenterApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const setProject = useProjectContextStore((s) => s.setProject)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof loadSettings>> | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [r, setR] = useState<HealthResult | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [tab, setTab] = useRemembered<ImagingTab>('tab', 'xray', (v) => typeof v === 'string')
  const [range, setRange] = useState<Range>('90')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setR(undefined); setErr(null)
    ;(async () => {
      try {
        const c = await loadSettings(projectId)
        const h = await loadHistory(projectId)
        const res = await computeProjectHealth(projectId, c.settings, h)
        const h2 = await loadHistory(projectId)
        if (!alive) return
        setCfg(c); setHistory(h2); setR(res)
      } catch (e) {
        if (alive) { setErr(e instanceof Error ? e.message : String(e)); setR(null) }
      }
    })()
    return () => { alive = false }
  }, [projectId, tick])

  const settings = cfg?.settings ?? DEFAULT_SETTINGS
  const reload = useCallback(() => setTick((x) => x + 1), [])

  return (
    <div className="phc" dir="rtl">
      <header className="phc-top">
        <div className="phc-brand">
          <span className="phc-brand-ico"><HeartPulse size={20} aria-hidden /></span>
          <span className="phc-brand-txt">
            <b dir="ltr">PROJECT HEALTH CENTER</b>
            <small dir="ltr">Monitor <i>|</i> Diagnose <i>|</i> Heal</small>
          </span>
          <span className="phc-brand-proj">
            <span>مرکز سلامت پروژه</span>
            <strong>{project?.officialName ?? '—'}</strong>
          </span>
        </div>
        <div className="phc-top-end">
          {r && <span className="phc-date"><CalendarDays size={14} aria-hidden /> وضعیت روز <b>{jd(r.asOf)}</b></span>}
          <button type="button" className="phc-btn" onClick={() => setSheet({ kind: 'projects' })}><ListOrdered size={15} aria-hidden /> پروژه‌ها بر اساس سلامت</button>
          <button type="button" className="phc-btn" onClick={() => r && exportExcel(r, history, settings, project?.officialName ?? '')} disabled={!r}><FileSpreadsheet size={15} aria-hidden /> خروجی اکسل</button>
          <button type="button" className="phc-btn" onClick={() => window.print()} disabled={!r}><Printer size={15} aria-hidden /> چاپ گزارش</button>
          <button type="button" className="phc-btn is-icon" onClick={() => setSheet({ kind: 'settings' })} aria-label="تنظیمات موتور سلامت" title="تنظیمات موتور سلامت"><Settings2 size={16} aria-hidden /></button>
          <button type="button" className="phc-btn is-icon" onClick={reload} aria-label="محاسبهٔ دوباره" title="محاسبهٔ دوباره" disabled={r === undefined}><RefreshCw size={16} aria-hidden className={r === undefined ? 'phc-spin' : ''} /></button>
          <ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome />
        </div>
      </header>

      {!projectId ? <Empty>ابتدا پروژه را از رادار پروژه‌ها انتخاب کنید.</Empty>
        : r === undefined ? <Loading />
        : r === null ? <Empty tone="err">{err ?? 'محاسبهٔ سلامت پروژه انجام نشد.'}</Empty>
        : <Body r={r} history={history} settings={settings} tab={tab} setTab={setTab} range={range} setRange={setRange} open={setSheet} />}

      {r && sheet?.kind === 'ind' && <IndicatorSheet r={r} id={sheet.id} history={history} settings={settings} onClose={() => setSheet(null)} />}
      {r && sheet?.kind === 'organ' && <OrganSheet r={r} k={sheet.key} settings={settings} onPick={(id) => setSheet({ kind: 'ind', id })} onClose={() => setSheet(null)} />}
      {r && sheet?.kind === 'domain' && <DomainSheet r={r} k={sheet.key} settings={settings} onPick={(id) => setSheet({ kind: 'ind', id })} onClose={() => setSheet(null)} />}
      {r && sheet?.kind === 'past' && <PastSheet r={r} snap={history.find((h) => h.date === sheet.date) ?? null} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'catalog' && <CatalogSheet settings={settings} onClose={() => setSheet(null)} />}
      <ProjectsSheet open={sheet?.kind === 'projects'} current={projectId} onPick={(id) => { setProject(id); setSheet(null) }} onClose={() => setSheet(null)} />
      {sheet?.kind === 'settings' && <SettingsSheet projectId={projectId} projectName={project?.officialName ?? ''} cfg={cfg} isAdmin={isAdmin} onSaved={() => { setSheet(null); reload() }} onClose={() => setSheet(null)} />}
    </div>
  )
}

function Loading() {
  return (
    <div className="phc-loading" role="status">
      <Ecg beats={[3, 5, 4, 6, 5, 4, 6, 5]} color="#5eead4" />
      <span><Loader2 size={16} className="phc-spin" aria-hidden /> در حال خواندن داده‌های ماژول‌ها و محاسبهٔ شاخص‌ها…</span>
    </div>
  )
}
function Empty({ children, tone }: { children: ReactNode; tone?: 'err' }) {
  return <div className={`phc-empty${tone ? ` is-${tone}` : ''}`}>{children}</div>
}

/* ── the page ──────────────────────────────────────────────────────── */

function Body({ r, history, settings, tab, setTab, range, setRange, open }: {
  r: HealthResult; history: Snapshot[]; settings: HealthSettings; tab: ImagingTab; setTab: (t: ImagingTab) => void; range: Range; setRange: (r: Range) => void; open: (s: Sheet) => void
}) {
  const color = INDEX_COLOR[r.status]
  const [organ, setOrgan] = useState<OrganKey | null>(null)
  const delta = r.prevIndex == null ? null : r.index - r.prevIndex
  const I = r.indicators, B = settings.bands
  const counted = INDICATORS.filter((d) => d.domain)
  const missing = counted.filter((d) => I[d.id].value == null)
  // caps that hold the index down, then critical indicators that are not already a cap — each as a short
  // title + one-line detail so the box reads at a glance instead of wrapping long sentences
  const capDetail = (label: string, reason: string) => {
    const rest = reason.startsWith(label) ? reason.slice(label.length).replace(/^\s*=\s*/, '') : reason.replace(/^[^:]*:\s*/, '')
    return rest.replace(/\(آستانهٔ بحرانی ([^)]+)\)/, '· آستانه $1').trim()
  }
  const capAlerts = r.caps.map((c) => ({ key: `cap:${c.id}`, id: c.id === 'gate' ? null : c.id, title: c.label, detail: capDetail(c.label, c.reason), chip: `سقف ${fa(c.cap)}` }))
  const critAlerts = counted.filter((d) => I[d.id].status === 'critical' && !r.caps.some((c) => c.id === d.id)).slice(0, 4)
    .map((d) => ({ key: d.id, id: d.id as string | null, title: d.label, detail: `${valueText(d.id, I[d.id].value)} ${d.unit}`, chip: 'بحرانی' }))
  const alerts = [...capAlerts, ...critAlerts]
  const [alertsOpen, setAlertsOpen] = useRemembered<boolean>('alerts', false, (v) => typeof v === 'boolean')
  const lowestCap = r.caps.length ? Math.min(...r.caps.map((c) => c.cap)) : null

  const vitals: VitalView[] = [
    { key: 'hr', id: 'velocity', medical: 'ضربان قلب', title: 'سرعت پیشرفت', display: I.velocity.value == null ? '—' : fa(I.velocity.value * 100), unit: '٪ سرعت برنامه', range: 'هدف: ۱۰۰٪ و بیشتر', ind: I.velocity, color: STATUS_COLOR[I.velocity.status], chart: <Ecg beats={r.ecg} color={STATUS_COLOR[I.velocity.status] === STATUS_COLOR.none ? '#5eead4' : STATUS_COLOR[I.velocity.status]} /> },
    { key: 'bp', id: 'cpi', medical: 'فشار خون', title: 'فشار مالی', display: r.bp.systolic == null ? '—' : <span dir="ltr">{fa(r.bp.systolic)}/{fa(r.bp.diastolic)}</span>, unit: 'مصرف بودجه / پیشرفت (٪)', range: `CPI ${valueText('cpi', I.cpi.value)} · ${rangeText('cpi', B.cpi)}`, ind: I.cpi, color: STATUS_COLOR[I.cpi.status], chart: <BpBar sys={r.bp.systolic} dia={r.bp.diastolic} color={STATUS_COLOR[I.cpi.status]} /> },
    { key: 'spo2', id: 'spo2', medical: 'SpO₂', title: 'کفایت منابع', display: valueText('spo2', I.spo2.value), unit: '٪', range: rangeText('spo2', B.spo2), ind: I.spo2, color: STATUS_COLOR[I.spo2.status], chart: spark(I.manpower_util.series, STATUS_COLOR[I.spo2.status]) },
    { key: 'temp', id: 'risk_temp', medical: 'دمای بدن', title: 'شدت ریسک', display: valueText('risk_temp', I.risk_temp.value), unit: I.risk_temp.value == null ? 'امتیاز' : `امتیاز · معادل ${fa(36.5 + (I.risk_temp.value / 100) * 4.5, 1)}°`, range: rangeText('risk_temp', B.risk_temp), ind: I.risk_temp, color: STATUS_COLOR[I.risk_temp.status], chart: <Thermo v={I.risk_temp.value} color={STATUS_COLOR[I.risk_temp.status]} /> },
    { key: 'rr', id: 'activity_rate', medical: 'تنفس', title: 'فعالیت جبهه‌ها', display: valueText('activity_rate', I.activity_rate.value), unit: '٪ میانگین ۳۰ روز', range: rangeText('activity_rate', B.activity_rate), ind: I.activity_rate, color: STATUS_COLOR[I.activity_rate.status], chart: spark(I.activity_rate.series, STATUS_COLOR[I.activity_rate.status]) },
  ]

  return (
    <main className="phc-main">
      {alerts.length > 0 && (
        <section className={`phc-alerts${alertsOpen ? ' is-open' : ''}`} aria-label="هشدارها">
          <button type="button" className="phc-alerts-head" aria-expanded={alertsOpen} aria-controls="phc-alert-list" onClick={() => setAlertsOpen(!alertsOpen)}>
            <AlertOctagon size={16} aria-hidden />
            <span className="phc-alerts-sum">
              {lowestCap != null && <b>سقف امتیاز {fa(lowestCap)}</b>}
              {capAlerts.length > 0 && <><i aria-hidden>·</i><span>{fa(capAlerts.length)} محدودکننده</span></>}
              {critAlerts.length > 0 && <>{capAlerts.length > 0 && <i aria-hidden>·</i>}<span>{fa(critAlerts.length)} شاخص بحرانی</span></>}
            </span>
            <span className="phc-alerts-tog">{alertsOpen ? 'بستن' : 'جزئیات'}<ChevronDown size={14} aria-hidden /></span>
          </button>
          {alertsOpen && (
            <div id="phc-alert-list" className="phc-alerts-body">
              {[{ label: 'محدودکننده‌های امتیاز', items: capAlerts }, { label: 'شاخص‌های بحرانی', items: critAlerts }].filter((g) => g.items.length).map((g) => (
                <div key={g.label} className="phc-alerts-group">
                  <small>{g.label}</small>
                  <ul>
                    {g.items.map((a) => (
                      <li key={a.key}>
                        {a.id ? <button type="button" onClick={() => open({ kind: 'ind', id: a.id as string })}><b>{a.title}</b><span>{a.detail}</span></button>
                          : <span className="phc-alerts-row"><b>{a.title}</b><span>{a.detail}</span></span>}
                        <em>{a.chip}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* hero: the index on a hologram, the engineer beside it */}
      <section className="phc-hero" style={{ ['--c' as string]: color }}>
        <div className="phc-hero-info">
          <span className="phc-eyebrow">شاخص سلامت پروژه</span>
          <h1>{INDEX_FA[r.status]}</h1>
          <p className="phc-hero-sum">{r.diagnosis.summary}</p>
          <div className="phc-hero-stats">
            <div>
              <span>نسبت به اندازه‌گیری قبل</span>
              {delta == null ? <b className="is-none">سابقه‌ای ثبت نشده</b>
                : <b className={delta >= 0 ? 'is-up' : 'is-down'}>{delta >= 0 ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}{delta === 0 ? 'بدون تغییر' : `${fa(Math.abs(delta))} امتیاز ${delta > 0 ? 'بهبود' : 'افت'}`}</b>}
            </div>
            <div>
              <span>پوشش داده</span>
              <b>{fa(Math.round(r.coverage * 100))}٪ <small>({fa(counted.length - missing.length)} از {fa(counted.length)} شاخص)</small></b>
              <span className="phc-meter"><i style={{ width: `${r.coverage * 100}%` }} /></span>
            </div>
          </div>
          {r.drivers.length > 0 && (
            <div className="phc-drivers">
              <span>علت تغییر امتیاز</span>
              <ul>
                {r.drivers.slice(0, 4).map((d) => (
                  <li key={d.key}><button type="button" onClick={() => open({ kind: 'domain', key: d.key })}>{d.text}</button><b className={d.delta >= 0 ? 'is-up' : 'is-down'} dir="ltr">{d.delta > 0 ? '+' : ''}{fa(d.delta, 1)}</b></li>
                ))}
              </ul>
            </div>
          )}
          <div className="phc-domains">
            {r.domains.map((d) => (
              <button type="button" key={d.key} onClick={() => open({ kind: 'domain', key: d.key })} style={{ ['--c' as string]: STATUS_COLOR[statusOf(d.score)] }}>
                <span>{DOMAIN_FA[d.key]}<small>وزن {fa(d.weight)}</small></span>
                <b>{fa(d.score)}</b>
                <span className="phc-meter"><i style={{ width: `${d.score}%` }} /></span>
                {d.coverage < 1 && <em>{d.coverage === 0 ? 'بدون داده' : `پوشش ${fa(Math.round(d.coverage * 100))}٪`}</em>}
              </button>
            ))}
          </div>
        </div>
        <div className="phc-stage">
          <div className="phc-stage-grid" aria-hidden />
          <div className="phc-stage-holo">
            <HoloRing value={r.index} color={color} label={INDEX_FA[r.status]} sub={r.caps.length ? `سقف ${fa(Math.min(...r.caps.map((c) => c.cap)))} · بدون سقف ${fa(r.rawIndex)}` : r.prevIndex != null ? `قبلی ${fa(r.prevIndex)}` : 'نخستین اندازه‌گیری'} />
            <span className="phc-pill" dir="rtl"><small>وضعیت کلی پروژه</small><b><StatusIcon status={r.status} size={17} />{INDEX_FA[r.status]}</b></span>
            <Pedestal />
          </div>
        </div>
      </section>

      {/* vital signs */}
      <section className="phc-panel phc-monitor">
        <PanelHead icon={<Activity size={17} />} title="علائم حیاتی" sub="پایش لحظه‌ای مانند مانیتور ICU؛ روی هر علامت بزنید تا جزئیات و سابقه را ببینید" />
        <div className="phc-vitals">
          {vitals.map((v) => <VitalCard key={v.key} v={v} band={B[v.id]} onOpen={() => open({ kind: 'ind', id: v.id })} />)}
        </div>
      </section>

      <section className="phc-panel phc-anat">
        <PanelHead icon={<HeartPulse size={17} />} title="سلامت اندام‌های پروژه" sub="هر اندام یک کارکرد پروژه است؛ اندام‌های نامطلوب روی بدن هشدار می‌دهند. روی اندام یا کارت آن بزنید تا شاخص‌ها را ببینید"
          end={<OrganTally r={r} />} />
        <div className="phc-anat-grid">
          <AnatomyHologram r={r} active={organ} onHover={setOrgan} onPick={(k) => open({ kind: 'organ', key: k })} />
          <OrganCards r={r} active={organ} onHover={setOrgan} onPick={(k) => open({ kind: 'organ', key: k })} />
        </div>
      </section>

      <div className="phc-cols">
        <section className="phc-panel">
          <PanelHead icon={<ClipboardList size={17} />} title="آزمایش خون پروژه" sub="محدوده‌های مرجع مدیریتی‌اند و مدیر سامانه آن‌ها را تعیین می‌کند؛ روی هر ردیف بزنید تا فرمول و منبع را ببینید" />
          <LabTable r={r} bands={B} onOpen={(id) => open({ kind: 'ind', id })} />
        </section>
        <section className="phc-panel">
          <PanelHead icon={<ShieldCheck size={17} />} title="سیستم ایمنی پروژه" sub="توان پروژه در پیشگیری، پاسخ و بازیابی" />
          <div className="phc-immune">
            <ScoreRing score={I.resilience.score} label="تاب‌آوری" value="میانگین چهار شاخص" size={116} onClick={() => open({ kind: 'ind', id: 'resilience' })} />
            <div className="phc-immune-grid">
              <ScoreRing score={I.risk_response.score} label="پاسخ به ریسک" value={I.risk_response.value == null ? 'داده ناقص' : `${fa(I.risk_response.value)}٪ ریسک مهم با اقدام`} onClick={() => open({ kind: 'ind', id: 'risk_response' })} />
              <ScoreRing score={I.preventive.score} label="اقدامات پیشگیرانه" value={I.preventive.value == null ? 'داده ناقص' : `${fa(I.preventive.value)}٪ در موعد`} onClick={() => open({ kind: 'ind', id: 'preventive' })} />
              <ScoreRing score={I.recurring.score} label="مشکلات تکرارشونده" value={I.recurring.value == null ? 'داده ناقص' : `${fa(I.recurring.value)} دستهٔ تکراری`} onClick={() => open({ kind: 'ind', id: 'recurring' })} />
              <ScoreRing score={I.recovery.score} label="سرعت بازیابی" value={I.recovery.value == null ? 'داده ناقص' : `میانه ${fa(I.recovery.value)} روز`} onClick={() => open({ kind: 'ind', id: 'recovery' })} />
            </div>
          </div>
        </section>
      </div>

      <section className="phc-panel">
        <PanelHead icon={<ScanLine size={17} />} title="تصویربرداری" sub="نمای کلی، ساختار، گلوگاه‌ها، جبهه‌ها و جریان تأمین و نقدینگی" />
        <NavScroller label="بخش‌های ماژول"><div className="phc-tabs" role="tablist">
          {([['xray', 'X-Ray', 'تصویر کلی'], ['ct', 'CT', 'ساختار WBS'], ['mri', 'MRI', 'گلوگاه‌ها'], ['us', 'سونوگرافی', 'جبهه‌های اجرا'], ['angio', 'آنژیوگرافی', 'جریان تأمین و نقدینگی']] as const).map(([k, a, b]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}><b>{a}</b><small>{b}</small></button>
          ))}
        </div></NavScroller>
        <Imaging r={r} tab={tab} open={open} />
      </section>

      <Doctor r={r} open={open} />

      <section className="phc-panel">
        <PanelHead icon={<TrendingUp size={17} />} title="روند سلامت" sub="هر روزی که سلامت پروژه محاسبه شود ثبت می‌شود؛ روی هر نقطه بزنید تا وضعیت آن روز را ببینید"
          end={<Seg label="بازهٔ زمانی" value={range} onChange={setRange} options={[{ key: '30', label: '۳۰ روز' }, { key: '90', label: '۹۰ روز' }, { key: '180', label: '۶ ماه' }, { key: 'all', label: 'همه' }]} />} />
        <TrendChart history={history} range={range} onPick={(date) => open({ kind: 'past', date })} />
      </section>

      <footer className="phc-foot">
        <span>همهٔ شاخص‌ها از داده‌های ثبت‌شده در ماژول‌های فرین محاسبه می‌شوند و در این صفحه داده‌ای وارد نمی‌شود. شاخص بدون داده با امتیاز {fa(settings.missingScore)} در محاسبه می‌آید تا کمبود داده وضعیت را بهتر از واقع نشان ندهد.</span>
        <button type="button" className="phc-btn" onClick={() => open({ kind: 'catalog' })}><BookOpenText size={15} aria-hidden /> شناسنامهٔ شاخص‌ها</button>
      </footer>
    </main>
  )
}

function OrganTally({ r }: { r: HealthResult }) {
  const n = (s: string) => r.organs.filter((o) => o.status === s).length
  return (
    <span className="phc-tally">
      {(['critical', 'bad', 'watch', 'good', 'none'] as const).filter((s) => n(s)).map((s) => (
        <span key={s} style={{ ['--c' as string]: STATUS_COLOR[s] }}><StatusIcon status={s} size={13} />{fa(n(s))} {STATUS_FA[s]}</span>
      ))}
    </span>
  )
}

/** the holographic platform the index ring floats on */
function Pedestal() {
  return (
    <svg className="phc-pedestal" viewBox="0 0 300 70" aria-hidden>
      <defs>
        <radialGradient id="phcPedGlow" cx=".5" cy=".5" r=".5">
          <stop offset="0" style={{ stopColor: 'var(--c)', stopOpacity: 0.75 }} />
          <stop offset=".6" style={{ stopColor: 'var(--c)', stopOpacity: 0.18 }} />
          <stop offset="1" style={{ stopColor: 'var(--c)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <ellipse cx="150" cy="35" rx="148" ry="30" fill="url(#phcPedGlow)" />
      <ellipse cx="150" cy="35" rx="124" ry="22" className="phc-ped-ring" />
      <ellipse cx="150" cy="35" rx="96" ry="16" className="phc-ped-ring is-dash" />
      <ellipse cx="150" cy="35" rx="64" ry="10" className="phc-ped-ring is-bright" />
    </svg>
  )
}

function PanelHead({ icon, title, sub, end }: { icon: ReactNode; title: string; sub?: string; end?: ReactNode }) {
  return (
    <div className="phc-ph">
      <span className="phc-ph-ico" aria-hidden>{icon}</span>
      <span className="phc-ph-txt"><h2>{title}</h2>{sub && <small>{sub}</small>}</span>
      {end && <span className="phc-ph-end">{end}</span>}
    </div>
  )
}

function BpBar({ sys, dia, color }: { sys: number | null; dia: number | null; color: string }) {
  if (sys == null || dia == null) return <span className="phc-nochart">EVM ثبت نشده</span>
  const max = Math.max(100, sys, dia)
  return (
    <span className="phc-bp" style={{ ['--c' as string]: color }}>
      <span><small>مصرف بودجه</small><i style={{ width: `${(sys / max) * 100}%` }} /></span>
      <span><small>پیشرفت</small><i className="is-dia" style={{ width: `${(dia / max) * 100}%` }} /></span>
    </span>
  )
}
function Thermo({ v, color }: { v: number | null; color: string }) {
  return (
    <span className="phc-thermo" style={{ ['--c' as string]: color }}>
      <i style={{ width: `${Math.max(3, Math.min(100, v ?? 0))}%` }} />
      <small>۰</small><small>۶۰ بحرانی</small><small>۱۰۰</small>
    </span>
  )
}

/* ── imaging ───────────────────────────────────────────────────────── */

function Imaging({ r, tab, open }: { r: HealthResult; tab: ImagingTab; open: (s: Sheet) => void }) {
  const im = r.imaging
  if (tab === 'xray') return (
    <div className="phc-xray">
      {im.xray.map((x) => {
        const st = statusOf(x.score)
        return (
          <button type="button" key={x.key} onClick={() => open({ kind: 'domain', key: x.key })} style={{ ['--c' as string]: STATUS_COLOR[st] }}>
            <span className="phc-xray-bone" style={{ height: `${Math.max(6, x.score)}%` }} />
            <b>{fa(x.score)}</b>
            <small>{DOMAIN_FA[x.key]}</small>
          </button>
        )
      })}
    </div>
  )
  if (tab === 'ct') return im.ct.length ? (
    <div className="phc-ct">
      {im.ct.map((c) => (
        <div key={c.label} className="phc-ct-row">
          <span>{c.label}</span>
          <span className="phc-ct-bar">
            <i className="is-plan" style={{ width: `${c.planned ?? 0}%` }} />
            <i className="is-act" style={{ width: `${c.actual}%`, background: c.planned != null && c.actual < c.planned - 5 ? '#f97316' : '#22c55e' }} />
          </span>
          <b>{fa(c.actual, 1)}٪ <small>از {c.planned == null ? '—' : `${fa(c.planned, 1)}٪`}</small></b>
        </div>
      ))}
      <p className="phc-note">نوار روشن پیشرفت واقعی و نوار کم‌رنگ پیشرفت برنامه‌ای هر رشته از ساختار شکست EPC است.</p>
    </div>
  ) : <Empty>پیشرفت رشته‌های EPC برای این پروژه ثبت نشده است.</Empty>
  if (tab === 'mri') return im.mri.length ? (
    <ul className="phc-mri">
      {im.mri.map((m, i) => (
        <li key={i} style={{ ['--w' as string]: m.weight }}>
          <span className="phc-mri-dot" aria-hidden />
          <span><b>{m.label}</b>{m.detail && <small>{m.detail}</small>}</span>
        </li>
      ))}
    </ul>
  ) : <Empty>گلوگاه یا وابستگی مشکل‌ساز در داده‌های ثبت‌شده دیده نمی‌شود.</Empty>
  if (tab === 'us') return im.ultrasound.length ? (
    <div className="phc-us">
      {im.ultrasound.map((u) => {
        const max = Math.max(...im.ultrasound.map((x) => x.reports))
        return (
          <div key={u.front} className="phc-us-row">
            <span>{u.front}</span>
            <span className="phc-us-wave"><i style={{ width: `${(u.reports / max) * 100}%` }} /></span>
            <b>{fa(u.reports)} گزارش</b>
            <small>آخرین: {jd(u.lastDate)}</small>
          </div>
        )
      })}
      <p className="phc-note">گزارش‌های ارسال‌شدهٔ ۳۰ روز اخیر به تفکیک جبههٔ کاری.</p>
    </div>
  ) : <Empty>در ۳۰ روز اخیر گزارش اجرایی ارسال‌شده‌ای ثبت نشده است.</Empty>
  return (
    <div className="phc-angio">
      {im.angio.map((a) => (
        <div key={a.path} className={`phc-vessel${a.blocked ? ' is-blocked' : ''}`}>
          <svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden>
            <path d="M4 15 C60 2, 90 28, 150 15 S240 2, 296 15" className="phc-vessel-wall" />
            <path d="M4 15 C60 2, 90 28, 150 15 S240 2, 296 15" className="phc-vessel-flow" />
            {a.blocked > 0 && <circle cx="196" cy="11" r="7" className="phc-vessel-clot" />}
          </svg>
          <span><b>{a.label}</b><small>{a.note}</small></span>
        </div>
      ))}
    </div>
  )
}

/* ── the diagnosis, written as a prescription ─────────────────────── */

function Doctor({ r, open }: { r: HealthResult; open: (s: Sheet) => void }) {
  const d = r.diagnosis
  return (
    <section className="phc-panel phc-rx">
      <PanelHead icon={<Stethoscope size={17} />} title="تشخیص پروژه" sub="جمع‌بندی بر پایهٔ قواعد تعریف‌شده و داده‌های ثبت‌شده؛ تصمیم نهایی با مدیر پروژه است" />
      <div className="phc-rx-sheet">
        <div className="phc-rx-head">
          <span className="phc-rx-mark" aria-hidden>℞</span>
          <div>
            <span>تشخیص اصلی</span>
            <h3>{d.headline}</h3>
          </div>
          <span className="phc-rx-date">{jd(r.asOf)}</span>
        </div>
        <div className="phc-rx-grid">
          <div>
            <h4>سه مشکل کلیدی</h4>
            {d.problems.length ? (
              <ol className="phc-rx-list">
                {d.problems.map((p) => (
                  <li key={p.id}><button type="button" onClick={() => open({ kind: 'ind', id: p.id })}><b>{p.label}</b><span>{p.value} · {p.range}</span></button><StatusChip status={p.status} /></li>
                ))}
              </ol>
            ) : <p className="phc-note">شاخصی در وضعیت نامطلوب یا بحرانی نیست.</p>}
          </div>
          <div>
            <h4>علت ریشه‌ای</h4>
            {d.causes.length ? (
              <ul className="phc-rx-list">
                {d.causes.map((c, i) => <li key={i}><span><b>{c.text}</b>{c.evidence && <span>{c.evidence}</span>}</span><em>{c.basis}</em></li>)}
              </ul>
            ) : <p className="phc-note">علت مشخصی از داده‌ها استخراج نشد.</p>}
          </div>
          <div className={`phc-rx-prog is-${d.prognosis.level}`}>
            <h4>پیش‌آگهی</h4>
            <p>{d.prognosis.text}</p>
            {d.prognosis.signals.length > 0 && <ul>{d.prognosis.signals.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          </div>
        </div>
        <h4 className="phc-rx-t">درمان پیشنهادی</h4>
        {d.prescriptions.length ? (
          <div className="phc-lab-wrap">
            <table className="phc-rx-table">
              <thead><tr><th>اولویت</th><th>اقدام</th><th>برای</th><th>مسئول</th><th>مهلت</th></tr></thead>
              <tbody>
                {d.prescriptions.map((p, i) => (
                  <tr key={i}>
                    <td><span className={`phc-prio is-${p.priority}`}>{PRIORITY_FA[p.priority]}</span></td>
                    <td>{p.action}</td>
                    <td className="phc-muted">{p.why}</td>
                    <td>{p.owner ?? <span className="phc-muted">تعیین نشده</span>}</td>
                    <td>{jd(p.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="phc-note">اقدام تازه‌ای لازم نیست؛ اقدام‌های در جریان در مرکز اقدامات پیگیری می‌شوند.</p>}
      </div>
    </section>
  )
}

/* ── trend ─────────────────────────────────────────────────────────── */

function TrendChart({ history, range, onPick }: { history: Snapshot[]; range: Range; onPick: (date: string) => void }) {
  const data = useMemo(() => {
    const from = range === 'all' ? '' : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10)
    return history.filter((h) => h.date >= from).map((h) => ({ date: h.date, label: jd(h.date).slice(5), index: h.index }))
  }, [history, range])
  if (data.length < 2) return (
    <div className="phc-trend-empty">
      <Empty>{data.length ? 'تاکنون یک اندازه‌گیری ثبت شده است؛ روند از دومین روز محاسبه نمایش داده می‌شود.' : 'در این بازه اندازه‌گیری ثبت نشده است.'}</Empty>
      {data.length === 1 && <button type="button" className="phc-btn" onClick={() => onPick(data[0].date)}>وضعیت {jd(data[0].date)}</button>}
    </div>
  )
  return (
    <div className="phc-trend-chart">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }} onClick={(e) => { const i = Number((e as { activeTooltipIndex?: number })?.activeTooltipIndex); if (Number.isFinite(i) && data[i]) onPick(data[i].date) }}>
          <defs>
            <linearGradient id="phcTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2dd4bf" stopOpacity=".45" /><stop offset="1" stopColor="#2dd4bf" stopOpacity="0" /></linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(148 163 184 / .12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} reversed />
          <YAxis domain={[0, 100]} orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} width={30} />
          <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={65} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip contentStyle={{ background: '#0b1324', border: '1px solid rgb(45 212 191 / .3)', borderRadius: 10, direction: 'rtl' }} labelStyle={{ color: '#e2e8f0' }} formatter={(v) => [fa(Number(v)), 'شاخص سلامت']} />
          <Area type="monotone" dataKey="index" stroke="#2dd4bf" strokeWidth={2} fill="url(#phcTrend)" dot={{ r: 3, fill: '#2dd4bf' }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── sheets ────────────────────────────────────────────────────────── */

function IndicatorSheet({ r, id, history, settings, onClose }: { r: HealthResult; id: string; history: Snapshot[]; settings: HealthSettings; onClose: () => void }) {
  const d = DEF[id], ind = r.indicators[id], b = settings.bands[id]
  const series = history.filter((h) => h.indicators[id]?.value != null).map((h) => ({ label: jd(h.date).slice(5), value: h.indicators[id].value as number }))
  return (
    <SideSheet open title={d.label} sub={d.medical ? `${d.medical} · ${d.domain ? DOMAIN_FA[d.domain] : 'نمایشی'}` : d.domain ? DOMAIN_FA[d.domain] : 'نمایشی'} onClose={onClose}>
      <div className="phc-sheet">
        <div className="phc-sheet-hero" style={{ ['--c' as string]: STATUS_COLOR[ind.status] }}>
          <b>{valueText(id, ind.value)}</b><span>{d.unit}</span>
          <StatusChip status={ind.status} />
          {ind.score != null && <em>امتیاز {fa(ind.score)} از ۱۰۰</em>}
        </div>
        {ind.note && <p className="phc-note">{ind.note}</p>}
        <dl className="phc-def">
          <dt>محدودهٔ مرجع</dt><dd>{rangeText(id, b)} {d.unit && `(${d.unit})`}</dd>
          <dt>روند</dt><dd><Trend id={id} ind={ind} band={b} /></dd>
          <dt>فرمول</dt><dd>{d.formula}</dd>
          <dt>منبع داده</dt><dd>{d.source}</dd>
          <dt>فیلدها</dt><dd className="phc-mono">{d.fields}</dd>
          <dt>تواتر به‌روزرسانی</dt><dd>{d.frequency}</dd>
          <dt>امتیازدهی</dt><dd>خطی میان «مطلوب» (۱۰۰) و «بحرانی» (۰)؛ مقدار بیرون از این بازه به همان حد محدود می‌شود.</dd>
          {d.capAt != null && <><dt>سقف شاخص کل</dt><dd>اگر مقدار به {fa(d.capAt, 2)} برسد، شاخص سلامت از {fa(d.cap)} بیشتر نمی‌شود.</dd></>}
          {d.domain && <><dt>وزن در شاخص کل</dt><dd>حوزهٔ {DOMAIN_FA[d.domain]} با وزن {fa(settings.weights[d.domain])}</dd></>}
        </dl>
        <h4>سابقه</h4>
        {series.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgb(148 163 184 / .15)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} reversed />
              <YAxis orientation="right" tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v) => [fa(Number(v), 2), d.label]} />
              <ReferenceLine y={b.good} stroke="#22c55e" strokeDasharray="4 4" />
              <ReferenceLine y={b.bad} stroke="#ef4444" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="phc-note">برای نمایش سابقه دست‌کم دو اندازه‌گیری لازم است.</p>}
      </div>
    </SideSheet>
  )
}

function IndicatorList({ r, ids, settings, onPick }: { r: HealthResult; ids: string[]; settings: HealthSettings; onPick: (id: string) => void }) {
  return (
    <ul className="phc-ilist">
      {ids.map((id) => {
        const d = DEF[id], ind = r.indicators[id]
        return (
          <li key={id}>
            <button type="button" onClick={() => onPick(id)}>
              <span><b>{d.label}</b><small>{rangeText(id, settings.bands[id])}</small></span>
              <span className="phc-ilist-v" style={{ color: STATUS_COLOR[ind.status] }}>{valueText(id, ind.value)} <small>{d.unit}</small></span>
              <StatusChip status={ind.status} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function OrganSheet({ r, k, settings, onPick, onClose }: { r: HealthResult; k: OrganKey; settings: HealthSettings; onPick: (id: string) => void; onClose: () => void }) {
  const o = r.organs.find((x) => x.key === k)!
  return (
    <SideSheet open title={`${ORGAN_FA[k].name} — ${ORGAN_FA[k].role}`} sub={o.score == null ? 'داده ناقص' : `امتیاز ${fa(o.score)} از ۱۰۰ · ${STATUS_FA[o.status]}`} onClose={onClose}>
      <div className="phc-sheet">
        <p className="phc-note">امتیاز اندام میانگین امتیاز شاخص‌های دارای دادهٔ زیر است.</p>
        <IndicatorList r={r} ids={o.indicators} settings={settings} onPick={onPick} />
      </div>
    </SideSheet>
  )
}

function DomainSheet({ r, k, settings, onPick, onClose }: { r: HealthResult; k: DomainKey; settings: HealthSettings; onPick: (id: string) => void; onClose: () => void }) {
  const d = r.domains.find((x) => x.key === k)!
  const ids = INDICATORS.filter((x) => x.domain === k).map((x) => x.id)
  return (
    <SideSheet open title={`حوزهٔ ${DOMAIN_FA[k]}`} sub={`امتیاز ${fa(d.score)} · وزن ${fa(d.weight)} · پوشش داده ${fa(Math.round(d.coverage * 100))}٪`} onClose={onClose}>
      <div className="phc-sheet">
        {d.prev != null && <p className="phc-note">امتیاز این حوزه در اندازه‌گیری قبل {fa(d.prev)} بوده است.</p>}
        <p className="phc-note">امتیاز حوزه میانگین امتیاز شاخص‌های آن است؛ شاخص بدون داده با امتیاز {fa(settings.missingScore)} حساب می‌شود.</p>
        <IndicatorList r={r} ids={ids} settings={settings} onPick={onPick} />
      </div>
    </SideSheet>
  )
}

function PastSheet({ r, snap, onClose }: { r: HealthResult; snap: Snapshot | null; onClose: () => void }) {
  if (!snap) return null
  const ids = INDICATORS.filter((d) => d.domain).map((d) => d.id)
  return (
    <SideSheet open title={`وضعیت سلامت در ${jd(snap.date)}`} sub={`شاخص ${fa(snap.index)} · ${INDEX_FA[snap.status as keyof typeof INDEX_FA] ?? snap.status}`} onClose={onClose}>
      <div className="phc-sheet">
        {snap.caps.length > 0 && <div className="phc-note is-warn">سقف‌های اعمال‌شده: {snap.caps.map((c) => c.reason).join('؛ ')}</div>}
        <h4>حوزه‌ها: آن روز ← امروز</h4>
        <ul className="phc-ilist">
          {snap.domains.map((d) => {
            const now = r.domains.find((x) => x.key === d.key)?.score ?? null
            return <li key={d.key}><div className="phc-ilist-row"><b>{DOMAIN_FA[d.key]}</b><span>{fa(d.score)} ← {fa(now)}</span></div></li>
          })}
        </ul>
        <h4>شاخص‌ها: آن روز ← امروز</h4>
        <div className="phc-lab-wrap">
          <table className="phc-lab is-compact">
            <thead><tr><th>شاخص</th><th>آن روز</th><th>امروز</th></tr></thead>
            <tbody>
              {ids.map((id) => {
                const then = snap.indicators[id]
                return (
                  <tr key={id}>
                    <td>{DEF[id].label}</td>
                    <td style={{ color: STATUS_COLOR[then?.status ?? 'none'] }}>{valueText(id, then?.value ?? null)}</td>
                    <td style={{ color: STATUS_COLOR[r.indicators[id].status] }}>{valueText(id, r.indicators[id].value)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SideSheet>
  )
}

function CatalogSheet({ settings, onClose }: { settings: HealthSettings; onClose: () => void }) {
  return (
    <SideSheet open title="شناسنامهٔ شاخص‌ها" sub="منبع، فیلدها، فرمول، واحد، محدودهٔ هدف و تواتر هر شاخص" onClose={onClose}>
      <div className="phc-sheet">
        {INDICATORS.map((d) => (
          <article key={d.id} className="phc-cat">
            <h4>{d.label}{d.medical && <small> · {d.medical}</small>}</h4>
            <dl className="phc-def">
              <dt>حوزه</dt><dd>{d.domain ? `${DOMAIN_FA[d.domain]} (در شاخص کل)` : 'نمایشی، خارج از شاخص کل'}</dd>
              <dt>منبع</dt><dd>{d.source}</dd>
              <dt>فیلدها</dt><dd className="phc-mono">{d.fields}</dd>
              <dt>فرمول</dt><dd>{d.formula}</dd>
              <dt>واحد</dt><dd>{d.unit}</dd>
              <dt>محدوده</dt><dd>{rangeText(d.id, settings.bands[d.id])}</dd>
              <dt>تواتر</dt><dd>{d.frequency}</dd>
            </dl>
          </article>
        ))}
      </div>
    </SideSheet>
  )
}

function ProjectsSheet({ open, current, onPick, onClose }: { open: boolean; current: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const [snaps, setSnaps] = useState<Map<string, Snapshot> | null>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (open) { setSnaps(null); loadLatestSnapshots().then(setSnaps) } }, [open])
  const rows = useMemo(() => {
    if (!snaps) return []
    return projects.filter((p) => snaps.has(p.id)).map((p) => ({ p, s: snaps.get(p.id)! })).sort((a, b) => a.s.index - b.s.index)
  }, [projects, snaps])
  const run = async () => {
    setBusy({ done: 0, total: 0 }); setMsg(null)
    const res = await refreshAll((done, total) => setBusy({ done, total }))
    setBusy(null)
    setMsg(res.failed.length ? `${fa(res.done - res.failed.length)} پروژه به‌روزرسانی شد؛ محاسبهٔ ${res.failed.join('، ')} انجام نشد.` : `سلامت ${fa(res.done)} پروژه به‌روزرسانی شد.`)
    setSnaps(await loadLatestSnapshots())
  }
  return (
    <SideSheet open={open} title="پروژه‌ها بر اساس سطح سلامت" sub="آخرین اندازه‌گیری هر پروژه‌ای که به آن دسترسی دارید" onClose={onClose}
      actions={<button type="button" className="phc-btn" onClick={run} disabled={!!busy}>{busy ? <><Loader2 size={14} className="phc-spin" aria-hidden /> {fa(busy.done)} از {fa(busy.total)}</> : <><RefreshCw size={14} aria-hidden /> به‌روزرسانی همه</>}</button>}>
      <div className="phc-sheet">
        {msg && <p className="phc-note">{msg}</p>}
        {!snaps ? <p className="phc-note"><Loader2 size={14} className="phc-spin" aria-hidden /> در حال خواندن…</p>
          : rows.length === 0 ? <p className="phc-note">هنوز سلامت هیچ پروژه‌ای محاسبه نشده است. «به‌روزرسانی همه» را بزنید.</p>
          : (['critical', 'bad', 'watch', 'good'] as const).map((st) => {
            const list = rows.filter((x) => x.s.status === st)
            if (!list.length) return null
            return (
              <div key={st} className="phc-plist">
                <h4 style={{ color: INDEX_COLOR[st] }}>{INDEX_FA[st]} <small>({fa(list.length)})</small></h4>
                <ul>
                  {list.map(({ p, s }) => (
                    <li key={p.id}>
                      <button type="button" className={p.id === current ? 'is-cur' : ''} onClick={() => onPick(p.id)} style={{ ['--c' as string]: INDEX_COLOR[st] }}>
                        <b className="phc-plist-score">{fa(s.index)}</b>
                        <span><strong>{p.officialName}</strong><small>{jd(s.date)}{s.coverage != null && ` · پوشش داده ${fa(Math.round(s.coverage * 100))}٪`}{s.caps.length ? ` · ${s.caps[0].label}` : ''}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
      </div>
    </SideSheet>
  )
}

function SettingsSheet({ projectId, projectName, cfg, isAdmin, onSaved, onClose }: {
  projectId: string | null; projectName: string; cfg: Awaited<ReturnType<typeof loadSettings>> | null; isAdmin: boolean; onSaved: () => void; onClose: () => void
}) {
  const [scope, setScope] = useState<'global' | 'project'>(cfg?.project ? 'project' : 'global')
  const base = scope === 'global' ? { ...DEFAULT_SETTINGS, ...(cfg?.global ?? {}) } : (cfg?.settings ?? DEFAULT_SETTINGS)
  const [weights, setWeights] = useState({ ...DEFAULT_SETTINGS.weights, ...base.weights })
  const [bands, setBands] = useState({ ...DEFAULT_SETTINGS.bands, ...base.bands })
  const [missingScore, setMissing] = useState(base.missingScore ?? DEFAULT_SETTINGS.missingScore)
  const [blockedCap, setBlocked] = useState(base.blockedCap ?? DEFAULT_SETTINGS.blockedCap)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0)
  const save = async () => {
    setSaving(true); setMsg(null)
    const e = await saveSettings(scope === 'project' ? projectId : null, { weights, bands, missingScore, blockedCap })
    setSaving(false)
    if (e) setMsg(e); else onSaved()
  }
  const num = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v))
  return (
    <SideSheet open title="تنظیمات موتور سلامت" sub={isAdmin ? 'وزن حوزه‌ها، محدوده‌های مرجع و قواعد امتیاز' : 'فقط مدیر سامانه می‌تواند تنظیمات را تغییر دهد'} onClose={onClose}
      actions={isAdmin ? <button type="button" className="phc-btn is-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="phc-spin" aria-hidden /> : <Download size={14} aria-hidden />} ذخیره</button> : undefined}>
      <div className="phc-sheet phc-set">
        <Seg label="دامنهٔ تنظیم" value={scope} onChange={setScope} options={[{ key: 'global', label: 'همهٔ پروژه‌ها' }, { key: 'project', label: `فقط ${projectName || 'این پروژه'}` }]} />
        {msg && <p className="phc-note is-warn">{msg}</p>}
        <h4>وزن حوزه‌ها <small className={total === 100 ? '' : 'is-warn'}>(جمع {fa(total)})</small></h4>
        <div className="phc-set-grid">
          {(Object.keys(weights) as DomainKey[]).map((k) => (
            <label key={k}><span>{DOMAIN_FA[k]}</span><input type="number" min={0} max={100} value={weights[k]} disabled={!isAdmin} onChange={(e) => setWeights({ ...weights, [k]: num(e.target.value) })} /></label>
          ))}
        </div>
        <h4>قواعد</h4>
        <div className="phc-set-grid">
          <label><span>امتیاز شاخص بدون داده</span><input type="number" min={0} max={100} value={missingScore} disabled={!isAdmin} onChange={(e) => setMissing(num(e.target.value))} /></label>
          <label><span>سقف شاخص هنگام انسداد گیت</span><input type="number" min={0} max={100} value={blockedCap} disabled={!isAdmin} onChange={(e) => setBlocked(num(e.target.value))} /></label>
        </div>
        <h4>محدودهٔ مرجع شاخص‌ها</h4>
        <div className="phc-lab-wrap">
          <table className="phc-lab is-compact">
            <thead><tr><th>شاخص</th><th>مطلوب</th><th>بحرانی</th></tr></thead>
            <tbody>
              {INDICATORS.map((d) => (
                <tr key={d.id}>
                  <td>{d.label} <small className="phc-muted">({d.unit})</small></td>
                  <td><input type="number" step="any" value={bands[d.id]?.good ?? 0} disabled={!isAdmin} onChange={(e) => setBands({ ...bands, [d.id]: { ...bands[d.id], good: num(e.target.value) } })} aria-label={`${d.label} مطلوب`} /></td>
                  <td><input type="number" step="any" value={bands[d.id]?.bad ?? 0} disabled={!isAdmin} onChange={(e) => setBands({ ...bands, [d.id]: { ...bands[d.id], bad: num(e.target.value) } })} aria-label={`${d.label} بحرانی`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SideSheet>
  )
}

/* ── export ────────────────────────────────────────────────────────── */

async function exportExcel(r: HealthResult, history: Snapshot[], s: HealthSettings, name: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const add = (title: string, rows: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '—': 'موردی نیست' }])
    ws['!views'] = [{ RTL: true }] as unknown as typeof ws['!views']
    XLSX.utils.book_append_sheet(wb, ws, title)
  }
  add('خلاصه', [
    { 'مورد': 'پروژه', 'مقدار': name }, { 'مورد': 'تاریخ', 'مقدار': jd(r.asOf) }, { 'مورد': 'شاخص سلامت', 'مقدار': r.index },
    { 'مورد': 'وضعیت', 'مقدار': INDEX_FA[r.status] }, { 'مورد': 'شاخص بدون سقف', 'مقدار': r.rawIndex }, { 'مورد': 'پوشش داده (٪)', 'مقدار': Math.round(r.coverage * 100) },
    { 'مورد': 'تشخیص', 'مقدار': r.diagnosis.headline }, { 'مورد': 'شرح', 'مقدار': r.diagnosis.summary },
    ...r.caps.map((c) => ({ 'مورد': 'سقف اعمال‌شده', 'مقدار': `${c.reason} → ${c.cap}` })),
  ])
  add('حوزه‌ها', r.domains.map((d) => ({ 'حوزه': DOMAIN_FA[d.key], 'وزن': d.weight, 'امتیاز': d.score, 'قبلی': d.prev ?? '', 'پوشش داده (٪)': Math.round(d.coverage * 100) })))
  add('شاخص‌ها', INDICATORS.map((d) => {
    const x = r.indicators[d.id]
    return { 'شاخص': d.label, 'نام پزشکی': d.medical ?? '', 'حوزه': d.domain ? DOMAIN_FA[d.domain] : 'نمایشی', 'مقدار': x.value ?? 'داده ناقص', 'واحد': d.unit, 'امتیاز': x.score ?? '', 'وضعیت': STATUS_FA[x.status], 'مطلوب': s.bands[d.id]?.good, 'بحرانی': s.bands[d.id]?.bad, 'قبلی': x.prev ?? '', 'منبع': d.source, 'فرمول': d.formula, 'تواتر': d.frequency }
  }))
  add('نسخهٔ درمان', r.diagnosis.prescriptions.map((p) => ({ 'اولویت': PRIORITY_FA[p.priority], 'اقدام': p.action, 'برای': p.why, 'مسئول': p.owner ?? '', 'مهلت': jd(p.due) })))
  add('سابقه', history.map((h) => ({ 'تاریخ': jd(h.date), 'شاخص': h.index, 'وضعیت': INDEX_FA[h.status as keyof typeof INDEX_FA] ?? h.status })))
  XLSX.writeFile(wb, `health-${r.asOf}.xlsx`)
}

export default HealthCenterApp
