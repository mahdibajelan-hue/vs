import { useMemo, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useIssuesStore } from '../store/useIssuesStore'
import { EMPTY_MEMBERS, useIssuesCurrentRole, useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { imCanManage } from '../types'
import { isIssueOverdue } from '../lib/issueRing'
import { IssueCard } from '../components/IssueCard'
import { NewProjectModal } from '../components/NewProjectModal'
import { MembersModal } from '../components/MembersModal'
import { LevelBreadcrumb } from '../../masterdata/components/LevelBreadcrumb'
import { useHierarchyPath } from '../../masterdata/lib/useHierarchyPath'

export function ProjectsPage({
  activeProjectId,
  onOpenProject,
  onBack,
  onSelectIssue,
  onNewIssue,
}: {
  activeProjectId: string | null
  onOpenProject: (id: string) => void
  onBack: () => void
  onSelectIssue: (id: string) => void
  onNewIssue: (projectId: string) => void
}) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const membersByProject = useIssuesMembersStore((s) => s.membersByProject)

  if (activeProjectId) {
    return (
      <ProjectDetail
        projectId={activeProjectId}
        onBack={onBack}
        onSelectIssue={onSelectIssue}
        onNewIssue={() => onNewIssue(activeProjectId)}
        showMembers={showMembers}
        onOpenMembers={() => setShowMembers(true)}
        onCloseMembers={() => setShowMembers(false)}
      />
    )
  }

  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">پروژه‌ها</div>
          <div className="im-page-sub">{projects.length} پروژه ثبت شده</div>
        </div>
        <button className="im-btn im-btn-primary" onClick={() => setShowNewProject(true)}>
          <Plus size={16} /> پروژه جدید
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">📁</div>هنوز پروژه‌ای ثبت نشده
          <div style={{ marginTop: 14 }}>
            <button className="im-btn im-btn-primary" onClick={() => setShowNewProject(true)}>
              ساخت اولین پروژه
            </button>
          </div>
        </div>
      ) : (
        <div className="im-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))' }}>
          {projects.map((p) => {
            const pIssues = issues.filter((i) => i.projectId === p.id)
            const pOverdue = pIssues.filter((i) => isIssueOverdue(i)).length
            return (
              <button key={p.id} className="im-proj-card" onClick={() => onOpenProject(p.id)}>
                <div className="im-proj-name">{p.name}</div>
                <div className="im-proj-desc">{p.description || 'بدون توضیحات'}</div>
                <div className="im-proj-stats">
                  <span>{pIssues.length} مشکل</span>
                  {pOverdue > 0 ? (
                    <span style={{ color: 'var(--im-coral)', fontWeight: 700 }}>{pOverdue} تاخیر</span>
                  ) : (
                    <span style={{ color: 'var(--im-mint)' }}>بدون تاخیر</span>
                  )}
                  <span>{(membersByProject[p.id] ?? []).length} عضو</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onCreated={onOpenProject} />}
    </div>
  )
}

function ProjectDetail({
  projectId,
  onBack,
  onSelectIssue,
  onNewIssue,
  showMembers,
  onOpenMembers,
  onCloseMembers,
}: {
  projectId: string
  onBack: () => void
  onSelectIssue: (id: string) => void
  onNewIssue: () => void
  showMembers: boolean
  onOpenMembers: () => void
  onCloseMembers: () => void
}) {
  const project = useIssuesStore((s) => s.projects.find((p) => p.id === projectId))
  const allIssues = useIssuesStore((s) => s.issues)
  const members = useIssuesMembersStore((s) => s.membersByProject[projectId] ?? EMPTY_MEMBERS)
  const role = useIssuesCurrentRole(projectId)
  const hierarchyPath = useHierarchyPath('issues', projectId)

  const pIssuesSorted = useMemo(
    () => allIssues.filter((i) => i.projectId === projectId).sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate)),
    [allIssues, projectId],
  )

  if (!project) return null

  return (
    <div>
      <div className="im-topbar">
        <div>
          <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginBottom: 10 }} onClick={onBack}>
            بازگشت به پروژه‌ها
          </button>
          <div className="im-page-title">{project.name}</div>
          <div className="im-page-sub">{project.description || 'بدون توضیحات'}</div>
          {hierarchyPath && <LevelBreadcrumb path={hierarchyPath} className="mt-1.5" style={{ color: 'var(--im-muted)' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {imCanManage(role) && (
            <button className="im-btn im-btn-ghost" onClick={onOpenMembers}>
              <Users size={14} /> اعضا ({members.length})
            </button>
          )}
          <button className="im-btn im-btn-primary" onClick={onNewIssue}>
            <Plus size={16} /> مشکل جدید
          </button>
        </div>
      </div>

      {pIssuesSorted.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">✅</div>هنوز مشکلی برای این پروژه ثبت نشده
        </div>
      ) : (
        <div className="im-grid">
          {pIssuesSorted.map((i) => (
            <IssueCard key={i.id} issue={i} pursuer={members.find((m) => m.userId === i.pursuerId)} onClick={() => onSelectIssue(i.id)} />
          ))}
        </div>
      )}

      {showMembers && <MembersModal projectId={projectId} projectName={project.name} onClose={onCloseMembers} />}
    </div>
  )
}
