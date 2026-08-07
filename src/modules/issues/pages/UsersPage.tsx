import { useState } from 'react'
import { Users as UsersIcon } from 'lucide-react'
import { useIssuesStore } from '../store/useIssuesStore'
import { EMPTY_MEMBERS, useIssuesCurrentRole, useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_ROLE_LABEL_FA, imCanManage } from '../types'
import { MembersModal } from '../components/MembersModal'

export function UsersPage() {
  const projects = useIssuesStore((s) => s.projects)
  const [membersModalProject, setMembersModalProject] = useState<string | null>(null)

  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">کاربران</div>
          <div className="im-page-sub">اعضای هر پروژه و بار کاری باز آن‌ها</div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">👤</div>هنوز پروژه‌ای برای مدیریت اعضا وجود نداره
        </div>
      ) : (
        <div className="im-grid">
          {projects.map((p) => (
            <ProjectMembers key={p.id} projectId={p.id} projectName={p.name} onManage={() => setMembersModalProject(p.id)} />
          ))}
        </div>
      )}

      {membersModalProject && (
        <MembersModal projectId={membersModalProject} projectName={projects.find((p) => p.id === membersModalProject)?.name ?? ''} onClose={() => setMembersModalProject(null)} />
      )}
    </div>
  )
}

function ProjectMembers({ projectId, projectName, onManage }: { projectId: string; projectName: string; onManage: () => void }) {
  const members = useIssuesMembersStore((s) => s.membersByProject[projectId] ?? EMPTY_MEMBERS)
  const issues = useIssuesStore((s) => s.issues)
  const role = useIssuesCurrentRole(projectId)
  const openCountFor = (userId: string) => issues.filter((i) => i.projectId === projectId && i.pursuerId === userId && i.status !== 'approved' && i.status !== 'rejected').length

  return (
    <div className="im-card">
      <div className="im-section-title">
        {projectName}
        {imCanManage(role) && (
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={onManage}>
            <UsersIcon size={13} /> مدیریت اعضا
          </button>
        )}
      </div>
      {members.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--im-muted)' }}>عضوی ثبت نشده</p>
      ) : (
        <div className="im-grid">
          {members.map((m) => (
            <div key={m.userId} className="im-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="im-avatar" style={{ width: 42, height: 42, fontSize: 15 }}>
                {(m.fullName || m.email)[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.fullName || m.email}</div>
                <div style={{ fontSize: 11.5, color: 'var(--im-muted)' }}>
                  {IM_ROLE_LABEL_FA[m.role]} · {openCountFor(m.userId)} مورد باز
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
