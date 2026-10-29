import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Award, BarChart3, Building2, CalendarClock, ClipboardCheck, Gauge, Gavel, Layers, MapPin, Network, ShieldAlert, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import type { MasterProject } from '../../masterdata/types'
import type { RmRisk, RmRiskAssessment } from '../../risk/types'
import type { ImIssue } from '../../issues/types'
import { currentState, riskLevel, riskScore, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA } from '../../risk/lib/riskScore'
import { formatJalali } from '../../../lib/jalali'
import { decisionQueue, DECISION_FA, QUEUE_REASON_FA, type PfProjectView } from '../lib/portfolioCore'
import { achievements, budget, byGroup, earnedScheduleDelay, gapOf, statusOf, STATUS_FA, vacPct, warnings, weightedProgress, whyCritical, type Status } from '../lib/dashboardCore'
import { sharedCategories } from '../lib/issueKpiCore'
import { faNum, fmtMoney } from '../components/pfUi'
import { PortfolioMap } from '../components/PortfolioMap'
import { ProgressChart } from '../components/ProgressChart'
import './dashboard.css'

const today = () => new Date().toISOString().slice(0, 10)
const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : '—')
const pct = (n: number | null | undefined, d = 0) => (n == null ? '—' : `${faNum(n, d)}٪`)

type TabKey = 'performance' | 'risk' | 'decisions' | 'issues' | 'priority'

