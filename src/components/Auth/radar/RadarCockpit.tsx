import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Clock3, FileText, Flag, Gauge, HeartPulse,
  LayoutDashboard, PanelRightOpen, Radar as RadarIcon, RefreshCw, Route, ShieldAlert, ShieldCheck, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { formatJalali } from '../../../lib/jalali'
import { HEALTH_VERDICT_FA, HealthGuideButton, healthColor as healthColorOf } from '../../../modules/projectMetrics/HealthGuide'
import { HEALTH_DIMENSION_LABEL_FA } from '../../../modules/lifecycle/types'
import { ModuleHeaderActions } from '../../common/ModuleHeaderActions'
import { RadarDisplay } from './RadarDisplay'
import { HeartbeatBar } from './HeartbeatBar'
import {
  SEVERITY_COLOR, SEVERITY_LABEL_FA, SIGNAL_CATEGORY_LABEL_FA, STATUS_COLOR, STATUS_LABEL_FA,
  type RadarData, type RadarSignal, type SignalCategory, type SignalSeverity,
} from './radarTypes'
import './radarCockpit.css'

/**
 * The desktop project radar: one screen that answers «how is this project doing and what needs me now», with every
 * figure read from the modules themselves (the same numbers the project dashboard, the health centre, the schedule,
 * the change register and the finance module show). Persian, right-to-left.
 */
