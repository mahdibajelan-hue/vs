import { useEffect, useMemo } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useRiskStore } from '../store/useRiskStore'
import { useRiskPeopleStore } from '../store/useRiskPeopleStore'
import { computeStates, isActiveRisk, type RiskState } from './riskState'
import { DEFAULT_POLICY, effectivePolicy } from './riskPolicy'
import type { RmPolicy } from '../types'

const EMPTY: never[] = []

/** All module data narrowed by the header project picker, plus derived per-risk states (computed once, shared by every page). */
export function useRiskData() {
  const s = useRiskStore()
  const scope = s.scopeProjectId
  return useMemo(() => {
    const policyFor = (projectId: string): RmPolicy => effectivePolicy(s.policies, projectId) ?? DEFAULT_POLICY
    const all = scope === 'all'
    const risks = all ? s.risks : s.risks.filter((r) => r.projectId === scope)
    const ids = new Set(risks.map((r) => r.id))
    const inRisks = <T extends { riskId: string }>(xs: T[]) => (all ? xs : xs.filter((x) => ids.has(x.riskId)))
    const assessments = inRisks(s.assessments)
    const actions = inRisks(s.actions)
    const controls = inRisks(s.controls)
    const kris = all ? s.kris : s.kris.filter((k) => k.projectId === scope)
    const kriIds = new Set(kris.map((k) => k.id))
    const kriReadings = all ? s.kriReadings : s.kriReadings.filter((r) => kriIds.has(r.kriId))
    const kriEvents = all ? s.kriEvents : s.kriEvents.filter((e) => kriIds.has(e.kriId))
    const links = inRisks(s.links)
    const acceptances = inRisks(s.acceptances)
    const contingency = inRisks(s.contingency)
    const projects = all ? s.projects : s.projects.filter((p) => p.id === scope)
    const suggestions = all ? s.suggestions : s.suggestions.filter((x) => x.projectId === scope)
    const states: Map<string, RiskState> = computeStates(risks, assessments, actions, controls, kris, policyFor)
    return {
      scope, projects, risks, active: risks.filter(isActiveRisk), assessments, actions, controls, kris, kriReadings, kriEvents, links, acceptances, contingency, suggestions, states, policyFor,
      corporate: s.corporate, categories: s.categories, allProjects: s.projects, policies: s.policies,
    }
  }, [s.risks, s.assessments, s.actions, s.controls, s.kris, s.kriReadings, s.kriEvents, s.links, s.acceptances, s.contingency, s.projects, s.suggestions, s.policies, s.corporate, s.categories, scope])
}

/** userId → name directory (central people list). */
export function useRiskDirectory() {
  const all = useRiskPeopleStore((s) => s.all)
  const fetchAll = useRiskPeopleStore((s) => s.fetchAll)
  useEffect(() => { fetchAll() }, [fetchAll])
  return useMemo(() => {
    const m = new Map(all.map((p) => [p.userId, p]))
    return { name: (id: string | null | undefined) => (id ? m.get(id)?.name ?? 'کاربر' : '—'), all, get: (id: string | null | undefined) => (id ? m.get(id) : undefined) }
  }, [all])
}

/** The viewer's capabilities in a project (server RLS is the real gate; this only hides buttons that would be refused). */
export function useRiskRole(projectId: string | null | undefined) {
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin) ?? false
  const role = useRiskStore((s) => (projectId ? s.myRoles[projectId] : undefined))
  return {
    isAdmin,
    role: role ?? null,
    canEdit: isAdmin || role !== 'management',
    canManage: isAdmin || role === 'project_manager' || role === 'risk_manager',
    isManagement: isAdmin || role === 'management',
  }
}
export { EMPTY }
