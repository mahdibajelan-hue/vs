import { useMemo, useState } from 'react'
import { Activity, AlertOctagon, Ban, Gauge, ListChecks, Siren, UserX } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { HelpButton } from '../../issues/components/Help'
import { HBars, Ring, Trend } from '../../issues/components/charts'
import { Kpi } from '../../issues/components/ui'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { clusterSimilar, comparePriority, dependentCounts, interventions, repeatedRiskIds } from '../lib/riskPortfolio'
import { SIZE_BAND_LABEL_FA, compareProjects, computeKpis } from '../lib/riskKpi'
import { addDays, scoreAt, isOpenAction } from '../lib/riskState'
import { todayIso } from '../lib/riskScore'
import { levelOf, ZONE_LABEL_FA } from '../lib/riskPolicy'
import { RiskMatrix } from '../components/RiskMatrix'
import { ScoreTriple, useCategoryLabel } from '../components/rk'
import type { PageProps } from '../RiskApp'

type View = 'pm' | 'program' | 'exec'
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function DashboardPage({ onOpenRisk, onGo }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const [view, setView] = useState<View>('pm')
  const today = todayIso()
  const policy = d.policyFor(d.scope === 'all' ? '' : d.scope)
  const st = (id: string) => d.states.get(id)!

  const deps = useMemo(() => dependentCounts(d.links), [d.links])
  const ranked = useMemo(() => d.active.map((risk) => ({ risk, state: st(risk.id) })).sort((a, b) => comparePriority(a, b, deps)), [d.active, d.states, deps]) // eslint-disable-line react-hooks/exhaustive-deps
  const clusters = useMemo(() => clusterSimilar(d.risks), [d.risks])
  const ctx = useMemo(() => ({ risks: d.risks, states: d.states, assessments: d.assessments, actions: d.actions, controls: d.controls, kris: d.kris, kriEvents: d.kriEvents, repeatedRiskIds: repeatedRiskIds(clusters), today }), [d, clusters, today])
  const kpis = useMemo(() => Object.fromEntries(computeKpis(ctx).map((k) => [k.id, k])), [ctx])
  const openActs = d.actions.filter(isOpenAction)
  const overdueActs = openActs.filter((a) => a.dueDate && a.dueDate < today)
  const blockedActs = openActs.filter((a) => a.status === 'blocked')
  const kriBad = d.kris.filter((k) => k.active && (k.state === 'warn' || k.state === 'critical'))
  const noGap = d.active.filter((r) => !st(r.id).hasOwner || !st(r.id).hasPlan)
  const outside = ranked.filter((x) => x.state.outsideTolerance)
  const interv = useMemo(() => interventions(d.risks, d.states), [d.risks, d.states])

  const months = useMemo(() => Array.from({ length: 7 }, (_, k) => addDays(today, -30 * (6 - k))), [today])
  const reductionTrend = useMemo(() => months.map((m) => {
    const xs = d.risks.map((r) => ({ r, s: scoreAt(r, d.assessments, m) })).filter((x) => x.s && x.r.initialScore > 0).map((x) => ((x.r.initialScore - x.s!.residual) / x.r.initialScore) * 100)
    return xs.length ? Math.round(median(xs)! * 10) / 10 : 0
  }), [months, d.risks, d.assessments])
  const critMoves = useMemo(() => {
    const d30 = addDays(today, -30)
    const was = (r: (typeof d.risks)[number]) => { const s = scoreAt(r, d.assessments, d30); return s ? levelOf(s.current, policy) === 'critical' : false }
    const became = d.active.filter((r) => st(r.id).level === 'critical' && !was(r))
    const left = d.risks.filter((r) => was(r) && (r.status === 'closed' || st(r.id).level !== 'critical'))
    return { became, left }
  }, [d, policy]) // eslint-disable-line react-hooks/exhaustive-deps
  const catRows = useMemo(() => { const m = new Map<string, { n: number; crit: number }>(); for (const r of d.active) { const x = m.get(r.category) ?? { n: 0, crit: 0 }; x.n++; if (st(r.id).level === 'critical') x.crit++; m.set(r.category, x) } return [...m.entries()].sort((a, b) => b[1].n - a[1].n) }, [d.active, d.states]) // eslint-disable-line react-hooks/exhaustive-deps
  const compare = useMemo(() => compareProjects(ctx, [...new Set(d.risks.map((r) => r.projectId))]), [ctx, d.risks])
  const projName = (id: string) => d.allProjects.find((p) => p.id === id)?.name ?? '—'

  const riskLine = (x: { risk: (typeof ranked)[number]['risk']; state: (typeof ranked)[number]['state'] }, extra?: string) => (
    <button key={x.risk.id} className="im-task" style={{ display: 'flex', width: '100%', textAlign: 'right', justifyContent: 'space-between', gap: 8, marginBottom: 6 }} onClick={() => onOpenRisk(x.risk.id)}>
      <span style={{ minWidth: 0 }}><span className="im-code">{x.risk.code}</span> <b>{x.risk.title}</b><div className="im-helper">{dir.name(x.risk.ownerId)} · {catLabel(x.risk.category)}{extra ? ' · ' + extra : ''}</div></span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}><ScoreTriple state={x.state} policy={d.policyFor(x.risk.projectId)} /></span>
    </button>
  )

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title">داشبورد ریسک</div><div className="im-page-sub">{d.active.length} ریسک فعال · {d.scope === 'all' ? `${d.projects.length} پروژه` : projName(d.scope)}</div></div>
        <div className="im-actions"><HelpButton content={RK_HELP.dashboard} /><div className="im-seg" role="tablist">{([['pm', 'مدیر پروژه'], ['program', 'مدیر طرح و پورتفولیو'], ['exec', 'مدیریت ارشد']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div></div>
      </div>

      {view === 'pm' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="ریسک بحرانی" value={kpis.critical_count.value ?? 0} tone={kpis.critical_count.value ? 'bad' : 'good'} icon={Siren} index={0} />
            <Kpi label="باقیمانده خارج از تحمل" value={outside.length} tone={outside.length ? 'bad' : 'good'} icon={AlertOctagon} index={1} />
            <Kpi label="اقدام معوق" value={overdueActs.length} tone={overdueActs.length ? 'bad' : 'good'} icon={ListChecks} index={2} />
            <Kpi label="اقدام مسدود" value={blockedActs.length} tone={blockedActs.length ? 'warn' : 'good'} icon={Ban} index={3} />
            <Kpi label="بدون مالک یا برنامه" value={noGap.length} tone={noGap.length ? 'warn' : 'good'} icon={UserX} index={4} />
            <Kpi label="KRI در هشدار/بحرانی" value={kriBad.length} tone={kriBad.length ? 'warn' : 'good'} icon={Activity} index={5} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 14, marginBottom: 14, alignItems: 'start' }} className="im-intel-grid">
            <div className="im-card"><div className="im-section-title">ریسک‌های اولویت‌دار <span className="im-helper">ناحیه تحمل ← KRI ← روند ← زمان تا وقوع ← وابستگی</span></div>{ranked.slice(0, 8).map((x) => riskLine(x, x.state.attention[0]))}{ranked.length === 0 && <div className="im-empty">ریسک فعالی نیست.</div>}</div>
            <div className="im-card"><div className="im-section-title">ماتریس باقیمانده</div><RiskMatrix risks={d.active} states={d.states} policy={policy} mode="residual" selected={null} onSelect={() => onGo('assessment')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <div className="im-card"><div className="im-section-title">اقدام‌های معوق و مسدود</div>{[...overdueActs, ...blockedActs.filter((b) => !overdueActs.includes(b))].slice(0, 7).map((a) => { const r = d.risks.find((x) => x.id === a.riskId)!; return <button key={a.id} className="im-task" style={{ display: 'block', width: '100%', textAlign: 'right', marginBottom: 6 }} onClick={() => onOpenRisk(r.id, 'response')}><span className="im-code">{r.code}</span> {a.description.slice(0, 70)}<div className="im-helper">{dir.name(a.ownerId)}{a.dueDate ? ` · سررسید ${formatJalali(a.dueDate)}` : ''}{a.status === 'blocked' ? ` · مسدود: ${a.blockedReason}` : ''}</div></button> })}{overdueActs.length + blockedActs.length === 0 && <div className="im-notice ok">اقدام معوق یا مسدودی نیست.</div>}</div>
            <div className="im-card"><div className="im-section-title">شاخص‌های هشدار نیازمند اقدام</div>{kriBad.slice(0, 7).map((k) => <div key={k.id} className="im-task" style={{ marginBottom: 6 }}><b>{k.name}</b> <span className="rk-flag" style={{ ['--c' as string]: k.state === 'critical' ? '#ef4444' : '#f59e0b' }}>{k.state === 'critical' ? 'بحرانی' : 'هشدار'}</span><div className="im-helper">مقدار {k.currentValue} {k.unit} (آستانه {k.warnThreshold}/{k.criticalThreshold})</div></div>)}{kriBad.length === 0 && <div className="im-notice ok">شاخصی در وضعیت هشدار نیست.</div>}<button className="im-ghostlink" onClick={() => onGo('monitoring')}>همهٔ شاخص‌ها ←</button></div>
            <div className="im-card"><div className="im-section-title">ریسک‌های بدون مالک یا برنامهٔ پاسخ</div>{noGap.slice(0, 7).map((r) => <button key={r.id} className="im-task" style={{ display: 'block', width: '100%', textAlign: 'right', marginBottom: 6 }} onClick={() => onOpenRisk(r.id)}><span className="im-code">{r.code}</span> {r.title.slice(0, 60)}<div className="rk-flags">{st(r.id).attention.filter((a) => a.startsWith('بدون')).map((a) => <span key={a} className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>{a}</span>)}</div></button>)}{noGap.length === 0 && <div className="im-notice ok">همهٔ ریسک‌ها مالک و برنامهٔ پاسخ دارند.</div>}</div>
          </div>
        </>
      )}

      {view === 'program' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="پروژه با ریسک فعال" value={compare.filter((c) => c.active > 0).length} icon={Gauge} color="#6366f1" index={0} />
            <Kpi label="ریسک مشترک بین پروژه‌ها" value={clusters.length} tone={clusters.length ? 'warn' : 'good'} hint="گروه‌های ریسک مشابه در چند پروژه" icon={Activity} index={1} />
            <Kpi label="نیازمند مداخلهٔ مدیر طرح" value={interv.filter((i) => i.level === 'project_manager').length} tone="warn" icon={Siren} index={2} />
            <Kpi label="نیازمند مدیریت ارشد" value={interv.filter((i) => i.level === 'management').length} tone={interv.some((i) => i.level === 'management') ? 'bad' : 'good'} icon={AlertOctagon} index={3} />
            <Kpi label="اثربخشی برنامه‌های پاسخ" value={kpis.response_effectiveness.value === null ? '—' : kpis.response_effectiveness.value + '٪'} hint={kpis.response_effectiveness.note} icon={ListChecks} index={4} />
          </div>
          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">مقایسهٔ پروژه‌ها از نظر مواجهه <span className="im-helper">فقط نرخ‌ها (٪)؛ مقایسه در گروه هم‌اندازه و هم‌مرحله معنی‌دار است</span></div>
            <div className="im-table-wrap"><table className="rk-compare"><thead><tr><th>پروژه</th><th>اندازه / مرحله</th><th>فعال</th><th>بحرانی</th><th>خارج از تحمل</th><th>بازنگری معوق</th><th>بدون مالک/برنامه</th><th>کاهش (میانه)</th></tr></thead><tbody>
              {[...compare].sort((a, b) => a.group.localeCompare(b.group) || (b.criticalShare ?? 0) - (a.criticalShare ?? 0)).map((c) => (
                <tr key={c.projectId}><td><b>{projName(c.projectId)}</b>{c.confidence === 'low' && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8', marginInlineStart: 6 }}>اطمینان پایین</span>}</td><td className="im-helper">{SIZE_BAND_LABEL_FA[c.sizeBand]} · {c.phase === 'unspecified' ? 'نامشخص' : c.phase}</td><td>{c.active}</td>
                  {[c.criticalShare, c.outsideToleranceShare, c.overdueReviewShare, c.noPlanShare].map((v, i) => <td key={i} className="rk-bar-cell" style={{ ['--c' as string]: i === 0 ? '#ef4444' : '#f59e0b' }}>{v !== null && <i style={{ width: `${v}%` }} />}<b>{v === null ? '—' : v + '٪'}</b></td>)}
                  <td>{c.medianReduction === null ? '—' : c.medianReduction + '٪'}</td></tr>
              ))}
            </tbody></table></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div className="im-card"><div className="im-section-title">تمرکز ریسک در حوزه‌ها <span className="im-helper">قرمز = سهم بحرانی ≥ ۳۰٪</span></div><HBars rows={catRows.slice(0, 10).map(([k, v]) => ({ key: k, label: catLabel(k), value: v.n, color: v.n && v.crit / v.n >= 0.3 ? '#ef4444' : undefined, hint: v.crit ? `${v.crit} بحرانی` : undefined }))} /></div>
            <div className="im-card"><div className="im-section-title">ریسک‌های نیازمند مداخلهٔ مدیر طرح</div>{interv.slice(0, 6).map((i) => riskLine(i, i.reasons[0]))}{interv.length === 0 && <div className="im-notice ok">موردی نیست.</div>}</div>
          </div>
        </>
      )}

      {view === 'exec' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="ریسک بحرانی" value={kpis.critical_count.value ?? 0} tone={kpis.critical_count.value ? 'bad' : 'good'} icon={Siren} index={0} />
            <Kpi label="تازه بحرانی‌شده (۳۰ روز)" value={critMoves.became.length} tone={critMoves.became.length ? 'bad' : 'good'} icon={AlertOctagon} index={1} />
            <Kpi label="از بحرانی خارج‌شده" value={critMoves.left.length} tone="good" icon={Gauge} index={2} />
            <Kpi label="خارج از تحمل سازمان" value={kpis.outside_tolerance.value === null ? '—' : kpis.outside_tolerance.value + '٪'} tone={(kpis.outside_tolerance.value ?? 0) >= 15 ? 'bad' : 'warn'} icon={AlertOctagon} index={3} />
            <Kpi label="نیازمند تصمیم مدیریت" value={interv.filter((i) => i.level === 'management').length} tone={interv.some((i) => i.level === 'management') ? 'bad' : 'good'} icon={Siren} index={4} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14, marginBottom: 14, alignItems: 'start' }} className="im-intel-grid">
            <div className="im-card"><div className="im-section-title">مهم‌ترین ریسک‌های سازمانی</div>{ranked.slice(0, 8).map((x) => riskLine(x, `${projName(x.risk.projectId)}`))}</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="im-card"><div className="im-section-title">روند کاهش ریسک باقیمانده <span className="im-helper">میانهٔ کاهش نسبت به ذاتی (٪)</span></div><Trend labels={months.map((m) => formatJalali(m).slice(0, 7))} series={[{ key: 'red', label: 'کاهش (میانه)', color: '#22c55e', values: reductionTrend }]} height={140} /></div>
              <div className="im-card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Ring value={kpis.reviews_on_schedule.value} label="بازنگری طبق برنامه" size={96} stroke={10} color="#0ea5e9" /><Ring value={kpis.controls_effective.value} label="کنترل مؤثر" size={96} stroke={10} color="#22c55e" /><Ring value={kpis.actions_on_time.value} label="اقدام در موعد" size={96} stroke={10} color="#f59e0b" /></div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div className="im-card"><div className="im-section-title">تصمیمات و مداخلات مدیریتی موردنیاز</div>{interv.filter((i) => i.level === 'management').slice(0, 7).map((i) => <button key={i.risk.id} className="im-task" style={{ display: 'block', width: '100%', textAlign: 'right', marginBottom: 6 }} onClick={() => onOpenRisk(i.risk.id)}><span className="im-code">{i.risk.code}</span> <b>{i.risk.title.slice(0, 70)}</b><div className="im-helper">{i.reasons.join(' · ')}</div></button>)}{!interv.some((i) => i.level === 'management') && <div className="im-notice ok">تصمیم مدیریتی معوقی نیست.</div>}</div>
            <div className="im-card"><div className="im-section-title">ریسک‌های مشترک بین پروژه‌ها</div>{clusters.slice(0, 5).map((c) => <div key={c.id} className="im-task" style={{ marginBottom: 6 }}><b>{c.members.length} ریسک در {c.projectIds.length} پروژه</b>{c.keywords.length > 0 && <span className="rk-flag" style={{ marginInlineStart: 6 }}>{c.keywords.slice(0, 3).join('، ')}</span>}<div className="im-helper">{c.projectIds.map(projName).join('، ')}</div></div>)}{clusters.length === 0 && <div className="im-helper">ریسک مشابهی بین پروژه‌ها دیده نشد.</div>}<button className="im-ghostlink" onClick={() => onGo('portfolio')}>تحلیل پورتفولیو ←</button></div>
            <div className="im-card"><div className="im-section-title">ناحیهٔ تحمل — {ZONE_LABEL_FA.escalate}</div>{outside.slice(0, 6).map((x) => riskLine(x))}{outside.length === 0 && <div className="im-notice ok">ریسکی خارج از تحمل نیست.</div>}</div>
          </div>
        </>
      )}
    </div>
  )
}
