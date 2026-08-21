import type { ImIssue } from '../types'
import { IM_PRIORITY_LABEL_FA, IM_STATUS_LABEL_FA } from '../types'
import type { ImProjectMember } from '../store/useIssuesMembersStore'
import { IssueRing } from './IssueRing'

export function IssueCard({
  issue,
  projectName,
  pursuer,
  onClick,
}: {
  issue: ImIssue
  projectName?: string
  pursuer?: ImProjectMember | null
  onClick: () => void
}) {
  return (
    <button className="im-issue-card" onClick={onClick}>
      <IssueRing issue={issue} />
      <div className="im-issue-main">
        <div className="im-issue-title">{issue.title}</div>
        <div className="im-issue-meta">
          {projectName && <span className="im-chip">{projectName}</span>}
          <span className={`im-chip im-pr-${issue.priority}`}>
            <span className="im-chip-dot" style={{ background: 'currentColor' }} />
            {IM_PRIORITY_LABEL_FA[issue.priority]}
          </span>
          <span className={`im-status-tag im-st-${issue.status}`}>{IM_STATUS_LABEL_FA[issue.status]}</span>
        </div>
      </div>
      <div style={{ textAlign: 'left', flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, color: 'var(--im-muted)', marginBottom: 3 }}>پیگیری</div>
        <div className="im-avatar-sm" title={pursuer?.fullName || pursuer?.email || ''}>
          {(pursuer?.fullName || pursuer?.email || '?')[0]}
        </div>
      </div>
    </button>
  )
}
