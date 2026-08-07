import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, IM_STATUSES, IM_STATUS_LABEL_FA, type ImIssuePriority, type ImIssueStatus } from '../types'
import { isoDiffDays, todayIso } from '../lib/issueRing'
import { IssueCard } from '../components/IssueCard'

export function IssuesPage({ onSelectIssue, onNewIssue }: { onSelectIssue: (id: string) => void; onNewIssue: () => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<ImIssueStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<ImIssuePriority | 'all'>('all')
  const today = todayIso()

  const list = useMemo(() => {
    let l = [...issues]
    if (projectFilter !== 'all') l = l.filter((i) => i.projectId === projectFilter)
    if (statusFilter !== 'all') l = l.filter((i) => i.status === statusFilter)
    if (priorityFilter !== 'all') l = l.filter((i) => i.priority === priorityFilter)
    l.sort((a, b) => isoDiffDays(today, a.deadlineDate) - isoDiffDays(today, b.deadlineDate))
    return l
  }, [issues, projectFilter, statusFilter, priorityFilter, today])

  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">مشکلات</div>
          <div className="im-page-sub">{list.length} مورد</div>
        </div>
        <button className="im-btn im-btn-primary" onClick={onNewIssue}>
          <Plus size={16} /> مشکل جدید
        </button>
      </div>

      <div className="im-filters">
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">همه پروژه‌ها</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ImIssueStatus | 'all')}>
          <option value="all">همه وضعیت‌ها</option>
          {IM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {IM_STATUS_LABEL_FA[s]}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as ImIssuePriority | 'all')}>
          <option value="all">همه اولویت‌ها</option>
          {IM_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {IM_PRIORITY_LABEL_FA[p]}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">🔍</div>موردی یافت نشد
        </div>
      ) : (
        <div className="im-grid">
          {list.map((i) => (
            <IssueCard
              key={i.id}
              issue={i}
              projectName={projects.find((p) => p.id === i.projectId)?.name}
              pursuer={(membersByProject[i.projectId] ?? []).find((m) => m.userId === i.pursuerId)}
              onClick={() => onSelectIssue(i.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
