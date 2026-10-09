import { useMemo } from 'react'
import { Building2, Users } from 'lucide-react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { effectiveDue, isActiveIssue, isClosedIssue } from '../lib/imModel'
import { todayIso } from '../lib/issueRing'
import { Ring, CHART_COLORS } from '../components/charts'
import { HelpButton } from '../components/Help'
import { useHierarchyPath } from '../../masterdata/lib/useHierarchyPath'
import { LevelBreadcrumb } from '../../masterdata/components/LevelBreadcrumb'

/** Projects come from Master Data (names, codes, hierarchy) — nothing is created or deleted here. */
export function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)
  const tasks = useIssueWorkStore((s) => s.tasks)
  const members = useIssuesMembersStore((s) => s.membersByProject)
  const today = todayIso()
  const stats = useMemo(() => projects.map((p) => {
    const list = issues.filter((i) => i.projectId === p.id)
    const act = list.filter(isActiveIssue)
    const ids = new Set(list.map((i) => i.id))
    const open = tasks.filter((t) => ids.has(t.issueId) && t.status !== 'done' && t.status !== 'cancelled').length
    return { p, total: list.length, active: act.length, late: act.filter((i) => effectiveDue(i) < today).length, closed: list.filter(isClosedIssue).length, openTasks: open }
  }), [projects, issues, tasks, today])

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><Building2 size={22} style={{ color: 'var(--im-teal)' }} />پروژه‌ها</div><div className="im-page-sub">{projects.length} پروژه از اطلاعات پایه سامانه</div></div>
        <HelpButton topic="projects" />
      </div>
      {projects.length === 0 ? <div className="im-empty"><div className="im-big">🏗️</div>پروژه‌ای برای شما قابل‌دسترس نیست. پروژه‌ها در «اطلاعات پایه» تعریف و در «مدیریت کاربران» به شما اختصاص داده می‌شوند.</div> : (
        <div className="im-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {stats.map((s, k) => <ProjectCard key={s.p.id} s={s} color={CHART_COLORS[k % CHART_COLORS.length]} people={(members[s.p.id] ?? []).length} onOpen={() => onOpenProject(s.p.id)} index={k} />)}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ s, color, people, onOpen, index }: { s: { p: { id: string; name: string; shortCode?: string }; total: number; active: number; late: number; closed: number; openTasks: number }; color: string; people: number; onOpen: () => void; index: number }) {
  const path = useHierarchyPath('issues', s.p.id)
  const pct = s.total ? Math.round((s.closed / s.total) * 100) : null
  return (
    <button className="im-proj-card" onClick={onOpen} style={{ borderInlineStart: `4px solid ${color}`, animation: 'im-rise 300ms var(--im-ease) both', animationDelay: `${index * 40}ms` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          {s.p.shortCode && <div className="im-code" style={{ marginBottom: 3 }}>{s.p.shortCode}</div>}
          <div className="im-proj-name">{s.p.name}</div>
        </div>
        <Ring value={pct} size={58} stroke={7} color={color} label="بسته‌شده" />
      </div>
      {path && <LevelBreadcrumb path={path} className="mb-2" style={{ color: 'var(--im-muted)' }} />}
      <div className="im-proj-stats">
        <span>{s.active} فعال</span>
        {s.late > 0 ? <span style={{ color: 'var(--im-coral)', fontWeight: 800 }}>{s.late} تأخیر</span> : <span style={{ color: 'var(--im-mint)', fontWeight: 700 }}>بدون تأخیر</span>}
        <span>{s.openTasks} اقدام باز</span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Users size={12} />{people}</span>
      </div>
    </button>
  )
}
