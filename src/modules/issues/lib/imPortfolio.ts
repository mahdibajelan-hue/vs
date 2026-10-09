import type { ImIssue } from '../types'
import { effectiveDue, isActiveIssue, priorityRank } from './imModel'
import { similarity } from './imText'

export interface HeatCell { projectId: string; category: string; active: number; overdue: number; critical: number }

/** Project × category matrix of active issues — the portfolio manager's «where is it burning» view. */
export function heatmap(issues: ImIssue[], today: string): { cells: HeatCell[]; max: number } {
  const m = new Map<string, HeatCell>()
  for (const i of issues) {
    if (!isActiveIssue(i)) continue
    const key = i.projectId + '|' + (i.category ?? 'none')
    const c = m.get(key) ?? { projectId: i.projectId, category: i.category ?? 'none', active: 0, overdue: 0, critical: 0 }
    c.active++
    if (effectiveDue(i) < today) c.overdue++
    if (priorityRank(i.severity ?? i.priority) >= 4) c.critical++
    m.set(key, c)
  }
  const cells = [...m.values()]
  return { cells, max: Math.max(1, ...cells.map((c) => c.active)) }
}

export interface SharedCause { label: string; issueIds: string[]; projectIds: string[]; closedCount: number }

/** Root causes that recur across ≥ minProjects different projects (lessons learned candidates). Text-similarity based; a person confirms. */
export function sharedCauses(issues: ImIssue[], minProjects = 2, threshold = 0.5): SharedCause[] {
  const withCause = issues.filter((i) => (i.rootCauseSummary ?? '').trim().length > 2)
  const used = new Set<string>()
  const out: SharedCause[] = []
  for (const a of withCause) {
    if (used.has(a.id)) continue
    const group = withCause.filter((b) => b.id === a.id || (!used.has(b.id) && similarity(a.rootCauseSummary!, b.rootCauseSummary!) >= threshold))
    const projects = new Set(group.map((g) => g.projectId))
    if (projects.size >= minProjects) {
      group.forEach((g) => used.add(g.id))
      out.push({ label: a.rootCauseSummary!.trim(), issueIds: group.map((g) => g.id), projectIds: [...projects], closedCount: group.filter((g) => !isActiveIssue(g)).length })
    }
  }
  return out.sort((x, y) => y.projectIds.length - x.projectIds.length || y.issueIds.length - x.issueIds.length)
}

export interface CorporateRollup { parent: ImIssue; children: ImIssue[]; projects: number; active: number; overdue: number; worstSeverity: number }

/** Parent («corporate») issues with the project-level issues attached to them. */
export function corporateRollup(issues: ImIssue[], today: string): CorporateRollup[] {
  const byParent = new Map<string, ImIssue[]>()
  for (const i of issues) if (i.corporateIssueId) byParent.set(i.corporateIssueId, [...(byParent.get(i.corporateIssueId) ?? []), i])
  const out: CorporateRollup[] = []
  for (const [pid, kids] of byParent) {
    const parent = issues.find((x) => x.id === pid)
    if (!parent) continue
    const act = kids.filter(isActiveIssue)
    out.push({ parent, children: kids, projects: new Set(kids.map((k) => k.projectId)).size, active: act.length, overdue: act.filter((k) => effectiveDue(k) < today).length, worstSeverity: Math.max(0, ...act.map((k) => priorityRank(k.severity ?? k.priority))) })
  }
  return out.sort((a, b) => b.worstSeverity - a.worstSeverity || b.active - a.active)
}

/** Parents cannot be their own descendants: reject cycles when attaching `child` under `parent`. */
export function wouldCreateCycle(issues: { id: string; corporateIssueId?: string | null }[], child: string, parent: string): boolean {
  if (child === parent) return true
  const by = new Map(issues.map((i) => [i.id, i.corporateIssueId ?? null]))
  let cur: string | null = parent
  for (let k = 0; cur && k < 50; k++) { if (cur === child) return true; cur = by.get(cur) ?? null }
  return false
}