/** The portfolio manager's single screen: budget, progress, delay, risk, geography, the projects that need intervention and the decisions waiting. */
export function DashboardTab({ views, projects, risks, riskMaster, assessments, issuesByMaster, currency, canGovern, onDecide, onOpenTab }: {
  views: PfProjectView[]; projects: MasterProject[]; risks: RmRisk[]; riskMaster: Map<string, string>; assessments: RmRiskAssessment[]; issuesByMaster: Map<string, ImIssue[]> | null
  currency: string; canGovern: boolean; onDecide: (projectId: string) => void; onOpenTab: (t: TabKey) => void
}) {
  const programs = useMasterDataStore((s) => s.programs)
  const orgs = useMasterDataStore((s) => s.organizations)
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const progName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? '—'

  const b = useMemo(() => budget(views), [views])
  const wp = useMemo(() => weightedProgress(views), [views])
  const delays = useMemo(() => views.map((v) => ({ v, d: earnedScheduleDelay(v.input.snapshot?.trend) })).filter((x) => x.d != null) as { v: PfProjectView; d: { days: number; lowerBound: boolean } }[], [views])
  const avgDelay = delays.length ? delays.reduce((n, x) => n + x.d.days, 0) / delays.length : null
  const warns = useMemo(() => warnings(views, today()), [views])
  const critical = views.filter((v) => statusOf(v) === 'critical')
  const statusCount = (s: Status) => views.filter((v) => statusOf(v) === s).length
  const delayOf = (id: string) => delays.find((x) => x.v.input.id === id)?.d ?? null

  return (
    <div className="pd">
      {/* row 1 — figures */}
      <div className="pd-top">
        <BudgetCard b={b} currency={currency} />
        <div className="pd-kpis">
          <Card tone="#ef4444" icon={<AlertTriangle size={18} />} label="پروژه‌های بحرانی" value={faNum(critical.length)} sub={`از ${faNum(views.length)} پروژه`} />
          <Card tone="#f59e0b" icon={<ShieldAlert size={18} />} label="انحرافات کلیدی" value={faNum(warns.filter((w) => w.severity === 'high').length)} sub={`${faNum(new Set(warns.filter((w) => w.severity === 'high').map((w) => w.projectId)).size)} پروژه · ${faNum(warns.length)} هشدار کل`} />
          <Card tone="#6366f1" icon={<CalendarClock size={18} />} label="میانگین تأخیر" value={avgDelay == null ? '—' : `${faNum(Math.round(avgDelay))} روز`} sub={avgDelay == null ? 'منحنی پیشرفت EPC ثبت نشده' : `روش زمان کسب‌شده · ${faNum(delays.length)} پروژه`} />
          <Card tone="#22c55e" icon={<TrendingUp size={18} />} label="پیشرفت کل پرتفولیو" value={pct(wp?.actual, 0)} sub={wp ? `برنامه ${pct(wp.planned, 0)} · ${wp.actual >= wp.planned ? 'جلوتر' : `${faNum(wp.planned - wp.actual, 1)} واحد عقب`}` : 'شاخص پیشرفت ثبت نشده'}>
            {wp && <div className="pd-meter"><i style={{ width: `${Math.min(100, wp.actual)}%` }} /><s style={{ insetInlineStart: `${Math.min(100, wp.planned)}%` }} /></div>}
          </Card>
          <Card tone="#0ea5e9" icon={<Layers size={18} />} label="تعداد کل پروژه‌ها" value={faNum(views.length)} sub={`${faNum(statusCount('good'))} خوب · ${faNum(statusCount('attention'))} نیازمند توجه · ${faNum(statusCount('unknown'))} بدون داده`} />
        </div>
      </div>

      {/* row 2 — risk heat map and trend */}
      <div className="pd-row2">
        <RiskMatrix risks={risks} assessments={assessments} names={(riskId) => byId.get(riskMaster.get(riskId) ?? '')?.officialName ?? '—'} onOpen={() => onOpenTab('risk')} />
        <TrendCard views={views} onOpen={() => onOpenTab('performance')} />
      </div>

      {/* row 3 — geography, critical projects, programs */}
      <div className="pd-row3">
        <MapCard views={views} byId={byId} />
        <Box title="پروژه‌های بحرانی و نیازمند مداخله" icon={<AlertTriangle size={15} />} tone="#ef4444" foot={<Foot onClick={() => onOpenTab('decisions')}>مشاهدهٔ صف تصمیم</Foot>}>
          {!critical.length ? <p className="pd-empty">پروژهٔ بحرانی نیست.</p> : (
            <div className="pd-table-wrap"><table className="pd-table"><thead><tr><th>پروژه / طرح</th><th>دلیل بحرانی بودن</th><th>تأخیر</th><th>پیشرفت</th></tr></thead><tbody>
              {critical.slice(0, 6).map((v) => { const d = delayOf(v.input.id); return (
                <tr key={v.input.id}><td><b>{v.input.name}</b><small>{progName(v.input.programId)}</small></td><td className="pd-bad">{whyCritical(v)}</td><td>{d ? `${d.lowerBound ? '≥' : ''}${faNum(d.days)} روز` : '—'}</td><td>{pct(v.input.snapshot?.actual)}</td></tr>
              ) })}
            </tbody></table></div>
          )}
        </Box>
        <Box title="خلاصهٔ وضعیت طرح‌ها" icon={<Building2 size={15} />} tone="#0ea5e9">
          <ProgramList views={views} name={progName} />
        </Box>
      </div>

      {/* row 4 — status table and achievements */}
      <div className="pd-row4">
        <Box title="وضعیت پروژه‌های پرتفولیو" icon={<ClipboardCheck size={15} />} tone="#6366f1" foot={<Foot onClick={() => onOpenTab('performance')}>عملکرد و پیش‌بینی همهٔ پروژه‌ها</Foot>}>
          <div className="pd-table-wrap"><table className="pd-table"><thead><tr><th>پروژه</th><th>پیشرفت</th><th>انحراف زمان</th><th>انحراف هزینه</th><th>وضعیت</th><th>بودجه ({currency})</th></tr></thead><tbody>
            {[...views].sort((a, c) => ({ critical: 0, attention: 1, good: 2, unknown: 3 })[statusOf(a)] - ({ critical: 0, attention: 1, good: 2, unknown: 3 })[statusOf(c)]).slice(0, 10).map((v) => {
              const d = delayOf(v.input.id), vp = vacPct(v), s = statusOf(v), g = gapOf(v)
              return (
                <tr key={v.input.id}><td><b>{v.input.name}</b></td><td>{pct(v.input.snapshot?.actual)}{g != null && <small className={g < 0 ? 'pd-bad' : 'pd-good'}>{g < 0 ? '' : '+'}{faNum(g, 1)} از برنامه</small>}</td>
                  <td className={d && d.days > 0 ? 'pd-bad' : ''}>{d ? `${d.lowerBound ? '≥' : ''}${faNum(d.days)} روز` : '—'}</td>
                  <td className={vp != null && vp < 0 ? 'pd-bad' : vp != null ? 'pd-good' : ''}>{vp == null ? '—' : `${vp < 0 ? '+' : '−'}${faNum(Math.abs(vp), 1)}٪`}</td>
                  <td><span className="pd-chip" style={{ '--c': STATUS_FA[s].tone } as CSSProperties}>{STATUS_FA[s].label}</span></td><td>{v.bac ? fmtMoney(v.bac, '') : '—'}</td></tr>
              )
            })}
          </tbody></table></div>
          {views.length > 10 && <p className="pd-note">{faNum(views.length - 10)} پروژهٔ دیگر در تب «عملکرد و پیش‌بینی».</p>}
        </Box>
        <Box title="مهم‌ترین دستاوردها و فرصت‌ها" icon={<Award size={15} />} tone="#22c55e">
          <Achievements views={views} />
        </Box>
      </div>

      {/* row 5 — warnings, decisions, cross-project */}
      <div className="pd-row5">
        <Box title="هشدارهای پیش‌نگر" icon={<AlertTriangle size={15} />} tone="#f97316" foot={<Foot onClick={() => onOpenTab('performance')}>مشاهدهٔ همه</Foot>}>
          {!warns.length ? <p className="pd-empty">هشداری نیست.</p> : (
            <div className="pd-table-wrap"><table className="pd-table is-compact"><thead><tr><th>نوع هشدار</th><th>پروژه</th><th>شرح</th><th>اهمیت</th></tr></thead><tbody>
              {warns.slice(0, 6).map((w) => <tr key={w.key}><td>{w.kind}</td><td>{w.project}</td><td className="pd-sec">{w.text}</td><td><span className="pd-chip" style={{ '--c': w.severity === 'high' ? '#ef4444' : '#f59e0b' } as CSSProperties}>{w.severity === 'high' ? 'بالا' : 'متوسط'}</span></td></tr>)}
            </tbody></table></div>
          )}
          <p className="pd-note">قاعده‌محور: گیت مسدود، SPI یا CPI زیر ۰٫۹، پیش‌بینی بیش‌هزینه بالای ۵٪، مایلستون بحرانی عقب، موعد بازبینی گذشته.</p>
        </Box>
        <Decisions views={views} canGovern={canGovern} onDecide={onDecide} onOpen={() => onOpenTab('decisions')} />
        <Box title="تحلیل بین‌پروژه‌ای" icon={<Network size={15} />} tone="#8b5cf6" foot={<Foot onClick={() => onOpenTab('issues')}>موانع و مسائل</Foot>}>
          <CrossProject views={views} delays={delays} issuesByMaster={issuesByMaster} progName={progName} contractorOf={(id) => { const p = byId.get(id); return p?.contractorOrgId ? orgs.find((o) => o.id === p.contractorOrgId)?.name ?? null : null }} />
        </Box>
      </div>
    </div>
  )
}

