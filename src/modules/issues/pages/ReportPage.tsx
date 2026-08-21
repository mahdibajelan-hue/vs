import { useMemo } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_STATUS_LABEL_FA } from '../types'
import { formatJalali } from '../../../lib/jalali'
import { isIssueOpen, isoDiffDays, todayIso } from '../lib/issueRing'

export function ReportPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const today = todayIso()

  const overdue = useMemo(() => {
    return issues
      .filter((i) => isIssueOpen(i) && isoDiffDays(today, i.deadlineDate) < 0)
      .map((i) => ({ issue: i, delayDays: -isoDiffDays(today, i.deadlineDate) }))
      .sort((a, b) => b.delayDays - a.delayDays)
  }, [issues, today])

  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">گزارش تاخیر</div>
          <div className="im-page-sub">مشکلاتی که از مهلت آن‌ها گذشته و هنوز تایید نشده‌اند</div>
        </div>
        <button className="im-btn im-btn-ghost" onClick={() => window.print()}>
          چاپ / خروجی
        </button>
      </div>

      {overdue.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">🎉</div>هیچ مورد تاخیرداری وجود نداره
        </div>
      ) : (
        <div className="im-grid">
          {overdue.map(({ issue: i, delayDays }) => {
            const proj = projects.find((p) => p.id === i.projectId)
            const members = membersByProject[i.projectId] ?? []
            const pursuer = members.find((m) => m.userId === i.pursuerId)
            const approver = members.find((m) => m.userId === i.approverId)
            const severity = delayDays > 7 ? 'var(--im-coral)' : 'var(--im-amber)'
            return (
              <button key={i.id} className="im-issue-card" style={{ alignItems: 'flex-start' }} onClick={() => onSelectIssue(i.id)}>
                <div
                  className="im-ring-wrap"
                  style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(232,93,78,0.12)', borderRadius: '50%' }}
                >
                  <div style={{ color: severity, fontWeight: 900, fontSize: 13, textAlign: 'center' }}>
                    {delayDays}
                    <div style={{ fontSize: 9, fontWeight: 700 }}>روز</div>
                  </div>
                </div>
                <div className="im-issue-main">
                  <div className="im-issue-title">{i.title}</div>
                  <div className="im-issue-meta">
                    <span className="im-chip">{proj?.name ?? '—'}</span>
                    <span className="im-chip">مهلت: {formatJalali(i.deadlineDate)}</span>
                    <span className="im-chip">مسئول انجام: {pursuer?.fullName || pursuer?.email || '—'}</span>
                    <span className="im-chip">تایید: {approver?.fullName || approver?.email || '—'}</span>
                    <span className={`im-status-tag im-st-${i.status}`}>{IM_STATUS_LABEL_FA[i.status]}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
