import { useMemo } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useChangeStore } from '../store/useChangeStore'
import type { ChangeRequest } from '../types'
import { APPROVED_STATUSES, contractKey, dayDiff } from './changeKpi'
import { computeBasis, resolveRoute, type BasisInput, type EngineRequest } from './changeRules'
import type { Perms } from './changeFlow'
import type { ContractInfo, ProjectInfo } from './changeData'

/** Names, permissions and the client-side preview of the approval route (the server recomputes it when the evaluation is completed). */
export function useChangeCtx() {
  const projects = useChangeStore((s) => s.projects)
  const contracts = useChangeStore((s) => s.contracts)
  const orgs = useChangeStore((s) => s.orgs)
  const people = useChangeStore((s) => s.people)
  const requests = useChangeStore((s) => s.requests)
  const myRoles = useChangeStore((s) => s.myRoles)
  const activeRules = useChangeStore((s) => s.activeRules)
  const profile = useAuthStore((s) => s.profile)
  return useMemo(() => {
    const pMap = new Map<string, ProjectInfo>(projects.map((p) => [p.id, p]))
    const cMap = new Map<string, ContractInfo>(contracts.map((c) => [c.id, c]))
    const uMap = new Map(people.map((p) => [p.userId, p]))
    const perms = (projectId: string | null | undefined): Perms => ({ isAdmin: !!profile?.isAdmin, roles: projectId ? myRoles[projectId] ?? [] : [], userId: profile?.id ?? null })
    type BasisReq = Pick<ChangeRequest, 'masterProjectId' | 'contractId' | 'originalContractAmount' | 'originalDurationDays'> & { id?: string }
    const basisInput = (r: BasisReq): BasisInput => {
      const c = r.contractId ? cMap.get(r.contractId) : undefined, p = pMap.get(r.masterProjectId)
      let baseAmount: number | null = null, baseSource = 'none', durationDays: number | null = null, durationSource = 'none'
      if (c && c.value > 0) { baseAmount = c.value; baseSource = 'contract' } else if (p && p.contractValue > 0) { baseAmount = p.contractValue; baseSource = 'project' } else if (r.originalContractAmount > 0) { baseAmount = r.originalContractAmount; baseSource = 'manual' }
      if (c?.start && c.end) { durationDays = dayDiff(c.end, c.start); durationSource = 'contract' } else if (p?.start && p.end) { durationDays = dayDiff(p.end, p.start); durationSource = 'project' } else if (r.originalDurationDays > 0) { durationDays = r.originalDurationDays; durationSource = 'manual' }
      const same = requests.filter((x) => x.id !== r.id && contractKey(x) === contractKey(r))
      const cumPrevAmount = same.filter((x) => APPROVED_STATUSES.includes(x.status)).reduce((s, x) => s + Math.abs(x.approvedCost ?? 0), 0)
      const cumPrevDays = same.filter((x) => APPROVED_STATUSES.includes(x.status)).reduce((s, x) => s + Math.abs(x.approvedDays ?? 0), 0)
      const pendingOtherAmount = same.filter((x) => x.status === 'awaiting_approval').reduce((s, x) => s + Math.abs(x.proposedCost), 0)
      return { baseAmount, baseSource, durationDays, durationSource, cumPrevAmount, cumPrevDays, pendingOtherAmount }
    }
    const preview = (r: BasisReq & Pick<ChangeRequest, 'changeType' | 'proposedCost' | 'proposedDays' | 'orgUnit'>) => {
      const req: EngineRequest = { id: r.id, masterProjectId: r.masterProjectId, changeType: r.changeType, proposedCost: r.proposedCost, proposedDays: r.proposedDays, orgUnit: r.orgUnit, contractType: pMap.get(r.masterProjectId)?.contractType ?? null }
      const basis = computeBasis(req, basisInput(r))
      return resolveRoute(req, activeRules, basis, new Date().toISOString().slice(0, 10))
    }
    return {
      projects, contracts, activeRules, perms, preview, basisInput,
      project: (id: string | null | undefined) => (id ? pMap.get(id) : undefined), contract: (id: string | null | undefined) => (id ? cMap.get(id) : undefined),
      projectName: (id: string | null | undefined) => (id ? pMap.get(id)?.name ?? '—' : '—'), contractLabel: (r: Pick<ChangeRequest, 'contractId' | 'contractNumber'>) => (r.contractId ? cMap.get(r.contractId)?.number || cMap.get(r.contractId)?.title || '—' : r.contractNumber || 'قرارداد اصلی'),
      userName: (id: string | null | undefined) => (id ? uMap.get(id)?.name ?? 'کاربر' : '—'), orgName: (id: string | null | undefined) => (id ? orgs.get(id) ?? '—' : '—'), people,
      baseOf: (r: ChangeRequest) => basisInput(r).baseAmount,
    }
  }, [projects, contracts, orgs, people, requests, myRoles, activeRules, profile?.isAdmin, profile?.id])
}
