import { useMemo, useState } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { IM_PRIORITY_LABEL_FA } from '../types'
import { IM_STAGE_LABEL_FA, effectiveDue, isActiveIssue, stageOf, dayDiff, priorityRank } from '../lib/imModel'
import { KPI_DEFS, agingBuckets, computeKpis, stageDistribution, workload } from '../lib/imKpi'
import { goodnessColor } from '../lib/issueAnalytics'
import { todayIso } from '../lib/issueRing'
import { SemiGauge } from '../components/Gauges'
import { IssueCard } from '../components/IssueCard'
import { Kpi, Segmented } from '../components/ui'
import { useUserDirectory } from '../lib/useUsers'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'

type Lens = 'exec' | 'follow' | 'me'
const fmt = (v: number | null, unit = '') => (v === null ? '—' : `${v.toLocaleString('en-US')}${unit}`)

export function DashboardPage({ onSelectIssue, onOpenRegister, onOpenMyWork }: { onSelectIssue: (id: string) => void; onOpenRegister: (f: { overdueOnly?: boolean; blockedOnly?: boolean; severity?: 'critical' }) => void; onOpenMyWork: () => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const tasks = useIssueWorkStore((s) => s.tasks)
  const exts = useIssueWorkStore((s) => s.extensions)
  const cfgSla = useIssueConfigStore((s) => s.sla)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id) ?? ''
  const [lens, setLens] = useState<Lens>('exec')
  const today = todayIso()

  const kpi = useMemo(() => computeKpis(issues, tasks, today), [issues, tasks, today])
  const aging = useMemo(() => agingBuckets(issues, today), [issues, today])
  const stages = useMemo(() => stageDistribution(issues.filter(isActiveIssue)), [issues])
  const active = useMemo(() => issues.filter(isActiveIssue), [issues])
  const critical = useMemo(
    () => [...active].filter((i) => priorityRank(i.severity ?? i.priority) >= 3 || effectiveDue(i) < today).sort((a, b) => priorityRank(b.severity ?? b.priority) - priorityRank(a.severity ?? a.priority) || effectiveDue(a).localeCompare(effectiveDue(b))).slice(0, 6),
    [active, today],
  )
  const perProject = useMemo(() => projects.map((p) => {
    const l = active.filter((i) => i.projectId === p.id)
    return { p, open: l.length, overdue: l.filter((i) => effectiveDue(i) < today).length, crit: l.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length, age: l.length ? Math.round(l.reduce((s, i) => s + dayDiff(i.createdAt.slice(0, 10), today), 0) / l.length) : 0 }
  }).filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.crit - a.crit), [projects, active, today])
  const load = useMemo(() => workload(issues, tasks, today), [issues, tasks, today])
  const unassigned = active.filter((i) => !i.pursuerId || !i.approverId)
  const stale = active.filter((i) => dayDiff(i.updatedAt.slice(0, 10), today) >= 7)
  const pendingExt = exts.filter((e) => e.status === 'pending')
  const maxAging = Math.max(1, ...aging.map((a) => a.count))
  const def = (k: string) => KPI_DEFS.find((d) => d.key === k)?.formulaFa
  const sla = cfgSla

  return (
    <div>
      <div className="im-topbar">
        <div><div className="im-page-title">داشبورد</div><div className="im-page-sub">وضعیت مسائل، تعهدات و سلامت پیگیری</div></div>
        <Segmented<Lens> value={lens} onChange={setLens} options={[{ id: 'exec', label: 'مدیریت اجرایی' }, { id: 'follow', label: 'پیگیری و کنترل' }, { id: 'me', label: 'من' }]} />
      </div>

      {lens === 'exec' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="مسئلهٔ فعال" value={fmt(kpi.active)} />
            <button onClick={() => onOpenRegister({ overdueOnly: true })} style={{ textAlign: 'right' }}><Kpi label="دارای تأخیر" value={fmt(kpi.overdueCount)} tone={kpi.overdueCount ? 'bad' : 'good'} hint={def('overdueRate')} /></button>
            <button onClick={() => onOpenRegister({ severity: 'critical' })} style={{ textAlign: 'right' }}><Kpi label="بحرانی فعال" value={fmt(active.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length)} tone="warn" /></button>
            <button onClick={() => onOpenRegister({ blockedOnly: true })} style={{ textAlign: 'right' }}><Kpi label="مسدود (منتظر تصمیم/منبع)" value={fmt(kpi.blockedCount)} tone={kpi.blockedCount ? 'warn' : 'good'} hint={def('blockedCount')} /></button>
            <Kpi label="جریان خالص ۳۰ روز" value={`${kpi.backlogNetFlow > 0 ? '+' : ''}${kpi.backlogNetFlow.toLocaleString('en-US')}`} tone={kpi.backlogNetFlow >= 0 ? 'good' : 'bad'} hint={def('backlogNetFlow')} />
            <Kpi label="منتظر تأیید مستقل" value={fmt(kpi.pendingVerification)} hint={def('pendingVerification')} />
          </div>

          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">شاخص‌های کیفیت پیگیری <span className="im-helper">تعریف دقیق هر شاخص در گزارش‌ها</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([['بستن به‌موقع (مؤثر)', kpi.onTimeClosure, 'onTimeClosure', false], ['بستن به‌موقع (سررسید اولیه)', kpi.onTimeClosureOriginal, 'onTimeClosureOriginal', false], ['پوشش علت ریشه‌ای', kpi.rootCauseCoverage, 'rootCauseCoverage', false], ['بازگشایی', kpi.reopenRate, 'reopenRate', true], ['تمدید', kpi.extensionRate, 'extensionRate', true]] as const).map(([l, v, k, inv]) => (
                <div key={k} style={{ flex: 1, minWidth: 120, textAlign: 'center' }} title={def(k)}>
                  <SemiGauge pct={v ?? 0} color={v === null ? 'var(--im-muted)' : goodnessColor(inv ? 100 - v : v)} centerText={v === null ? '—' : `${Math.round(v)}٪`} />
                  <div className="im-metric-title">{l}</div>
                </div>
              ))}
            </div>
            <div className="im-helper" style={{ marginTop: 8 }}>میانگین زمان رفع: <b>{fmt(kpi.avgResolutionDays, ' روز')}</b> · میانگین سن مسائل باز: <b>{fmt(kpi.avgAgeOpen, ' روز')}</b></div>
          </div>

          <div className="im-row" style={{ marginBottom: 14, alignItems: 'stretch' }}>
            <div className="im-card" style={{ flex: '1 1 300px' }}>
              <div className="im-section-title">سن مسائل باز</div>
              {aging.map((a) => (
                <div key={a.key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 28px', gap: 8, alignItems: 'center', marginBottom: 7, fontSize: 12 }}>
                  <span style={{ color: 'var(--im-muted)' }}>{a.label}</span>
                  <div className="im-bar"><i style={{ width: `${(a.count / maxAging) * 100}%`, background: a.key === '60+' || a.key === '31-60' ? 'var(--im-coral)' : a.key === '15-30' ? 'var(--im-amber)' : 'var(--im-mint)' }} /></div>
                  <b>{a.count.toLocaleString('en-US')}</b>
                </div>
              ))}
            </div>
            <div className="im-card" style={{ flex: '1 1 300px' }}>
              <div className="im-section-title">توزیع مرحله‌ها</div>
              {stages.map((s) => (
                <div key={s.stage} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 28px', gap: 8, alignItems: 'center', marginBottom: 7, fontSize: 12 }}>
                  <span style={{ color: 'var(--im-muted)' }}>{IM_STAGE_LABEL_FA[s.stage as keyof typeof IM_STAGE_LABEL_FA]}</span>
                  <div className="im-bar"><i style={{ width: `${(s.count / Math.max(1, kpi.active)) * 100}%`, background: 'var(--im-amber)' }} /></div>
                  <b>{s.count.toLocaleString('en-US')}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title">سلامت پروژه‌ها</div>
            <div className="im-table-wrap" style={{ border: 'none' }}>
              <table className="im-table"><thead><tr><th>پروژه</th><th>فعال</th><th>تأخیردار</th><th>بحرانی</th><th>میانگین سن (روز)</th></tr></thead>
                <tbody>{perProject.map((r) => <tr key={r.p.id}><td className="ttl">{r.p.name}</td><td>{r.open}</td><td style={{ color: r.overdue ? 'var(--im-coral)' : undefined, fontWeight: 700 }}>{r.overdue}</td><td style={{ color: r.crit ? 'var(--im-coral)' : undefined }}>{r.crit}</td><td>{r.age}</td></tr>)}</tbody>
              </table>
              {perProject.length === 0 && <div className="im-empty" style={{ padding: 20 }}>مسئلهٔ فعالی وجود ندارد.</div>}
            </div>
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
            <Kpi label="بدون مسئول انجام/تأیید" value={fmt(unassigned.length)} tone={unassigned.length ? 'warn' : 'good'} />
            <Kpi label="بی‌حرکت بیش از ۷ روز" value={fmt(stale.length)} tone={stale.length ? 'warn' : 'good'} />
            <Kpi label="تمدید در انتظار تصمیم" value={fmt(pendingExt.length)} tone={pendingExt.length ? 'warn' : 'good'} />
            <Kpi label="منتظر تأیید اقدام" value={fmt(kpi.pendingVerification)} />
          </div>
          <div className="im-card">
            <div className="im-section-title">بار کاری افراد <span className="im-helper">اقدام‌های باز + مسائل مسئول</span></div>
            <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>نفر</th><th>باز</th><th>تأخیردار</th><th>مسدود</th></tr></thead>
              <tbody>{load.slice(0, 20).map((w) => <tr key={w.userId}><td>{users.name(w.userId)}</td><td>{w.open}</td><td style={{ color: w.overdue ? 'var(--im-coral)' : undefined, fontWeight: 700 }}>{w.overdue}</td><td>{w.blocked}</td></tr>)}</tbody></table>
              {load.length === 0 && <div className="im-empty" style={{ padding: 20 }}>هنوز بار کاری ثبت نشده است.</div>}</div>
          </div>
          <div className="im-card">
            <div className="im-section-title">مسائل بدون مسئول یا بی‌حرکت</div>
            <div className="im-grid">{[...new Map([...unassigned, ...stale].map((i) => [i.id, i])).values()].slice(0, 10).map((i) => (
              <IssueCard key={i.id} issue={i} projectName={projects.find((p) => p.id === i.projectId)?.name} pursuer={null} onClick={() => onSelectIssue(i.id)} />
            ))}</div>
          </div>
          <div className="im-helper">هدف‌های SLA فعلی: {sla.map((p) => `${IM_PRIORITY_LABEL_FA[p.severity]}: پاسخ ${p.responseHours} ساعت / رفع ${p.resolveDays} روز`).join(' · ')}</div>
        </div>
      )}

      {lens === 'me' && (
        <div className="im-card">
          <div className="im-section-title">خلاصهٔ من</div>
          {(() => {
            const myTasks = tasks.filter((t) => t.executorId === me && t.status !== 'done' && t.status !== 'cancelled')
            const myIssues = active.filter((i) => [i.ownerId, i.followUpId, i.pursuerId, i.approverId].includes(me))
            const stageCounts = myIssues.reduce<Record<string, number>>((m, i) => { const k = IM_STAGE_LABEL_FA[stageOf(i)]; m[k] = (m[k] ?? 0) + 1; return m }, {})
            return (
              <>
                <div className="im-kpi-grid">
                  <Kpi label="مسائل من" value={fmt(myIssues.length)} />
                  <Kpi label="اقدام‌های باز" value={fmt(myTasks.length)} />
                  <Kpi label="تأخیردار" value={fmt(myTasks.filter((t) => t.dueDate && t.dueDate < today).length + myIssues.filter((i) => effectiveDue(i) < today && i.pursuerId === me).length)} tone="bad" />
                  <Kpi label="منتظر تأیید من" value={fmt(tasks.filter((t) => t.status === 'pending_verification' && t.approverId === me).length)} />
                </div>
                <button className="im-btn im-btn-primary" onClick={onOpenMyWork}>رفتن به «کارهای من»</button>
                <div className="im-helper" style={{ marginTop: 8 }}>مسائل فعال شما بر اساس مرحله: {Object.entries(stageCounts).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