/* ── pieces ────────────────────────────────────────────────────────── */

function Card({ tone, icon, label, value, sub, children }: { tone: string; icon: ReactNode; label: string; value: string; sub: string; children?: ReactNode }) {
  return (
    <div className="pd-card" style={{ '--c': tone } as CSSProperties}>
      <span className="pd-card-ic" aria-hidden>{icon}</span>
      <p className="pd-card-l">{label}</p>
      <b className="pd-card-v">{value}</b>
      {children}
      <small className="pd-card-s">{sub}</small>
    </div>
  )
}

function Box({ title, icon, tone, foot, children, className = '' }: { title: string; icon: ReactNode; tone: string; foot?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pd-box ${className}`} style={{ '--c': tone } as CSSProperties}>
      <header><h3><span aria-hidden>{icon}</span>{title}</h3></header>
      <div className="pd-box-body">{children}</div>
      {foot && <footer>{foot}</footer>}
    </section>
  )
}
const Foot = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button type="button" className="pd-link" onClick={onClick}><ArrowLeft size={13} /> {children}</button>

function BudgetCard({ b, currency }: { b: ReturnType<typeof budget>; currency: string }) {
  const R = 52, C = 2 * Math.PI * R
  const p = b.absorbedPct == null ? 0 : Math.min(100, b.absorbedPct)
  return (
    <section className="pd-box pd-budget" style={{ '--c': '#16a34a' } as CSSProperties}>
      <header><h3><span aria-hidden><Wallet size={15} /></span>بودجهٔ کل پرتفولیو و میزان جذب</h3></header>
      <div className="pd-budget-body">
        <svg viewBox="0 0 140 140" className="pd-donut" role="img" aria-label={`جذب ${faNum(p, 0)} درصد بودجه`}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--pd-track)" strokeWidth="16" />
          <circle cx="70" cy="70" r={R} fill="none" stroke="#16a34a" strokeWidth="16" strokeDasharray={`${(p / 100) * C} ${C}`} transform="rotate(-90 70 70)" strokeLinecap="butt" />
          <text x="70" y="62" textAnchor="middle" className="pd-donut-l">کل بودجه</text>
          <text x="70" y="82" textAnchor="middle" className="pd-donut-v">{fmtMoney(b.total, '')}</text>
        </svg>
        <dl>
          <div><dt><i style={{ background: '#16a34a' }} />جذب‌شده (تأییدشده)</dt><dd>{fmtMoney(b.absorbed, '')}<small>{b.absorbedPct == null ? '' : `${faNum(b.absorbedPct, 0)}٪`}</small></dd></div>
          <div><dt><i style={{ background: 'var(--pd-track)' }} />باقی‌مانده</dt><dd>{fmtMoney(b.remaining, '')}<small>{b.absorbedPct == null ? '' : `${faNum(100 - b.absorbedPct, 0)}٪`}</small></dd></div>
          <p className="pd-note">{currency} · بودجهٔ {faNum(b.projectsWithBudget)} پروژه؛ جذب از صورت‌وضعیت‌های تأییدشدهٔ EPC در {faNum(b.projectsWithCost)} پروژه.</p>
        </dl>
      </div>
    </section>
  )
}

const LEVELS = [5, 4, 3, 2, 1]
function RiskMatrix({ risks, assessments, names, onOpen }: { risks: RmRisk[]; assessments: RmRiskAssessment[]; names: (riskId: string) => string; onOpen: () => void }) {
  const [cell, setCell] = useState<string | null>(null)
  const grid = useMemo(() => {
    const m = new Map<string, RmRisk[]>()
    for (const r of risks) {
      if (r.status === 'closed') continue
      const s = currentState(r, assessments.filter((a) => a.riskId === r.id))
      m.set(`${s.probability}-${s.impact}`, [...(m.get(`${s.probability}-${s.impact}`) ?? []), r])
    }
    return m
  }, [risks, assessments])
  const active = [...grid.values()].reduce((n, l) => n + l.length, 0)
  const picked = cell ? grid.get(cell) ?? [] : []
  return (
    <Box title="نقشهٔ حرارتی ریسک‌های پرتفولیو — احتمال × اثر" icon={<ShieldAlert size={15} />} tone="#ef4444" foot={<Foot onClick={onOpen}>ریسک و وابستگی</Foot>}>
      <div className="pd-heat">
        <div className="pd-heat-y" aria-hidden><span>اثر</span>{LEVELS.map((l) => <b key={l}>{faNum(l)}</b>)}</div>
        <div className="pd-heat-grid" role="grid" aria-label="ماتریس احتمال و اثر">
          {LEVELS.map((impact) => [1, 2, 3, 4, 5].map((prob) => {
            const k = `${prob}-${impact}`, list = grid.get(k) ?? [], lvl = riskLevel(riskScore(prob, impact))
            return (
              <button key={k} type="button" role="gridcell" className={`pd-heat-cell${cell === k ? ' is-on' : ''}`} style={{ '--h': RISK_LEVEL_COLOR[lvl], opacity: list.length ? 1 : 0.38 } as CSSProperties}
                aria-label={`احتمال ${prob}، اثر ${impact}: ${list.length} ریسک`} onClick={() => setCell(cell === k ? null : k)}>
                {list.length ? faNum(list.length) : ''}
              </button>
            )
          }))}
        </div>
        <div className="pd-heat-x" aria-hidden>{[1, 2, 3, 4, 5].map((l) => <b key={l}>{faNum(l)}</b>)}<span>احتمال</span></div>
      </div>
      <div className="pd-legend">{(['critical', 'high', 'medium', 'low'] as const).map((l) => <span key={l}><i style={{ background: RISK_LEVEL_COLOR[l] }} />{RISK_LEVEL_LABEL_FA[l]}</span>)}<span className="pd-sec">{faNum(active)} ریسک فعال</span></div>
      {cell && (
        <ul className="pd-cell-list">
          {!picked.length ? <li className="pd-sec">ریسکی در این خانه نیست.</li> : picked.slice(0, 8).map((r) => <li key={r.id}><b>{r.title}</b><small>{names(r.id)}</small></li>)}
          {picked.length > 8 && <li className="pd-sec">و {faNum(picked.length - 8)} ریسک دیگر</li>}
        </ul>
      )}
      {!active && <p className="pd-empty">ریسک فعالی در این محدوده ثبت نشده — به معنای ریسک کم نیست.</p>}
    </Box>
  )
}

function TrendCard({ views, onOpen }: { views: PfProjectView[]; onOpen: () => void }) {
  return (
    <Box title="پیشرفت پروژه‌های پرتفولیو" icon={<BarChart3 size={15} />} tone="#2563eb" foot={<Foot onClick={onOpen}>عملکرد و پیش‌بینی</Foot>}>
      <ProgressChart views={views} />
    </Box>
  )
}

function MapCard({ views, byId }: { views: PfProjectView[]; byId: Map<string, MasterProject> }) {
  return (
    <Box title="وضعیت جغرافیایی پروژه‌ها" icon={<MapPin size={15} />} tone="#0d9488" className="pd-mapbox">
      <PortfolioMap views={views} byId={byId} />
    </Box>
  )
}

function ProgramList({ views, name }: { views: PfProjectView[]; name: (id: string | null) => string }) {
  const g = byGroup(views, (v) => v.input.programId, (k) => name(k))
  if (!g.length) return <p className="pd-empty">پروژه‌های این محدوده به طرحی وصل نیستند.</p>
  return (
    <ul className="pd-progs">{g.slice(0, 6).map((p) => (
      <li key={p.key}>
        <div><b>{p.name}</b><small>{faNum(p.count)} پروژه{p.critical ? ` · ${faNum(p.critical)} بحرانی` : ''}</small></div>
        <div className="pd-progbar" title={p.planned != null ? `برنامه ${faNum(p.planned, 0)}٪` : ''}><i style={{ width: `${Math.min(100, p.actual ?? 0)}%` }} />{p.planned != null && <s style={{ insetInlineStart: `${Math.min(100, p.planned)}%` }} />}</div>
        <span>{pct(p.actual)}</span>
      </li>
    ))}</ul>
  )
}

function Achievements({ views }: { views: PfProjectView[] }) {
  const a = achievements(views)
  if (!a.length) return <p className="pd-empty">پروژه‌ای جلوتر از برنامه یا فرصت مشخصی در دادهٔ فعلی دیده نشد.</p>
  return (
    <ul className="pd-ach">{a.slice(0, 6).map((x) => <li key={x.key} className={`is-${x.kind}`}>{x.kind === 'achievement' ? <Award size={14} /> : <Sparkles size={14} />}<span>{x.text}</span></li>)}</ul>
  )
}

function Decisions({ views, canGovern, onDecide, onOpen }: { views: PfProjectView[]; canGovern: boolean; onDecide: (id: string) => void; onOpen: () => void }) {
  const q = useMemo(() => decisionQueue(views, today()), [views])
  const recent = views.filter((v) => v.lastDecision).map((v) => ({ v, d: v.lastDecision! })).sort((a, b) => b.d.decidedAt.localeCompare(a.d.decidedAt)).slice(0, 3)
  return (
    <Box title="تصمیمات و اقدامات موردنیاز" icon={<Gavel size={15} />} tone="#6366f1" foot={<Foot onClick={onOpen}>تصمیم‌های سبد</Foot>}>
      {!q.length ? <p className="pd-empty">تصمیمی در صف نیست.</p> : (
        <ul className="pd-dec">{q.slice(0, 5).map(({ view: v, reasons }) => (
          <li key={v.input.id}><div><b>{v.input.name}</b><small>{reasons.map((r) => QUEUE_REASON_FA[r]).join(' · ')}</small></div>{canGovern && <button type="button" className="pd-btn" onClick={() => onDecide(v.input.id)}>تصمیم</button>}</li>
        ))}</ul>
      )}
      {recent.length > 0 && <p className="pd-note">آخرین تصمیم‌ها: {recent.map(({ v, d }) => `${DECISION_FA[d.decision].label} — ${v.input.name} (${jd(d.decidedAt)})`).join('؛ ')}</p>}
    </Box>
  )
}

function CrossProject({ views, delays, issuesByMaster, progName, contractorOf }: { views: PfProjectView[]; delays: { v: PfProjectView; d: { days: number; lowerBound: boolean } }[]; issuesByMaster: Map<string, ImIssue[]> | null; progName: (id: string | null) => string; contractorOf: (id: string) => string | null }) {
  const progs = byGroup(views, (v) => v.input.programId, (k) => progName(k)).filter((p) => p.actual != null && p.planned != null)
  const ctr = byGroup(views, (v) => contractorOf(v.input.id), (k) => k).filter((c) => c.spi != null && c.count >= 1)
  const cats = issuesByMaster ? sharedCategories(views.map((v) => ({ projectId: v.input.id, name: v.input.name, issues: issuesByMaster.get(v.input.id) ?? [] }))) : []
  const top = [...delays].sort((a, b) => b.d.days - a.d.days).filter((x) => x.d.days > 0).slice(0, 3)
  return (
    <div className="pd-cross">
      <div><h4>عملکرد طرح‌ها (واقعی ÷ برنامه)</h4>{!progs.length ? <p className="pd-sec">داده ندارد</p> : <ul>{progs.slice(0, 4).map((p) => { const r = (p.planned as number) > 0 ? ((p.actual as number) / (p.planned as number)) * 100 : 100; return <li key={p.key}><span>{p.name}</span><i className="pd-mini"><s style={{ width: `${Math.min(100, r)}%`, background: r >= 95 ? '#22c55e' : r >= 85 ? '#f59e0b' : '#ef4444' }} /></i><b>{faNum(r, 0)}٪</b></li> })}</ul>}</div>
      <div><h4>میانگین SPI پیمانکاران</h4>{!ctr.length ? <p className="pd-sec">داده ندارد</p> : <ul>{ctr.sort((a, b) => (a.spi as number) - (b.spi as number)).slice(0, 4).map((c) => <li key={c.key}><span>{c.name}</span><i className="pd-mini"><s style={{ width: `${Math.min(100, (c.spi as number) * 100)}%`, background: (c.spi as number) >= 0.95 ? '#22c55e' : (c.spi as number) >= 0.9 ? '#f59e0b' : '#ef4444' }} /></i><b>{faNum(c.spi as number, 2)}</b></li>)}</ul>}<small className="pd-sec">همبستگی است؛ مرحله و دامنهٔ پروژه‌ها یکسان نیست.</small></div>
      <div><h4>مشکلات تکرارشونده</h4>{!cats.length ? <p className="pd-sec">دستهٔ مشترکی بین پروژه‌ها نیست</p> : <ul>{cats.slice(0, 4).map((c) => <li key={c.key}><span>{c.key}</span><b>{faNum(c.projects.length)} پروژه</b></li>)}</ul>}</div>
      <div><h4>بیشترین تأخیر</h4>{!top.length ? <p className="pd-sec">تأخیری اندازه‌گیری نشد</p> : <ol>{top.map((x) => <li key={x.v.input.id}><span>{x.v.input.name}</span><b>{x.d.lowerBound ? '≥' : ''}{faNum(x.d.days)} روز</b></li>)}</ol>}</div>
      <p className="pd-note"><Gauge size={12} /> تأخیر با روش «زمان کسب‌شده»: تاریخی که برنامه به پیشرفت فعلی رسیده بود، تا تاریخ آخرین اندازه‌گیری.</p>
    </div>
  )
}
