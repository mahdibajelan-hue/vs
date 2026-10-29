import { useEffect, useMemo } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { buildProjectSummaries, usePortfolioDashboardRaw } from '../../reporting/lib/portfolioDashboard'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { useLifecycleStore } from '../../lifecycle/store/useLifecycleStore'
import { summariseProject } from '../../lifecycle/lib/portfolioRollup'
import { buildViews, type PfDelivery, type PfProjectInput } from './portfolioCore'

let lifecycleRequested = false

export interface PortfolioScope { portfolioId: string | null; programId: string | null }

/**
 * Every project of the scope as a portfolio view: master data + the project's own snapshot + its risk level + the
 * governance rows. The same list feeds every tab, so the numbers agree between them.
 */
export function usePortfolioViews(scope: PortfolioScope) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const st = usePortfolioStore()

  const allIds = useMemo(() => projects.map((p) => p.id), [projects])
  const { data: raw } = usePortfolioDashboardRaw(allIds)

  useEffect(() => { if (!usePortfolioStore.getState().loaded) void usePortfolioStore.getState().loadGovernance() }, [])
  useEffect(() => { if (allIds.length) void usePortfolioStore.getState().loadSnapshots(allIds) }, [allIds])

  // milestones and actions from the lifecycle control tower — what its former portfolio page showed, now here
  const lc = useLifecycleStore()
  useEffect(() => { if (!lifecycleRequested) { lifecycleRequested = true; void useLifecycleStore.getState().fetchPortfolioWide() } }, [])
  const delivery = useMemo(() => {
    const m = new Map<string, PfDelivery>()
    if (lc.loadingPortfolio) return m
    for (const p of projects) {
      const by = <T extends { projectId: string }>(list: T[]) => list.filter((x) => x.projectId === p.id)
      const s = summariseProject(p, lc.allLifecycles.find((l) => l.projectId === p.id) ?? null, by(lc.allMilestones), by(lc.allGates), by(lc.allChecklist), lc.allActions.filter((a) => a.projectId === p.id), by(lc.allHealth))
      m.set(p.id, { milestonesDelayed: s.milestonesDelayed, criticalMilestonesDelayed: s.criticalMilestonesDelayed, overdueActions: s.overdueActions, criticalOverdueActions: s.criticalOverdueActions })
    }
    return m
  }, [projects, lc.loadingPortfolio, lc.allLifecycles, lc.allMilestones, lc.allGates, lc.allChecklist, lc.allActions, lc.allHealth])

  const summaries = useMemo(() => (raw ? buildProjectSummaries(projects, portfolios, programs, raw) : []), [raw, projects, portfolios, programs])

  const inScope = useMemo(() => projects.filter((p) => (scope.programId ? p.programId === scope.programId : scope.portfolioId ? p.portfolioId === scope.portfolioId : true)), [projects, scope.portfolioId, scope.programId])

  const views = useMemo(() => {
    const inputs: PfProjectInput[] = inScope.map((p) => ({
      id: p.id, name: p.officialName, code: p.projectIdCode, portfolioId: p.portfolioId, programId: p.programId,
      budget: p.contractValue, manualEac: p.forecastCostAtCompletion,
      snapshot: st.snapshots.get(p.id) ?? null,
      riskLevel: summaries.find((s) => s.masterProjectId === p.id)?.highestActiveRiskLevel ?? null,
      score: st.scores.get(p.id) ?? null,
      decisions: st.decisions.filter((d) => d.projectId === p.id),
      delivery: delivery.get(p.id) ?? null,
    }))
    return buildViews(inputs, st.weights)
  }, [inScope, st.snapshots, st.scores, st.decisions, st.weights, summaries, delivery])

  const scopedRisks = useMemo(() => (raw ? inScope.flatMap((p) => raw.risksByMaster.get(p.id) ?? []) : []), [raw, inScope])
  // risk → its master project, for naming the project behind a risk on the dashboard
  const riskMaster = useMemo(() => new Map(raw ? inScope.flatMap((p) => (raw.risksByMaster.get(p.id) ?? []).map((r) => [r.id, p.id] as [string, string])) : []), [raw, inScope])
  const scopedAssessments = useMemo(() => (raw ? scopedRisks.flatMap((r) => raw.assessmentsByRisk.get(r.id) ?? []) : []), [raw, scopedRisks])
  const currency = inScope.find((p) => p.currency)?.currency ?? 'ریال'
  const snapshotsReady = st.snapshotProgress.total > 0 && st.snapshotProgress.done >= st.snapshotProgress.total

  const issuesByMaster = raw?.issuesByMaster ?? null
  return { views, summaries, riskMaster, scopedRisks, scopedAssessments, currency, rawLoaded: !!raw, snapshotsReady, progress: st.snapshotProgress, inScope, issuesByMaster, cachedAt: st.cachedAt }
}