const fa = (v: number, d = 0) => v.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${fa(v, d)}٪`)
const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)) : '—')
const SEV_RANK: Record<SignalSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const CAT_ICON: Record<SignalCategory, LucideIcon> = { risk: AlertTriangle, issue: CircleAlert, delay: Clock3, change: RefreshCw, milestone: Flag, contract: FileText, gate: ShieldCheck }
const CAT_ORDER: SignalCategory[] = ['risk', 'issue', 'delay', 'change', 'contract', 'gate', 'milestone']
const VERDICT_FA = HEALTH_VERDICT_FA
const moduleOf = (s: RadarSignal): ModuleKey => (s.category === 'risk' ? 'risk' : s.category === 'issue' ? 'taskissue' : s.category === 'change' ? 'change' : s.category === 'contract' ? 'finance' : s.category === 'gate' ? (s.id.startsWith('pssr') ? 'pssr' : 'stagegate') : 'scheduling')
const MODULE_FA: Partial<Record<ModuleKey, string>> = { risk: 'مدیریت ریسک', taskissue: 'موانع و اقدامات', change: 'مدیریت تغییرات', finance: 'قراردادها و مالی', pssr: 'آمادگی راه‌اندازی', stagegate: 'چرخهٔ عمر', scheduling: 'برنامه‌ریزی و کنترل زمان' }

export interface RadarCockpitProps {
  data: RadarData
  projectName: string
  projectCode: string
  sidebarOpen: boolean
  onOpenSidebar: () => void
  onBack: () => void
  onOpen: (m: ModuleKey) => void
  onRefresh: () => void
  refreshing: boolean
  canSee: (m: ModuleKey) => boolean
}

export function RadarCockpit({ data, projectName, projectCode, sidebarOpen, onOpenSidebar, onBack, onOpen, onRefresh, refreshing, canSee }: RadarCockpitProps) {
  const loading = !data.live
  const [cat, setCat] = useState<SignalCategory | 'all'>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const signals = useMemo(() => [...data.signals].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]), [data.signals])
  const shown = cat === 'all' ? signals : signals.filter((s) => s.category === cat)
  const counts = useMemo(() => Object.fromEntries(CAT_ORDER.map((c) => [c, signals.filter((s) => s.category === c).length])) as Record<SignalCategory, number>, [signals])
  const hd = data.healthDetail
  const statusColor = hd ? healthColorOf(hd) : STATUS_COLOR[data.status]
  const go = (m: ModuleKey) => { if (canSee(m)) onOpen(m) }
  const k = data.kpi

  return (
    <div className="rc" dir="rtl" data-loading={loading || undefined}>
      {/* ── top bar ── */}
      <header className="rc-top">
        <div className="rc-brand">
          <button type="button" className="rc-icon-btn" onClick={onBack} aria-label="بازگشت به صفحهٔ اصلی"><ArrowRight size={17} /></button>
          <span className="rc-logo"><RadarIcon size={18} aria-hidden /></span>
          <div><b>رادار پروژه</b><small>تصویر زندهٔ پروژه از همهٔ ماژول‌ها</small></div>
        </div>
        <div className="rc-top-actions">
          {!sidebarOpen && <button type="button" className="rc-btn" onClick={onOpenSidebar}><PanelRightOpen size={15} aria-hidden /> ماژول‌های پروژه</button>}
          <button type="button" className="rc-btn" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'rc-spin' : ''} aria-hidden /> {refreshing ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی'}</button>
          <ModuleHeaderActions onExitToHub={onBack} hideModuleHome guideKey="radar" />
        </div>
      </header>

      <main className="rc-main">
        {/* ── hero ── */}
        <section className="rc-hero rc-in" style={{ '--st': statusColor } as CSSProperties}>
          <div className="rc-hero-id">
            <h1>{projectName}</h1>
            <div className="rc-hero-meta">
              <span dir="ltr" className="rc-mono">{projectCode}</span>
              <span>به‌روزرسانی {data.reportDateFa}</span>
              {data.currentStageLabel && data.currentStageLabel !== '—' && <span className="rc-chip"><Route size={12} aria-hidden /> فاز جاری: {data.currentStageLabel}</span>}
            </div>
          </div>
          <div className="rc-hero-status">
            <span className="rc-status-pill"><HeartPulse size={15} aria-hidden /> {loading ? 'در حال خواندن…' : hd ? VERDICT_FA[hd.status] : STATUS_LABEL_FA[data.status]}</span>
            <HeartbeatBar status={data.status} color={statusColor} />
            {canSee('projectdashboard') && <button type="button" className="rc-btn is-ghost" onClick={() => go('projectdashboard')}><LayoutDashboard size={15} aria-hidden /> داشبورد پروژه</button>}
          </div>
        </section>

        {/* ── pulse: health, progress, SPI, CPI, finish ── */}
        <section className="rc-pulse" aria-label="شاخص‌های اصلی">
          <Tile i={0} accent={statusColor} label="سلامت پروژه" onClick={canSee('healthcenter') ? () => go('healthcenter') : undefined} extra={<HealthGuideButton health={hd} />}>
            <div className="rc-health">
              <Ring v={k.health} color={statusColor} />
              <div><b className="rc-big">{loading ? '—' : fa(k.health)}<small>/۱۰۰</small></b>
                <span className="rc-sub" style={{ color: statusColor }}>{hd ? `${VERDICT_FA[hd.status]}${hd.drivenBy ? ` · ${HEALTH_DIMENSION_LABEL_FA[hd.drivenBy]}` : ''}` : '—'}</span></div>
            </div>
          </Tile>
          <Tile i={1} accent="#3b82f6" label="پیشرفت کل چرخهٔ عمر" onClick={canSee('stagegate') ? () => go('stagegate') : undefined}>
            <b className="rc-big">{loading ? '—' : pct(k.progressActual, 0)}</b>
            <Progress actual={k.progressActual} planned={k.progressPlanned} />
            <span className="rc-sub">برنامه {pct(k.progressPlanned, 0)} · {deltaFa(k.progressActual - k.progressPlanned)}</span>
          </Tile>
          <Tile i={2} accent="#14b8a6" label="شاخص عملکرد زمانی (SPI)" onClick={canSee('projectdashboard') ? () => go('projectdashboard') : undefined}>
            <b className="rc-big" style={{ color: idxColor(k.spi, 'high') }}>{loading || !k.spi ? '—' : fa(k.spi, 2)}</b>
            <Meter v={k.spi || null} />
            <span className="rc-sub">{!k.spi ? 'برنامه‌ای هنوز صفر است' : k.spi >= 1 ? `${fa((k.spi - 1) * 100)}٪ جلوتر از برنامه` : `${fa((1 - k.spi) * 100)}٪ عقب‌تر از برنامه`}</span>
          </Tile>
          <Tile i={3} accent="#f59e0b" label="شاخص عملکرد هزینه (CPI)" onClick={canSee('projectdashboard') ? () => go('projectdashboard') : undefined}>
            <b className="rc-big" style={{ color: idxColor(k.cpi, 'high') }}>{loading || !k.cpi ? '—' : fa(k.cpi, 2)}</b>
            <Meter v={k.cpi || null} />
            <span className="rc-sub">{!k.cpi ? 'کارکرد تأییدشده‌ای ثبت نشده' : `هر ریال هزینه ${fa(k.cpi, 2)} ریال ارزش کسب کرده`}</span>
          </Tile>
          <Tile i={4} accent="#8b5cf6" label="پایان پیش‌بینی‌شده" onClick={canSee('scheduling') ? () => go('scheduling') : undefined}>
            <FinishTile data={data} />
          </Tile>
        </section>

        {/* ── radar + signal feed ── */}
        <section className="rc-row rc-row-scope">
          <article className="rc-card rc-scope rc-in" style={{ '--d': '160ms' } as CSSProperties}>
            <header className="rc-card-head"><b><RadarIcon size={16} aria-hidden /> اسکن سیگنال‌ها</b><small>فاصله از مرکز = شدت؛ نزدیک‌تر یعنی بحرانی‌تر</small></header>
            <div className="rc-seg" role="tablist" aria-label="نوع سیگنال">
              <button type="button" role="tab" aria-selected={cat === 'all'} onClick={() => setCat('all')}>همه <i>{fa(signals.length)}</i></button>
              {CAT_ORDER.filter((c) => counts[c] > 0).map((c) => { const I = CAT_ICON[c]; return <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}><I size={13} aria-hidden /> {SIGNAL_CATEGORY_LABEL_FA[c]} <i>{fa(counts[c])}</i></button> })}
            </div>
            <div className="rc-scope-wrap"><RadarDisplay signals={shown} dimmed={loading || refreshing} hideCallout onOpenDetail={(s) => setPicked(s.id)} /></div>
            <div className="rc-sev-legend">{(['critical', 'high', 'medium', 'low'] as SignalSeverity[]).map((s) => <span key={s}><i style={{ background: SEVERITY_COLOR[s] }} />{SEVERITY_LABEL_FA[s]} {fa(shown.filter((x) => x.severity === s).length)}</span>)}</div>
          </article>
          <article className="rc-card rc-feed rc-in" style={{ '--d': '200ms' } as CSSProperties}>
            <header className="rc-card-head"><b><Activity size={16} aria-hidden /> نیازمند تصمیم</b><small>{cat === 'all' ? 'همهٔ سیگنال‌ها، به ترتیب شدت' : SIGNAL_CATEGORY_LABEL_FA[cat]}</small></header>
            {loading ? <SkeletonList /> : shown.length === 0 ? <p className="rc-empty"><CheckCircle2 size={18} aria-hidden /> سیگنالی در این دسته ثبت نشده است.</p> : (
              <ul className="rc-signals">
                {shown.slice(0, 40).map((s) => {
                  const I = CAT_ICON[s.category], open = picked === s.id, m = moduleOf(s)
                  return (
                    <li key={s.id} className={open ? 'is-open' : ''} style={{ '--sv': SEVERITY_COLOR[s.severity] } as CSSProperties}>
                      <button type="button" className="rc-sig" aria-expanded={open} onClick={() => setPicked(open ? null : s.id)}>
                        <span className="rc-sig-ico"><I size={14} aria-hidden /></span>
                        <span className="rc-sig-body"><b>{s.title}</b><small>{SIGNAL_CATEGORY_LABEL_FA[s.category]}{s.subject ? ` · ${s.subject}` : ''}</small></span>
                        <span className="rc-sev">{SEVERITY_LABEL_FA[s.severity]}</span>
                      </button>
                      {open && (
                        <div className="rc-sig-detail">
                          {s.detail && s.detail !== '—' && <p>{s.detail}</p>}
                          {s.impact && s.impact !== '—' && <p><span>اثر:</span> {s.impact}</p>}
                          {s.rootCause && s.rootCause !== '—' && <p><span>علت:</span> {s.rootCause}</p>}
                          {s.recommendedAction && s.recommendedAction !== '—' && <p className="rc-act"><span>اقدام:</span> {s.recommendedAction}</p>}
                          {canSee(m) && <button type="button" className="rc-btn is-small" onClick={() => go(m)}>باز کردن در {MODULE_FA[m] ?? 'ماژول'} <ArrowLeft size={13} aria-hidden /></button>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </article>
        </section>

        {/* ── lifecycle + EPC ── */}
        <section className="rc-card rc-life rc-in" style={{ '--d': '240ms' } as CSSProperties}>
          <header className="rc-card-head"><b><Route size={16} aria-hidden /> چرخهٔ عمر پروژه</b><small>کل {pct(data.lifecycleOverallPct ?? k.progressActual, 0)} · برنامه {pct(k.progressPlanned, 0)}</small>
            {canSee('stagegate') && <button type="button" className="rc-link" onClick={() => go('stagegate')}>Stage-Gate <ArrowLeft size={13} aria-hidden /></button>}</header>
          {data.lifecycle.length ? (
            <ol className="rc-rail">
              {data.lifecycle.map((st, i) => (
                <li key={st.key} className={`is-${st.state}`} style={{ '--p': `${Math.max(0, Math.min(100, st.progressPct))}%`, '--i': i } as CSSProperties} title={st.dateFa}>
                  <span className="rc-rail-dot">{st.state === 'done' ? <CheckCircle2 size={14} aria-hidden /> : fa(i + 1)}</span>
                  <b>{st.label}</b>
                  <span className="rc-rail-bar"><i /></span>
                  <small>{st.state === 'upcoming' ? 'پیش رو' : pct(st.progressPct, 0)}</small>
                </li>
              ))}
            </ol>
          ) : <p className="rc-empty">{loading ? 'در حال خواندن…' : 'چرخهٔ عمر یا برنامهٔ EPC برای این پروژه ثبت نشده است.'}</p>}
          {data.epc && (
            <div className="rc-epc">
              {data.epc.map((d) => {
                const m: ModuleKey = d.key === 'engineering' ? 'engineering' : d.key === 'procurement' ? 'material' : 'execution'
                return (
                  <button key={d.key} type="button" className="rc-epc-item" onClick={() => go(m)} disabled={!canSee(m)}>
                    <span className="rc-epc-head"><b>{d.label}</b><span>{pct(d.pct)}{d.plannedPct != null && <small> / برنامه {pct(d.plannedPct)}</small>}</span></span>
                    <Progress actual={d.pct} planned={d.plannedPct ?? null} />
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── gate · contract · watch list ── */}
        <section className="rc-row rc-row-3">
          <article className="rc-card rc-in" style={{ '--d': '280ms' } as CSSProperties}>
            <header className="rc-card-head"><b><Flag size={16} aria-hidden /> گیت بعدی</b>{canSee('stagegate') && <button type="button" className="rc-link" onClick={() => go('stagegate')}>جزئیات <ArrowLeft size={13} aria-hidden /></button>}</header>
            {data.nextGate.prerequisites || data.nextGate.readinessPct ? <>
              <div className="rc-gate">
                <Ring v={data.nextGate.readinessPct} color={data.nextGate.failed ? '#ef4444' : data.nextGate.readinessPct >= 80 ? '#22c55e' : '#f59e0b'} label={pct(data.nextGate.readinessPct, 0)} />
                <div><b className="rc-gate-name">{data.nextGate.name}</b><span className="rc-sub">آمادگی برای عبور از گیت</span></div>
              </div>
              <div className="rc-gate-stats">
                <span><b>{fa(data.nextGate.prerequisites)}</b>پیش‌نیاز</span><span className="is-ok"><b>{fa(data.nextGate.passed)}</b>تأییدشده</span>
                <span className="is-warn"><b>{fa(data.nextGate.pending)}</b>در انتظار</span><span className="is-bad"><b>{fa(data.nextGate.failed)}</b>ردشده</span>
              </div>
            </> : <p className="rc-empty">{loading ? 'در حال خواندن…' : 'گیتی برای این پروژه ثبت نشده است.'}</p>}
          </article>

          <article className="rc-card rc-in" style={{ '--d': '320ms' } as CSSProperties}>
            <header className="rc-card-head"><b><Wallet size={16} aria-hidden /> قرارداد اصلی</b>{canSee('finance') && <button type="button" className="rc-link" onClick={() => go('finance')}>مالی <ArrowLeft size={13} aria-hidden /></button>}</header>
            {data.contract ? <ContractBody c={data.contract} /> : <p className="rc-empty">{loading ? 'در حال خواندن…' : 'قراردادی برای این پروژه در ماژول مالی ثبت نشده است.'}</p>}
          </article>

          <article className="rc-card rc-in" style={{ '--d': '360ms' } as CSSProperties}>
            <header className="rc-card-head"><b><Gauge size={16} aria-hidden /> پایش</b></header>
            <div className="rc-watch">
              <Count icon={ShieldAlert} color="#f43f5e" label="ریسک فعال" v={k.activeRisks} sub={k.activeRisksHigh ? `${fa(k.activeRisksHigh)} بالا یا بحرانی` : undefined} onClick={() => go('risk')} />
              <Count icon={CircleAlert} color="#a78bfa" label="مسئلهٔ باز" v={k.openIssues} sub={k.openIssuesHigh ? `${fa(k.openIssuesHigh)} بالا یا بحرانی` : undefined} onClick={() => go('taskissue')} />
              <Count icon={Clock3} color="#f59e0b" label="فعالیت عقب‌افتاده" v={k.delayedActivities} sub={data.schedule?.criticalOverdue ? `${fa(data.schedule.criticalOverdue)} روی مسیر بحرانی` : undefined} onClick={() => go('scheduling')} />
              <Count icon={RefreshCw} color="#38bdf8" label="تغییر در انتظار تصمیم" v={k.pendingChanges} onClick={() => go('change')} />
            </div>
            <div className="rc-ms">
              <span className="rc-ms-head"><CalendarClock size={14} aria-hidden /> نقاط عطف ۳۰ روز آینده <i>{fa(k.upcomingMilestones)}</i></span>
              {data.schedule?.milestones?.length ? <ul>{data.schedule.milestones.slice(0, 4).map((m) => <li key={m.code + m.date}><span className={m.critical ? 'is-crit' : ''}>{m.name}</span><small>{jd(m.date)}</small></li>)}</ul>
                : <small className="rc-sub">{loading ? 'در حال خواندن…' : 'نقطهٔ عطفی در ۳۰ روز آینده نیست.'}</small>}
            </div>
          </article>
        </section>

        <footer className="rc-foot">
          <span><span className="rc-live-dot" aria-hidden /> {loading ? 'در حال خواندن از ماژول‌ها…' : 'داده‌ها از ماژول‌ها خوانده شده است'}</span>
          <span>منابع: سلامت و EVM از داشبورد پروژه · چرخهٔ عمر از Stage-Gate · EPC از مهندسی، کالا و اجرا · برنامه از کنترل زمان · ریسک، مسائل، تغییرات، مالی و PSSR از ماژول‌های خودشان</span>
        </footer>
      </main>
    </div>
  )
}

// ── pieces ──────────────────────────────────────────────────────────────────
function Tile({ i, accent, label, children, onClick, extra }: { i: number; accent: string; label: string; children: ReactNode; onClick?: () => void; extra?: ReactNode }) {
  return (
    <article className={`rc-tile rc-in${onClick ? ' is-link' : ''}`} style={{ '--ac': accent, '--d': `${i * 40}ms` } as CSSProperties}>
      <div className="rc-tile-head"><span>{label}</span>{extra}</div>
      {children}
      {onClick && <button type="button" className="rc-tile-hit" onClick={onClick} aria-label={`باز کردن ${label}`} />}
    </article>
  )
}
function Ring({ v, color, label }: { v: number; color: string; label?: string }) {
  const r = 22, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, v)) / 100
  return (
    <span className="rc-ring">
      <svg viewBox="0 0 56 56" aria-hidden><circle cx="28" cy="28" r={r} className="rc-ring-track" /><circle cx="28" cy="28" r={r} stroke={color} strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 28 28)" className="rc-ring-fill" /></svg>
      {label && <b>{label}</b>}
    </span>
  )
}
function Progress({ actual, planned }: { actual: number; planned: number | null }) {
  const behind = planned != null && actual < planned - 0.5
  return (
    <span className="rc-prog">
      <i className={behind ? 'is-behind' : ''} style={{ width: `${Math.max(0, Math.min(100, actual))}%` }} />
      {planned != null && planned > 0 && <em style={{ insetInlineStart: `${Math.min(100, planned)}%` }} title={`برنامه ${pct(planned)}`} />}
    </span>
  )
}
const idxColor = (v: number, better: 'high') => (!v ? undefined : better === 'high' ? (v >= 1 ? '#22c55e' : v >= 0.9 ? '#f59e0b' : '#ef4444') : undefined)
function Meter({ v }: { v: number | null }) {
  const lo = 0.5, hi = 1.5, x = (n: number) => ((Math.max(lo, Math.min(hi, n)) - lo) / (hi - lo)) * 100
  return (
    <span className="rc-meter" dir="ltr">
      <span style={{ left: 0, width: `${x(0.9)}%`, background: '#ef4444' }} /><span style={{ left: `${x(0.9)}%`, width: `${x(1) - x(0.9)}%`, background: '#f59e0b' }} /><span style={{ left: `${x(1)}%`, right: 0, background: '#22c55e' }} />
      <em style={{ left: `${x(1)}%` }} />
      {v != null && <b style={{ left: `${x(v)}%` }} />}
    </span>
  )
}
const deltaFa = (d: number) => (Math.abs(d) < 0.5 ? 'طبق برنامه' : d > 0 ? `${fa(d, 1)}٪ جلوتر` : `${fa(-d, 1)}٪ عقب‌تر`)
function FinishTile({ data }: { data: RadarData }) {
  const s = data.schedule
  if (!s) return <><b className="rc-big">—</b><span className="rc-sub">{data.live ? 'برنامهٔ زمان‌بندی تأییدشده‌ای ثبت نشده' : 'در حال خواندن…'}</span></>
  const ref = s.revisedFinish ?? s.contractFinish
  const late = s.contractorDelay ?? (s.baselineSlip ?? 0)
  return (
    <>
      <b className="rc-big rc-date">{jd(s.forecastFinish)}</b>
      <span className={`rc-badge ${late > 0 ? 'is-bad' : 'is-ok'}`}>{late > 0 ? `${fa(late)} روز دیرتر از ${s.contractorDelay != null ? 'قرارداد' : 'خط مبنا'}` : 'در محدودهٔ قرارداد'}</span>
      <span className="rc-sub">{ref ? `پایان قراردادی ${jd(ref)}` : s.baselineFinish ? `خط مبنا ${jd(s.baselineFinish)}` : ''} · تاریخ داده {jd(s.dataDate)}</span>
    </>
  )
}
function ContractBody({ c }: { c: NonNullable<RadarData['contract']> }) {
  const rial = c.currency.trim() === 'ریال'
  const money = (m: number) => (rial ? `${fa(m / 1000, 1)} میلیارد ریال` : `${fa(m, 1)} میلیون ${c.currency.trim()}`)
  return (
    <div className="rc-contract">
      {(c.title || c.number) && <p className="rc-sub">{c.title}{c.number ? <span dir="ltr"> · {c.number}</span> : null}</p>}
      <b className="rc-big">{money(c.contractValue)}</b>
      <span className="rc-sub">ارزش جاری قرارداد</span>
      <div className="rc-paid"><span>پرداخت‌شده</span><Progress actual={c.paidPct} planned={null} /><b>{pct(c.paidPct, 0)}</b></div>
      <dl>
        <div><dt>الحاقیه‌های مصوب</dt><dd>{money(c.approvedChanges)}</dd></div>
        <div><dt>ادعاهای باز</dt><dd className={c.claims > 0 ? 'is-warn' : ''}>{money(c.claims)}</dd></div>
        <div><dt>کسور حسن انجام کار</dt><dd>{money(c.retention)}</dd></div>
      </dl>
    </div>
  )
}
function Count({ icon: I, color, label, v, sub, onClick }: { icon: LucideIcon; color: string; label: string; v: number; sub?: string; onClick: () => void }) {
  return (
    <button type="button" className="rc-count" style={{ '--cc': color } as CSSProperties} onClick={onClick}>
      <span className="rc-count-ico"><I size={15} aria-hidden /></span>
      <span className="rc-count-body"><small>{label}</small><b>{fa(v)}</b>{sub && <em>{sub}</em>}</span>
    </button>
  )
}
function SkeletonList() {
  return <div className="rc-skel-list" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className="rc-skel" style={{ animationDelay: `${i * 80}ms` }} />)}</div>
}
