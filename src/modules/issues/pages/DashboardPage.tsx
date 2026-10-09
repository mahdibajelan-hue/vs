import { useMemo, useState } from 'react'
import { AlarmClock, Gauge as GaugeIcon, Hourglass, ListChecks, OctagonAlert, ShieldAlert, TrendingDown, TrendingUp, UserX } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { IM_PRIORITY_LABEL_FA } from '../types'
import { IM_STAGE_LABEL_FA, effectiveDue, isActiveIssue, stageOf, dayDiff, priorityRank } from '../lib/imModel'
import { KPI_DEFS, agingBuckets, computeKpis, severityDistribution, stageDistribution, weeklyTrend, workload } from '../lib/imKpi'
import { forecastDelays } from '../lib/imForecast'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { useUserDirectory } from '../lib/useUsers'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IssueCard } from '../components/IssueCard'
import { Kpi, Segmented } from '../components/ui'
import { Donut, HBars, Ring, Trend } from '../components/charts'
import { HelpButton } from '../components/Help'

type Lens = 'exec' | 'follow' | 'me'
const fmt = (v: number | null, unit = '') => (v === null ? '—' : `${v}${unit}`)
const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#38bdf8' } as const

/** Executive Control Tower: three lenses over the same data (management, follow-up & control, me). */
export function DashboardPage({ onSelectIssue, onOpenRegister, onOpenMyWork }: { onSelectIssue: (id: string) => void; onOpenRegister: (f: { overdueOnly?: boolean; blockedOnly?: boolean; severity?: 'critical' }) => void; onOpenMyWork: () => void }) {
  const sc = useScoped()
  const cfgSla = useIssueConfigStore((s) => s.sla)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id) ?? ''
  const [lens, setLens] = useState<Lens>('exec')
  const today = todayIso()
  const { issues, tasks, extensions: exts, projects } = sc

  const kpi = useMemo(() => computeKpis(issues, tasks, today), [issues, tasks, today])
  const aging = useMemo(() => agingBuckets(issues, today), [issues, today])
  const trend = useMemo(() => weeklyTrend(issues, today, 8), [issues, today])
  const stages = useMemo(() => stageDistribution(issues.filter(isActiveIssue)), [issues])
  const sev = useMemo(() => severityDistribution(issues), [issues])
  const active = useMemo(() => issues.filter(isActiveIssue), [issues])
  const critical = useMemo(() => [...active].filter((i) => priorityRank(i.severity ?? i.priority) >= 3 || effectiveDue(i) < today).sort((a, b) => priorityRank(b.severity ?? b.priority) - priorityRank(a.severity ?? a.priority) || effectiveDue(a).localeCompare(effectiveDue(b))).slice(0, 6), [active, today])
  const perProject = useMemo(() => projects.map((p) => {
    const l = active.filter((i) => i.projectId === p.id)
    return { p, open: l.length, overdue: l.filter((i) => effectiveDue(i) < today).length, crit: l.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length, age: l.length ? Math.round(l.reduce((s, i) => s + dayDiff(i.createdAt.slice(0, 10), today), 0) / l.length) : 0 }
  }).filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.crit - a.crit), [projects, active, today])
  const load = useMemo(() => workload(issues, tasks, today), [issues, tasks, today])
  const unassigned = active.filter((i) => !i.pursuerId || !i.approverId)
  const stale = active.filter((i) => dayDiff(i.updatedAt.slice(0, 10), today) >= 7)
  const pendingExt = exts.filter((e) => e.status === 'pending')
  const fc = useMemo(() => forecastDelays(issues, today, new Set(tasks.filter((t) => t.status === 'blocked').map((t) => t.issueId))), [issues, tasks, today])
  const atRisk = fc.forecasts.filter((f) => f.riskScore >= 40).slice(0, 6)
  const def = (k: string) => KPI_DEFS.find((d) => d.key === k)?.formulaFa
  const net = kpi.backlogNetFlow

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><GaugeIcon size={22} style={{ color: 'var(--im-indigo)' }} />برج کنترل مدیریتی</div><div className="im-page-sub">وضعیت مسائل، تعهدات و سلامت پیگیری</div></div>
        <div className="im-actions"><HelpButton topic="tower" /><Segmented<Lens> value={lens} onChange={setLens} options={[{ id: 'exec', label: 'مدیریت اجرایی' }, { id: 'follow', label: 'پیگیری و کنترل' }, { id: 'me', label: 'من' }]} /></div>
      </div>

      {lens === 'exec' && (
        <>
          <div className="im-kpi-grid">
            <Kpi index={0} icon={OctagonAlert} color="#f97316" label="مسئلهٔ فعال" value={fmt(kpi.active)} />
            <button onClick={() => onOpenRegister({ overdueOnly: true })}><Kpi index={1} icon={AlarmClock} color="#ef4444" label="دارای تأخیر" value={fmt(kpi.overdueCount)} tone={kpi.overdueCount ? 'bad' : 'good'} hint={def('overdueRate')} /></button>
            <button onClick={() => onOpenRegister({ severity: 'critical' })}><Kpi index={2} icon={ShieldAlert} color="#dc2626" label="بحرانی فعال" value={fmt(active.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length)} /></button>
            <button onClick={() => onOpenRegister({ blockedOnly: true })}><Kpi index={3} icon={Hourglass} color="#8b5cf6" label="مسدود (منتظر تصمیم/منبع)" value={fmt(kpi.blockedCount)} tone={kpi.blockedCount ? 'warn' : 'good'} hint={def('blockedCount')} /></button>
            <Kpi index={4} icon={net >= 0 ? TrendingUp : TrendingDown} color={net >= 0 ? '#22c55e' : '#ef4444'} label="جریان خالص ۳۰ روز" value={`${net > 0 ? '+' : ''}${net}`} tone={net >= 0 ? 'good' : 'bad'} hint={def('backlogNetFlow')} />
            <Kpi index={5} icon={ListChecks} color="#0ea5e9" label="منتظر تأیید مستقل" value={fmt(kpi.pendingVerification)} hint={def('pendingVerification')} />
          </div>

          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">شاخص‌های کیفیت پیگیری <span className="im-helper">تعریف دقیق هر شاخص در «شاخص‌ها»</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 12 }}>
              <Ring value={kpi.onTimeClosure} color="#34d399" label="بستن به‌موقع (مؤثر)" size={96} stroke={10} />
              <Ring value={kpi.onTimeClosureOriginal} color="#2dd4bf" label="بستن به‌موقع (اولیه)" size={96} stroke={10} />
              <Ring value={kpi.rootCauseCoverage} color="#38bdf8" label="پوشش علت ریشه" size={96} stroke={10} />
              <Ring value={kpi.reopenRate} color="#fb7185" label="بازگشایی" size={96} stroke={10} />
              <Ring value={kpi.extensionRate} color="#f59e0b" label="تمدید" size={96} stroke={10} />
            </div>
            <div className="im-helper" style={{ marginTop: 10 }}>میانگین زمان رفع: <b>{fmt(kpi.avgResolutionDays, ' روز')}</b> · میانگین سن مسائل باز: <b>{fmt(kpi.avgAgeOpen, ' روز')}</b></div>
          </div>

          <div className="im-chart-grid" style={{ marginBottom: 14 }}>
            <div className="im-card"><div className="im-section-title">مرحله‌های مسائل فعال</div>
              <Donut centerLabel="فعال" slices={stages.map((s, i) => ({ key: s.stage, label: IM_STAGE_LABEL_FA[s.stage as keyof typeof IM_STAGE_LABEL_FA] ?? s.stage, value: s.count, color: ['#a78bfa', '#38bdf8', '#f59e0b', '#2dd4bf', '#fb7185', '#818cf8', '#34d399', '#f97316'][i % 8] }))} /></div>
            <div className="im-card"><div className="im-section-title">شدت</div>
              <Donut centerLabel="فعال" slices={sev.map((s) => ({ key: s.severity, label: IM_PRIORITY_LABEL_FA[s.severity as keyof typeof IM_PRIORITY_LABEL_FA], value: s.count, color: SEV_COLOR[s.severity as keyof typeof SEV_COLOR] }))} /></div>
            <div className="im-card"><div className="im-section-title">روند هفتگی</div>
              <Trend labels={trend.labels} series={[{ key: 'c', label: 'ثبت‌شده', color: '#f59e0b', values: trend.created }, { key: 'x', label: 'بسته‌شده', color: '#34d399', values: trend.closed }]} height={130} /></div>
            <div className="im-card"><div className="im-section-title">سن مسائل باز</div>
              <HBars rows={aging.map((a, i) => ({ key: a.key, label: a.label, value: a.count, color: ['#34d399', '#2dd4bf', '#f59e0b', '#f97316', '#ef4444'][i] }))} /></div>
          </div>

          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">سلامت پروژه‌ها</div>
            <div className="im-table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="im-table"><thead><tr><th>پروژه</th><th>فعال</th><th>تأخیردار</th><th>بحرانی</th><th>میانگین سن (روز)</th></tr></thead>
                <tbody>{perProject.map((r) => <tr key={r.p.id}><td className="ttl">{r.p.shortCode && <span className="im-code">{r.p.shortCode} </span>}{r.p.name}</td><td>{r.open}</td><td style={{ color: r.overdue ? 'var(--im-coral)' : undefined, fontWeight: 800 }}>{r.overdue}</td><td style={{ color: r.crit ? 'var(--im-coral)' : undefined }}>{r.crit}</td><td>{r.age}</td></tr>)}</tbody>
              </table>
              {perProject.length === 0 && <div className="im-empty" style={{ padding: 20 }}>مسئلهٔ فعالی وجود ندارد.</div>}
            </div>
          </div>

          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">پیش‌بینی ریسک تأخیر <span className="im-helper">{fc.confident ? 'بر اساس سابقهٔ مسائل بسته‌شده' : 'سابقهٔ بسته‌شده‌ها کم است؛ اعتماد پایین'}</span></div>
            {atRisk.length === 0 ? <div className="im-helper">مسئلهٔ پرریسکی شناسایی نشد.</div> : atRisk.map((f) => { const i = issues.find((x) => x.id === f.issueId); return i ? (
              <button key={f.issueId} className="im-check" style={{ width: '100%', textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => onSelectIssue(i.id)}>
                <span><b>{i.title}</b><div className="im-helper">{f.reasons.join(' · ')}</div></span>
                <span className="im-pill" style={{ ['--c' as string]: f.riskScore >= 70 ? 'var(--im-coral)' : 'var(--im-amber)' }}>ریسک {f.riskScore}</span>
              </button>) : null })}
            <div className="im-helper" style={{ marginTop: 6 }}>امتیاز = سررسید/زمان مورد انتظار + مسدودی + تمدید مکرر + بی‌حرکتی؛ وزن‌ها شفاف و قابل‌بازبینی‌اند.</div>
          </div>

          <div className="im-card">
            <div className="im-section-title">نیازمند توجه مدیریت <span className="im-helper">بحرانی/بالا یا تأخیردار</span></div>
            <div className="im-grid">{critical.length === 0 ? <div className="im-empty" style={{ padding: 20 }}>🎯 مورد بحرانی یا تأخیردار وجود ندارد</div> : critical.map((i) => (
              <IssueCard key={i.id} issue={i} projectName={projects.find((p) => p.id === i.projectId)?.name} pursuer={i.pursuerId ? (membersByProject[i.projectId] ?? []).find((m) => m.userId === i.pursuerId) : null} onClick={() => onSelectIssue(i.id)} />
            ))}</div>
          </div>
        </>
      )}

      {lens === 'follow' && (
        <div className="im-grid" style={{ gap: 14 }}>
          <div className="im-kpi-grid" style={{ marginBottom: 0 }}>
            <Kpi index={0} icon={UserX} color="#f59e0b" label="بدون مسئول انجام/تأیید" value={fmt(unassigned.length)} tone={unassigned.length ? 'warn' : 'good'} />
            <Kpi index={1} icon={Hourglass} color="#8b5cf6" label="بی‌حرکت بیش از ۷ روز" value={fmt(stale.length)} tone={stale.length ? 'warn' : 'good'} />
            <Kpi index={2} icon={AlarmClock} color="#f97316" label="تمدید در انتظار تصمیم" value={fmt(pendingExt.length)} tone={pendingExt.length ? 'warn' : 'good'} />
            <Kpi index={3} icon={ListChecks} color="#0ea5e9" label="منتظر تأیید اقدام" value={fmt(kpi.pendingVerification)} />
          </div>
          <div className="im-card">
            <div className="im-section-title">بار کاری افراد <span className="im-helper">اقدام‌های باز + مسائل مسئول</span></div>
            <HBars rows={load.slice(0, 12).map((w) => ({ key: w.userId, label: users.name(w.userId), value: w.open, color: w.overdue ? '#f97316' : '#38bdf8', hint: `${w.overdue} تأخیردار · ${w.blocked} مسدود` }))} />
            <div className="im-helper" style={{ marginTop: 6 }}>نوار نارنجی = دارای مورد تأخیردار</div>
            {load.length === 0 && <div className="im-empty" style={{ padding: 20 }}>هنوز بار کاری ثبت نشده است.</div>}
          </div>
          <div className="im-card">
            <div className="im-section-title">مسائل بدون مسئول یا بی‌حرکت</div>
            <div className="im-grid">{[...new Map([...unassigned, ...stale].map((i) => [i.id, i])).values()].slice(0, 10).map((i) => (
              <IssueCard key={i.id} issue={i} projectName={projects.find((p) => p.id === i.projectId)?.name} pursuer={null} onClick={() => onSelectIssue(i.id)} />
            ))}</div>
          </div>
          <div className="im-helper">هدف‌های SLA فعلی: {cfgSla.map((p) => `${IM_PRIORITY_LABEL_FA[p.severity]}: پاسخ ${p.responseHours} ساعت / رفع ${p.resolveDays} روز`).join(' · ')}</div>
        </div>
      )}

      {lens === 'me' && (() => {
        const myTasks = tasks.filter((t) => t.executorId === me && t.status !== 'done' && t.status !== 'cancelled')
        const myIssues = active.filter((i) => [i.ownerId, i.followUpId, i.pursuerId, i.approverId].includes(me))
        const stageCounts = myIssues.reduce<Record<string, number>>((m, i) => { const k = IM_STAGE_LABEL_FA[stageOf(i)]; m[k] = (m[k] ?? 0) + 1; return m }, {})
        return (
          <div className="im-card">
            <div className="im-section-title">خلاصهٔ من</div>
            <div className="im-kpi-grid">
              <Kpi index={0} icon={OctagonAlert} color="#f97316" label="مسائل من" value={fmt(myIssues.length)} />
              <Kpi index={1} icon={ListChecks} color="#0ea5e9" label="اقدام‌های باز" value={fmt(myTasks.length)} />
              <Kpi index={2} icon={AlarmClock} color="#ef4444" label="تأخیردار" value={fmt(myTasks.filter((t) => t.dueDate && t.dueDate < today).length + myIssues.filter((i) => effectiveDue(i) < today && i.pursuerId === me).length)} tone="bad" />
              <Kpi index={3} icon={ShieldAlert} color="#8b5cf6" label="منتظر تأیید من" value={fmt(tasks.filter((t) => t.status === 'pending_verification' && t.approverId === me).length)} />
            </div>
            <button className="im-btn im-btn-primary" onClick={onOpenMyWork}>رفتن به «کارهای من»</button>
            <div className="im-helper" style={{ marginTop: 8 }}>مسائل فعال شما بر اساس مرحله: {Object.entries(stageCounts).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</div>
          </div>
        )
      })()}
    </div>
  )
}
