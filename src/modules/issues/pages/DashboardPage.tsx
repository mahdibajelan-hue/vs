import { useMemo } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { computeIssueMetrics, computePriorityDistribution, computeStatusDistribution, goodnessColor } from '../lib/issueAnalytics'
import { isIssueOpen, isIssueOverdue, isoDiffDays, todayIso } from '../lib/issueRing'
import { PriorityBars, SemiGauge, StatusDonut } from '../components/Gauges'
import { IssueCard } from '../components/IssueCard'

export function DashboardPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const today = todayIso()

  const open = useMemo(() => issues.filter(isIssueOpen), [issues])
  const overdue = useMemo(() => open.filter((i) => isIssueOverdue(i, today)), [open, today])
  const approved = useMemo(() => issues.filter((i) => i.status === 'approved'), [issues])
  const nearDeadline = useMemo(() => open.filter((i) => { const d = isoDiffDays(today, i.deadlineDate); return d >= 0 && d <= 2 }), [open, today])

  const topOverdue = useMemo(
    () => [...overdue].sort((a, b) => isoDiffDays(today, a.deadlineDate) - isoDiffDays(today, b.deadlineDate)).slice(0, 5),
    [overdue, today],
  )

  const metrics = useMemo(() => computeIssueMetrics(issues, today), [issues, today])
  const statusDist = useMemo(() => computeStatusDistribution(issues), [issues])
  const priorityDist = useMemo(() => computePriorityDistribution(issues), [issues])

  const gAvg = Math.min(100, (metrics.avgDays / 14) * 100)
  const colorAvg = goodnessColor(100 - gAvg)
  const colorOnTime = goodnessColor(metrics.onTimeRate)
  const colorClosed = goodnessColor(metrics.closedRatio)

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name

  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">داشبورد</div>
          <div className="im-page-sub">نمای کلی وضعیت پروژه‌ها و مهلت‌ها</div>
        </div>
      </div>

      <div className="im-grid im-stat-grid">
        <div className="im-stat-card">
          <div className="im-num">{projects.length}</div>
          <div className="im-lbl">پروژه فعال</div>
        </div>
        <div className="im-stat-card">
          <div className="im-num">{open.length}</div>
          <div className="im-lbl">مشکل باز</div>
        </div>
        <div className="im-stat-card warn">
          <div className="im-num">{overdue.length}</div>
          <div className="im-lbl">دارای تاخیر</div>
        </div>
        <div className="im-stat-card">
          <div className="im-num">{approved.length}</div>
          <div className="im-lbl">تایید شده</div>
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title" style={{ marginBottom: 8 }}>
          شاخص‌های کلیدی
        </div>
        <div className="im-grid im-metrics-grid" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
            <SemiGauge pct={metrics.onTimeRate} color={colorOnTime} centerText={`${metrics.onTimeRate}%`} />
            <div className="im-metric-title">تایید به‌موقع</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
            <SemiGauge pct={metrics.closedRatio} color={colorClosed} centerText={`${metrics.closedRatio}%`} />
            <div className="im-metric-title">نسبت بسته‌شده</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
            <SemiGauge pct={gAvg} color={colorAvg} centerText={metrics.avgDays.toFixed(1)} />
            <div className="im-metric-title">میانگین بستن (روز)</div>
            <div className={`im-metric-trend ${metrics.trendClosedPct >= 0 ? 'im-trend-up' : 'im-trend-down'}`} style={{ fontSize: 10 }}>
              {metrics.trendClosedPct >= 0 ? '▲' : '▼'} {Math.abs(metrics.trendClosedPct)}٪ نسبت به هفته قبل
            </div>
          </div>
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 16 }}>
        <div className="im-section-title" style={{ marginBottom: 10 }}>
          توزیع وضعیت و اولویت
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '0 0 auto', margin: '0 auto' }}>
            <StatusDonut distribution={statusDist} total={issues.length} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <PriorityBars distribution={priorityDist} />
          </div>
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 16 }}>
        <div className="im-section-title">فوری‌ترین تاخیرها</div>
        {topOverdue.length === 0 ? (
          <div className="im-empty" style={{ padding: 26 }}>
            🎯 در حال حاضر هیچ موردی با تاخیر وجود نداره
          </div>
        ) : (
          <div className="im-grid">
            {topOverdue.map((i) => (
              <IssueCard
                key={i.id}
                issue={i}
                projectName={projectName(i.projectId)}
                pursuer={i.pursuerId ? (membersByProject[i.projectId] ?? []).find((m) => m.userId === i.pursuerId) : null}
                onClick={() => onSelectIssue(i.id)}
              />
            ))}
          </div>
        )}
      </div>

      {nearDeadline.length > 0 && (
        <div className="im-card">
          <div className="im-section-title">نزدیک به مهلت (تا ۲ روز)</div>
          <div className="im-grid">
            {nearDeadline.slice(0, 4).map((i) => (
              <IssueCard
                key={i.id}
                issue={i}
                projectName={projectName(i.projectId)}
                pursuer={i.pursuerId ? (membersByProject[i.projectId] ?? []).find((m) => m.userId === i.pursuerId) : null}
                onClick={() => onSelectIssue(i.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
