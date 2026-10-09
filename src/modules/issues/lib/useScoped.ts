import { useMemo } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { useDecisionStore } from '../store/useDecisionStore'

/** Everything the pages show, narrowed by the project picker in the header (scopeProjectId = 'all' → no narrowing). */
export function useScoped() {
  const scope = useIssuesStore((s) => s.scopeProjectId)
  const projectsAll = useIssuesStore((s) => s.projects)
  const issuesAll = useIssuesStore((s) => s.issues)
  const tasksAll = useIssueWorkStore((s) => s.tasks)
  const extAll = useIssueWorkStore((s) => s.extensions)
  const decAll = useDecisionStore((s) => s.decisions)
  return useMemo(() => {
    if (scope === 'all') return { scope, projects: projectsAll, issues: issuesAll, tasks: tasksAll, extensions: extAll, decisions: decAll }
    const issues = issuesAll.filter((i) => i.projectId === scope)
    const ids = new Set(issues.map((i) => i.id))
    return { scope, projects: projectsAll.filter((p) => p.id === scope), issues, tasks: tasksAll.filter((t) => ids.has(t.issueId)), extensions: extAll.filter((e) => ids.has(e.issueId)), decisions: decAll.filter((d) => d.projectId === scope) }
  }, [scope, projectsAll, issuesAll, tasksAll, extAll, decAll])
}
